/**
 * Lapisan akses data di atas Google Spreadsheet.
 *
 * Aturan main yang membuat ini tetap cepat di dalam batas Apps Script:
 *   - Satu tabel dibaca sekali penuh (getValues) lalu diolah di memori.
 *     Jangan pernah getRange() per baris di dalam loop.
 *   - Tulis memakai appendRows / setValues sekali jalan.
 *   - Semua operasi tulis dibungkus LockService supaya dua operator yang
 *     submit bersamaan tidak saling menimpa baris.
 */

/**
 * Spreadsheet database.
 *
 * Urutan penentuan sengaja dibuat begini: Script Property menang lebih dulu
 * supaya lingkungan uji bisa diarahkan ke salinan tanpa mengubah kode, lalu
 * spreadsheet induk bila script terikat padanya, terakhir ID default di CFG.
 */
function db_() {
  var id = PropertiesService.getScriptProperties().getProperty(CFG.PROP_DB_ID);
  if (id) return SpreadsheetApp.openById(id);

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  if (CFG.DEFAULT_DB_ID) return SpreadsheetApp.openById(CFG.DEFAULT_DB_ID);

  throw new Error('Database belum dikonfigurasi. Jalankan Setup_initDatabase() lebih dulu.');
}

function dbSheet_(table) {
  var sh = db_().getSheetByName(table);
  if (!sh) throw new Error('Tabel tidak ditemukan: ' + table);
  return sh;
}

/**
 * Baca seluruh tabel menjadi array of object.
 * @param {string} table Nama tabel pada SCHEMA.
 * @param {boolean=} noCache Lewati cache (dipakai setelah menulis).
 * @return {!Array<!Object>}
 */
function dbRead(table, noCache) {
  var cacheKey = 'tbl:' + table;
  var cache = CacheService.getScriptCache();

  if (!noCache && CACHED_TABLES.indexOf(table) >= 0) {
    var hit = cache.get(cacheKey);
    if (hit) {
      try {
        return JSON.parse(hit);
      } catch (e) {
        // cache rusak - abaikan dan baca ulang dari sheet
      }
    }
  }

  var sh = dbSheet_(table);
  var last = sh.getLastRow();
  var cols = SCHEMA[table];
  if (last < 2) return [];

  var values = sh.getRange(2, 1, last - 1, cols.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === '' || values[i][0] === null) continue;  // baris kosong
    var o = { _row: i + 2 };
    for (var c = 0; c < cols.length; c++) o[cols[c]] = values[i][c];
    rows.push(o);
  }

  if (CACHED_TABLES.indexOf(table) >= 0) {
    var payload = JSON.stringify(rows);
    // CacheService menolak nilai > 100KB; tabel besar cukup dibaca langsung.
    if (payload.length < 95000) cache.put(cacheKey, payload, CFG.CACHE_TTL_SEC);
  }
  return rows;
}

function dbInvalidate(table) {
  CacheService.getScriptCache().remove('tbl:' + table);
}

/**
 * Tambah satu atau banyak baris.
 * @param {string} table
 * @param {!Object|!Array<!Object>} records
 * @return {number} jumlah baris yang ditulis
 */
function dbInsert(table, records) {
  var list = Array.isArray(records) ? records : [records];
  if (!list.length) return 0;

  var cols = SCHEMA[table];
  var matrix = list.map(function (rec) {
    return cols.map(function (c) {
      var v = rec[c];
      return v === undefined || v === null ? '' : v;
    });
  });

  return withLock_(function () {
    var sh = dbSheet_(table);
    sh.getRange(sh.getLastRow() + 1, 1, matrix.length, cols.length).setValues(matrix);
    dbInvalidate(table);
    return matrix.length;
  });
}

/**
 * Perbarui baris berdasarkan primary key (kolom pertama).
 * @return {boolean} true jika baris ditemukan dan diperbarui
 */
function dbUpdate(table, keyValue, patch) {
  var cols = SCHEMA[table];
  return withLock_(function () {
    var rows = dbRead(table, true);
    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][cols[0]]) === String(keyValue)) { target = rows[i]; break; }
    }
    if (!target) return false;

    Object.keys(patch).forEach(function (k) { target[k] = patch[k]; });
    var line = cols.map(function (c) {
      var v = target[c];
      return v === undefined || v === null ? '' : v;
    });
    dbSheet_(table).getRange(target._row, 1, 1, cols.length).setValues([line]);
    dbInvalidate(table);
    return true;
  });
}

/** Cari satu baris berdasarkan primary key. */
function dbFind(table, keyValue) {
  var pk = SCHEMA[table][0];
  var rows = dbRead(table);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][pk]) === String(keyValue)) return rows[i];
  }
  return null;
}

/** Filter tabel dengan predikat. */
function dbWhere(table, predicate) {
  return dbRead(table).filter(predicate);
}

/**
 * Ambil baris yang nilai kolom tertentunya termasuk dalam daftar `values`.
 *
 * Dipakai untuk tabel transaksi yang tumbuh terus (TRX_AM_RESULT bertambah
 * ribuan baris per minggu). Membaca satu kolom kunci jauh lebih murah daripada
 * seluruh tabel, lalu hanya blok baris yang relevan yang dibaca penuh. Baris
 * milik satu check selalu ditulis sekaligus sehingga letaknya berdekatan dan
 * blok min..max tetap sempit.
 *
 * @param {string} table
 * @param {string} colName Kolom yang dicocokkan.
 * @param {!Array<string>} values
 * @return {!Array<!Object>}
 */
function dbReadByKey(table, colName, values) {
  if (!values || !values.length) return [];

  var cols = SCHEMA[table];
  var colIdx = cols.indexOf(colName);
  if (colIdx < 0) throw new Error('Kolom tidak ada di ' + table + ': ' + colName);

  var sh = dbSheet_(table);
  var last = sh.getLastRow();
  if (last < 2) return [];

  var wanted = {};
  values.forEach(function (v) { wanted[String(v)] = true; });

  var keys = sh.getRange(2, colIdx + 1, last - 1, 1).getValues();
  var hits = [];
  for (var i = 0; i < keys.length; i++) {
    if (wanted[String(keys[i][0])]) hits.push(i + 2);
  }
  if (!hits.length) return [];

  var lo = hits[0];
  var hi = hits[hits.length - 1];
  var block = sh.getRange(lo, 1, hi - lo + 1, cols.length).getValues();

  return hits.map(function (rowNum) {
    var raw = block[rowNum - lo];
    var o = { _row: rowNum };
    for (var c = 0; c < cols.length; c++) o[cols[c]] = raw[c];
    return o;
  });
}

/**
 * Bungkus operasi tulis dengan lock skrip.
 * Tanpa ini, dua submit bersamaan bisa menulis ke baris terakhir yang sama.
 *
 * Lock dibuat reentrant lewat penghitung kedalaman karena operasi tingkat atas
 * (mis. amSubmit) memanggil dbInsert/dbUpdate yang juga mengunci. Satu eksekusi
 * Apps Script berjalan single-threaded, jadi penghitung sederhana sudah cukup
 * dan mencegah eksekusi mengunci dirinya sendiri.
 */
var LOCK_DEPTH_ = 0;
var LOCK_HANDLE_ = null;

function withLock_(fn) {
  if (LOCK_DEPTH_ > 0) {          // sudah memegang lock di frame luar
    LOCK_DEPTH_++;
    try {
      return fn();
    } finally {
      LOCK_DEPTH_--;
    }
  }

  LOCK_HANDLE_ = LockService.getScriptLock();
  if (!LOCK_HANDLE_.tryLock(20000)) {
    LOCK_HANDLE_ = null;
    throw new Error('Sistem sedang sibuk, coba lagi sebentar lagi.');
  }
  LOCK_DEPTH_ = 1;
  try {
    return fn();
  } finally {
    LOCK_DEPTH_--;
    if (LOCK_DEPTH_ === 0 && LOCK_HANDLE_) {
      LOCK_HANDLE_.releaseLock();
      LOCK_HANDLE_ = null;
    }
  }
}

/** ID acak pendek yang cukup untuk volume harian pabrik. */
function newId_(prefix) {
  var ts = Date.now().toString(36).toUpperCase();
  var rnd = Math.floor(Math.random() * 1679616).toString(36).toUpperCase();
  return prefix + '-' + ts + '-' + ('0000' + rnd).slice(-4);
}

function nowIso_() {
  return Utilities.formatDate(new Date(), CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function today_() {
  return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
}

/**
 * Normalkan nilai tanggal menjadi string 'yyyy-MM-dd'.
 *
 * Spreadsheet bisa mengubah '2026-08-29' menjadi objek Date meskipun kolom
 * sudah diformat teks (mis. saat data ditempel manual oleh admin). Semua
 * pembacaan tanggal harus lewat sini, jangan pernah String(v).slice(0, 10) -
 * pada objek Date itu menghasilkan 'Sat Aug 2' dan diam-diam merusak
 * pengelompokan per minggu di dashboard.
 */
function ymd_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, CFG.TZ, 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : s.slice(0, 10);
}

/** Catat jejak audit. Sengaja tidak dibungkus try/catch agar kegagalan terlihat. */
function audit_(nik, action, entity, entityId, detail) {
  dbInsert('LOG_AUDIT', {
    ts: nowIso_(),
    nik: nik || '-',
    action: action,
    entity: entity || '',
    entity_id: entityId || '',
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail || {})
  });
}
