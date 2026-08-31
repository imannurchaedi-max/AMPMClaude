/**
 * Direktori karyawan - sumber kebenaran identitas, dibaca langsung saat login.
 *
 * Data karyawan TIDAK disalin ke database aplikasi. Setiap login membaca
 * spreadsheet DATA KARYAWAN, sehingga karyawan baru, mutasi jabatan, dan
 * resign otomatis terpakai tanpa perlu impor ulang.
 *
 * Pemetaan peran memakai kolom Otorisasi yang sudah dipakai sistem lain di
 * pabrik (Buat / Verifikasi / Validasi), bukan kosakata baru, supaya artinya
 * tidak bergeser antar aplikasi.
 */

var EMP = {
  SHEET_ID: '14OTl9xYINyRIqnJ2AEaCJFD_D9tNRRueNgFby6FjY9o',
  TAB: 'KARYAWAN',
  CACHE_KEY: 'emp:karyawan',
  CACHE_TTL: 600,

  // Kolom yang dibaca. Nama harus sama persis dengan header di baris 1.
  COL: {
    nik: 'NIK',
    name: 'Nama',
    dept: 'Departemen',
    jabatan: 'Jabatan',
    otorisasi: 'Otorisasi',
    password: 'Password',
    email: 'Email'
  }
};

/**
 * Otorisasi -> peran aplikasi.
 * Buat = mengisi checksheet, Verifikasi = mengesahkan, Validasi = memantau.
 */
var OTORISASI_ROLE = {
  'BUAT': 'OPERATOR',
  'VERIFIKASI': 'LEADER',
  'VALIDASI': 'MANAGER'
};

/**
 * Jabatan -> kelompok stasiun yang boleh dikerjakan.
 *
 * Data karyawan tidak menyimpan nomor stasiun (hanya "Packer", bukan
 * "Packer 3"), dan memang tidak bisa: operator berotasi antar stasiun tiap
 * shift. Jadi jabatan hanya menentukan KELOMPOK stasiun, lalu stasiun
 * spesifiknya dipilih sendiri saat membuka checksheet.
 *
 * 'OP'      -> OP1..OP4
 * 'PACKER'  -> PACKER1..PACKER7
 * 'PALLET'  -> PALLETING1..PALLETING2
 * '*'       -> semua stasiun (pengawas)
 * tidak terdaftar -> tidak berkepentingan dengan AM, login ditolak
 */
var JABATAN_STATIONS = {
  'PACKER': 'PACKER',
  'PRODUKSI HARIAN': 'PACKER',
  'PRODUKSI BORONGAN': 'PACKER',
  'OPERATOR PRODUKSI': 'OP',
  'OPERATOR PRODUCTION': 'OP',
  'OPERATOR FORKLIFT': 'PALLET',
  'OPERATOR REACHTRUCK': 'PALLET',
  'CHECKER': 'PALLET',
  'LINE LEADER': '*',
  'SHIFT LEADER': '*',
  'PIC AREA': '*',
  'PRODUCTION CHIEF SPV 1': '*',
  'PRODUCTION ENGINEER SPV': '*',
  'MANUFACTURING HEAD': '*',
  'PLANT MANAGER': '*'
};

/** Departemen ditulis tidak konsisten di sumber ('Production' dan 'PROD'). */
function normDept_(v) {
  var d = String(v || '').trim().toUpperCase();
  if (d.indexOf('PROD') === 0 || d === 'PRODUCTION') return 'PRODUCTION';
  if (d.indexOf('ENG') === 0) return 'ENGINEERING';
  if (d.indexOf('LOG') === 0) return 'LOGISTIC';
  if (d.indexOf('QUALITY') === 0 || d.indexOf('QC') === 0) return 'QUALITY';
  if (d.indexOf('HR') === 0) return 'HRGA';
  return d;
}

/**
 * Sheets menyimpan NIK sebagai angka, sehingga terbaca '128000001.0'.
 * Login mencocokkan string, jadi ekor desimal harus dibuang lebih dulu.
 */
function normNik_(v) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  if (/^\d+\.0+$/.test(s)) s = s.split('.')[0];
  return s;
}

/** Password pun bisa terbaca sebagai angka ('132325.0'). */
function normPass_(v) {
  return normNik_(v);
}

/**
 * Baca seluruh direktori karyawan menjadi peta nik -> data.
 * @param {boolean=} noCache
 * @return {!Object<string, !Object>}
 */
function empDirectory(noCache) {
  var cache = CacheService.getScriptCache();
  if (!noCache) {
    var hit = cache.get(EMP.CACHE_KEY);
    if (hit) {
      try {
        return JSON.parse(hit);
      } catch (e) {
        // cache rusak - baca ulang dari sheet
      }
    }
  }

  var sh = SpreadsheetApp.openById(EMP.SHEET_ID).getSheetByName(EMP.TAB);
  if (!sh) {
    throw new Error('Tab "' + EMP.TAB + '" tidak ditemukan di spreadsheet karyawan.');
  }

  var last = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (last < 2) throw new Error('Direktori karyawan kosong.');

  var values = sh.getRange(1, 1, last, lastCol).getValues();
  var head = values[0].map(function (h) { return String(h).trim(); });

  var idx = {};
  Object.keys(EMP.COL).forEach(function (k) {
    idx[k] = head.indexOf(EMP.COL[k]);
  });
  if (idx.nik < 0 || idx.password < 0) {
    throw new Error('Kolom NIK atau Password tidak ada di tab ' + EMP.TAB + '.');
  }

  var map = {};
  for (var r = 1; r < values.length; r++) {
    var nik = normNik_(values[r][idx.nik]);
    if (!nik) continue;
    map[nik] = {
      nik: nik,
      name: String(values[r][idx.name] || '').trim(),
      dept: normDept_(values[r][idx.dept]),
      jabatan: String(values[r][idx.jabatan] || '').trim(),
      otorisasi: String(values[r][idx.otorisasi] || '').trim(),
      password: normPass_(values[r][idx.password]),
      email: idx.email >= 0 ? String(values[r][idx.email] || '').trim() : ''
    };
  }

  var payload = JSON.stringify(map);
  // CacheService menolak nilai besar; direktori besar cukup dibaca langsung.
  if (payload.length < 95000) cache.put(EMP.CACHE_KEY, payload, EMP.CACHE_TTL);
  return map;
}

/** Cari satu karyawan berdasarkan NIK. */
function empFind(nik) {
  return empDirectory()[normNik_(nik)] || null;
}

function empRefresh() {
  CacheService.getScriptCache().remove(EMP.CACHE_KEY);
  var n = Object.keys(empDirectory(true)).length;
  Logger.log('Direktori karyawan dimuat ulang: %s orang', n);
  return n;
}

/**
 * Terjemahkan data karyawan menjadi hak akses aplikasi.
 *
 * @param {!Object} emp Baris karyawan dari empDirectory().
 * @return {{role: string, stations: !Array<string>, group: string}}
 */
function empAccess(emp) {
  var role = OTORISASI_ROLE[String(emp.otorisasi).toUpperCase()] || 'OPERATOR';
  var group = JABATAN_STATIONS[String(emp.jabatan).toUpperCase().trim()] || '';

  // Pengawas dan manajemen tidak terikat stasiun tertentu
  if (CFG.ROLES[role] >= CFG.ROLES.LEADER) group = group || '*';

  var stations = [];
  if (group === '*') {
    stations = ['OP1', 'OP2', 'OP3', 'OP4',
                'PACKER1', 'PACKER2', 'PACKER3', 'PACKER4',
                'PACKER5', 'PACKER6', 'PACKER7',
                'PALLETING1', 'PALLETING2'];
  } else if (group === 'OP') {
    stations = ['OP1', 'OP2', 'OP3', 'OP4'];
  } else if (group === 'PACKER') {
    stations = ['PACKER1', 'PACKER2', 'PACKER3', 'PACKER4',
                'PACKER5', 'PACKER6', 'PACKER7'];
  } else if (group === 'PALLET') {
    stations = ['PALLETING1', 'PALLETING2'];
  }

  return { role: role, stations: stations, group: group };
}

/**
 * Lini yang boleh diakses.
 *
 * Tab KARYAWAN tidak menyimpan Section, jadi lini tidak bisa disimpulkan dari
 * sana. Pembatasan lini karena itu tidak diterapkan - operator memilih mesin,
 * dan mesin itulah yang menentukan lini. Fungsi ini disediakan sebagai satu
 * tempat untuk mengubahnya bila kelak Section ikut disediakan.
 */
function empLines(emp) {
  return [];  // kosong = semua lini
}

/** Ringkasan direktori, untuk memeriksa kesehatan pemetaan dari editor. */
function Setup_auditEmployeeMapping() {
  var dir = empDirectory(true);
  var niks = Object.keys(dir);
  var byRole = {}, unmapped = {}, eligible = 0;

  niks.forEach(function (n) {
    var e = dir[n];
    var a = empAccess(e);
    byRole[a.role] = (byRole[a.role] || 0) + 1;
    if (!a.stations.length) {
      unmapped[e.jabatan] = (unmapped[e.jabatan] || 0) + 1;
    } else {
      eligible++;
    }
  });

  Logger.log('===== AUDIT PEMETAAN KARYAWAN =====');
  Logger.log('Total karyawan     : %s', niks.length);
  Logger.log('Bisa memakai AM    : %s', eligible);
  Logger.log('Peran              : %s', JSON.stringify(byRole));
  Logger.log('');
  Logger.log('Jabatan TANPA stasiun (login AM ditolak):');
  Object.keys(unmapped).sort(function (a, b) {
    return unmapped[b] - unmapped[a];
  }).forEach(function (j) {
    Logger.log('  %s orang - %s', unmapped[j], j || '(kosong)');
  });
  Logger.log('');
  Logger.log('Tambahkan jabatan ke JABATAN_STATIONS di 09_Employee.gs bila ada');
  Logger.log('yang seharusnya boleh mengisi checksheet.');
  Logger.log('===================================');
  return { total: niks.length, eligible: eligible, byRole: byRole, unmapped: unmapped };
}
