# 02 — Arsitektur

## Gambaran umum

```
┌──────────────────────────────────────────────────────────────┐
│  Browser — HP operator di lantai produksi / desktop leader    │
│  ui/Index.html · ui/Style.html · ui/App.html                  │
│  satu halaman, ganti view tanpa reload; token sesi di         │
│  localStorage (boleh gagal — sesi hilang saat reload saja)    │
└───────────────────────────┬──────────────────────────────────┘
                            │ google.script.run
                            │   .rpc(action, token, payload)
┌───────────────────────────▼──────────────────────────────────┐
│  08_Api.gs — satu-satunya pintu masuk                        │
│  ROUTES: 14 aksi → handler. Sesi, error, dan bentuk balasan   │
│  ditangani terpusat di sini.                                  │
└───────────────────────────┬──────────────────────────────────┘
                            │
   ┌──────────┬─────────────┼─────────────┬──────────────┐
   ▼          ▼             ▼             ▼              ▼
┌────────┐ ┌────────┐ ┌───────────┐ ┌──────────┐ ┌────────────┐
│02_Auth │ │09_Empl │ │04_AmCheck │ │05_Finding│ │06_Dashboard│
│login   │ │peran & │ │checklist  │ │temuan    │ │compliance  │
│sesi    │◄┤stasiun │ │submit     │ │          │ │cleanliness │
│peran   │ │        │ │verifikasi │ │          │ │            │
└───┬────┘ └───┬────┘ └─────┬─────┘ └────┬─────┘ └─────┬──────┘
    │          │            │ 03_Period  │             │
    │          │            └────────────┴─────────────┘
    │          │                         │
    │          ▼                         ▼
    │   ┌─────────────────┐  ┌────────────────────────────────┐
    │   │ DATA KARYAWAN   │  │  01_Db.gs — lapisan akses data  │
    │   │ 14OTl9xY…FjY9o  │  │  dbRead/Insert/Update/Find/     │
    │   │ tab KARYAWAN    │  │  ReadByKey + cache + lock       │
    │   │ 982 karyawan    │  │  reentrant + normalisasi tanggal│
    │   │ HANYA DIBACA    │  └───────────────┬────────────────┘
    │   └─────────────────┘                  │
    └─────────────────────────────────────┐  │
                                          ▼  ▼
                       ┌──────────────────────────────────────┐
                       │  AM PM MONITORING 1x1kmQem…uFkb8     │
                       │  9 tab = 9 tabel, kolom format teks  │
                       └──────────────────────────────────────┘
```

Dua spreadsheet dengan peran yang berbeda tegas:

| Spreadsheet | Peran | Akses |
|---|---|---|
| **DATA KARYAWAN** | Sumber identitas: siapa, jabatan apa, otorisasi apa | Hanya dibaca |
| **AM PM MONITORING** | Database aplikasi: master task, transaksi, audit | Baca-tulis |

## Keputusan desain

### 1. AM lebih dulu, bukan PM

PM sudah berjalan di Excel dengan completion 94,7% — sistem yang bekerja.
Memigrasikannya lebih dulu berarti mengambil risiko tanpa imbalan sepadan.
AM masih 100% kertas, jadi di situ seluruh gain-nya.

Fondasi bersama (mesin, stasiun, periode, audit, kosakata alasan) tetap dibangun
sejak awal supaya modul PM tinggal menempel di fase 3.

### 2. Login NIK + password, bukan akun Google

Hanya **8% karyawan punya email** di data HR, jadi akun Google Workspace per
orang bukan pilihan. Konsekuensinya:

- Webapp di-deploy `executeAs: USER_DEPLOYING` + `access: ANYONE_ANONYMOUS`
- Apps Script tidak memberi identitas apa pun → sesi dikelola sendiri
- Token sesi disimpan di `CacheService`, TTL 12 jam (menutup satu shift penuh)

### 3. Identitas dibaca langsung, tidak disalin

Daftar karyawan **tidak diimpor** ke aplikasi. Setiap login membaca tab
`KARYAWAN` di spreadsheet DATA KARYAWAN, di-cache 10 menit.

Akibatnya karyawan baru, mutasi jabatan, dan resign otomatis terpakai tanpa
impor ulang — tidak ada dua daftar karyawan yang bisa saling menyimpang.

### 4. Peran dan stasiun diturunkan, bukan diisi manual

| Kolom sumber | Menentukan | Pemetaan |
|---|---|---|
| `Otorisasi` | Peran | Buat → `OPERATOR` · Verifikasi → `LEADER` · Validasi → `MANAGER` |
| `Jabatan` | Kelompok stasiun | Packer → `PACKER1..7` · Operator Produksi → `OP1..4` · Forklift/Reachtruck/Checker → `PALLETING1..2` · Line/Shift Leader → semua |

`Otorisasi` dipakai apa adanya karena kosakata itu **sudah dipakai sistem lain di
pabrik**. Memperkenalkan istilah peran baru berisiko membuat artinya bergeser
antar aplikasi.

**Jabatan menentukan kelompok, bukan satu stasiun tetap.** Data karyawan hanya
menyebut "Packer", tidak pernah "Packer 3" — dan memang tidak bisa, karena
operator berotasi antar stasiun tiap shift. Stasiun spesifik dipilih sendiri saat
membuka checksheet.

Jabatan yang tidak terpetakan **ditolak login** dengan pesan bernama, bukan
diberi akses kosong. `Setup_auditEmployeeMapping()` melaporkan jabatan mana yang
belum tercakup beserta jumlah orangnya.

### 5. Password dua lapis

Kolom `Password` di direktori bukan password per orang — **981 dari 982 karyawan
memakai nilai yang sama** (`DAM1234567`). Bila itu jadi satu-satunya kredensial,
siapa pun yang mengetahuinya bisa masuk sebagai siapa pun, termasuk sebagai Line
Leader untuk memverifikasi checksheet. Itu meniadakan akuntabilitas yang justru
menjadi tujuan sistem ini.

Karena itu password direktori diperlakukan sebagai **kunci masuk pertama saja**:

```
login pertama    → password direktori diterima
                 → sesi ditandai must_change_password
                 → UI memaksa layar Ganti Password sebelum apa pun bisa dibuka
                 → password pribadi disimpan ter-hash di MST_USER
login berikutnya → hanya password pribadi yang diterima
                 → password direktori DITOLAK untuk NIK itu
```

### 6. `MST_USER` adalah lapisan tipis, bukan salinan direktori

Baris dibuat hanya untuk orang yang **benar-benar pernah login**, plus akun
darurat `ADMIN` yang memang tidak ada di direktori.

Isinya terbatas pada hal yang tidak ada di direktori: password pribadi,
penyimpangan peran/stasiun, dan waktu login terakhir. Kolom kosong berarti "ikut
direktori" — jadi mutasi jabatan tetap otomatis berlaku.

### 7. Akun lokal sebagai jalur darurat

Bila spreadsheet karyawan tidak terbaca (dihapus, izin berubah, kuota API), akun
lokal seperti `ADMIN` **tetap bisa masuk**. Sistem tidak boleh terkunci total
karena satu dependensi eksternal.

### 8. Database ternormalisasi, bukan salinan struktur Excel

`Maps 2026` adalah 81.007 baris terdenormalisasi — nama equipment, deskripsi
operasi, dan durasi diulang ribuan kali. Praktis untuk pivot Excel, buruk sebagai
backend: satu perubahan nama part berarti menyunting ribuan baris.

Sistem baru memisahkan **master** (definisi task, jarang berubah) dari
**transaksi** (hasil pelaksanaan, tumbuh terus). Detail di
[03-model-data.md](03-model-data.md).

### 9. Router RPC tunggal

Klien hanya memanggil satu fungsi: `rpc(action, token, payload)`.

Penanganan sesi, error, dan audit terpusat di satu tempat. Menambah fitur berarti
menambah satu entri di `ROUTES` — bukan menambah endpoint baru yang harus
diamankan sendiri-sendiri dan berisiko lupa memeriksa peran.

Bentuk balasan selalu seragam:

```js
{ ok: true,  data: ... }
{ ok: false, error: "pesan", code: "ERROR" | "SESSION_EXPIRED" }
```

Klien memakai `code`, bukan pencocokan teks pesan, untuk memutuskan kapan
menampilkan layar login lagi.

## Desain visual — diselaraskan dengan DAM PORTAL (31 Agu 2026)

`0. DT SUMMARY/active trial/index.html` (webapp DAM PORTAL — hub Downtime,
QDASH, EWO dkk milik PT. Daya Anugrah Mulya) punya sistem desain sendiri:
sidebar gelap, glassmorphism, font "Outfit", aksen biru `#3b82f6`. Supaya
webapp AM/PM ini terasa satu keluarga dengan aplikasi DAM lain, token warna,
font, dan branding layar login diselaraskan ke situ — **tapi bukan seluruh
shell-nya**.

| Diambil dari DAM PORTAL | Sengaja TIDAK diikuti |
|---|---|
| Token warna (`--primary: #3b82f6`, dst di `ui/Style.html`) | Sidebar + topbar desktop — checksheet ini form satu kolom, bukan dashboard multi-modul |
| Font "Outfit" (Google Fonts) | Glassmorphism/blur pada kartu — kontras tinggi lebih penting di layar HP di bawah cahaya lantai produksi |
| Logo DAM + "PT. DAYA ANUGRAH MULYA" di layar login | Chart.js/Bootstrap — checksheet tidak butuh visualisasi seberat dashboard analitik |

`--ok` dan `--warn` sengaja **tidak** disamakan persis dengan token DAM
PORTAL (`#10b981`/`#f59e0b`) — keduanya dipakai sebagai warna teks di sini
(bukan cuma badge di atas kartu semi-transparan seperti di DAM PORTAL), dan
versi DAM PORTAL kontrasnya terlalu rendah di atas latar putih solid untuk
dibaca cepat sambil berdiri di lantai produksi.

## Batasan Apps Script yang membentuk kode

| Batasan | Dampak | Penanganan |
|---|---|---|
| Eksekusi maks 6 menit | Operasi besar bisa timeout | Baca tabel sekali penuh, olah di memori; tidak pernah `getRange()` per baris dalam loop |
| Sheets bukan database | Tidak ada indeks | `dbReadByKey()` membaca satu kolom kunci lalu hanya blok baris relevan |
| Tidak ada transaksi | Dua submit bersamaan bisa saling menimpa | `LockService` pada semua operasi tulis |
| `LockService` tidak reentrant | `amSubmit` → `dbInsert` bisa mengunci diri sendiri | Penghitung kedalaman di `withLock_()` |
| Sheets memaksa tipe data | `'2026-08-29'` jadi `Date`, `'328000022'` jadi angka | Kolom diformat teks (`@`); `ymd_()` dan `normNik_()` menormalkan saat baca |
| `CacheService` maks 100 KB per entri | Direktori/tabel besar gagal di-cache | Payload > 95 KB dilewati, dibaca langsung |
| Webapp tidak punya spreadsheet aktif | `getActiveSpreadsheet()` bisa `null` | `db_()` mundur ke `CFG.DEFAULT_DB_ID` |

## Modul

| Berkas | Baris | Tanggung jawab |
|---|---|---|
| `00_Config.gs` | 116 | Konstanta + `SCHEMA` (sumber kebenaran tunggal urutan kolom) |
| `01_Db.gs` | 280 | Akses Sheets, cache, lock, ID, audit, normalisasi tanggal |
| `02_Auth.gs` | 286 | Login dua lapis, sesi, pemeriksaan peran |
| `03_Period.gs` | 104 | ISO week, `period_key`, penentuan jatuh tempo |
| `04_AmCheck.gs` | 297 | Susun checklist, submit, verifikasi, terbitkan temuan |
| `05_Finding.gs` | 122 | Daftar, tugaskan, tutup temuan; ringkasan |
| `06_Dashboard.gs` | 159 | Compliance, cleanliness, tren, top NG |
| `07_Setup.gs` | 396 | Init tab, seed master, impor CSV, pemulihan akun, diagnosa |
| `08_Api.gs` | 124 | `doGet`, `include`, `ROUTES`, `rpc`, `appBootstrap` |
| `09_Employee.gs` | 246 | Direktori karyawan, pemetaan Otorisasi/Jabatan → peran & stasiun |
| `10_Photo.gs` | 108 | Unggah foto bukti hasil AM ke Drive, validasi tipe/ukuran |

Semua `.gs` berbagi lingkup global di Apps Script — penamaan berawalan angka
hanya untuk mengatur urutan baca manusia, bukan urutan muat.

Fungsi berakhiran garis bawah (`hashPassword_`, `withLock_`, `sessionOf_`) adalah
internal: tidak pernah dipanggil dari klien dan tidak boleh masuk `ROUTES`.

## Daftar aksi RPC

| Aksi | Peran minimum | Kegunaan |
|---|---|---|
| `auth.login` | — | Login NIK + password |
| `auth.logout` | sesi | Akhiri sesi |
| `auth.changePassword` | sesi | Tetapkan/ganti password pribadi |
| `app.bootstrap` | sesi | Mesin, stasiun, hak akses, konfigurasi awal |
| `am.checklist` | OPERATOR | Task jatuh tempo + hasil tersimpan |
| `am.submit` | OPERATOR | Simpan hasil, terbitkan temuan (OK/NG wajib foto) |
| `photo.upload` | OPERATOR | Unggah foto bukti (base64) ke Drive, kembalikan URL |

### Perkaya visual (31 Agu 2026)

Setelah token warna/font diselaraskan (§ di atas), diuji langsung side-by-side
dengan DAM PORTAL — masih terasa "form biasa" karena hanya nilai token yang
berubah, layoutnya identik dengan sebelumnya. Ditambahkan lapisan visual
kedua, tetap dalam batas solid/opak (bukan blur) dan satu-halaman mobile:

- Gradient hero solid di layar login (`linear-gradient` 3 warna primary),
  teks brand dengan `background-clip: text`, shadow kartu lebih dalam
- Topbar dan tombol primer pakai gradient solid + shadow, bukan flat color
- Indikator titik hijau berdenyut ("live pill") di topbar — dekoratif,
  menandai app aktif membaca database, bukan klaim streaming realtime
- Kartu task/stat/chip/choice terpilih dapat shadow/glow warna sesuai status
  (OK hijau, NG merah) dan efek tekan (`:active`) untuk umpan balik sentuh
- Drawer menu (☰) diganti jadi **sidebar kiri** (bukan overlay kanan tanpa
  identitas) — strukturnya disamakan persis dengan sidebar DAM PORTAL/Gemba
  Control Tower: `sidebar-header` (logo + nama app), `sidebar-user-profile`
  (avatar ikon + nama + rincian NIK/jabatan/departemen/stasiun berikon,
  pakai Bootstrap Icons — CDN sama seperti yang dipakai DAM PORTAL), lalu
  `main-nav` dan `sidebar-footer` (tombol Keluar). Warna navy gelap
  (`#1E2A3A`, teks `#8FA4B8`, highlight aktif `rgba(59,130,246,.18)`) —
  menu yang sedang aktif tersorot terus, bukan cuma saat disentuh. Yang
  **tidak** diikutkan dari DAM PORTAL: nav-group collapsible dan banyak
  modul (Quality/Logistic/dst) — checksheet ini cuma 4 menu datar, tidak
  butuh mekanisme sub-modul
- **Topbar diperbaiki jadi putih** (`background: #ffffff`, border-bottom
  tipis) — semula sempat dibuat biru solid, ternyata itu keliru: kode asli
  DAM PORTAL (`.app-topbar` di trial index.html) memang putih, biru cuma
  dipakai untuk label kecil ("DAM PORTAL") di atas judul. Biru solid di
  topbar itu yang bikin bentrok dengan sidebar navy di sebelahnya
- **Sidebar responsif**: overlay + tombol ☰ hanya aktif di layar sempit
  (< 900px, HP). Di layar lebar (tablet/PC), sidebar terbuka permanen dan
  mendorong konten (`display:flex` pada `.app-wrapper`), sama seperti
  perilaku DAM PORTAL — tombol menu dan overlay disembunyikan otomatis
| `am.verify` | LEADER | Sahkan checksheet, kunci periode |
| `finding.list` | LEADER | Daftar temuan |
| `finding.assign` | LEADER | Tugaskan PIC + tenggat |
| `finding.close` | LEADER | Tutup dengan catatan wajib |
| `dashboard.summary` | LEADER | Compliance, cleanliness, tren, top NG |
| `employee.lookup` | sesi | Cari karyawan dari NIK (password tidak pernah ikut) |
| `user.create` | ADMIN | Buat akun lokal |
| `auth.resetPassword` | ADMIN | Kosongkan password pribadi seseorang |

## Alur data: satu login

```
NIK + password
  → rpc('auth.login')
  → 02_Auth.authLogin
     ├─ batas percobaan gagal (5×, kunci 5 menit)
     ├─ dbFind('MST_USER')          lapisan lokal, boleh kosong
     ├─ empFind()                   baca direktori karyawan (cache 10 menit)
     │    └─ gagal? akun lokal tetap boleh masuk
     ├─ verifikasi password:
     │    password_hash terisi  → wajib cocok dengan password pribadi
     │    password_hash kosong  → cocokkan dengan password direktori,
     │                            tandai must_change_password
     ├─ buildSession_()  peran & stasiun dari empAccess(),
     │                   ditimpa MST_USER bila kolomnya diisi
     ├─ tolak bila tidak punya stasiun dan bukan LEADER ke atas
     ├─ touchLogin_()    buat/perbarui baris MST_USER seperlunya
     └─ audit_()         LOG_AUDIT
```

Isi sesi: `nik` `name` `role` `line` `stations` `dept` `jabatan` `source`
`must_change_password` `exp`.

`source` bernilai `EMPLOYEE` (dari direktori) atau `LOCAL` (akun darurat).

## Alur data: satu submisi

```
Operator tap OK/NG  →  App.html mengumpulkan jawaban
                    →  rpc('am.submit', token, payload)
                    →  04_AmCheck.amSubmit
                       ├─ sessionOf_()          verifikasi token
                       ├─ cek stasiun milik user
                       ├─ tolak NG tanpa catatan
                       ├─ periodKey_() → checkId_()   kunci idempotensi
                       ├─ withLock_ ┬ hapus detail lama (bila submit ulang)
                       │            ├─ tulis TRX_AM_CHECK  (header)
                       │            └─ tulis TRX_AM_RESULT (detail)
                       ├─ raiseFindings_()      NG → TRX_FINDING
                       └─ audit_()              LOG_AUDIT
```

Kunci idempotensinya adalah `check_id` yang deterministik:

```
AMC-{machine}-{station}-{frequency}-{periodKey}
```

Submit dua kali pada periode yang sama menghasilkan `check_id` identik, sehingga
memperbarui baris yang sama alih-alih menduplikasi. Ini yang melindungi dari tap
ganda dan sinyal terputus di lantai produksi.

## Pengujian

Apps Script tidak bisa dijalankan lokal. `tools/gas_harness.js` memuat semua
`.gs` ke konteks `vm` Node dengan stub `SpreadsheetApp`, `CacheService`,
`PropertiesService`, `LockService`, `DriveApp`, dan `Utilities` — termasuk
**dua spreadsheet tiruan**: database aplikasi dan direktori karyawan, serta
folder Drive tiruan untuk uji unggah foto.

Direktori tiruan sengaja meniru kejanggalan data asli agar bug produksi juga
muncul di uji: NIK tersimpan sebagai angka (`328000022.0`), departemen ditulis
`Production` dan `PROD`, serta satu password dipakai bersama.

**104 asersi**, mencakup: perhitungan ISO week termasuk batas tahun, idempotensi
setup dan submit, penolakan NG tanpa catatan, penolakan OK/NG tanpa foto bukti,
validasi tipe dan ukuran foto, WEEKLY menampilkan rekap SHIFTLY tanpa
mencampur check_id, penguncian setelah verifikasi, siklus hidup
temuan, agregasi dashboard, kontrol akses per peran, penurunan peran dari
`Otorisasi`, penurunan stasiun dari `Jabatan`, dan bukti bahwa password bersama
berhenti berlaku setelah password pribadi ditetapkan.

```bash
cd "project claude/active"
node tools/gas_harness.js
```

Jalankan sebelum setiap `clasp push`.

## Versi & deployment

`clasp push` hanya memperbarui HEAD. **URL yang dibagikan ke operator tetap
menyajikan versi lama** sampai deployment diarahkan ke versi baru — lihat
[08-operasional.md](08-operasional.md).

| Deployment | Menyajikan | Untuk |
|---|---|---|
| `@9` | Versi tetap | URL yang dibagikan ke operator |
| `@HEAD` | Kode terbaru | Uji internal tanpa membuat versi |
