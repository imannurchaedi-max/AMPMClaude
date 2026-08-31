# 08 — Runbook Operasional

Dokumen yang dibuka saat sistem **sudah berjalan** dan ada yang perlu dikerjakan
atau diperbaiki. Untuk setup pertama kali, lihat [06-deployment.md](06-deployment.md).

---

## Kartu referensi cepat

| Aset | Nilai |
|---|---|
| Akun pemilik | `manex.dam@gmail.com` |
| Spreadsheet | **AM PM MONITORING** — [`1x1kmQem…uFkb8`](https://docs.google.com/spreadsheets/d/1x1kmQemH80GlVZaT1QVr3QSITsHIYIHzVursa7uFkb8/edit) |
| Apps Script | [`1kedA00V…3Sflg`](https://script.google.com/home/projects/1kedA00V42dUXfdFkalnljEgGQJMDB-1Mmv9bmMAZJYi6RmojDG93Sflg/edit) |
| **URL webapp (bagikan ini)** | https://script.google.com/macros/s/AKfycbyf4C31Qqb8oWfZNVBle_WkXQgpRRXSigI8Cpvu7xAuOpc3jyAzCPn_fqMmUurO32Tg/exec |
| URL uji (selalu kode terbaru) | https://script.google.com/macros/s/AKfycby8qOwFQ-VPOo9aYvS_sj140IQjRSpKt-6zRDIWpw4/exec |
| Seed CSV di Drive | [`1ktGZkbEmzXytPmMfKDVtqWuPzva46oYa`](https://drive.google.com/file/d/1ktGZkbEmzXytPmMfKDVtqWuPzva46oYa/view) — `am_tasks.csv` |
| Folder foto bukti di Drive | [`1tvOOIdJHK-C0CZy0Wj3QR_Q-aR6xsSps`](https://drive.google.com/drive/folders/1tvOOIdJHK-C0CZy0Wj3QR_Q-aR6xsSps) — dibuat `photoUpload()`, maks 1 MB/foto |
| **Direktori karyawan** | **DATA KARYAWAN** — [`14OTl9xY…FjY9o`](https://docs.google.com/spreadsheets/d/14OTl9xYINyRIqnJ2AEaCJFD_D9tNRRueNgFby6FjY9o/edit), tab `KARYAWAN` |
| **NIK admin darurat** | **`ADMIN`** (akun lokal, tidak ada di direktori karyawan) |
| Login karyawan | NIK + password dari kolom `Password` direktori |
| Kode lokal | `project claude/active/webapp/src/` |
| Kredensial clasp cadangan | `~/.clasprc.backup-iman-20260829.json` (akun `iman.nurchaedi@gmail.com`) |

> **Password tidak dicatat di dokumen ini dengan sengaja.** Menyimpannya di
> berkas teks meniadakan gunanya hash bersalt. Bila lupa, reset — caranya di bawah.

---

## Login & akun

### Cara login karyawan

Identitas dibaca **langsung dari direktori karyawan setiap login** — tidak ada
salinan daftar karyawan di aplikasi. Karyawan baru, mutasi jabatan, dan resign
otomatis terpakai tanpa impor ulang.

1. Masuk dengan **NIK** dan **password dari kolom `Password`** di direktori
2. Sistem memaksa menetapkan **password pribadi** sebelum bisa mengisi checksheet
3. Sesudah itu password direktori tidak berlaku lagi untuk NIK tersebut

Peran dan stasiun tidak diisi manual, melainkan diturunkan dari direktori:

| Kolom direktori | Menentukan | Pemetaan |
|---|---|---|
| `Otorisasi` | Peran | Buat → `OPERATOR` · Verifikasi → `LEADER` · Validasi → `MANAGER` |
| `Jabatan` | Kelompok stasiun | Packer/Produksi Harian/Borongan → `PACKER1..7` · Operator Produksi/Production → `OP1..4` · Forklift/Reachtruck/Checker → `PALLETING1..2` · Line Leader/Shift Leader/SPV → semua |

Jabatan menentukan **kelompok**, bukan satu stasiun tetap — operator berotasi
tiap shift, jadi stasiun spesifik dipilih sendiri saat membuka checksheet.

Jabatan yang tidak ada di peta itu **ditolak login** dengan pesan jelas. Jalankan
`Setup_auditEmployeeMapping()` untuk melihat jabatan apa saja yang belum
terpetakan beserta jumlah orangnya, lalu tambahkan ke `JABATAN_STATIONS` di
`09_Employee.gs` bila memang seharusnya boleh mengisi checksheet.

### Tidak bisa login — jalur tercepat

> **Refresh dulu tab editor Apps Script.** Fungsi yang baru di-push tidak muncul
> di dropdown sampai halaman dimuat ulang. Ini penyebab paling sering "fungsinya
> tidak ada di daftar".

Ini untuk **akun admin darurat**, bukan akun karyawan. Jalankan
**`Setup_quickAdmin()`** → login dengan **NIK `ADMIN`, password `123456`**
→ segera ganti lewat menu Ganti Password.

Fungsi ini menghapus sekaligus semua variabel yang bisa keliru: salah ketik,
akun terkunci, akun nonaktif, cache basi, dan akun yang belum pernah dibuat.

Untuk **karyawan** yang tidak bisa masuk, lihat tabel pemecahan masalah di
bawah — penyebabnya biasanya jabatan belum dipetakan, bukan password.

### Kalau masih gagal — diagnosa

Jalankan **`Setup_diagnoseLogin()`**. Untuk sekalian menguji password tertentu, buat
pembungkus (tombol Run tidak bisa mengirim argumen):

```js
function cekLogin() {
  Setup_diagnoseLogin('ADMIN', '123456');
}
```

Execution log akan melaporkan berurutan setiap hal yang bisa menggagalkan login:

```
1. Database : AM PM MONITORING          <- spreadsheet yang benar-benar dipakai
2. Override DB_SPREADSHEET_ID: (tidak diset)
3. Salt password : ADA (96 karakter)    <- bila HILANG, semua password pribadi batal
4. Tab MST_USER: ADA, baris terisi 2
5. Jumlah pengguna: 1
   NIK "ADMIN" | ADMIN | aktif=TRUE | hash 64 karakter
6. Cari NIK "ADMIN": KETEMU
7. Status aktif: true
8. Uji password "123456": COCOK
   -> Login seharusnya BERHASIL dengan password ini.
```

Baris mana pun yang menyimpang dari pola di atas menunjukkan penyebabnya
langsung — tidak perlu menebak.

### Reset password admin dengan angka acak

Password **tidak bisa dibaca ulang dari mana pun.** `MST_USER.password_hash`
hanya berisi hash SHA-256 bersalt; password aslinya tidak tersimpan di
spreadsheet, di kode, maupun di log setelah sesi editor ditutup. Satu-satunya
jalan adalah mengganti.

Pilih fungsi `Setup_resetAdminPin` → **Run** → baca **Execution log**:

```
==================================================
  PASSWORD DIRESET
  NIK : ADMIN
  PASSWORD : 482915     <- catat yang ini
  Catat sekarang. Ganti lewat menu Ganti Password.
==================================================
```

Fungsi ini juga:
- membuat akun bila NIK belum ada
- membuka kunci akun yang terkunci akibat 5× salah password

### Menetapkan password admin pilihan sendiri

Tombol Run di editor tidak bisa mengirim argumen. Buat pembungkus, lalu
jalankan pembungkusnya:

```js
function resetPasswordAdmin() {
  Setup_resetAdminPin('ADMIN', '123456');
}
```

### Lupa NIK apa saja yang terdaftar

Jalankan `Setup_listUsers()` — menampilkan NIK yang **pernah login**, bukan
seluruh direktori karyawan. Password tidak pernah ditampilkan.

Untuk melihat seluruh karyawan, buka langsung spreadsheet DATA KARYAWAN.

### Akun terkunci

Setelah 5× password salah, NIK terkunci **5 menit** dan otomatis pulih sendiri.

### Menambah pengguna

**Tidak perlu.** Semua karyawan di direktori otomatis bisa login begitu
jabatannya terpetakan. Menambah karyawan dilakukan di spreadsheet DATA
KARYAWAN, lalu `empRefresh()` bila tidak mau menunggu cache 10 menit habis.

Yang bisa disesuaikan per orang, dengan mengisi baris di tab `MST_USER`
(kolom kosong = ikut direktori):

| Kolom | Gunanya bila diisi |
|---|---|
| `role` | Menimpa peran hasil `Otorisasi` |
| `stations` | Mengunci ke stasiun tertentu, dipisah `;` — mis. `OP1;OP2` |
| `active` | `FALSE` memblokir login meski aktif di direktori |

Nilai `role` yang sah: `OPERATOR` · `LEADER` · `PLANNER` · `MANAGER` · `ADMIN`.

---

## Tugas rutin

### Master checksheet direvisi

```bash
cd "project claude/active"
python tools/extract_am_master.py        # bangun ulang seed dari .xlsx
```

Unggah `seed/am_tasks.csv` ke Drive **akun `manex.dam@gmail.com`** dengan nama
sama, lalu jalankan `Setup_importAmTasks()` di editor.

Impor bersifat **replace**, bukan append — aman dijalankan berulang.

> `Setup_importAmTasks()` mencari berkas berdasarkan **nama** di Drive pemilik
> script. Kalau diunggah ke akun Google yang berbeda, hasilnya
> `File tidak ditemukan di Drive: am_tasks.csv`.

### Kode diubah

```bash
cd "project claude/active"
node tools/gas_harness.js                # wajib 104/104 lolos
cd webapp && clasp push --force
```

`clasp push` hanya memperbarui HEAD. **URL yang dibagikan ke operator tetap
menyajikan versi lama** sampai deployment diarahkan ke versi baru:

```bash
clasp create-deployment   -i AKfycbyf4C31Qqb8oWfZNVBle_WkXQgpRRXSigI8Cpvu7xAuOpc3jyAzCPn_fqMmUurO32Tg   -d "AMPM x.y - keterangan perubahan"
```

Ini membuat versi baru sekaligus mengarahkan deployment stabil ke sana.
Periksa dengan `clasp list-deployments`.

> Ini kesalahan yang paling mudah terjadi: kode sudah benar di editor, tapi
> operator masih memakai versi lama dan melaporkan bug yang sudah diperbaiki.

### Skema tabel diubah

1. Sunting `SCHEMA` di `00_Config.gs`
2. `clasp push --force`
3. Jalankan `Setup_migrateSchema()` — menambah kolom baru tanpa menghapus data

### Berpindah akun clasp

```bash
# kembali ke iman.nurchaedi@gmail.com (proyek DAM lain)
cp ~/.clasprc.backup-iman-20260829.json ~/.clasprc.json

# kembali ke manex.dam@gmail.com (proyek ini)
clasp login        # pilih manex.dam@gmail.com di browser
```

Periksa dengan `clasp show-authorized-user`.

---

## Daftar fungsi setup

Semua dijalankan dari editor Apps Script, menu **Run**.

| Fungsi | Kegunaan | Aman diulang? |
|---|---|---|
| `Setup_initDatabase()` | Buat 9 tab, format kolom jadi teks | Ya |
| `Setup_seedMaster()` | Isi 6 mesin + 13 stasiun | Ya — dilewati bila sudah terisi |
| `Setup_importAmTasks()` | Impor 357 task dari CSV di Drive | Ya — bersifat replace |
| `Setup_createAdmin()` | Buat akun ADMIN pertama | Ya — dilewati bila sudah ada |
| **`Setup_quickAdmin()`** | **Set ADMIN / `123456` secara pasti** | Ya |
| **`Setup_diagnoseLogin()`** | **Laporkan kenapa login gagal** | Ya — hanya membaca |
| `Setup_resetAdminPin()` | Reset password admin acak, buka kunci | Ya |
| `Setup_listUsers()` | Daftar NIK yang pernah login | Ya — hanya membaca |
| **`Setup_auditEmployeeMapping()`** | **Jabatan mana yang belum dipetakan ke stasiun** | Ya — hanya membaca |
| **`empRefresh()`** | **Muat ulang direktori karyawan (cache 10 menit)** | Ya |
| `Setup_migrateSchema()` | Tambah kolom baru sesuai SCHEMA | Ya |

> Setelah `clasp push`, **refresh tab editor** agar fungsi baru muncul di
> dropdown Run.

---

## Pemecahan masalah

| Gejala | Penyebab | Perbaikan |
|---|---|---|
| `File tidak ditemukan di Drive: am_tasks.csv` | CSV belum diunggah, atau ada di akun Google lain | Unggah ke Drive `manex.dam@gmail.com` |
| `Kolom CSV kurang: task_id` | BOM tidak terbuang saat impor | Pastikan `stripBom_()` ada di `07_Setup.gs` |
| `Tabel tidak ditemukan: MST_...` | `Setup_initDatabase()` belum jalan | Jalankan fungsi itu |
| `NIK atau password salah` padahal yakin benar | Akun terkunci, password pribadi sudah diganti, atau NIK tidak ada di direktori | `Setup_diagnoseLogin()` |
| `Jabatan "X" belum dipetakan ke stasiun AM` | Jabatan belum ada di `JABATAN_STATIONS` | `Setup_auditEmployeeMapping()`, lalu tambahkan di `09_Employee.gs` |
| Karyawan baru belum bisa login | Cache direktori masih lama (10 menit) | `empRefresh()` |
| `Terlalu banyak percobaan gagal` | 5× password salah | Tunggu 5 menit |
| `Akses ditolak. Butuh peran minimal LEADER` | Peran pengguna terlalu rendah | Ubah `role` di tab `MST_USER` |
| `Stasiun X bukan penugasan Anda` | `stations` pengguna tidak memuat stasiun itu | Perbaiki kolom `stations` di `MST_USER` |
| `Sistem sedang sibuk` | Lock tertahan >20 detik | Operasi lain sedang menulis; coba lagi |
| `Foto bukti wajib untuk hasil OK/NG` | Submit dikirim sebelum semua item OK/NG selesai unggah foto | Tunggu ikon unggah selesai sebelum menekan Simpan |
| `Gagal menyimpan foto ke Drive` | Akun `manex.dam@gmail.com` tidak lagi punya akses tulis ke folder foto | Pastikan folder `1tvOOIdJHK-C0CZy0Wj3QR_Q-aR6xsSps` masih dimiliki/dibagikan ke akun itu |
| Foto tidak tampil di riwayat checksheet | `setSharing(ANYONE_WITH_LINK)` gagal karena kebijakan berbagi Drive organisasi | Ubah kebijakan berbagi folder foto, atau buka link foto langsung dari `LOG_AUDIT` |
| Layar login kosong / blank | Berkas HTML salah nama | Harus `ui/Index`, `ui/Style`, `ui/App` |
| Tanggal kacau di dashboard | Kolom tidak berformat teks | Jalankan ulang `Setup_initDatabase()` |
| Perubahan kode tidak terlihat pengguna | Deployment masih versi lama | Manage deployments → New version |
| `clasp push` → `The caller does not have permission` | Akun clasp salah | `clasp show-authorized-user`, lalu `clasp login` |

---

## Yang memang tidak bisa dilakukan

Supaya tidak dicari-cari:

- **Membaca password pribadi yang sudah ada.** Hanya hash yang tersimpan. Reset
  satu-satunya jalan — setelah direset, yang bersangkutan kembali memakai
  password direktori dan diminta menetapkan yang baru.
- **Mengubah data karyawan dari aplikasi ini.** Direktori hanya dibaca.
  Perubahan nama, jabatan, atau otorisasi dilakukan di spreadsheet DATA KARYAWAN.
- **Mengubah checksheet yang sudah `VERIFIED`** lewat webapp. Ini disengaja —
  verifikasi leader adalah pengganti tanda tangan pengawas. Bila benar-benar
  perlu, ubah `status` kembali ke `SUBMITTED` di tab `TRX_AM_CHECK`.
- **Menjalankan fungsi setup dari webapp.** Semuanya hanya lewat editor, karena
  editor sudah menuntut akses ke proyek Apps Script.
- **Melihat log Execution lama.** Log hilang setelah sesi editor ditutup. Untuk
  jejak permanen, lihat tab `LOG_AUDIT` di spreadsheet.

---

## Jejak audit

Tab `LOG_AUDIT` mencatat semua aksi: `LOGIN`, `LOGOUT`, `AM_SUBMIT`,
`AM_VERIFY`, `FINDING_ASSIGN`, `FINDING_CLOSE`, `CHANGE_PASSWORD`,
`RESET_PASSWORD`, `USER_CREATE`.

Karena kolom `Password` di direktori karyawan dipakai bersama oleh 981 dari 982
orang, tab ini adalah **satu-satunya pertanggungjawaban siapa mengubah apa**
sampai setiap orang menetapkan password pribadinya. Jangan dihapus atau
dimatikan.
