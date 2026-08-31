/**
 * Setup sekali jalan: menyiapkan tab pada spreadsheet yang sudah ada,
 * mengisi master, dan membuat akun admin pertama.
 *
 * Urutan menjalankan (dari editor Apps Script, menu Run):
 *   1. Setup_initDatabase()     -> buat semua tab pada spreadsheet terikat
 *   2. Setup_seedMaster()       -> isi mesin & stasiun
 *   3. Setup_importAmTasks()    -> impor am_tasks.csv yang diunggah ke Drive
 *   4. Setup_createAdmin()      -> buat akun admin, PIN dicetak di log
 * Lalu Deploy > New deployment > Web app.
 */

/**
 * Siapkan struktur tabel pada spreadsheet database.
 *
 * Aman dijalankan berulang: tab yang sudah ada tidak disentuh isinya, hanya
 * header dan formatnya yang diselaraskan dengan SCHEMA. Ini juga jalur yang
 * dipakai untuk memasang skema pada spreadsheet kosong yang dibuat manual.
 *
 * @return {string} ID spreadsheet yang dipakai
 */
function Setup_initDatabase() {
  var ss = db_();
  var created = [], updated = [];

  Object.keys(SCHEMA).forEach(function (table) {
    var cols = SCHEMA[table];
    var sh = ss.getSheetByName(table);

    if (!sh) {
      sh = ss.insertSheet(table);
      created.push(table);
    } else {
      updated.push(table);
    }

    sh.getRange(1, 1, 1, cols.length).setValues([cols])
      .setFontWeight('bold').setBackground('#e8eaed');
    sh.setFrozenRows(1);

    // Buang kolom sisa agar getLastColumn() tidak menyesatkan
    if (sh.getMaxColumns() > cols.length) {
      sh.deleteColumns(cols.length + 1, sh.getMaxColumns() - cols.length);
    }

    // Paksa seluruh kolom bertipe teks. Tanpa ini Sheets mengubah '2026-08-29'
    // menjadi Date dan '1.0' menjadi angka, sehingga kunci periode serta
    // task_id tidak lagi cocok saat dibaca kembali.
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    dbInvalidate(table);
  });

  // Spreadsheet baru selalu membawa satu tab kosong bawaan. Hapus hanya bila
  // benar-benar kosong dan bukan salah satu tabel kita.
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (SCHEMA[name]) return;
    if (ss.getSheets().length <= 1) return;
    if (sh.getLastRow() === 0 && /^(Sheet|Sheet1|Sheet 1)$/i.test(name)) {
      ss.deleteSheet(sh);
      Logger.log('Tab bawaan kosong dihapus: %s', name);
    }
  });

  pinSalt_();  // buat salt sekarang, sebelum ada user
  Logger.log('Database siap: %s', ss.getUrl());
  Logger.log('Tab dibuat  : %s', created.join(', ') || '(tidak ada)');
  Logger.log('Tab diperiksa: %s', updated.join(', ') || '(tidak ada)');
  return ss.getId();
}

/** Mesin dan stasiun sesuai data Form PM03 dan checksheet AM. */
function Setup_seedMaster() {
  var machines = [
    { machine_id: 'AHP1', line: 'AHP', name: 'Adult Pants 1', seq: 1, active: 'TRUE' },
    { machine_id: 'BHP1', line: 'BHP', name: 'Baby Pants 1', seq: 2, active: 'TRUE' },
    { machine_id: 'BHP2', line: 'BHP', name: 'Baby Pants 2', seq: 3, active: 'TRUE' },
    { machine_id: 'BHP3', line: 'BHP', name: 'Baby Pants 3', seq: 4, active: 'TRUE' },
    { machine_id: 'BHP4', line: 'BHP', name: 'Baby Pants 4', seq: 5, active: 'TRUE' },
    { machine_id: 'BHP5', line: 'BHP', name: 'Baby Pants 5', seq: 6, active: 'TRUE' }
  ];

  var stations = [];
  ['OP1', 'OP2', 'OP3', 'OP4'].forEach(function (id, i) {
    stations.push({ station_id: id, label: 'Operator ' + id.slice(2),
                    type: 'OPERATOR', seq: i + 1, active: 'TRUE' });
  });
  for (var p = 1; p <= 7; p++) {
    stations.push({ station_id: 'PACKER' + p, label: 'Packer ' + p,
                    type: 'PACKER', seq: 10 + p, active: 'TRUE' });
  }
  for (var q = 1; q <= 2; q++) {
    stations.push({ station_id: 'PALLETING' + q, label: 'Palleting ' + q,
                    type: 'PALLETING', seq: 20 + q, active: 'TRUE' });
  }

  if (!dbRead('MST_MACHINE', true).length) dbInsert('MST_MACHINE', machines);
  if (!dbRead('MST_STATION', true).length) dbInsert('MST_STATION', stations);
  Logger.log('Master terisi: %s mesin, %s stasiun', machines.length, stations.length);
}

/**
 * Buang BOM (U+FEFF) di awal string.
 *
 * Excel menulis CSV dengan BOM. Bila tidak dibuang, header pertama terbaca
 * sebagai '<BOM>task_id' dan impor gagal dengan pesan menyesatkan
 * "Kolom CSV kurang: task_id".
 *
 * Sengaja memakai perbandingan kode karakter, bukan regex berisi BOM literal:
 * karakter itu tidak terlihat di editor dan pernah hilang diam-diam saat
 * berkas ini disunting, membuat penyaringan menjadi no-op tanpa gejala.
 */
function stripBom_(s) {
  s = String(s === undefined || s === null ? '' : s);
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

/**
 * Impor master task AM dari file CSV hasil tools/extract_am_master.py.
 * Unggah seed/am_tasks.csv ke Drive lebih dulu, lalu jalankan fungsi ini.
 *
 * @param {string=} fileName Nama file di Drive (default 'am_tasks.csv').
 */
function Setup_importAmTasks(fileName) {
  fileName = fileName || 'am_tasks.csv';
  var files = DriveApp.getFilesByName(fileName);
  if (!files.hasNext()) {
    throw new Error('File tidak ditemukan di Drive: ' + fileName);
  }

  var text = stripBom_(files.next().getBlob().getDataAsString('UTF-8'));
  var rows = Utilities.parseCsv(text);
  if (rows.length < 2) throw new Error('CSV kosong.');

  var head = rows[0].map(function (h) { return stripBom_(h).trim(); });
  var cols = SCHEMA.MST_AM_TASK;
  var missing = cols.filter(function (c) { return head.indexOf(c) < 0; });
  if (missing.length) {
    throw new Error('Kolom CSV kurang: ' + missing.join(', '));
  }

  var records = rows.slice(1)
    .filter(function (r) { return r[head.indexOf('task_id')]; })
    .map(function (r) {
      var o = {};
      cols.forEach(function (c) { o[c] = r[head.indexOf(c)]; });
      return o;
    });

  // Impor bersifat replace agar bisa dijalankan ulang setelah master direvisi
  var sh = dbSheet_('MST_AM_TASK');
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  dbInvalidate('MST_AM_TASK');
  dbInsert('MST_AM_TASK', records);

  Logger.log('Impor selesai: %s task', records.length);
  return records.length;
}

/** Buat akun admin pertama. PIN acak dicetak ke log - segera ganti setelah login. */
function Setup_createAdmin(nik, name) {
  nik = nik || 'ADMIN';
  name = name || 'Administrator';
  if (dbFind('MST_USER', nik)) {
    Logger.log('User %s sudah ada.', nik);
    return;
  }
  var pin = String(Math.floor(100000 + Math.random() * 900000));
  dbInsert('MST_USER', {
    nik: nik,
    name: name,
    password_hash: hashPassword_(nik, pin),
    role: 'ADMIN',
    line: '',
    stations: '',
    active: 'TRUE',
    created_at: nowIso_(),
    last_login: ''
  });
  Logger.log('Admin dibuat. NIK: %s  PASSWORD: %s  <- catat sekarang, ganti setelah login.',
             nik, pin);
}

/**
 * Reset password akun lokal dari editor Apps Script.
 *
 * Jalur pemulihan untuk kondisi PIN admin awal telanjur hilang. PIN tidak
 * pernah disimpan polos - yang ada di MST_USER hanya hash SHA-256 bersalt -
 * sehingga PIN lama memang tidak bisa dibaca ulang, hanya bisa diganti.
 *
 * Sengaja tidak memakai token sesi seperti authResetPassword(): fungsi ini hanya
 * dapat dijalankan dari editor, yang sudah menuntut akses ke proyek Apps
 * Script. Jadi ia tidak menambah permukaan serangan lewat webapp.
 *
 * @param {string=} nik NIK yang direset (default 'ADMIN').
 * @param {string=} newPin PIN baru 6 digit. Bila kosong, dibuatkan acak.
 * @return {string} PIN baru
 */
function Setup_resetAdminPin(nik, newPin) {
  nik = String(nik || 'ADMIN').trim();
  var pin = String(newPin || Math.floor(100000 + Math.random() * 900000));
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN harus 6 digit angka.');

  var user = dbFind('MST_USER', nik);
  if (user) {
    dbUpdate('MST_USER', nik, { password_hash: hashPassword_(nik, pin), active: 'TRUE' });
  } else {
    dbInsert('MST_USER', {
      nik: nik,
      name: 'Administrator',
      password_hash: hashPassword_(nik, pin),
      role: 'ADMIN',
      line: '',
      stations: '',
      active: 'TRUE',
      created_at: nowIso_(),
      last_login: ''
    });
  }

  // Buka kunci bila akun sempat terkunci karena percobaan login gagal
  CacheService.getScriptCache().remove('fail:' + nik);

  Logger.log('==================================================');
  Logger.log('  %s', user ? 'PASSWORD DIRESET' : 'AKUN DIBUAT');
  Logger.log('  NIK : %s', nik);
  Logger.log('  PASSWORD : %s', pin);
  Logger.log('  Catat sekarang. Ganti lewat menu Ganti Password.');
  Logger.log('==================================================');
  return pin;
}

/**
 * Tetapkan akun admin dengan PIN yang pasti: NIK 'ADMIN', PIN '123456'.
 *
 * Dipakai ketika login gagal dan penyebabnya belum jelas - menghapus semua
 * variabel yang bisa keliru sekaligus (PIN salah ketik, akun terkunci, akun
 * nonaktif, cache basi). PIN sengaja diketahui, jadi segera ganti setelah
 * berhasil masuk.
 */
function Setup_quickAdmin() {
  Setup_resetAdminPin('ADMIN', '123456');
  // Kosongkan cache master supaya webapp tidak membaca baris lama
  ['MST_USER', 'MST_MACHINE', 'MST_STATION', 'MST_AM_TASK'].forEach(dbInvalidate);
  Logger.log('Masuk dengan NIK "ADMIN" dan password "123456", lalu segera ganti password.');
}

/**
 * Laporkan kondisi sebenarnya dari jalur login - untuk memastikan, bukan menduga.
 *
 * Memeriksa berurutan setiap hal yang bisa menggagalkan login: spreadsheet yang
 * dituju, keberadaan salt, isi tabel pengguna, lalu pencocokan hash PIN.
 *
 * @param {string=} nik NIK yang diperiksa (default 'ADMIN').
 * @param {string=} pin PIN yang ingin diuji cocok atau tidak. Opsional.
 */
function Setup_diagnoseLogin(nik, pin) {
  nik = String(nik || 'ADMIN').trim();
  Logger.log('===== DIAGNOSA LOGIN =====');

  var ss = db_();
  Logger.log('1. Database : %s', ss.getName());
  Logger.log('   ID       : %s', ss.getId());
  Logger.log('   Cocok CFG.DEFAULT_DB_ID? %s', ss.getId() === CFG.DEFAULT_DB_ID);

  var props = PropertiesService.getScriptProperties();
  var overrideId = props.getProperty(CFG.PROP_DB_ID);
  Logger.log('2. Override DB_SPREADSHEET_ID: %s', overrideId || '(tidak diset)');

  var salt = props.getProperty(CFG.PROP_PIN_SALT);
  Logger.log('3. Salt password : %s', salt ? 'ADA (' + salt.length + ' karakter)' : 'TIDAK ADA');
  if (!salt) {
    Logger.log('   -> Salt hilang. Semua password pribadi lama otomatis tidak cocok.');
    Logger.log('   -> Jalankan Setup_quickAdmin() untuk membuat ulang.');
  }

  var sh = ss.getSheetByName('MST_USER');
  Logger.log('4. Tab MST_USER: %s', sh ? 'ADA, baris terisi ' + sh.getLastRow() : 'TIDAK ADA');
  if (!sh) {
    Logger.log('   -> Jalankan Setup_initDatabase() lebih dulu.');
    return;
  }

  var users = dbRead('MST_USER', true);   // paksa baca sheet, abaikan cache
  Logger.log('5. Jumlah pengguna: %s', users.length);
  users.forEach(function (u) {
    Logger.log('   NIK "%s" | %s | aktif=%s | hash %s karakter',
               u.nik, u.role, u.active, String(u.password_hash).length);
  });

  var user = dbFind('MST_USER', nik);
  Logger.log('6. Cari NIK "%s": %s', nik, user ? 'KETEMU' : 'TIDAK KETEMU');
  if (!user) {
    Logger.log('   -> Perhatikan spasi tersembunyi pada NIK di atas.');
    Logger.log('   -> Jalankan Setup_quickAdmin() untuk membuat akun bersih.');
    return;
  }

  var aktif = String(user.active).toUpperCase() === 'TRUE';
  Logger.log('7. Status aktif: %s (nilai tersimpan: "%s")', aktif, user.active);

  if (pin) {
    var hitung = hashPassword_(nik, pin);
    var cocok = user.password_hash === hitung;
    Logger.log('8. Uji password "%s": %s', pin, cocok ? 'COCOK' : 'TIDAK COCOK');
    Logger.log('   hash tersimpan : %s...', String(user.password_hash).slice(0, 16));
    Logger.log('   hash dari input: %s...', hitung.slice(0, 16));
    if (cocok && aktif) Logger.log('   -> Login seharusnya BERHASIL dengan PIN ini.');
  } else {
    Logger.log('8. Password tidak diuji. Panggil Setup_diagnoseLogin("ADMIN", "123456").');
  }
  Logger.log('==========================');
}

/**
 * Daftar pengguna terdaftar - untuk memeriksa NIK apa saja yang ada
 * ketika lupa akun mana yang dipakai. PIN tidak pernah ditampilkan.
 */
function Setup_listUsers() {
  var users = dbRead('MST_USER', true);
  if (!users.length) {
    Logger.log('Belum ada pengguna. Jalankan Setup_resetAdminPin().');
    return [];
  }
  Logger.log('%s pengguna terdaftar:', users.length);
  users.forEach(function (u) {
    Logger.log('  NIK %s | %s | %s | stasiun: %s | aktif: %s',
               u.nik, u.name, u.role, u.stations || '-', u.active);
  });
  return users.map(function (u) { return u.nik; });
}

/**
 * Tambah pengguna. Dipakai admin lewat UI, atau manual dari editor.
 * @param {string} token
 * @param {{nik: string, name: string, role: string, line: string,
 *          stations: string, pin: string}} rec
 */
function userCreate(token, rec) {
  var s = sessionOf_(token);
  requireRole_(s, 'ADMIN');

  var nik = String(rec.nik || '').trim();
  if (!nik) throw new Error('NIK wajib diisi.');
  if (dbFind('MST_USER', nik)) throw new Error('NIK sudah terdaftar: ' + nik);
  if (!CFG.ROLES[String(rec.role || '').toUpperCase()]) {
    throw new Error('Peran tidak dikenal: ' + rec.role);
  }
  if (!/^\d{6}$/.test(String(rec.pin || ''))) {
    throw new Error('PIN harus 6 digit angka.');
  }

  dbInsert('MST_USER', {
    nik: nik,
    name: String(rec.name || '').trim(),
    password_hash: hashPassword_(nik, rec.pin),
    role: String(rec.role).toUpperCase(),
    line: String(rec.line || '').trim(),
    stations: String(rec.stations || '').trim().toUpperCase(),
    active: 'TRUE',
    created_at: nowIso_(),
    last_login: ''
  });
  audit_(s.nik, 'USER_CREATE', 'MST_USER', nik, { role: rec.role });
  return { ok: true };
}

/**
 * Migrasi skema: tambahkan kolom baru pada tab yang sudah ada tanpa
 * menghapus data. Jalankan setelah mengubah SCHEMA di 00_Config.gs.
 */
function Setup_migrateSchema() {
  var ss = db_();
  Object.keys(SCHEMA).forEach(function (table) {
    var sh = ss.getSheetByName(table);
    if (!sh) {
      sh = ss.insertSheet(table);
      sh.getRange(1, 1, 1, SCHEMA[table].length).setValues([SCHEMA[table]])
        .setFontWeight('bold').setBackground('#e8eaed');
      sh.setFrozenRows(1);
      Logger.log('Tab baru dibuat: %s', table);
      return;
    }
    var want = SCHEMA[table];
    var have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]
      .filter(String);
    var added = want.filter(function (c) { return have.indexOf(c) < 0; });
    if (added.length) {
      sh.getRange(1, 1, 1, want.length).setValues([want])
        .setFontWeight('bold').setBackground('#e8eaed');
      Logger.log('%s: kolom ditambahkan -> %s', table, added.join(', '));
    }
    dbInvalidate(table);
  });
  Logger.log('Migrasi skema selesai.');
}
