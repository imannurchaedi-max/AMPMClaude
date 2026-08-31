/**
 * Autentikasi NIK + Password.
 *
 * Identitas berasal dari spreadsheet DATA KARYAWAN yang dibaca langsung setiap
 * login - tidak ada salinan daftar karyawan di aplikasi ini. Karyawan baru,
 * mutasi jabatan, dan resign otomatis terpakai tanpa impor ulang.
 *
 * DUA LAPIS PASSWORD, dan alasannya:
 *
 * Kolom Password di direktori karyawan bukan password per orang - 981 dari 982
 * karyawan memakai nilai yang sama persis ('DAM1234567'). Bila itu dipakai
 * sebagai satu-satunya kredensial, siapa pun yang mengetahuinya bisa masuk
 * sebagai siapa pun, termasuk sebagai Line Leader untuk memverifikasi
 * checksheet. Itu meniadakan akuntabilitas yang justru menjadi tujuan sistem.
 *
 * Karena itu password direktori diperlakukan sebagai KUNCI MASUK PERTAMA saja.
 * Pada login pertama, pengguna wajib menetapkan password pribadi yang disimpan
 * ter-hash di MST_USER. Setelah itu password bersama tidak lagi berlaku untuk
 * NIK tersebut.
 *
 * MST_USER di sini bukan salinan direktori karyawan, melainkan lapisan tipis
 * berisi password pribadi dan penyimpangan hak akses - hanya untuk orang yang
 * benar-benar pernah login, ditambah akun darurat seperti ADMIN yang memang
 * tidak ada di direktori karyawan.
 */

var MAX_FAILED = 5;
var LOCKOUT_SEC = 300;

function pinSalt_() {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty(CFG.PROP_PIN_SALT);
  if (!salt) {
    salt = Utilities.base64Encode(Utilities.getUuid() + Utilities.getUuid());
    props.setProperty(CFG.PROP_PIN_SALT, salt);
  }
  return salt;
}

/** Hash password. Password polos tidak pernah disimpan di aplikasi ini. */
function hashPassword_(nik, password) {
  var raw = pinSalt_() + '|' + String(nik).trim() + '|' + String(password).trim();
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
}

/** Nama lama, dipertahankan agar fungsi setup yang sudah ada tetap jalan. */
function hashPin_(nik, pin) {
  return hashPassword_(nik, pin);
}

function failKey_(nik) { return 'fail:' + nik; }

/**
 * Login dengan NIK dan password.
 * @return {{token: string, user: !Object}}
 */
function authLogin(nik, password) {
  nik = normNik_(nik);
  password = String(password || '').trim();
  if (!nik || !password) throw new Error('NIK dan password wajib diisi.');

  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get(failKey_(nik)) || 0);
  if (fails >= MAX_FAILED) {
    throw new Error('Terlalu banyak percobaan gagal. Coba lagi dalam 5 menit.');
  }

  var local = dbFind('MST_USER', nik);
  if (local && String(local.active).toUpperCase() !== 'TRUE') {
    return authFail_(cache, nik, fails);
  }

  var emp = null;
  try {
    emp = empFind(nik);
  } catch (e) {
    // Direktori tidak terbaca. Akun lokal (mis. ADMIN) harus tetap bisa masuk
    // supaya sistem tidak terkunci total saat spreadsheet karyawan bermasalah.
    if (!local) throw new Error('Direktori karyawan tidak dapat dibaca: ' + e.message);
  }

  if (!local && !emp) return authFail_(cache, nik, fails);

  var session;
  if (local && local.password_hash) {
    // Password pribadi sudah ditetapkan - password direktori tidak berlaku lagi
    if (local.password_hash !== hashPassword_(nik, password)) {
      return authFail_(cache, nik, fails);
    }
    session = buildSession_(nik, local, emp, false);
  } else if (emp && emp.password && emp.password === password) {
    // Kunci masuk pertama memakai password direktori
    session = buildSession_(nik, local, emp, true);
  } else {
    return authFail_(cache, nik, fails);
  }

  if (!session.stations.length && CFG.ROLES[session.role] < CFG.ROLES.LEADER) {
    throw new Error(
      'Jabatan "' + (emp ? emp.jabatan : '-') + '" belum dipetakan ke stasiun AM. ' +
      'Hubungi admin.');
  }

  cache.remove(failKey_(nik));
  var token = Utilities.getUuid();
  cache.put('sess:' + token, JSON.stringify(session), CFG.SESSION_TTL_SEC);

  touchLogin_(nik, local, emp, session);
  audit_(nik, 'LOGIN', 'MST_USER', nik,
         { source: session.source, role: session.role });

  return { token: token, user: sessionPublic_(session) };
}

/** Pesan sengaja tidak membedakan NIK salah dan password salah. */
function authFail_(cache, nik, fails) {
  cache.put(failKey_(nik), String(fails + 1), LOCKOUT_SEC);
  throw new Error('NIK atau password salah.');
}

/**
 * Susun sesi. Data lokal menang atas direktori bila diisi, sehingga admin bisa
 * menyimpang dari jabatan resmi tanpa menyentuh spreadsheet HR.
 */
function buildSession_(nik, local, emp, mustChange) {
  var access = emp ? empAccess(emp) : { role: 'OPERATOR', stations: [] };

  var role = (local && local.role) ? String(local.role).toUpperCase() : access.role;
  var stations = (local && String(local.stations || '').trim())
    ? String(local.stations).toUpperCase().split(';').filter(String)
    : access.stations;

  return {
    nik: nik,
    name: (local && local.name) || (emp && emp.name) || nik,
    role: role,
    line: (local && local.line) || '',
    stations: stations,
    dept: emp ? emp.dept : '',
    jabatan: emp ? emp.jabatan : (local ? local.role : ''),
    source: emp ? 'EMPLOYEE' : 'LOCAL',
    must_change_password: !!mustChange,
    exp: Date.now() + CFG.SESSION_TTL_SEC * 1000
  };
}

/**
 * Catat waktu login. Baris MST_USER dibuat seperlunya - hanya untuk orang yang
 * benar-benar memakai sistem, bukan menyalin seluruh direktori karyawan.
 */
function touchLogin_(nik, local, emp, session) {
  if (local) {
    dbUpdate('MST_USER', nik, { last_login: nowIso_() });
    return;
  }
  dbInsert('MST_USER', {
    nik: nik,
    name: session.name,
    password_hash: '',           // diisi saat pengguna menetapkan password pribadi
    role: '',                    // kosong = ikut direktori karyawan
    line: '',
    stations: '',                // kosong = ikut jabatan
    active: 'TRUE',
    created_at: nowIso_(),
    last_login: nowIso_()
  });
}

function authLogout(token) {
  var s = sessionOf_(token, true);
  CacheService.getScriptCache().remove('sess:' + token);
  if (s) audit_(s.nik, 'LOGOUT', 'MST_USER', s.nik, '');
  return { ok: true };
}

/**
 * Ambil sesi dari token.
 * @param {string} token
 * @param {boolean=} soft Kembalikan null alih-alih melempar error.
 */
function sessionOf_(token, soft) {
  var raw = token ? CacheService.getScriptCache().get('sess:' + token) : null;
  if (!raw) {
    if (soft) return null;
    throw new Error('SESSION_EXPIRED');
  }
  var s = JSON.parse(raw);
  if (s.exp < Date.now()) {
    CacheService.getScriptCache().remove('sess:' + token);
    if (soft) return null;
    throw new Error('SESSION_EXPIRED');
  }
  return s;
}

function sessionPublic_(s) {
  return {
    nik: s.nik, name: s.name, role: s.role, line: s.line,
    stations: s.stations, dept: s.dept, jabatan: s.jabatan,
    source: s.source, must_change_password: !!s.must_change_password
  };
}

/** Lempar error bila peran pengguna di bawah level minimum. */
function requireRole_(session, minRole) {
  var level = CFG.ROLES[session.role] || 0;
  if (level < CFG.ROLES[minRole]) {
    throw new Error('Akses ditolak. Butuh peran minimal ' + minRole + '.');
  }
  return true;
}

/**
 * Tetapkan atau ganti password pribadi.
 *
 * Password lama boleh berupa password direktori (saat pertama kali menetapkan)
 * atau password pribadi sebelumnya.
 */
function authChangePassword(token, oldPassword, newPassword) {
  var s = sessionOf_(token);
  newPassword = String(newPassword || '').trim();

  if (newPassword.length < 6) {
    throw new Error('Password baru minimal 6 karakter.');
  }

  var emp = null;
  try { emp = empFind(s.nik); } catch (e) { /* akun lokal tetap boleh */ }

  var local = dbFind('MST_USER', s.nik);
  var okOld = local && local.password_hash
    ? local.password_hash === hashPassword_(s.nik, oldPassword)
    : !!(emp && emp.password && emp.password === String(oldPassword || '').trim());

  if (!okOld) throw new Error('Password lama salah.');

  if (emp && newPassword === emp.password) {
    throw new Error('Password baru tidak boleh sama dengan password bersama.');
  }

  var patch = { password_hash: hashPassword_(s.nik, newPassword) };
  if (local) {
    dbUpdate('MST_USER', s.nik, patch);
  } else {
    dbInsert('MST_USER', {
      nik: s.nik, name: s.name, password_hash: patch.password_hash,
      role: '', line: '', stations: '', active: 'TRUE',
      created_at: nowIso_(), last_login: nowIso_()
    });
  }

  // Sesi berjalan tidak lagi perlu memaksa penggantian
  s.must_change_password = false;
  CacheService.getScriptCache()
    .put('sess:' + token, JSON.stringify(s), CFG.SESSION_TTL_SEC);

  audit_(s.nik, 'CHANGE_PASSWORD', 'MST_USER', s.nik, '');
  return { ok: true };
}

/** Nama lama dipertahankan agar rute RPC yang sudah dipakai tidak putus. */
function authChangePin(token, oldPin, newPin) {
  return authChangePassword(token, oldPin, newPin);
}

/**
 * Reset password pribadi seseorang - hanya ADMIN.
 * Setelah direset, yang bersangkutan kembali memakai password direktori.
 */
function authResetPassword(token, targetNik) {
  var s = sessionOf_(token);
  requireRole_(s, 'ADMIN');
  targetNik = normNik_(targetNik);

  if (!dbFind('MST_USER', targetNik)) {
    throw new Error('NIK belum pernah login: ' + targetNik);
  }
  dbUpdate('MST_USER', targetNik, { password_hash: '' });
  CacheService.getScriptCache().remove(failKey_(targetNik));
  audit_(s.nik, 'RESET_PASSWORD', 'MST_USER', targetNik, '');
  return { ok: true };
}
