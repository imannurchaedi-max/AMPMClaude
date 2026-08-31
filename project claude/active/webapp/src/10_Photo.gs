/**
 * Unggah foto bukti hasil pemeriksaan AM ke Google Drive.
 *
 * Checksheet kertas hanya mencatat pelaksanaan (V/X) - tidak ada yang menjamin
 * kondisi mesin sesungguhnya seperti yang diklaim operator. Foto bukti menutup
 * celah itu: 04_AmCheck.gs mewajibkan hasil OK/NG disertai photo_url sebelum
 * submit diterima, supaya leader dan audit mutu bisa memeriksa kondisi nyata,
 * bukan cuma percaya tanda centang. NA dikecualikan karena berarti item memang
 * tidak berlaku pada mesin/stasiun itu - tidak ada yang bisa difoto.
 *
 * Kompresi dilakukan di klien (App.html, lewat <canvas>) sebelum dikirim,
 * karena foto asli dari HP (2-5 MB) melebihi batas payload google.script.run
 * dan akan menghabiskan kuota Drive dengan cepat bila disimpan mentah. Batas
 * ukuran di sini tetap final dan otoritatif - klien bisa dilewati, server tidak.
 */

/** Ekstensi berkas dari MIME type. Jatuh ke .jpg untuk tipe yang tak dikenal. */
function imageExt_(mime) {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return '.jpg';
}

/**
 * Normalkan alias MIME type yang umum dikirim dari klien ('jpg', 'jpeg', dst).
 *
 * Sengaja TIDAK jatuh ke 'image/jpeg' untuk tipe yang tidak dikenal - itu akan
 * membuat validasi "hanya gambar" di photoUpload() jadi tidak pernah aktif
 * karena semua tipe selalu lolos sebagai gambar. Tipe asing dikembalikan apa
 * adanya supaya pemanggil bisa menolaknya.
 */
function normalizeMime_(mimeType) {
  var m = String(mimeType || '').trim().toLowerCase();
  if (m === 'jpg' || m === 'jpeg') return 'image/jpeg';
  if (m === 'png' || m === 'webp' || m === 'gif') return 'image/' + m;
  return m;
}

/** Buang prefix data URL ('data:image/jpeg;base64,...') bila ada. */
function base64ToBytes_(b64) {
  var s = String(b64 || '');
  var idx = s.indexOf(',');
  if (idx >= 0 && s.slice(0, idx).toLowerCase().indexOf('base64') >= 0) {
    s = s.slice(idx + 1);
  }
  s = s.replace(/\s+/g, '');
  try {
    return Utilities.base64Decode(s);
  } catch (e) {
    return [];
  }
}

function formatBytes_(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

function photoFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty(CFG.PROP_PHOTO_FOLDER_ID)
    || CFG.PHOTO_FOLDER_ID;
  return DriveApp.getFolderById(id);
}

/**
 * Unggah satu foto (base64) ke folder bukti di Drive.
 *
 * @param {string} token
 * @param {{base64: string, filename: string, mime_type: string,
 *          task_id: string=}} payload
 * @return {{url: string, file_id: string, name: string, size: number}}
 */
function photoUpload(token, payload) {
  var s = sessionOf_(token);
  payload = payload || {};

  var b64 = payload.base64 || '';
  if (!b64) throw new Error('Data foto kosong.');

  var mime = normalizeMime_(payload.mime_type);
  if (mime.indexOf('image/') !== 0) {
    throw new Error('Hanya berkas gambar yang diterima.');
  }

  var bytes = base64ToBytes_(b64);
  if (!bytes.length) throw new Error('Data foto tidak valid.');
  if (bytes.length > CFG.MAX_PHOTO_BYTES) {
    throw new Error('Foto terlalu besar. Maksimal 1 MB (dapat ' +
                     formatBytes_(bytes.length) + ').');
  }

  var ts = Utilities.formatDate(new Date(), CFG.TZ, 'yyyyMMdd_HHmmss');
  var name = 'AM_' + s.nik + '_' + ts + '_' + Utilities.getUuid().slice(0, 8) + imageExt_(mime);
  var blob = Utilities.newBlob(bytes, mime, name);

  var file;
  try {
    file = photoFolder_().createFile(blob);
  } catch (e) {
    throw new Error('Gagal menyimpan foto ke Drive: ' + (e.message || e));
  }

  // Perlu tampil di <img> pada webapp; tidak fatal bila kebijakan Drive
  // organisasi membatasi setSharing - foto tetap tersimpan.
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    // sengaja diabaikan
  }

  var url = 'https://drive.google.com/uc?export=view&id=' + file.getId();
  audit_(s.nik, 'UPLOAD_PHOTO', 'TRX_AM_RESULT', file.getId(),
         { task_id: payload.task_id || '', size: bytes.length, name: name });

  return { url: url, file_id: file.getId(), name: file.getName(), size: bytes.length };
}
