/**
 * Pengelolaan temuan (abnormality) hasil AM.
 *
 * Ini bagian yang tidak dimiliki checksheet kertas: pada form lama, tanda "X"
 * berhenti sebagai coretan. Di sini setiap NG menjadi temuan bernomor dengan
 * pemilik, tenggat, dan jejak penutupan.
 */

/** Daftar temuan dengan filter opsional. */
function findingList(token, filter) {
  var s = sessionOf_(token);
  filter = filter || {};

  var rows = dbRead('TRX_FINDING');
  var out = rows.filter(function (f) {
    if (filter.status && String(f.status).toUpperCase() !== String(filter.status).toUpperCase()) {
      return false;
    }
    if (filter.open_only && ['DONE', 'CLOSED', 'CANCELLED']
        .indexOf(String(f.status).toUpperCase()) >= 0) {
      return false;
    }
    if (filter.line && String(f.line) !== String(filter.line)) return false;
    if (filter.machine_id && String(f.machine_id) !== String(filter.machine_id)) return false;
    if (filter.station && String(f.station) !== String(filter.station)) return false;
    if (filter.assigned_to && String(f.assigned_to) !== String(filter.assigned_to)) return false;
    return true;
  });

  var today = parseDate_(today_());
  out.forEach(function (f) {
    var raised = ymd_(f.raised_at);
    f.raised_at = String(f.raised_at || '');
    f.due_date = ymd_(f.due_date);
    f.age_days = raised ? Math.floor((today - parseDate_(raised)) / 86400000) : 0;
    f.overdue = !!(f.due_date &&
      ['DONE', 'CLOSED', 'CANCELLED'].indexOf(String(f.status).toUpperCase()) < 0 &&
      parseDate_(f.due_date) < today);
    delete f._row;
  });

  out.sort(function (a, b) {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return b.age_days - a.age_days;
  });

  return { user: sessionPublic_(s), count: out.length, findings: out };
}

/** Tugaskan temuan ke seseorang beserta tenggatnya. */
function findingAssign(token, findingId, assignedTo, dueDate, severity) {
  var s = sessionOf_(token);
  requireRole_(s, 'LEADER');

  var f = dbFind('TRX_FINDING', findingId);
  if (!f) throw new Error('Temuan tidak ditemukan: ' + findingId);
  if (assignedTo && !dbFind('MST_USER', assignedTo)) {
    throw new Error('NIK penerima tugas tidak terdaftar: ' + assignedTo);
  }

  var patch = {
    assigned_to: assignedTo || '',
    due_date: dueDate || '',
    status: String(f.status).toUpperCase() === 'OPEN' ? 'IN_PROGRESS' : f.status
  };
  if (severity) patch.severity = severity;

  dbUpdate('TRX_FINDING', findingId, patch);
  audit_(s.nik, 'FINDING_ASSIGN', 'TRX_FINDING', findingId, patch);
  return { ok: true };
}

/** Tutup temuan. Wajib menyertakan catatan penutupan. */
function findingClose(token, findingId, closingNote, reason) {
  var s = sessionOf_(token);
  requireRole_(s, 'LEADER');

  if (!String(closingNote || '').trim()) {
    throw new Error('Catatan penutupan wajib diisi.');
  }
  var f = dbFind('TRX_FINDING', findingId);
  if (!f) throw new Error('Temuan tidak ditemukan: ' + findingId);
  if (['CLOSED', 'CANCELLED'].indexOf(String(f.status).toUpperCase()) >= 0) {
    throw new Error('Temuan ini sudah ditutup.');
  }
  if (reason && CFG.REASONS.indexOf(reason) < 0) {
    throw new Error('Alasan tidak dikenal: ' + reason);
  }

  dbUpdate('TRX_FINDING', findingId, {
    status: 'CLOSED',
    reason: reason || f.reason,
    closed_by: s.nik,
    closed_at: nowIso_(),
    closing_note: String(closingNote).trim()
  });
  audit_(s.nik, 'FINDING_CLOSE', 'TRX_FINDING', findingId, closingNote);
  return { ok: true };
}

/** Ringkasan temuan untuk kartu dashboard. */
function findingSummary_() {
  var rows = dbRead('TRX_FINDING');
  var today = parseDate_(today_());
  var sum = { open: 0, in_progress: 0, closed: 0, overdue: 0, by_machine: {}, by_station: {} };

  rows.forEach(function (f) {
    var st = String(f.status).toUpperCase();
    if (st === 'OPEN') sum.open++;
    else if (st === 'IN_PROGRESS') sum.in_progress++;
    else if (st === 'CLOSED' || st === 'DONE') sum.closed++;

    var active = ['DONE', 'CLOSED', 'CANCELLED'].indexOf(st) < 0;
    var due = ymd_(f.due_date);
    if (active && due && parseDate_(due) < today) sum.overdue++;
    if (active) {
      sum.by_machine[f.machine_id] = (sum.by_machine[f.machine_id] || 0) + 1;
      sum.by_station[f.station] = (sum.by_station[f.station] || 0) + 1;
    }
  });
  return sum;
}
