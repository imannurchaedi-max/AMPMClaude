/**
 * Titik masuk webapp dan router RPC.
 *
 * Klien memanggil satu fungsi saja - rpc(action, token, payload) - agar
 * penanganan error, sesi, dan audit terpusat di sini. Menambah fitur berarti
 * menambah satu entri di ROUTES, bukan menambah endpoint baru yang harus
 * diamankan sendiri-sendiri.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('ui/Index')
    .evaluate()
    .setTitle(CFG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/**
 * Peta aksi -> handler. Setiap handler menerima (token, payload).
 * Handler bertanggung jawab memvalidasi sesi dan perannya sendiri.
 */
var ROUTES = {
  // Publik
  'auth.login': function (token, p) { return authLogin(p.nik, p.password); },
  'auth.logout': function (token) { return authLogout(token); },
  'app.bootstrap': function (token) { return appBootstrap(token); },

  // Operator
  'am.checklist': function (token, p) { return amGetChecklist(token, p); },
  'am.submit': function (token, p) { return amSubmit(token, p); },
  'photo.upload': function (token, p) { return photoUpload(token, p); },
  'auth.changePassword': function (token, p) {
    return authChangePassword(token, p.old_password, p.new_password);
  },

  // Leader
  'am.verify': function (token, p) { return amVerify(token, p.check_id, p.note); },
  'finding.list': function (token, p) { return findingList(token, p); },
  'finding.assign': function (token, p) {
    return findingAssign(token, p.finding_id, p.assigned_to, p.due_date, p.severity);
  },
  'finding.close': function (token, p) {
    return findingClose(token, p.finding_id, p.closing_note, p.reason);
  },

  // Manajemen
  'dashboard.summary': function (token, p) { return dashboardSummary(token, p); },

  // Admin
  'user.create': function (token, p) { return userCreate(token, p); },
  'auth.resetPassword': function (token, p) { return authResetPassword(token, p.nik); },
  'employee.lookup': function (token, p) {
    sessionOf_(token);
    var e = empFind(p.nik);
    // Password tidak pernah ikut keluar dari server
    return e ? { nik: e.nik, name: e.name, dept: e.dept,
                 jabatan: e.jabatan, otorisasi: e.otorisasi } : null;
  }
};

/**
 * Router tunggal.
 * @return {{ok: boolean, data: *}|{ok: boolean, error: string, code: string}}
 */
function rpc(action, token, payload) {
  try {
    var handler = ROUTES[action];
    if (!handler) throw new Error('Aksi tidak dikenal: ' + action);
    return { ok: true, data: handler(token, payload || {}) };
  } catch (e) {
    var msg = e && e.message ? e.message : String(e);
    return {
      ok: false,
      error: msg,
      // Klien memakai kode ini untuk memutuskan apakah harus menampilkan
      // layar login lagi tanpa mengandalkan pencocokan teks pesan.
      code: msg === 'SESSION_EXPIRED' ? 'SESSION_EXPIRED' : 'ERROR'
    };
  }
}

/** Data awal yang dibutuhkan UI setelah login: mesin, stasiun, konfigurasi. */
function appBootstrap(token) {
  var s = sessionOf_(token);

  var machines = dbWhere('MST_MACHINE', function (m) {
    return String(m.active).toUpperCase() === 'TRUE';
  }).map(function (m) {
    return { machine_id: m.machine_id, line: m.line, name: m.name, seq: Number(m.seq) };
  }).sort(function (a, b) { return a.seq - b.seq; });

  var stations = dbWhere('MST_STATION', function (x) {
    return String(x.active).toUpperCase() === 'TRUE';
  }).map(function (x) {
    return { station_id: x.station_id, label: x.label, type: x.type, seq: Number(x.seq) };
  }).sort(function (a, b) { return a.seq - b.seq; });

  // Stasiun yang boleh dibuka ditentukan jabatan di direktori karyawan.
  // Pengawas ke atas memperoleh seluruh stasiun dari empAccess().
  if (s.stations && s.stations.length) {
    stations = stations.filter(function (x) {
      return s.stations.indexOf(x.station_id) >= 0;
    });
  }

  return {
    user: sessionPublic_(s),
    app: { name: CFG.APP_NAME, version: CFG.VERSION, today: today_() },
    machines: machines,
    stations: stations,
    shifts: CFG.SHIFTS,
    reasons: CFG.REASONS,
    roles: Object.keys(CFG.ROLES),
    can: {
      verify: CFG.ROLES[s.role] >= CFG.ROLES.LEADER,
      manage_findings: CFG.ROLES[s.role] >= CFG.ROLES.LEADER,
      dashboard: CFG.ROLES[s.role] >= CFG.ROLES.LEADER,
      admin: CFG.ROLES[s.role] >= CFG.ROLES.ADMIN
    }
  };
}
