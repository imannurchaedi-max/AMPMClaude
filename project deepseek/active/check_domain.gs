// check_domain.gs
// Submit checksheet: TRX_AM_CHECK (header) + TRX_AM_RESULT (per task).

function submitCheck(payload) {
  if (!payload) return { ok: false, error: 'Missing payload' };
  var results = payload.results || [];
  var total = results.length;
  var ok = 0, ng = 0, na = 0;
  for (var i = 0; i < results.length; i++) {
    var r = String(results[i].result || '').toUpperCase();
    if (r === 'OK') ok++;
    else if (r === 'NG') ng++;
    else if (r === 'NA') na++;
  }

  var checkId = Utilities.getUuid();
  var now = new Date().toISOString();

  var checkSh = getSheet_(SHEETS.TRX_AM_CHECK);
  if (checkSh) {
    checkSh.appendRow([
      checkId,
      payload.period_key || '',
      payload.check_date || '',
      payload.shift || '',
      payload.line || '',
      payload.machine_id || '',
      payload.station || '',
      payload.nik || '',
      payload.frequency || '',
      total, ok, ng, na,
      'SUBMITTED',
      now,
      '', '', '',
      payload.note || ''
    ]);
  }

  var resultSh = getSheet_(SHEETS.TRX_AM_RESULT);
  for (var j = 0; j < results.length; j++) {
    var rr = results[j];
    if (resultSh) {
      resultSh.appendRow([
        Utilities.getUuid(),
        checkId,
        rr.task_id || '',
        rr.seq || (j + 1),
        rr.result || '',
        rr.note || '',
        rr.photo_url || '',
        now
      ]);
    }
  }

  logAudit_(payload.nik || '', 'SUBMIT_CHECK', 'TRX_AM_CHECK', checkId, 'total=' + total + ' ok=' + ok + ' ng=' + ng + ' na=' + na);
  return { ok: true, check_id: checkId, total: total, ok: ok, ng: ng, na: na };
}

function verifyCheck(checkId, nik) {
  var sh = getSheet_(SHEETS.TRX_AM_CHECK);
  if (!sh) return { ok: false, error: 'Sheet not found' };
  var values = sh.getDataRange().getValues();
  var now = new Date().toISOString();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(checkId)) {
      sh.getRange(i + 1, 14).setValue('VERIFIED');
      sh.getRange(i + 1, 16).setValue(nik || '');
      sh.getRange(i + 1, 17).setValue(now);
      logAudit_(nik || '', 'VERIFY_CHECK', 'TRX_AM_CHECK', checkId, '');
      return { ok: true };
    }
  }
  return { ok: false, error: 'Check not found' };
}

function getRecentChecks(limit) {
  var checks = readSheetObjects_(SHEETS.TRX_AM_CHECK);
  checks.reverse();
  var n = Math.min(Number(limit) || 20, checks.length);
  return { ok: true, data: checks.slice(0, n) };
}

function getCheckDetail(checkId) {
  var checks = readSheetObjects_(SHEETS.TRX_AM_CHECK);
  var header = null;
  for (var i = 0; i < checks.length; i++) {
    if (String(checks[i].check_id) === String(checkId)) { header = checks[i]; break; }
  }
  if (!header) return { ok: false, error: 'Check not found' };
  var tasks = readSheetObjects_(SHEETS.MST_AM_TASK);
  var taskMap = {};
  for (var k = 0; k < tasks.length; k++) taskMap[tasks[k].task_id] = tasks[k];
  var results = readSheetObjects_(SHEETS.TRX_AM_RESULT);
  var rows = [];
  for (var j = 0; j < results.length; j++) {
    if (String(results[j].check_id) === String(checkId)) {
      var t = taskMap[results[j].task_id] || {};
      rows.push({ seq: results[j].seq, result: results[j].result, part_name: t.part_name || results[j].task_id });
    }
  }
  return { ok: true, data: { check: header, results: rows } };
}
