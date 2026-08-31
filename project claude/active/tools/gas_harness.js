/**
 * Harness uji untuk kode Apps Script.
 *
 * Apps Script tidak bisa dijalankan secara lokal, jadi berkas .gs dimuat ke
 * dalam satu konteks vm bersama stub layanan Google (Spreadsheet, Cache,
 * Properties, Lock, Utilities). Cukup untuk memverifikasi logika periode,
 * idempotensi submit, penerbitan temuan, dan agregasi dashboard sebelum
 * di-deploy - tanpa menyentuh spreadsheet sungguhan.
 *
 * Jalankan: node tools/gas_harness.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..', 'webapp', 'src');

// --------------------------------------------------------------- stub Sheet
class FakeRange {
  constructor(sheet, row, col, nRows, nCols) {
    Object.assign(this, { sheet, row, col, nRows, nCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nRows; r++) {
      const line = [];
      for (let c = 0; c < this.nCols; c++) {
        const rr = this.sheet.data[this.row - 1 + r] || [];
        const v = rr[this.col - 1 + c];
        line.push(v === undefined ? '' : v);
      }
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    values.forEach((line, r) => {
      const target = this.row - 1 + r;
      while (this.sheet.data.length <= target) this.sheet.data.push([]);
      line.forEach((v, c) => { this.sheet.data[target][this.col - 1 + c] = v; });
    });
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setNumberFormat() { return this; }
}

class FakeSheet {
  constructor(name) { this.name = name; this.data = []; }
  setName(n) { this.name = n; return this; }
  getName() { return this.name; }
  getRange(row, col, nRows = 1, nCols = 1) {
    return new FakeRange(this, row, col, nRows, nCols);
  }
  getLastRow() {
    let last = 0;
    this.data.forEach((r, i) => {
      if (r && r.some(v => v !== '' && v !== undefined && v !== null)) last = i + 1;
    });
    return last;
  }
  getLastColumn() {
    return this.data.reduce((m, r) => Math.max(m, r ? r.length : 0), 0);
  }
  getMaxRows() { return Math.max(this.data.length, 1000); }
  getMaxColumns() { return Math.max(this.getLastColumn(), 30); }
  deleteColumns() { return this; }
  deleteRow(row) { this.data.splice(row - 1, 1); return this; }
  deleteRows(row, n) { this.data.splice(row - 1, n); return this; }
  setFrozenRows() { return this; }
}

class FakeSpreadsheet {
  constructor(name) { this.name = name; this.sheets = []; this.id = 'FAKE_DB'; }
  getId() { return this.id; }
  getName() { return this.name; }
  getUrl() { return 'https://fake/' + this.id; }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) {
    const s = new FakeSheet(n || 'Sheet' + (this.sheets.length + 1));
    this.sheets.push(s);
    return s;
  }
  deleteSheet(sh) {
    const i = this.sheets.indexOf(sh);
    if (i >= 0) this.sheets.splice(i, 1);
    return this;
  }
}

// ------------------------------------------------------------- stub layanan
const STORE = { props: {}, cache: {} };
let THE_DB = null;
let fakeFileCounter = 0;

/**
 * Direktori karyawan tiruan.
 *
 * Sengaja meniru kejanggalan data asli agar bug yang muncul di produksi juga
 * muncul di sini: NIK tersimpan sebagai angka sehingga terbaca '328000022.0',
 * departemen ditulis tidak konsisten ('Production' vs 'PROD'), dan satu
 * password dipakai bersama oleh hampir semua orang.
 */
const SHARED_PW = 'DAM1234567';
const EMP_DB = new FakeSpreadsheet('DATA KARYAWAN');
(() => {
  const sh = EMP_DB.insertSheet('KARYAWAN');
  const rows = [
    ['NIK', 'Nama', 'Departemen', 'Jabatan', 'Otorisasi', 'Password', 'Email'],
    // NIK sebagai angka -> terbaca dengan ekor '.0'
    [328000022.0, 'Azhar Aizad', 'Production', 'Packer', 'Buat', SHARED_PW, ''],
    [328000023.0, 'Budi Santoso', 'PROD', 'Operator Produksi', 'Buat', SHARED_PW, ''],
    [328000024.0, 'Citra Dewi', 'Production', 'Produksi Harian', 'Buat', SHARED_PW, ''],
    [128000012.0, 'Evita', 'Production', 'Line Leader', 'Verifikasi', SHARED_PW, 'evita@x.com'],
    [128000001.0, 'Iman Nurchaedi S.', 'Production', 'Plant Manager', 'Validasi', SHARED_PW, ''],
    [328000001.0, 'Rio Gustiawan', 'Engineering', 'Technician', 'Buat', SHARED_PW, ''],
    [428000004.0, 'Adi Muzaki', 'HRGA', 'GA Vendor', 'Buat', SHARED_PW, ''],
    // satu orang dengan password berbeda, juga tersimpan sebagai angka
    [128000099.0, 'Khusus', 'Production', 'Packer', 'Buat', 132325.0, '']
  ];
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
})();


const sandbox = {
  console,
  // Apps Script mensubstitusi %s pada argumen berikutnya; stub harus meniru itu
  // agar keluaran harness tidak menyesatkan saat membaca log setup.
  Logger: {
    log: (fmt, ...args) => {
      let i = 0;
      const s = typeof fmt === 'string' && args.length
        ? fmt.replace(/%s/g, () => (i < args.length ? String(args[i++]) : '%s'))
        : [fmt, ...args].join(' ');
      console.log('   [log] ' + s);
    }
  },

  SpreadsheetApp: {
    create(name) {
      THE_DB = new FakeSpreadsheet(name);
      THE_DB.insertSheet('Sheet1');
      return THE_DB;
    },
    // Meniru spreadsheet kosong buatan pengguna: sudah ada, hanya berisi
    // satu tab bawaan 'Sheet1'. Ini kondisi awal yang sesungguhnya.
    getActiveSpreadsheet() {
      if (!THE_DB) {
        THE_DB = new FakeSpreadsheet('AM PM Tracker DB');
        THE_DB.insertSheet('Sheet1');
      }
      return THE_DB;
    },
    // Spreadsheet DATA KARYAWAN berada di berkas terpisah dan hanya dibaca.
    openById(id) {
      if (id === '14OTl9xYINyRIqnJ2AEaCJFD_D9tNRRueNgFby6FjY9o') return EMP_DB;
      return sandbox.SpreadsheetApp.getActiveSpreadsheet();
    }
  },

  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: k => (k in STORE.props ? STORE.props[k] : null),
      setProperty: (k, v) => { STORE.props[k] = v; }
    })
  },

  CacheService: {
    getScriptCache: () => ({
      get: k => {
        const e = STORE.cache[k];
        if (!e || e.exp < Date.now()) return null;
        return e.v;
      },
      put: (k, v, ttl) => { STORE.cache[k] = { v, exp: Date.now() + ttl * 1000 }; },
      remove: k => { delete STORE.cache[k]; }
    })
  },

  LockService: {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
  },

  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    getUuid: () => crypto.randomUUID(),
    base64Encode: s => Buffer.from(String(s)).toString('base64'),
    computeDigest: (alg, raw) => {
      const h = crypto.createHash('sha256').update(String(raw), 'utf8').digest();
      return Array.from(h).map(b => (b > 127 ? b - 256 : b));
    },
    formatDate: (date, tz, fmt) => {
      const p = n => String(n).padStart(2, '0');
      const Y = date.getFullYear(), M = p(date.getMonth() + 1), D = p(date.getDate());
      const h = p(date.getHours()), m = p(date.getMinutes()), s = p(date.getSeconds());
      if (fmt === 'yyyy-MM-dd') return `${Y}-${M}-${D}`;
      return `${Y}-${M}-${D}T${h}:${m}:${s}`;
    },
    parseCsv: text => text.trim().split(/\r?\n/).map(l => l.split(',')),
    newBlob: (bytes, mime, name) => ({
      getBytes: () => bytes,
      getContentType: () => mime,
      getName: () => name
    }),
    base64Decode: s => Array.from(Buffer.from(String(s), 'base64'))
  },

  DriveApp: {
    getFilesByName: () => ({ hasNext: () => false }),
    // Folder foto bukti tiruan: cukup untuk menguji ukuran/tipe/nama berkas
    // tanpa benar-benar menyentuh Drive.
    getFolderById: id => ({
      id,
      createFile: blob => {
        const fileId = 'FAKE_FILE_' + (++fakeFileCounter);
        return { getId: () => fileId, getName: () => blob.getName(), setSharing: () => {} };
      }
    }),
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
    Permission: { VIEW: 'VIEW' }
  }
};
sandbox.global = sandbox;

// ---------------------------------------------------------------- pemuatan
const ctx = vm.createContext(sandbox);
fs.readdirSync(SRC)
  .filter(f => f.endsWith('.gs'))
  .sort()
  .forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  });

// ------------------------------------------------------------------- utils
let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + '\n        harap: ' + e + '\n        dapat: ' + a); }
}
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
}
function throws(label, fn, fragment) {
  try {
    fn();
    fail++; console.log('  FAIL  ' + label + '  -> tidak melempar error');
  } catch (e) {
    if (!fragment || e.message.indexOf(fragment) >= 0) {
      pass++; console.log('  PASS  ' + label);
    } else {
      fail++; console.log('  FAIL  ' + label + '  -> pesan: ' + e.message);
    }
  }
}

const R = fn => { const r = ctx[fn]; return r; };

// =================================================================== TES ===
console.log('\n== 1. Perhitungan periode ==');
check('isoWeek 2026-01-01', ctx.isoWeek_(new Date(2026, 0, 1)), { year: 2026, week: 1 });
check('isoWeek 2026-08-29', ctx.isoWeek_(new Date(2026, 7, 29)), { year: 2026, week: 35 });
// 2027-01-01 jatuh hari Jumat -> masih minggu 53 tahun 2026 menurut ISO-8601
check('isoWeek 2027-01-01 (batas tahun)', ctx.isoWeek_(new Date(2027, 0, 1)),
      { year: 2026, week: 53 });

check('periodKey SHIFTLY', ctx.periodKey_('SHIFTLY', '2026-08-29', '2'), '2026-08-29#S2');
check('periodKey DAILY', ctx.periodKey_('DAILY', '2026-08-29', '1'), '2026-08-29');
check('periodKey WEEKLY', ctx.periodKey_('WEEKLY', '2026-08-29', '1'), '2026-W35');
check('periodKey MONTHLY', ctx.periodKey_('MONTHLY', '2026-08-29', '1'), '2026-08');
throws('SHIFTLY tanpa shift ditolak',
       () => ctx.periodKey_('SHIFTLY', '2026-08-29', ''), 'Shift wajib');

ok('WEEKLY sama sepanjang minggu',
   ctx.periodKey_('WEEKLY', '2026-08-24', '1') === ctx.periodKey_('WEEKLY', '2026-08-29', '3'));
ok('SHIFTLY beda tiap shift',
   ctx.periodKey_('SHIFTLY', '2026-08-29', '1') !== ctx.periodKey_('SHIFTLY', '2026-08-29', '2'));

console.log('\n== 2. ymd_ tahan objek Date ==');
check('ymd_ dari Date', ctx.ymd_(new Date(2026, 7, 29)), '2026-08-29');
check('ymd_ dari string', ctx.ymd_('2026-08-29'), '2026-08-29');
check('ymd_ dari ISO datetime', ctx.ymd_('2026-08-29T10:15:00'), '2026-08-29');
check('ymd_ dari kosong', ctx.ymd_(''), '');

console.log('\n== 3. Setup database pada spreadsheet kosong ==');
ctx.Setup_initDatabase();
ok('semua tabel dibuat',
   Object.keys(ctx.SCHEMA).every(t => THE_DB.getSheetByName(t) !== null),
   'tab: ' + THE_DB.getSheets().map(s => s.getName()).join(', '));
ok('tab bawaan Sheet1 dibersihkan', THE_DB.getSheetByName('Sheet1') === null);
check('jumlah tab', THE_DB.getSheets().length, Object.keys(ctx.SCHEMA).length);

// Idempotensi: menjalankan ulang tidak boleh menggandakan tab atau menghapus data
ctx.Setup_seedMaster();
const machinesBefore = ctx.dbRead('MST_MACHINE', true).length;
ctx.Setup_initDatabase();
check('init ulang tidak menggandakan tab',
      THE_DB.getSheets().length, Object.keys(ctx.SCHEMA).length);
check('init ulang tidak menghapus data',
      ctx.dbRead('MST_MACHINE', true).length, machinesBefore);
check('mesin ter-seed', ctx.dbRead('MST_MACHINE', true).length, 6);
check('stasiun ter-seed', ctx.dbRead('MST_STATION', true).length, 13);

console.log('\n== 3b. Impor CSV ber-BOM ==');
// Excel menulis CSV dengan BOM. Sempat lolos diam-diam karena regex berisi
// karakter BOM literal menjadi no-op setelah berkas disunting.
check('stripBom_ membuang BOM', ctx.stripBom_('﻿task_id'), 'task_id');
check('stripBom_ membiarkan string bersih', ctx.stripBom_('task_id'), 'task_id');
check('stripBom_ tahan nilai kosong', ctx.stripBom_(null), '');
ok('tidak ada BOM literal tersisa di sumber .gs',
   fs.readdirSync(SRC).filter(f => f.endsWith('.gs'))
     .every(f => !fs.readFileSync(path.join(SRC, f), 'utf8').includes('﻿')),
   'regex berisi BOM literal mudah rusak saat disunting');

console.log('\n== 4. Master task dari hasil ekstraksi nyata ==');
const csv = fs.readFileSync(path.join(__dirname, '..', 'seed', 'am_tasks.csv'), 'utf8')
  .replace(/^﻿/, '');
const lines = csv.trim().split(/\r?\n/);
const head = lines[0].split(',');
function splitCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const taskRecords = lines.slice(1).map(l => {
  const cells = splitCsvLine(l);
  const o = {};
  ctx.SCHEMA.MST_AM_TASK.forEach(c => { o[c] = cells[head.indexOf(c)] || ''; });
  return o;
}).filter(r => r.task_id);
ctx.dbInsert('MST_AM_TASK', taskRecords);
console.log('   ' + taskRecords.length + ' task dimuat dari seed/am_tasks.csv');
ok('task termuat', ctx.dbRead('MST_AM_TASK', true).length === taskRecords.length);

console.log('\n== 5. Login lewat direktori karyawan ==');
// Identitas berasal dari spreadsheet karyawan, bukan dari tabel lokal.
const SHARED = 'DAM1234567';

check('normNik_ membuang ekor desimal', ctx.normNik_('328000022.0'), '328000022');
check('normDept_ menyatukan PROD dan Production',
      [ctx.normDept_('PROD'), ctx.normDept_('Production')], ['PRODUCTION', 'PRODUCTION']);
check('direktori termuat', Object.keys(ctx.empDirectory(true)).length, 8);

const packer = ctx.empFind('328000022');
ok('karyawan ditemukan lewat NIK bersih', packer !== null);
check('nama terbaca', packer.name, 'Azhar Aizad');

// Otorisasi menentukan peran, Jabatan menentukan kelompok stasiun
check('Buat -> OPERATOR', ctx.empAccess(packer).role, 'OPERATOR');
check('Packer -> 7 stasiun packer', ctx.empAccess(packer).stations.length, 7);
check('Verifikasi -> LEADER', ctx.empAccess(ctx.empFind('128000012')).role, 'LEADER');
check('Validasi -> MANAGER', ctx.empAccess(ctx.empFind('128000001')).role, 'MANAGER');
check('Operator Produksi -> stasiun OP',
      ctx.empAccess(ctx.empFind('328000023')).stations, ['OP1', 'OP2', 'OP3', 'OP4']);
check('Line Leader -> semua stasiun',
      ctx.empAccess(ctx.empFind('128000012')).stations.length, 13);

throws('password salah ditolak',
       () => ctx.authLogin('328000022', 'salah'), 'NIK atau password salah');
throws('NIK tidak terdaftar ditolak',
       () => ctx.authLogin('999999999', SHARED), 'NIK atau password salah');
throws('jabatan tanpa stasiun ditolak',
       () => ctx.authLogin('428000004', SHARED), 'belum dipetakan ke stasiun');

const opSession = ctx.authLogin('328000022', SHARED);
ok('login operator berhasil', !!opSession.token);
check('peran dari Otorisasi', opSession.user.role, 'OPERATOR');
check('sumber identitas', opSession.user.source, 'EMPLOYEE');
ok('ditandai wajib ganti password', opSession.user.must_change_password === true);
ok('NIK berekor .0 tetap bisa login', !!ctx.authLogin('328000022.0', SHARED).token);

const leadSession = ctx.authLogin('128000012', SHARED);
check('leader dari Otorisasi Verifikasi', leadSession.user.role, 'LEADER');

console.log('\n== 5b. Password pribadi menggantikan password bersama ==');
// Password bersama dipakai 981 dari 982 karyawan, jadi tidak boleh tetap
// berlaku setelah pengguna menetapkan password sendiri.
throws('password baru tidak boleh sama dengan password bersama',
       () => ctx.authChangePassword(opSession.token, SHARED, SHARED),
       'tidak boleh sama');
throws('password baru terlalu pendek ditolak',
       () => ctx.authChangePassword(opSession.token, SHARED, 'abc'), 'minimal 6');
throws('password lama salah ditolak',
       () => ctx.authChangePassword(opSession.token, 'ngawur', 'rahasia123'),
       'Password lama salah');

ctx.authChangePassword(opSession.token, SHARED, 'rahasia123');
ok('login dengan password pribadi', !!ctx.authLogin('328000022', 'rahasia123').token);
throws('password bersama tidak berlaku lagi',
       () => ctx.authLogin('328000022', SHARED), 'NIK atau password salah');
ok('hash disimpan, bukan password polos',
   ctx.dbFind('MST_USER', '328000022').password_hash !== 'rahasia123');
ok('tidak lagi wajib ganti password',
   ctx.authLogin('328000022', 'rahasia123').user.must_change_password === false);
ok('karyawan lain tidak terpengaruh', !!ctx.authLogin('328000024', SHARED).token);

console.log('\n== 5c. Akun lokal darurat ==');
// ADMIN tidak ada di direktori karyawan; sistem tidak boleh terkunci total
// bila spreadsheet karyawan bermasalah.
ctx.Setup_quickAdmin();
const admSession = ctx.authLogin('ADMIN', '123456');
check('peran ADMIN', admSession.user.role, 'ADMIN');
check('sumber identitas lokal', admSession.user.source, 'LOCAL');
ok('Setup_listUsers menyebut ADMIN', ctx.Setup_listUsers().indexOf('ADMIN') >= 0);
ok('diagnosa berjalan tanpa error', (ctx.Setup_diagnoseLogin('ADMIN', '123456'), true));
ok('audit pemetaan berjalan', ctx.Setup_auditEmployeeMapping().total === 8);

console.log('\n== 6. Akses stasiun ==');
throws('operator packer ditolak di stasiun OP',
       () => ctx.amGetChecklist(opSession.token,
             { machine_id: 'AHP1', station: 'OP1', date: '2026-08-29', shift: '1' }),
       'bukan penugasan Anda');

const opOP = ctx.authLogin('328000023', SHARED);   // Operator Produksi -> OP1..OP4
const cl = ctx.amGetChecklist(opOP.token,
  { machine_id: 'AHP1', station: 'OP1', date: '2026-08-29', shift: '1' });
ok('checklist OP1 terisi', cl.groups.length > 0,
   'grup: ' + cl.groups.map(g => g.frequency + '(' + g.tasks.length + ')').join(', '));
console.log('   grup: ' + cl.groups.map(g => g.frequency + ' x' + g.tasks.length).join(', '));
ok('semua grup berstatus DRAFT', cl.groups.every(g => g.status === 'DRAFT'));

console.log('\n== 6b. WEEKLY menampilkan rekap SHIFTLY ==');
const shiftlyGrp = cl.groups.find(g => g.frequency === 'SHIFTLY');
const weeklyGrp = cl.groups.find(g => g.frequency === 'WEEKLY');
ok('ada grup SHIFTLY dan WEEKLY untuk diuji', !!shiftlyGrp && !!weeklyGrp,
   'grup: ' + cl.groups.map(g => g.frequency).join(', '));
if (shiftlyGrp && weeklyGrp) {
  const nativeWeekly = weeklyGrp.tasks.filter(t => !t.recap);
  const recapWeekly = weeklyGrp.tasks.filter(t => t.recap);
  check('jumlah rekap = jumlah task SHIFTLY', recapWeekly.length, shiftlyGrp.tasks.length);
  ok('task asli WEEKLY tidak ikut ditandai recap', nativeWeekly.every(t => !t.recap));
  ok('rekap ditempatkan setelah task asli (bukan tercampur)',
     weeklyGrp.tasks.slice(0, nativeWeekly.length).every(t => !t.recap) &&
     weeklyGrp.tasks.slice(nativeWeekly.length).every(t => t.recap));
  check('task_id rekap sama persis dengan task_id SHIFTLY',
        recapWeekly.map(t => t.task_id).sort(),
        shiftlyGrp.tasks.map(t => t.task_id).sort());
  ok('grup SHIFTLY sendiri tidak ikut tertandai recap (tetap wajib per shift)',
     shiftlyGrp.tasks.every(t => !t.recap));
}

console.log('\n== 7. Submit checksheet ==');
const grp = cl.groups.find(g => g.frequency === 'SHIFTLY') || cl.groups[0];
const FAKE_PHOTO = 'https://drive.google.com/uc?export=view&id=FAKE_SEED';
const answers = grp.tasks.map((t, i) => ({
  task_id: t.task_id,
  result: i === 0 ? 'NG' : 'OK',
  note: i === 0 ? 'Ada kerak fluff di guide belt' : '',
  photo_url: FAKE_PHOTO
}));

throws('NG tanpa catatan ditolak', () => ctx.amSubmit(opOP.token, {
  machine_id: 'AHP1', station: 'OP1', date: '2026-08-29', shift: '1',
  frequency: grp.frequency,
  results: grp.tasks.map(t => ({ task_id: t.task_id, result: 'NG', note: '', photo_url: FAKE_PHOTO }))
}), 'wajib diberi catatan');

const sub = ctx.amSubmit(opOP.token, {
  machine_id: 'AHP1', station: 'OP1', date: '2026-08-29', shift: '1',
  frequency: grp.frequency, results: answers, note: 'shift pagi'
});
check('hitungan NG', sub.counts.NG, 1);
check('hitungan OK', sub.counts.OK, answers.length - 1);
check('temuan dibuat', sub.findings_created, 1);

console.log('\n== 7b. Foto bukti wajib untuk OK/NG ==');
throws('OK/NG tanpa foto ditolak', () => ctx.amSubmit(opOP.token, {
  machine_id: 'AHP1', station: 'OP1', date: '2026-08-29', shift: '1',
  frequency: grp.frequency,
  results: grp.tasks.map(t => ({ task_id: t.task_id, result: 'OK', note: '' }))
}), 'Foto bukti wajib');

const smallPhoto = Buffer.alloc(200, 7).toString('base64');   // 200 byte, jauh di bawah batas
const uploaded = ctx.photoUpload(opOP.token, {
  base64: 'data:image/jpeg;base64,' + smallPhoto,
  filename: 'test.jpg', mime_type: 'image/jpeg', task_id: grp.tasks[0].task_id
});
ok('upload foto berhasil', !!uploaded.url && uploaded.size === 200,
   'dapat: ' + JSON.stringify(uploaded));
ok('url mengarah ke Drive', uploaded.url.indexOf('drive.google.com') >= 0);

throws('mime bukan gambar ditolak', () => ctx.photoUpload(opOP.token, {
  base64: 'data:text/plain;base64,' + Buffer.from('bukan gambar').toString('base64'),
  filename: 'x.txt', mime_type: 'text/plain'
}), 'gambar');

const tooBig = Buffer.alloc(ctx.CFG.MAX_PHOTO_BYTES + 1024, 3).toString('base64');
throws('foto lebih dari 1 MB ditolak', () => ctx.photoUpload(opOP.token, {
  base64: tooBig, filename: 'big.jpg', mime_type: 'image/jpeg'
}), 'Maksimal 1 MB');

throws('sesi kedaluwarsa ditolak saat upload',
       () => ctx.photoUpload('token-palsu', { base64: smallPhoto, mime_type: 'image/jpeg' }),
       'SESSION_EXPIRED');

console.log('\n== 8. Idempotensi submit ulang ==');
const before = ctx.dbRead('TRX_AM_CHECK', true).length;
const sub2 = ctx.amSubmit(opOP.token, {
  machine_id: 'AHP1', station: 'OP1', date: '2026-08-29', shift: '1',
  frequency: grp.frequency,
  results: answers.map(a => ({ task_id: a.task_id, result: 'OK', note: '', photo_url: FAKE_PHOTO }))
});
check('header tidak berlipat', ctx.dbRead('TRX_AM_CHECK', true).length, before);
check('check_id sama', sub2.check_id, sub.check_id);
check('detail tidak berlipat',
      ctx.dbRead('TRX_AM_RESULT', true).filter(r => r.check_id === sub.check_id).length,
      answers.length);
check('temuan tidak diduplikasi (masih terbuka)', sub2.findings_created, 0);

console.log('\n== 8b. Submit WEEKLY (termasuk rekap SHIFTLY) ==');
const weeklyAnswers = weeklyGrp.tasks.map(t => ({
  task_id: t.task_id, result: 'OK', note: '', photo_url: FAKE_PHOTO
}));
const subWeekly = ctx.amSubmit(opOP.token, {
  machine_id: 'AHP1', station: 'OP1', date: '2026-08-29', shift: '1',
  frequency: 'WEEKLY', results: weeklyAnswers, note: 'rekap mingguan'
});
check('total task WEEKLY (asli + rekap) tersimpan', subWeekly.counts.OK, weeklyAnswers.length);
ok('check_id WEEKLY beda dari check_id SHIFTLY', subWeekly.check_id !== sub.check_id);
check('hasil rekap tersimpan di bawah check_id WEEKLY, bukan SHIFTLY',
      ctx.dbRead('TRX_AM_RESULT', true).filter(r => r.check_id === subWeekly.check_id).length,
      weeklyAnswers.length);
check('submission SHIFTLY sebelumnya tidak ikut berubah jumlahnya',
      ctx.dbRead('TRX_AM_RESULT', true).filter(r => r.check_id === sub.check_id).length,
      answers.length);

console.log('\n== 9. Verifikasi mengunci periode ==');
throws('operator tidak boleh verifikasi',
       () => ctx.amVerify(opOP.token, sub.check_id, ''), 'Akses ditolak');
ctx.amVerify(leadSession.token, sub.check_id, 'ok');
check('status jadi VERIFIED',
      ctx.dbFind('TRX_AM_CHECK', sub.check_id).status, 'VERIFIED');
throws('submit setelah verifikasi ditolak', () => ctx.amSubmit(opOP.token, {
  machine_id: 'AHP1', station: 'OP1', date: '2026-08-29', shift: '1',
  frequency: grp.frequency, results: answers
}), 'sudah diverifikasi');

console.log('\n== 10. Temuan ==');
const fl = ctx.findingList(leadSession.token, { open_only: true });
check('satu temuan terbuka', fl.count, 1);
const fid = fl.findings[0].finding_id;
throws('tutup tanpa catatan ditolak',
       () => ctx.findingClose(leadSession.token, fid, ''), 'wajib diisi');
ctx.findingAssign(leadSession.token, fid, 'ADMIN', '2026-09-05');
check('status jadi IN_PROGRESS',
      ctx.dbFind('TRX_FINDING', fid).status, 'IN_PROGRESS');
ctx.findingClose(leadSession.token, fid, 'sudah dibersihkan', 'Man Power Kurang');
check('status jadi CLOSED', ctx.dbFind('TRX_FINDING', fid).status, 'CLOSED');
check('tidak ada temuan terbuka',
      ctx.findingList(leadSession.token, { open_only: true }).count, 0);

console.log('\n== 11. Dashboard ==');
const dash = ctx.dashboardSummary(leadSession.token, { weeks: 8 });
ok('tren 8 minggu', dash.weeks.length === 8);
ok('ada minggu dengan data', dash.weeks.some(w => w.task > 0));
ok('compliance terhitung', dash.current.compliance !== undefined,
   'expected=' + dash.current.expected + ' submitted=' + dash.current.submitted);
console.log('   compliance hari ini: ' + dash.current.submitted + '/' + dash.current.expected);
ok('ringkasan temuan benar', dash.findings.closed === 1 && dash.findings.open === 0);

console.log('\n== 12. Router RPC ==');
const bad = ctx.rpc('tidak.ada', opSession.token, {});
check('aksi tak dikenal -> ok:false', bad.ok, false);
const expired = ctx.rpc('app.bootstrap', 'token-palsu', {});
check('token kedaluwarsa -> kode SESSION_EXPIRED', expired.code, 'SESSION_EXPIRED');
const boot = ctx.rpc('app.bootstrap', opSession.token, {});
ok('bootstrap berhasil', boot.ok && boot.data.machines.length === 6);
// Jabatan menentukan KELOMPOK stasiun, bukan satu stasiun tetap: operator
// berotasi antar stasiun tiap shift, jadi ia memilih sendiri saat membuka
// checksheet. Packer melihat PACKER1..7 dan tidak melihat satu pun OP.
ok('packer hanya melihat stasiun packer',
   boot.data.stations.length === 7 &&
   boot.data.stations.every(x => x.station_id.indexOf('PACKER') === 0),
   'dapat: ' + boot.data.stations.map(x => x.station_id).join(','));
const bootLead = ctx.rpc('app.bootstrap', leadSession.token, {});
ok('leader lihat semua stasiun', bootLead.data.stations.length === 13);
ok('hak leader benar',
   bootLead.data.can.verify === true && bootLead.data.can.admin === false);

// =================================================================== hasil ==
console.log('\n' + '='.repeat(60));
console.log(`HASIL: ${pass} lulus, ${fail} gagal`);
console.log('='.repeat(60));
process.exit(fail ? 1 : 0);
