/**
 * Dashboard AM.
 *
 * Metrik yang dipakai sengaja meniru Form PM03 supaya AM dan PM bisa dibaca
 * dalam satu bahasa:
 *   - Compliance : berapa persen checksheet yang jatuh tempo benar-benar diisi.
 *                  Setara "Completion" pada PM.
 *   - Cleanliness: dari yang diisi, berapa persen item berhasil OK.
 *                  Ini yang tidak pernah terukur di form kertas.
 *
 * Keduanya dipisah karena sering berlawanan arah: compliance bisa 100% sementara
 * cleanliness turun, atau sebaliknya.
 */

/**
 * Ringkasan dashboard.
 * @param {string} token
 * @param {{weeks: number, line: string}=} opt
 */
function dashboardSummary(token, opt) {
  var s = sessionOf_(token);
  opt = opt || {};
  var nWeeks = Number(opt.weeks || 8);
  var weeks = lastWeeks_(nWeeks);
  var weekSet = {};
  weeks.forEach(function (w) { weekSet[w] = true; });

  var checks = dbRead('TRX_AM_CHECK').filter(function (c) {
    if (opt.line && String(c.line) !== String(opt.line)) return false;
    return true;
  });

  // Kelompokkan submisi per minggu ISO berdasarkan tanggal pelaksanaan
  var byWeek = {};
  weeks.forEach(function (w) {
    byWeek[w] = { week: w, submitted: 0, verified: 0, task: 0, ok: 0, ng: 0, na: 0 };
  });

  checks.forEach(function (c) {
    var d = ymd_(c.check_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    var iw = isoWeek_(parseDate_(d));
    var key = iw.year + '-W' + pad2_(iw.week);
    if (!weekSet[key]) return;
    var b = byWeek[key];
    b.submitted++;
    if (String(c.status).toUpperCase() === 'VERIFIED') b.verified++;
    b.task += Number(c.total_task) || 0;
    b.ok += Number(c.ok_count) || 0;
    b.ng += Number(c.ng_count) || 0;
    b.na += Number(c.na_count) || 0;
  });

  var trend = weeks.map(function (w) {
    var b = byWeek[w];
    var scored = b.ok + b.ng;   // NA tidak dihitung sebagai penilaian
    return {
      week: w,
      submitted: b.submitted,
      verified: b.verified,
      task: b.task,
      ok: b.ok,
      ng: b.ng,
      na: b.na,
      cleanliness: scored ? round2_(b.ok / scored) : null
    };
  });

  return {
    user: sessionPublic_(s),
    generated_at: nowIso_(),
    weeks: trend,
    current: currentPeriodCompliance_(opt.line),
    findings: findingSummary_(),
    top_ng: topNgParts_(20)
  };
}

/**
 * Compliance periode berjalan: bandingkan checksheet yang seharusnya ada
 * (mesin aktif x stasiun yang punya task) dengan yang sudah masuk.
 */
function currentPeriodCompliance_(line) {
  var ymd = today_();
  var machines = dbWhere('MST_MACHINE', function (m) {
    return String(m.active).toUpperCase() === 'TRUE' &&
           (!line || String(m.line) === String(line));
  });

  var tasks = dbWhere('MST_AM_TASK', function (t) {
    return String(t.active).toUpperCase() === 'TRUE';
  });

  // Pasangan (mesin, stasiun, frekuensi) yang seharusnya dikerjakan hari ini
  var expected = {};
  machines.forEach(function (m) {
    tasks.forEach(function (t) {
      if (String(t.line) !== String(m.line)) return;
      if (String(t.machines).split(';').indexOf(m.machine_id) < 0) return;
      String(t.stations).split(';').filter(String).forEach(function (st) {
        var freq = t.frequency;
        if (freq === 'SHIFTLY') {
          CFG.SHIFTS.forEach(function (sh) {
            expected[checkId_(m.machine_id, st, freq, periodKey_(freq, ymd, sh))] = true;
          });
        } else if (isDue_(freq, ymd, '1')) {
          expected[checkId_(m.machine_id, st, freq, periodKey_(freq, ymd, '1'))] = true;
        }
      });
    });
  });

  var expectedIds = Object.keys(expected);
  var done = {};
  dbRead('TRX_AM_CHECK').forEach(function (c) {
    if (expected[c.check_id]) done[c.check_id] = String(c.status).toUpperCase();
  });

  var submitted = Object.keys(done).length;
  var verified = Object.keys(done).filter(function (k) {
    return done[k] === 'VERIFIED';
  }).length;

  return {
    date: ymd,
    expected: expectedIds.length,
    submitted: submitted,
    verified: verified,
    compliance: expectedIds.length ? round2_(submitted / expectedIds.length) : null,
    missing: expectedIds.filter(function (id) { return !done[id]; }).slice(0, 50)
  };
}

/** Part yang paling sering NG - titik masuk untuk kaizen. */
function topNgParts_(limit) {
  var taskById = {};
  dbRead('MST_AM_TASK').forEach(function (t) { taskById[t.task_id] = t; });

  var tally = {};
  dbRead('TRX_AM_RESULT').forEach(function (r) {
    if (String(r.result).toUpperCase() !== 'NG') return;
    var t = taskById[r.task_id];
    if (!t) return;
    var key = t.line + '|' + t.part_name;
    if (!tally[key]) {
      tally[key] = { line: t.line, part_name: t.part_name, station: t.station, count: 0 };
    }
    tally[key].count++;
  });

  return Object.keys(tally)
    .map(function (k) { return tally[k]; })
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, limit || 20);
}

function round2_(n) {
  return Math.round(n * 10000) / 10000;
}
