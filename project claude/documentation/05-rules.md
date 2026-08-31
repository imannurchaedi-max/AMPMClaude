# 05 — Rules

## Bagian A — Aturan bisnis yang ditegakkan sistem

Semua aturan di bawah ditegakkan **di sisi server**. UI ikut menegakkannya demi
kenyamanan, tapi UI bukan lapisan keamanan — pembatasan di klien selalu bisa
dilewati.

### A1. Hasil NG wajib bercatatan

Submit ditolak bila ada item `NG` tanpa catatan.

*Alasan:* NG tanpa keterangan menghasilkan temuan yang tidak bisa ditindaklanjuti.
Inilah kegagalan utama form kertas — tanda `X` tanpa konteks.

### A1c. Checklist WEEKLY menampilkan rekap task SHIFTLY

Saat operator membuka grup WEEKLY, task ber-`frequency=SHIFTLY` untuk
mesin+stasiun yang sama ikut ditampilkan lagi di bawahnya (ditandai
`recap: true`, ditempatkan setelah task WEEKLY asli). Ini murni salinan
tampilan — **tidak mengubah kewajiban shiftly**: task itu tetap wajib diisi
tiap shift seperti biasa lewat grup SHIFTLY sendiri, dengan `check_id` dan
periode sendiri.

Menjawab item rekap di grup WEEKLY menghasilkan baris `TRX_AM_RESULT`
terpisah di bawah `check_id` WEEKLY minggu itu — bukan menimpa atau
menduplikasi hasil submisi shift harian. Semua aturan lain (OK/NG wajib
foto, NG wajib catatan) berlaku sama untuk item rekap.

*Alasan:* pengawas ingin satu titik ulasan mingguan yang mencakup ulang
kondisi item shiftly, tanpa menghapus disiplin pengisian per shift yang
sudah berjalan.

### A2. Semua item wajib terisi

Tombol Simpan tidak aktif selama masih ada item kosong.

*Alasan:* checksheet parsial memberi angka compliance yang menyesatkan.

### A1b. Hasil OK/NG wajib foto bukti

Submit ditolak bila ada item `OK` atau `NG` tanpa `photo_url`. `NA`
dikecualikan — tidak ada kondisi fisik yang bisa difoto untuk item yang
memang tidak berlaku. Ditegakkan di `amSubmit()` (`04_AmCheck.gs`), bukan
cuma disarankan di UI.

*Alasan:* pilihan Ya/Tidak, Sudah/Belum, Good/NG semata tidak membuktikan
apa pun tentang kondisi mesin sesungguhnya — operator bisa menandai OK tanpa
benar-benar memeriksa. Foto memaksa ada bukti visual yang bisa diperiksa
ulang oleh leader saat verifikasi, bukan sekadar percaya klaim.

Batas ukuran **1 MB per foto**, ditegakkan ulang di server (`10_Photo.gs`)
terlepas dari kompresi di klien — klien bisa dilewati, server tidak.

### A3. Satu submisi per periode

`check_id` bersifat deterministik. Submit ulang **memperbarui**, tidak
menduplikasi.

*Alasan:* di lantai produksi, tap ganda dan sinyal terputus adalah kejadian
normal, bukan pengecualian.

### A4. Periode terkunci setelah verifikasi

Checksheet berstatus `VERIFIED` tidak bisa diubah operator.

*Alasan:* verifikasi leader adalah pengganti tanda tangan pengawas. Data yang
sudah disahkan tidak boleh berubah diam-diam.

### A5. Operator terbatas pada kelompok stasiunnya

Jabatan di direktori karyawan menentukan **kelompok** stasiun (Packer →
`PACKER1..7`, Operator Produksi → `OP1..4`), bukan satu stasiun tetap —
operator berotasi tiap shift. Diperiksa di `amGetChecklist` dan `amSubmit`,
bukan hanya disembunyikan di UI.

*Alasan:* akuntabilitas. Selama sebagian orang masih memakai password bersama,
otorisasi tidak boleh sekadar kosmetik di UI.

### A6. Verifikasi butuh peran LEADER ke atas

Operator ditolak dengan pesan eksplisit.

### A7. Temuan tidak diduplikasi

Satu task yang NG berulang pada periode berbeda tetap satu temuan selama temuan
sebelumnya belum ditutup.

*Alasan:* tanpa ini, satu masalah kronis menghasilkan puluhan temuan per minggu
dan daftar menjadi tidak terpakai.

### A8. Penutupan temuan wajib bercatatan

*Alasan:* temuan yang ditutup tanpa keterangan menghapus jejak perbaikan.

### A9. `NA` tidak dihitung dalam cleanliness

Cleanliness = `OK ÷ (OK + NG)`.

*Alasan:* item yang tidak berlaku tidak boleh mengerek maupun menurunkan nilai.

### A10. Compliance dan cleanliness dilaporkan terpisah

*Alasan:* keduanya sering berlawanan arah. Menggabungkannya menyembunyikan
justru informasi yang paling berguna.

### A11. Minggu memakai ISO-8601

Sama dengan `ISOWEEKNUM()` di Dashboard 2026, sehingga angka minggu AM dan PM
selalu cocok.

### A12b. Jabatan tak terpetakan ditolak login

Jabatan yang tidak ada di `JABATAN_STATIONS` ditolak dengan pesan eksplisit,
bukan diberi akses kosong.

*Alasan:* akses kosong menghasilkan layar tanpa isi yang membingungkan.
Penolakan bernama menunjukkan langsung apa yang perlu diperbaiki admin.

### A12. Kategori alasan mengikuti Form PM03

7 kategori di `CFG.REASONS` sama persis dengan `Completion 2026`.

*Alasan:* saat modul PM digabung nanti, tidak perlu memetakan ulang kosakata.

## Bagian B — Aturan keamanan

### B1. Password pribadi tidak pernah disimpan polos

SHA-256 dengan salt yang disimpan di Script Properties. Salt dibuat sekali saat
`Setup_initDatabase()`.

Password direktori karyawan **tidak** disalin ke aplikasi — hanya dibandingkan
saat login pertama, lalu digantikan password pribadi.

### B2. Percobaan gagal dibatasi

5× per NIK, lalu terkunci 5 menit.

### B3. Pesan login tidak membedakan NIK salah dan password salah

*Alasan:* mencegah penyerang memetakan NIK yang valid.

### B4. Semua aksi tercatat di `LOG_AUDIT`

Selama sebagian karyawan masih memakai password bersama, log ini adalah
satu-satunya pertanggungjawaban siapa mengubah apa. **Jangan dimatikan.**

### B5. Batasan yang harus disadari

Model ancaman yang diasumsikan: **jaringan internal pabrik**. Risiko utama
adalah operator mengisi checksheet atas nama orang lain, bukan penyerang
eksternal.

Kolom `Password` di direktori karyawan **dipakai bersama oleh 981 dari 982
orang**. Sampai setiap orang menetapkan password pribadinya, identitas belum
sepenuhnya bisa dipercaya. Konsekuensinya:

- Jangan menyimpan data pribadi, medis, atau finansial di database ini
- Jangan memakai kembali skema ini untuk sistem yang menangani data sensitif
- Bila kelak sistem menampung data sensitif, ganti ke akun Google Workspace atau
  tambahkan faktor kedua

### B6. Webapp berjalan sebagai pemilik deployment

`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`. Ini konsekuensi tak
terhindarkan dari operator tanpa akun Google. Artinya **siapa pun yang tahu URL
bisa mencapai layar login** — otorisasi sesungguhnya ada di lapisan NIK+password.

Jangan sebarkan URL di luar keperluan operasional.

## Bagian C — Konvensi coding

### C1. `SCHEMA` adalah sumber kebenaran tunggal

Urutan kolom didefinisikan di `00_Config.gs`. Jangan menyusun ulang kolom
langsung di spreadsheet. Ubah `SCHEMA` lalu jalankan `Setup_migrateSchema()`.

### C2. Jangan pernah `getRange()` per baris dalam loop

Baca tabel sekali penuh, olah di memori, tulis sekali. Ini pembeda antara
operasi 2 detik dan operasi yang kena batas 6 menit.

### C3. Semua operasi tulis dibungkus `withLock_()`

Lock bersifat reentrant lewat penghitung kedalaman, jadi aman memanggil
`dbInsert` di dalam blok `withLock_` yang lebih luar.

### C4. Semua pembacaan tanggal lewat `ymd_()`

**Jangan pernah** `String(v).slice(0, 10)` pada nilai tanggal. Bila Sheets
mengubahnya menjadi objek `Date`, itu menghasilkan `'Sat Aug 2'` dan
diam-diam merusak pengelompokan mingguan.

### C5. Fungsi berakhiran `_` adalah internal

`hashPassword_`, `withLock_`, `sessionOf_` — tidak pernah dipanggil dari klien dan
tidak boleh masuk `ROUTES`.

### C6. Menambah fitur = menambah entri di `ROUTES`

Jangan membuat endpoint baru di luar router. Router adalah tempat terpusat
penanganan sesi, error, dan bentuk balasan.

### C7. Handler memvalidasi perannya sendiri

`rpc()` tidak tahu peran apa yang dibutuhkan tiap aksi. Setiap handler wajib
memanggil `sessionOf_()` dan `requireRole_()` bila perlu.

### C8. Klien memakai `code`, bukan teks pesan

`code: 'SESSION_EXPIRED'` yang menentukan kapan menampilkan layar login lagi.
Pencocokan teks pesan rapuh terhadap perubahan bahasa.

### C9. Jalankan harness sebelum setiap push

```bash
cd "project claude/active"
node tools/gas_harness.js
```

104 asersi harus lolos semua.

### C10. Impor master bersifat replace, bukan append

`Setup_importAmTasks()` mengosongkan `MST_AM_TASK` lebih dulu. Ini membuatnya
aman dijalankan ulang setiap kali master direvisi.

### C11. Komentar menjelaskan *kenapa*, bukan *apa*

Kode sudah menjelaskan apa yang terjadi. Komentar dipakai untuk hal yang tidak
terbaca dari kode: batasan platform, keputusan desain, jebakan yang dihindari.

### C12. Bahasa

Komentar, pesan error, dan UI dalam Bahasa Indonesia — penggunanya operator
pabrik. Nama fungsi, variabel, dan kolom database dalam Bahasa Inggris.
