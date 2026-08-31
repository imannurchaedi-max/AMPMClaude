/**
 * AM/PM Tracker - Konfigurasi & skema database.
 *
 * Backend memakai Google Spreadsheet sebagai database. Setiap tab adalah tabel;
 * SCHEMA di bawah adalah satu-satunya sumber kebenaran untuk urutan kolom.
 * Jangan menyusun ulang kolom di spreadsheet secara manual - ubah di sini lalu
 * jalankan Setup_migrateSchema().
 */

var CFG = {
  APP_NAME: 'AM/PM Tracker',
  VERSION: '0.1.0',
  TZ: 'Asia/Jakarta',

  /**
   * Spreadsheet yang dipakai sebagai database.
   *
   * Script ini terikat (container-bound) pada spreadsheet tersebut, jadi
   * normalnya getActiveSpreadsheet() sudah cukup. ID eksplisit tetap disimpan
   * sebagai cadangan agar fungsi yang dijalankan dari pemicu waktu atau dari
   * script lain tetap menemukan database yang benar.
   */
  DEFAULT_DB_ID: '1x1kmQemH80GlVZaT1QVr3QSITsHIYIHzVursa7uFkb8',

  // Menimpa DEFAULT_DB_ID bila diisi; berguna untuk lingkungan uji terpisah.
  PROP_DB_ID: 'DB_SPREADSHEET_ID',
  PROP_PIN_SALT: 'PIN_SALT',

  /**
   * Folder Drive tempat foto bukti hasil AM disimpan. Menimpa lewat Script
   * Property PHOTO_FOLDER_ID bila perlu diarahkan ke folder lain tanpa push.
   */
  PHOTO_FOLDER_ID: '1tvOOIdJHK-C0CZy0Wj3QR_Q-aR6xsSps',
  PROP_PHOTO_FOLDER_ID: 'PHOTO_FOLDER_ID',

  // Foto dari HP berukuran 2-5 MB; dikompresi di klien sebelum dikirim, tapi
  // batas ini yang final dan otoritatif - klien bisa dilewati, server tidak.
  MAX_PHOTO_BYTES: 1 * 1024 * 1024,

  SESSION_TTL_SEC: 60 * 60 * 12,   // 12 jam - menutup satu shift penuh
  CACHE_TTL_SEC: 300,              // master data jarang berubah

  SHIFTS: ['1', '2', '3'],

  // Frekuensi -> cara periode dihitung. Menentukan kapan sebuah task jatuh tempo
  // dan menjadi kunci idempotensi agar tidak ada submisi ganda pada periode sama.
  FREQUENCIES: {
    SHIFTLY: { label: 'Per Shift', period: 'SHIFT' },
    DAILY: { label: 'Harian', period: 'DAY' },
    WEEKLY: { label: 'Mingguan', period: 'WEEK' },
    BIWEEKLY: { label: '2 Mingguan', period: 'WEEK2' },
    MONTHLY: { label: 'Bulanan', period: 'MONTH' }
  },

  RESULTS: ['OK', 'NG', 'NA'],

  ROLES: {
    OPERATOR: 1,   // isi checksheet stasiunnya sendiri
    LEADER: 2,     // verifikasi submisi + kelola temuan
    PLANNER: 3,    // kelola master task & penugasan
    MANAGER: 4,    // dashboard lintas lini, read-only
    ADMIN: 9       // kelola user & konfigurasi
  },

  FINDING_STATUS: ['OPEN', 'IN_PROGRESS', 'DONE', 'CLOSED', 'CANCELLED'],

  // Alasan tidak tercapai - selaras dengan kategori Completion 2026 di Form PM03
  // supaya pelaporan AM dan PM memakai kosakata yang sama.
  REASONS: [
    'Spare Part Kosong',
    'Man Power Kurang',
    'Produksi Full Plan',
    'Keterbatasan Tools',
    'Tunggu Plan Date',
    'Tunggu Eksekusi Bubu',
    'Kesalahan Planning'
  ]
};

/**
 * Skema tabel. Kolom pertama tiap tabel adalah primary key.
 */
var SCHEMA = {
  MST_USER: [
    'nik', 'name', 'password_hash', 'role', 'line', 'stations',
    'active', 'created_at', 'last_login'
  ],

  MST_MACHINE: ['machine_id', 'line', 'name', 'seq', 'active'],

  MST_STATION: ['station_id', 'label', 'type', 'seq', 'active'],

  // Hasil ekstraksi dari seed/am_tasks.csv
  MST_AM_TASK: [
    'task_id', 'line', 'machines', 'station', 'stations', 'frequency', 'seq',
    'part_name', 'action', 'standard', 'pic_label', 'doc_no', 'doc_rev',
    'doc_effective', 'source_sheet', 'active'
  ],

  // Header submisi: satu baris per (stasiun x mesin x periode)
  TRX_AM_CHECK: [
    'check_id', 'period_key', 'check_date', 'shift', 'line', 'machine_id',
    'station', 'nik', 'frequency', 'total_task', 'ok_count', 'ng_count',
    'na_count', 'status', 'submitted_at', 'verified_by', 'verified_at', 'note'
  ],

  // Detail per task
  TRX_AM_RESULT: [
    'result_id', 'check_id', 'task_id', 'seq', 'result', 'note',
    'photo_url', 'recorded_at'
  ],

  // Setiap hasil NG melahirkan temuan yang harus ditutup
  TRX_FINDING: [
    'finding_id', 'check_id', 'task_id', 'line', 'machine_id', 'station',
    'part_name', 'description', 'severity', 'reason', 'status',
    'raised_by', 'raised_at', 'assigned_to', 'due_date',
    'closed_by', 'closed_at', 'closing_note'
  ],

  LOG_AUDIT: ['ts', 'nik', 'action', 'entity', 'entity_id', 'detail'],

  CFG_KV: ['key', 'value', 'updated_at', 'updated_by']
};

/** Tabel yang di-cache karena sering dibaca dan jarang berubah. */
var CACHED_TABLES = ['MST_USER', 'MST_MACHINE', 'MST_STATION', 'MST_AM_TASK'];
