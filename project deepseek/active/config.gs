// config.gs
// AM PM Monitoring - configuration, sheet names, headers, and helpers.

var APP_NAME = 'AM PM Monitoring';

// Default master spreadsheet (new empty sheet).
// Override via Script Property MASTER_SPREADSHEET_ID if needed.
var DEFAULT_MASTER_SPREADSHEET_ID = '1x1kmQemH80GlVZaT1QVr3QSITsHIYIHzVursa7uFkb8';

// External employee list (authoritative for login). Read live, NOT imported.
var EMPLOYEE_SPREADSHEET_ID = '14OTl9xYINyRIqnJ2AEaCJFD_D9tNRRueNgFby6FjY9o';
var EMPLOYEE_SHEET = 'KARYAWAN';

// Sheet (tab) names - single source of truth.
var SHEETS = {
  MST_USER: 'MST_USER',
  MST_MACHINE: 'MST_MACHINE',
  MST_STATION: 'MST_STATION',
  MST_AM_TASK: 'MST_AM_TASK',
  TRX_AM_CHECK: 'TRX_AM_CHECK',
  TRX_AM_RESULT: 'TRX_AM_RESULT',
  TRX_FINDING: 'TRX_FINDING',
  LOG_AUDIT: 'LOG_AUDIT',
  CFG_KV: 'CFG_KV'
};

// Header rows (must match documentation/schema.md and AM PM MONITORING.xlsx).
var HEADERS = {
  MST_USER: ['nik', 'name', 'pin_hash', 'role', 'line', 'stations', 'active', 'created_at', 'last_login'],
  MST_MACHINE: ['machine_id', 'line', 'name', 'seq', 'active'],
  MST_STATION: ['station_id', 'label', 'type', 'seq', 'active'],
  MST_AM_TASK: ['task_id', 'line', 'machines', 'station', 'stations', 'frequency', 'seq', 'part_name', 'action', 'standard', 'pic_label', 'doc_no', 'doc_rev', 'doc_effective', 'source_sheet', 'active'],
  TRX_AM_CHECK: ['check_id', 'period_key', 'check_date', 'shift', 'line', 'machine_id', 'station', 'nik', 'frequency', 'total_task', 'ok_count', 'ng_count', 'na_count', 'status', 'submitted_at', 'verified_by', 'verified_at', 'note'],
  TRX_AM_RESULT: ['result_id', 'check_id', 'task_id', 'seq', 'result', 'note', 'photo_url', 'recorded_at'],
  TRX_FINDING: ['finding_id', 'check_id', 'task_id', 'line', 'machine_id', 'station', 'part_name', 'description', 'severity', 'reason', 'status', 'raised_by', 'raised_at', 'assigned_to', 'due_date', 'closed_by', 'closed_at', 'closing_note'],
  LOG_AUDIT: ['ts', 'nik', 'action', 'entity', 'entity_id', 'detail'],
  CFG_KV: ['key', 'value', 'updated_at', 'updated_by']
};

function getMasterSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('MASTER_SPREADSHEET_ID');
  if (!id) {
    id = DEFAULT_MASTER_SPREADSHEET_ID;
  }
  return SpreadsheetApp.openById(id);
}

function getSheet_(name) {
  var ss = getMasterSpreadsheet_();
  return ss.getSheetByName(name) || null;
}

function readConfig_() {
  var sh = getSheet_(SHEETS.CFG_KV);
  if (!sh) return {};
  var values = sh.getDataRange().getValues();
  var out = {};
  for (var i = 1; i < values.length; i++) {
    var key = values[i][0];
    if (key) out[String(key)] = values[i][1];
  }
  return out;
}

function getConfigValue_(key, fallback) {
  var cfg = readConfig_();
  var v = cfg[key];
  return (v === undefined || v === null || v === '') ? fallback : v;
}

// Creates all tabs + header rows once. Run from the Apps Script editor or via
// `clasp run bootstrapSheets`.
function bootstrapSheets() {
  var ss = getMasterSpreadsheet_();
  var names = Object.keys(SHEETS);
  for (var i = 0; i < names.length; i++) {
    var name = SHEETS[names[i]];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
    }
    var headers = HEADERS[name];
    if (headers && headers.length && sh.getLastRow() === 0) {
      sh.appendRow(headers);
      sh.setFrozenRows(1);
    }
  }
  return { ok: true, created: names.length };
}

function readSheetObjects_(name) {
  var sh = getSheet_(name);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  var headers = values[0] || [];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[i][j];
    }
    out.push(obj);
  }
  return out;
}
