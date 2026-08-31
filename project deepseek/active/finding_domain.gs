// finding_domain.gs
// Findings / defects.

function saveFinding(payload) {
  if (!payload) return { ok: false, error: 'Missing payload' };
  var id = Utilities.getUuid();
  var now = new Date().toISOString();
  var sh = getSheet_(SHEETS.TRX_FINDING);
  if (sh) {
    sh.appendRow([
      id,
      payload.check_id || '',
      payload.task_id || '',
      payload.line || '',
      payload.machine_id || '',
      payload.station || '',
      payload.part_name || '',
      payload.description || '',
      payload.severity || 'MEDIUM',
      payload.reason || '',
      payload.status || 'OPEN',
      payload.raised_by || '',
      now,
      payload.assigned_to || '',
      payload.due_date || '',
      '', '', '',
      payload.closing_note || ''
    ]);
  }
  logAudit_(payload.raised_by || '', 'CREATE_FINDING', 'TRX_FINDING', id, payload.severity || '');
  return { ok: true, finding_id: id };
}

function getFindings(status) {
  var all = readSheetObjects_(SHEETS.TRX_FINDING);
  if (!status) return { ok: true, data: all };
  var out = [];
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].status).toUpperCase() === String(status).toUpperCase()) out.push(all[i]);
  }
  return { ok: true, data: out };
}

function updateFinding(findingId, status, assignedTo, dueDate) {
  var sh = getSheet_(SHEETS.TRX_FINDING);
  if (!sh) return { ok: false, error: 'Sheet not found' };
  var values = sh.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(findingId)) {
      if (status) sh.getRange(i + 1, 11).setValue(status);
      if (assignedTo) sh.getRange(i + 1, 14).setValue(assignedTo);
      if (dueDate) sh.getRange(i + 1, 15).setValue(dueDate);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Finding not found' };
}

function closeFinding(findingId, nik, closingNote) {
  var sh = getSheet_(SHEETS.TRX_FINDING);
  if (!sh) return { ok: false, error: 'Sheet not found' };
  var values = sh.getDataRange().getValues();
  var now = new Date().toISOString();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(findingId)) {
      sh.getRange(i + 1, 11).setValue('CLOSED');
      sh.getRange(i + 1, 16).setValue(nik || '');
      sh.getRange(i + 1, 17).setValue(now);
      sh.getRange(i + 1, 18).setValue(closingNote || '');
      logAudit_(nik || '', 'CLOSE_FINDING', 'TRX_FINDING', findingId, closingNote || '');
      return { ok: true };
    }
  }
  return { ok: false, error: 'Finding not found' };
}
