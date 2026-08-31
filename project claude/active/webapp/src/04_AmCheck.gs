/**
 * Modul AM Checksheet: menyusun daftar task yang jatuh tempo, menerima submisi,
 * dan menerbitkan temuan dari setiap hasil NG.
 */

/** check_id deterministik -> submit ulang memperbarui, bukan menduplikasi. */
function checkId_(machineId, station, frequency, periodKey) {
  return ['AMC', machineId, station, frequency,
          periodKey.replace(/[^0-9A-Za-z]/g, '')].join('-');
}

/**
 * Daftar task yang harus dikerjakan sebuah stasiun pada mesin, tanggal, dan
 * shift tertentu - digabung dengan hasil yang sudah tersimpan bila ada.
 *
 * @param {string} token
 * @param {{machine_id: string, station: string, date: string, shift: string}} req
 * @return {!Object}
 */
function amGetChecklist(token, req) {
  var s = sessionOf_(token);
  var machineId = String(req.machine_id || '').trim();
  var station = String(req.station || '').trim().toUpperCase();
  var ymd = String(req.date || today_());
  var shift = String(req.shift || '1');

  if (!machineId || !station) throw new Error('Mesin dan stasiun wajib dipilih.');

  // Operator hanya boleh membuka stasiun yang ditugaskan kepadanya.
  if (CFG.ROLES[s.role] <= CFG.ROLES.OPERATOR && s.stations.indexOf(station) < 0) {
    throw new Error('Stasiun ' + station + ' bukan penugasan Anda.');
  }

  var machine = dbFind('MST_MACHINE', machineId);
  if (!machine) throw new Error('Mesin tidak ditemukan: ' + machineId);

  var tasks = dbWhere('MST_AM_TASK', function (t) {
    if (String(t.active).toUpperCase() !== 'TRUE') return false;
    if (String(t.line) !== String(machine.line)) return false;
    if (String(t.machines).split(';').indexOf(machineId) < 0) return false;
    if (String(t.stations).split(';').indexOf(station) < 0) return false;
    return isDue_(t.frequency, ymd, shift);
  });

  // Kelompokkan per frekuensi karena tiap frekuensi punya periode sendiri
  var groups = {};
  tasks.forEach(function (t) {
    (groups[t.frequency] = groups[t.frequency] || []).push(t);
  });

  // Checklist WEEKLY ikut menampilkan task SHIFTLY sebagai rekap/double-check
  // mingguan. Task SHIFTLY TETAP wajib diisi tiap shift seperti biasa - grup
  // SHIFTLY di atas tidak disentuh. Ini cuma salinan tampilan yang disimpan
  // di bawah check_id WEEKLY sendiri, bukan pengganti submisi shift harian.
  // Ditandai `recap: true` supaya frontend memisahkan visualnya, dan supaya
  // urutan tampil task weekli asli tidak tercampur dengan rekap.
  if (groups.SHIFTLY && groups.SHIFTLY.length) {
    var recapTasks = groups.SHIFTLY.map(function (t) {
      var copy = {};
      Object.keys(t).forEach(function (k) { copy[k] = t[k]; });
      copy.recap = true;
      return copy;
    });
    groups.WEEKLY = (groups.WEEKLY || []).concat(recapTasks);
  }

  // Hitung dulu check_id semua grup, lalu ambil hanya hasil milik check tersebut.
  var meta = {};
  Object.keys(groups).forEach(function (freq) {
    var pk = periodKey_(freq, ymd, shift);
    meta[freq] = { period_key: pk, check_id: checkId_(machineId, station, freq, pk) };
  });

  var checkIds = Object.keys(meta).map(function (f) { return meta[f].check_id; });
  var resultByCheck = {};
  dbReadByKey('TRX_AM_RESULT', 'check_id', checkIds).forEach(function (r) {
    (resultByCheck[r.check_id] = resultByCheck[r.check_id] || {})[r.task_id] = r;
  });

  var out = [];
  Object.keys(groups).forEach(function (freq) {
    var pk = meta[freq].period_key;
    var cid = meta[freq].check_id;
    var header = dbFind('TRX_AM_CHECK', cid);
    var saved = resultByCheck[cid] || {};

    out.push({
      frequency: freq,
      frequency_label: CFG.FREQUENCIES[freq].label,
      period_key: pk,
      period_label: periodLabel_(freq, ymd, shift),
      check_id: cid,
      status: header ? header.status : 'DRAFT',
      submitted_at: header ? header.submitted_at : '',
      verified_by: header ? header.verified_by : '',
      tasks: groups[freq]
        .sort(function (a, b) {
          // Task asli dulu (sesuai seq), rekap SHIFTLY selalu di bawahnya -
          // seq rekap bisa tumpang tindih dengan seq weekli asli karena
          // berasal dari checksheet sumber yang berbeda.
          var ra = a.recap ? 1 : 0, rb = b.recap ? 1 : 0;
          if (ra !== rb) return ra - rb;
          return Number(a.seq) - Number(b.seq);
        })
        .map(function (t) {
          var r = saved[t.task_id];
          return {
            task_id: t.task_id,
            seq: Number(t.seq),
            part_name: t.part_name,
            action: t.action,
            standard: t.standard,
            recap: !!t.recap,
            result: r ? r.result : '',
            note: r ? r.note : '',
            photo_url: r ? r.photo_url : ''
          };
        })
    });
  });

  out.sort(function (a, b) { return a.frequency.localeCompare(b.frequency); });

  return {
    machine: { machine_id: machine.machine_id, name: machine.name, line: machine.line },
    station: station,
    date: ymd,
    shift: shift,
    user: sessionPublic_(s),
    groups: out
  };
}

/**
 * Simpan submisi satu grup frekuensi.
 *
 * @param {string} token
 * @param {{machine_id: string, station: string, date: string, shift: string,
 *          frequency: string, results: !Array<{task_id: string, result: string,
 *          note: string}>, note: string}} payload
 */
function amSubmit(token, payload) {
  var s = sessionOf_(token);
  var machineId = String(payload.machine_id || '').trim();
  var station = String(payload.station || '').trim().toUpperCase();
  var ymd = String(payload.date || today_());
  var shift = String(payload.shift || '1');
  var freq = String(payload.frequency || '').toUpperCase();
  var results = payload.results || [];

  if (!CFG.FREQUENCIES[freq]) throw new Error('Frekuensi tidak dikenal: ' + freq);
  if (!results.length) throw new Error('Tidak ada hasil untuk disimpan.');
  if (CFG.ROLES[s.role] <= CFG.ROLES.OPERATOR && s.stations.indexOf(station) < 0) {
    throw new Error('Stasiun ' + station + ' bukan penugasan Anda.');
  }

  var machine = dbFind('MST_MACHINE', machineId);
  if (!machine) throw new Error('Mesin tidak ditemukan: ' + machineId);

  // Setiap NG wajib disertai catatan - ini yang membuat temuan bisa ditindaklanjuti.
  var invalid = results.filter(function (r) {
    return r.result === 'NG' && !String(r.note || '').trim();
  });
  if (invalid.length) {
    throw new Error('Hasil NG wajib diberi catatan (' + invalid.length + ' item belum diisi).');
  }
  var unknown = results.filter(function (r) { return CFG.RESULTS.indexOf(r.result) < 0; });
  if (unknown.length) throw new Error('Ada hasil dengan nilai tidak valid.');

  // OK/NG wajib disertai foto bukti - checksheet kertas hanya mencatat
  // pelaksanaan (V/X), bukan kondisi mesin sesungguhnya. NA dikecualikan
  // karena berarti item memang tidak berlaku, tidak ada yang bisa difoto.
  var noPhoto = results.filter(function (r) {
    return (r.result === 'OK' || r.result === 'NG') && !String(r.photo_url || '').trim();
  });
  if (noPhoto.length) {
    throw new Error('Foto bukti wajib untuk hasil OK/NG (' + noPhoto.length + ' item belum ada foto).');
  }

  var pk = periodKey_(freq, ymd, shift);
  var cid = checkId_(machineId, station, freq, pk);

  var taskById = {};
  dbRead('MST_AM_TASK').forEach(function (t) { taskById[t.task_id] = t; });

  var existing = dbFind('TRX_AM_CHECK', cid);
  if (existing && String(existing.status).toUpperCase() === 'VERIFIED') {
    throw new Error('Checksheet periode ini sudah diverifikasi dan tidak bisa diubah.');
  }

  var counts = { OK: 0, NG: 0, NA: 0 };
  results.forEach(function (r) { counts[r.result]++; });

  var ts = nowIso_();
  var resultRows = results.map(function (r) {
    var t = taskById[r.task_id] || {};
    return {
      result_id: cid + ':' + r.task_id,
      check_id: cid,
      task_id: r.task_id,
      seq: t.seq || 0,
      result: r.result,
      note: String(r.note || '').trim(),
      photo_url: String(r.photo_url || ''),
      recorded_at: ts
    };
  });

  withLock_(function () {
    // Submit ulang: buang detail lama sebelum menulis yang baru.
    if (existing) deleteResultsOf_(cid);

    var header = {
      check_id: cid,
      period_key: pk,
      check_date: ymd,
      shift: freq === 'SHIFTLY' ? shift : '',
      line: machine.line,
      machine_id: machineId,
      station: station,
      nik: s.nik,
      frequency: freq,
      total_task: results.length,
      ok_count: counts.OK,
      ng_count: counts.NG,
      na_count: counts.NA,
      status: 'SUBMITTED',
      submitted_at: ts,
      verified_by: '',
      verified_at: '',
      note: String(payload.note || '').trim()
    };

    if (existing) {
      dbUpdate('TRX_AM_CHECK', cid, header);
    } else {
      dbInsert('TRX_AM_CHECK', header);
    }
    dbInsert('TRX_AM_RESULT', resultRows);
  });

  var findings = raiseFindings_(s, cid, machine, station, results, taskById);
  audit_(s.nik, 'AM_SUBMIT', 'TRX_AM_CHECK', cid,
         { ok: counts.OK, ng: counts.NG, na: counts.NA, findings: findings.length });

  return {
    ok: true,
    check_id: cid,
    counts: counts,
    findings_created: findings.length,
    period_label: periodLabel_(freq, ymd, shift)
  };
}

/** Hapus detail hasil sebuah check (dipakai saat submit ulang). */
function deleteResultsOf_(checkId) {
  var sh = dbSheet_('TRX_AM_RESULT');
  var last = sh.getLastRow();
  if (last < 2) return;
  var ids = sh.getRange(2, 2, last - 1, 1).getValues();  // kolom check_id
  for (var i = ids.length - 1; i >= 0; i--) {            // hapus dari bawah
    if (String(ids[i][0]) === checkId) sh.deleteRow(i + 2);
  }
  dbInvalidate('TRX_AM_RESULT');
}

/**
 * Terbitkan temuan untuk setiap hasil NG yang belum punya temuan terbuka.
 * Satu task yang NG berulang pada periode berbeda tetap satu temuan selama
 * temuan sebelumnya belum ditutup - supaya daftar temuan tidak membanjir.
 */
function raiseFindings_(session, checkId, machine, station, results, taskById) {
  var ngs = results.filter(function (r) { return r.result === 'NG'; });
  if (!ngs.length) return [];

  var openByTask = {};
  dbRead('TRX_FINDING').forEach(function (f) {
    if (['DONE', 'CLOSED', 'CANCELLED'].indexOf(String(f.status).toUpperCase()) < 0) {
      openByTask[f.machine_id + '|' + f.task_id] = f;
    }
  });

  var ts = nowIso_();
  var rows = [];
  ngs.forEach(function (r) {
    if (openByTask[machine.machine_id + '|' + r.task_id]) return;  // sudah ada
    var t = taskById[r.task_id] || {};
    rows.push({
      finding_id: newId_('FND'),
      check_id: checkId,
      task_id: r.task_id,
      line: machine.line,
      machine_id: machine.machine_id,
      station: station,
      part_name: t.part_name || '',
      description: String(r.note || '').trim(),
      severity: 'NORMAL',
      reason: '',
      status: 'OPEN',
      raised_by: session.nik,
      raised_at: ts,
      assigned_to: '',
      due_date: '',
      closed_by: '',
      closed_at: '',
      closing_note: ''
    });
  });

  if (rows.length) dbInsert('TRX_FINDING', rows);
  return rows;
}

/** Verifikasi checksheet oleh leader. */
function amVerify(token, checkId, note) {
  var s = sessionOf_(token);
  requireRole_(s, 'LEADER');
  var header = dbFind('TRX_AM_CHECK', checkId);
  if (!header) throw new Error('Checksheet tidak ditemukan: ' + checkId);
  if (String(header.status).toUpperCase() !== 'SUBMITTED') {
    throw new Error('Hanya checksheet berstatus SUBMITTED yang bisa diverifikasi.');
  }
  dbUpdate('TRX_AM_CHECK', checkId, {
    status: 'VERIFIED',
    verified_by: s.nik,
    verified_at: nowIso_(),
    note: [header.note, String(note || '').trim()].filter(String).join(' | ')
  });
  audit_(s.nik, 'AM_VERIFY', 'TRX_AM_CHECK', checkId, '');
  return { ok: true };
}
