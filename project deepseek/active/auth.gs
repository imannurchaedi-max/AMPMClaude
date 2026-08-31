// auth.gs
// Login reads the external employee spreadsheet (KARYAWAN tab), no PIN, no import.
// KARYAWAN columns (0-based):
// 0 NIK | 1 Nama | 2 Departemen | 3 Jabatan | 4 Otorisasi | 5 Password | 6 Email
// 7 Notifikasi | 8 Output Summary | 9 Performance Monitoring | 10 OEE Dashboard
// 11 Downtime Dashboard | 12 Reject Rate | 13 Material Balance | 14 TPP | 15 MOM

function getEmployeeSpreadsheet_() {
  return SpreadsheetApp.openById(EMPLOYEE_SPREADSHEET_ID);
}

function truthy_(v) {
  return v === true || v === 1 || v === '1' || String(v).toUpperCase() === 'TRUE';
}

function getEmployeeByNik_(nik) {
  var ss = getEmployeeSpreadsheet_();
  var sh = ss.getSheetByName(EMPLOYEE_SHEET);
  if (!sh) return null;
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[0]) === String(nik)) {
      return {
        nik: String(row[0]),
        name: row[1],
        department: row[2],
        jabatan: row[3],
        otorisasi: row[4],
        password: String(row[5]),
        email: row[6],
        notifikasi: row[7],
        access: {
          outputSummary: truthy_(row[8]),
          performanceMonitoring: truthy_(row[9]),
          oeeDashboard: truthy_(row[10]),
          downtimeDashboard: truthy_(row[11]),
          rejectRate: truthy_(row[12]),
          materialBalance: truthy_(row[13]),
          tpp: truthy_(row[14]),
          mom: truthy_(row[15])
        }
      };
    }
  }
  return null;
}

function getEmployeeType_(nik) {
  var n = String(nik);
  if (n.indexOf('128') === 0) return 'STAFF';
  if (n.indexOf('328') === 0) return 'NON_STAFF';
  if (n.indexOf('428') === 0) return 'MK';
  return 'UNKNOWN';
}

// Exposed RPC: verify NIK + password (plaintext from KARYAWAN).
function authenticate(nik, password) {
  var emp = getEmployeeByNik_(nik);
  if (!emp) return { ok: false, error: 'NIK not found' };
  if (String(emp.password) !== String(password)) {
    return { ok: false, error: 'Wrong password' };
  }
  logAudit_(emp.nik, 'LOGIN', 'KARYAWAN', emp.nik, '');
  return {
    ok: true,
    user: {
      nik: emp.nik,
      name: emp.name,
      department: emp.department,
      jabatan: emp.jabatan,
      jenis: getEmployeeType_(emp.nik),
      activity: emp.otorisasi,
      notifikasi: emp.notifikasi,
      access: emp.access
    }
  };
}

// Append a row to LOG_AUDIT.
function logAudit_(nik, action, entity, entityId, detail) {
  var sh = getSheet_(SHEETS.LOG_AUDIT);
  if (!sh) return;
  sh.appendRow([new Date().toISOString(), nik || '', action || '', entity || '', entityId || '', detail || '']);
}

