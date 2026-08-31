# active — kode

Semua kode sistem AM/PM Tracker. Dokumentasi ada di `../documentation/`.

```
webapp/
  .clasp.json              konfigurasi clasp (scriptId + rootDir)
  .claspignore             pembatas berkas yang dikirim
  src/appsscript.json      manifest Apps Script
  src/00_Config.gs         konstanta + SCHEMA (sumber kebenaran kolom)
  src/01_Db.gs             akses Sheets, cache, lock, normalisasi tanggal
  src/02_Auth.gs           login NIK+password dua lapis, sesi, peran
  src/03_Period.gs         ISO week, period_key, jatuh tempo
  src/04_AmCheck.gs        checklist, submit, verifikasi
  src/05_Finding.gs        siklus temuan
  src/06_Dashboard.gs      compliance, cleanliness, tren
  src/07_Setup.gs          init database, seed, impor, kelola user
  src/08_Api.gs            doGet + router RPC
  src/09_Employee.gs       direktori karyawan, peta jabatan -> stasiun
  src/10_Photo.gs          unggah foto bukti ke Drive, validasi tipe/ukuran
  src/ui/                  Index.html, Style.html, App.html

tools/
  extract_am_master.py     ekstraksi master dari .xlsx warisan
  gas_harness.js           uji lokal, 104 asersi

seed/
  am_tasks.csv             357 task master (333 aktif)
  am_history.csv           214 baris arsip audit Week 42-46
  am_master.json           gabungan + metadata dokumen
```

## Perintah

```bash
python tools/extract_am_master.py    # bangun ulang seed dari .xlsx
node tools/gas_harness.js            # wajib 104/104 lolos sebelum push
cd webapp && clasp push              # kirim ke Apps Script
```

Langkah deploy lengkap: [../documentation/06-deployment.md](../documentation/06-deployment.md)
Konvensi coding: [../documentation/05-rules.md](../documentation/05-rules.md) bagian C
