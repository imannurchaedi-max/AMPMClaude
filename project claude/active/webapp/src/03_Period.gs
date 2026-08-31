/**
 * Perhitungan periode.
 *
 * period_key adalah kunci idempotensi: satu stasiun pada satu mesin hanya boleh
 * punya satu submisi per periode. Ini yang mencegah checksheet ganda ketika
 * operator menekan submit dua kali atau sinyal terputus di tengah jalan.
 */

/** Nomor minggu ISO-8601 (minggu mulai Senin, minggu 1 memuat Kamis pertama). */
function isoWeek_(date) {
  var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var dayNum = d.getUTCDay() || 7;           // Minggu = 7, bukan 0
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // geser ke Kamis minggu ini
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: week };
}

function parseDate_(ymd) {
  var p = String(ymd).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function pad2_(n) { return ('0' + n).slice(-2); }

/**
 * Bangun period_key untuk sebuah frekuensi.
 * @param {string} frequency SHIFTLY | DAILY | WEEKLY | BIWEEKLY | MONTHLY
 * @param {string} ymd Tanggal 'yyyy-MM-dd'
 * @param {string=} shift '1' | '2' | '3' (hanya dipakai SHIFTLY)
 * @return {string}
 */
function periodKey_(frequency, ymd, shift) {
  var freq = CFG.FREQUENCIES[frequency];
  if (!freq) throw new Error('Frekuensi tidak dikenal: ' + frequency);
  var d = parseDate_(ymd);

  switch (freq.period) {
    case 'SHIFT':
      if (CFG.SHIFTS.indexOf(String(shift)) < 0) {
        throw new Error('Shift wajib diisi untuk frekuensi SHIFTLY.');
      }
      return ymd + '#S' + shift;

    case 'DAY':
      return ymd;

    case 'WEEK': {
      var w = isoWeek_(d);
      return w.year + '-W' + pad2_(w.week);
    }

    case 'WEEK2': {
      // Dua-mingguan dipetakan ke minggu genap agar periodenya stabil
      var w2 = isoWeek_(d);
      var anchor = w2.week - (w2.week % 2);
      return w2.year + '-W' + pad2_(anchor) + '/2';
    }

    case 'MONTH':
      return ymd.slice(0, 7);

    default:
      throw new Error('Periode tidak dikenal: ' + freq.period);
  }
}

/**
 * Apakah frekuensi ini jatuh tempo pada tanggal/shift tersebut?
 * WEEKLY dan MONTHLY sengaja dibiarkan terbuka sepanjang periodenya - operator
 * boleh mengerjakannya kapan saja dalam minggu/bulan berjalan, sesuai praktik
 * di checksheet kertas yang hanya menandai minggu pelaksanaan.
 */
function isDue_(frequency, ymd, shift) {
  var freq = CFG.FREQUENCIES[frequency];
  if (!freq) return false;
  if (freq.period === 'SHIFT') return CFG.SHIFTS.indexOf(String(shift)) >= 0;
  if (freq.period === 'DAY') return String(shift) === '1';  // diwakili shift pagi
  return true;
}

/** Label periode yang enak dibaca manusia untuk ditampilkan di UI. */
function periodLabel_(frequency, ymd, shift) {
  var freq = CFG.FREQUENCIES[frequency];
  switch (freq.period) {
    case 'SHIFT': return ymd + ' - Shift ' + shift;
    case 'DAY': return ymd;
    case 'WEEK': case 'WEEK2': return 'Minggu ' + periodKey_(frequency, ymd, shift);
    case 'MONTH': return 'Bulan ' + ymd.slice(0, 7);
  }
  return ymd;
}

/** Rentang minggu ISO untuk query dashboard: kembalikan daftar N minggu terakhir. */
function lastWeeks_(n) {
  var out = [];
  var d = new Date();
  for (var i = 0; i < n; i++) {
    var w = isoWeek_(d);
    out.unshift(w.year + '-W' + pad2_(w.week));
    d.setDate(d.getDate() - 7);
  }
  return out;
}
