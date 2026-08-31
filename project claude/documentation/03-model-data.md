# 03 — Model Data

Spreadsheet: [`1x1kmQem…uFkb8`](https://docs.google.com/spreadsheets/d/1x1kmQemH80GlVZaT1QVr3QSITsHIYIHzVursa7uFkb8/edit)

Satu tab = satu tabel. Kolom pertama selalu primary key. Urutan kolom
didefinisikan di `SCHEMA` pada `00_Config.gs` — **itu sumber kebenaran tunggal**.
Jangan menyusun ulang kolom langsung di spreadsheet; ubah `SCHEMA` lalu jalankan
`Setup_initDatabase()`.

## Peta relasi

```
DATA KARYAWAN (eksternal) ──► identitas, peran, stasiun (dibaca saat login)
     │
MST_USER ──┬──────────────────────► TRX_AM_CHECK.nik        (pengisi)
           ├──────────────────────► TRX_AM_CHECK.verified_by (verifikator)
           └──────────────────────► TRX_FINDING.assigned_to  (penanggung jawab)

MST_MACHINE ─────────────────────► TRX_AM_CHECK.machine_id
MST_STATION ─────────────────────► TRX_AM_CHECK.station

MST_AM_TASK ─────────────────────► TRX_AM_RESULT.task_id

TRX_AM_CHECK (header) ──1:N──────► TRX_AM_RESULT (detail)
        │
        └──────────── hasil NG ───► TRX_FINDING
```

## Tabel master

### `MST_USER` — lapisan tipis, bukan master karyawan

Daftar karyawan ada di spreadsheet **DATA KARYAWAN** dan dibaca langsung saat
login. Tabel ini hanya menyimpan hal yang tidak ada di sana, dan hanya untuk
orang yang **benar-benar pernah login** — plus akun darurat seperti `ADMIN`
yang memang tidak ada di direktori.

| Kolom | Isi |
|---|---|
| `nik` | **PK.** Nomor induk karyawan |
| `name` | Nama tampilan (disalin saat login pertama) |
| `password_hash` | SHA-256 bersalt. Kosong = masih memakai password direktori |
| `role` | Kosong = ikut `Otorisasi` di direktori. Diisi = menimpanya |
| `line` | Kosong = semua lini |
| `stations` | Kosong = ikut `Jabatan`. Diisi = kunci ke stasiun tertentu, dipisah `;` |
| `active` | `FALSE` memblokir login meski aktif di direktori |
| `created_at`, `last_login` | ISO datetime |

### Direktori karyawan (sumber eksternal, hanya dibaca)

Spreadsheet [`14OTl9xY…FjY9o`](https://docs.google.com/spreadsheets/d/14OTl9xYINyRIqnJ2AEaCJFD_D9tNRRueNgFby6FjY9o/edit),
tab `KARYAWAN`, 982 baris, NIK 100% unik.

| Kolom dipakai | Peran di sistem |
|---|---|
| `NIK` | Identitas login. Tersimpan sebagai angka → dinormalkan dari `328000022.0` |
| `Nama` | Nama tampilan |
| `Departemen` | Ditulis tidak konsisten (`Production` dan `PROD`) → dinormalkan |
| `Jabatan` | Menentukan kelompok stasiun |
| `Otorisasi` | Menentukan peran: Buat / Verifikasi / Validasi |
| `Password` | Kunci masuk pertama saja — 981 dari 982 memakai nilai sama |

### `MST_MACHINE`

`machine_id` (PK) · `line` · `name` · `seq` · `active`

Terisi 6 baris: AHP1, BHP1–BHP5.

### `MST_STATION`

`station_id` (PK) · `label` · `type` · `seq` · `active`

Terisi 13 baris: OP1–OP4, PACKER1–PACKER7, PALLETING1–PALLETING2.

### `MST_AM_TASK`

Hasil `tools/extract_am_master.py`. **357 baris (333 aktif).**

| Kolom | Isi |
|---|---|
| `task_id` | **PK.** Hash 10 karakter dari lini+stasiun+frekuensi+urutan+part+tindakan |
| `line` | `AHP` / `BHP` |
| `machines` | Mesin yang memakai task ini, dipisah `;` |
| `station` | Stasiun asal sheet |
| `stations` | Stasiun efektif (bisa banyak), dipisah `;` |
| `frequency` | `SHIFTLY` `DAILY` `WEEKLY` `BIWEEKLY` `MONTHLY` |
| `seq` | Nomor urut dalam checksheet |
| `part_name` | Nama part |
| `action` | Tindakan yang harus dilakukan |
| `standard` | Kriteria penerimaan |
| `pic_label` | Label PIC asli dari file warisan (untuk penelusuran) |
| `doc_no`, `doc_rev`, `doc_effective` | Metadata dokumen mutu |
| `source_sheet` | Sheet asal — jejak balik ke file warisan |
| `active` | `FALSE` untuk task dari sheet tersembunyi (versi lama) |

`station` vs `stations`: `station` adalah stasiun pemilik sheet, `stations`
adalah daftar stasiun yang benar-benar mengerjakan (dari kolom PIC baris itu).
Untuk task ber-PIC `OP 1,2,3/Packer`, `stations` berisi `OP1;OP2;OP3;PACKER`.
**Query pemilihan task selalu memakai `stations`, bukan `station`.**

## Tabel transaksi

### `TRX_AM_CHECK` — header submisi

Satu baris per (stasiun × mesin × frekuensi × periode).

| Kolom | Isi |
|---|---|
| `check_id` | **PK deterministik**: `AMC-{machine}-{station}-{freq}-{periodKey}` |
| `period_key` | Kunci periode — lihat tabel di bawah |
| `check_date` | `yyyy-MM-dd` |
| `shift` | `1`/`2`/`3`, kosong untuk non-SHIFTLY |
| `line`, `machine_id`, `station` | Konteks |
| `nik` | Pengisi |
| `frequency` | Frekuensi grup ini |
| `total_task`, `ok_count`, `ng_count`, `na_count` | Rekap, dihitung server |
| `status` | `SUBMITTED` → `VERIFIED` |
| `submitted_at`, `verified_by`, `verified_at` | Jejak |
| `note` | Catatan umum |

### `TRX_AM_RESULT` — detail per task

`result_id` (PK, `{check_id}:{task_id}`) · `check_id` · `task_id` · `seq` ·
`result` (`OK`/`NG`/`NA`) · `note` · `photo_url` · `recorded_at`

Baris satu check selalu ditulis sekaligus sehingga letaknya berdekatan — itu
yang membuat `dbReadByKey()` efisien.

### `TRX_FINDING` — temuan

Lahir otomatis dari setiap hasil `NG`.

`finding_id` (PK) · `check_id` · `task_id` · `line` · `machine_id` · `station` ·
`part_name` · `description` · `severity` · `reason` · `status` · `raised_by` ·
`raised_at` · `assigned_to` · `due_date` · `closed_by` · `closed_at` ·
`closing_note`

Status: `OPEN` → `IN_PROGRESS` → `CLOSED` (atau `CANCELLED`).

`reason` memakai 7 kategori yang **sama persis** dengan `Completion 2026` di
Form PM03, supaya AM dan PM kelak bisa dilaporkan dalam satu bahasa:
Spare Part Kosong · Man Power Kurang · Produksi Full Plan · Keterbatasan Tools ·
Tunggu Plan Date · Tunggu Eksekusi Bubu · Kesalahan Planning.

### `LOG_AUDIT`

`ts` · `nik` · `action` · `entity` · `entity_id` · `detail`

Mencatat: `LOGIN`, `LOGOUT`, `AM_SUBMIT`, `AM_VERIFY`, `FINDING_ASSIGN`,
`FINDING_CLOSE`, `CHANGE_PASSWORD`, `RESET_PASSWORD`, `USER_CREATE`.

Selama sebagian karyawan masih memakai password bersama, log ini adalah
satu-satunya pertanggungjawaban siapa mengubah apa. Jangan dimatikan.

### `CFG_KV`

`key` · `value` · `updated_at` · `updated_by` — konfigurasi runtime.

## Kunci periode

`period_key` adalah kunci idempotensi. Satu stasiun pada satu mesin hanya boleh
punya satu submisi per periode.

| Frekuensi | Bentuk `period_key` | Contoh |
|---|---|---|
| `SHIFTLY` | `yyyy-MM-dd#S{shift}` | `2026-08-29#S2` |
| `DAILY` | `yyyy-MM-dd` | `2026-08-29` |
| `WEEKLY` | `yyyy-Www` (ISO-8601) | `2026-W35` |
| `BIWEEKLY` | `yyyy-Www/2` (dipatok minggu genap) | `2026-W34/2` |
| `MONTHLY` | `yyyy-MM` | `2026-08` |

Minggu memakai **ISO-8601**: minggu mulai Senin, minggu 1 adalah minggu yang
memuat Kamis pertama. Ini sama dengan `ISOWEEKNUM()` yang dipakai Dashboard 2026,
jadi angka minggu AM dan PM selalu cocok.

Uji batas tahun sudah tercakup: 2027-01-01 jatuh hari Jumat, sehingga masih
masuk minggu 53 tahun 2026.

## Aturan jatuh tempo

- `SHIFTLY` — jatuh tempo tiap shift
- `DAILY` — diwakili shift 1 supaya tidak muncul tiga kali sehari
- `WEEKLY`, `BIWEEKLY`, `MONTHLY` — terbuka sepanjang periodenya

Frekuensi panjang sengaja dibiarkan terbuka: di checksheet kertas, operator
hanya menandai minggu pelaksanaan, bukan hari tertentu. Sistem mengikuti praktik
yang sudah berjalan.

## Pertumbuhan data

| Tabel | Laju | Proyeksi 1 tahun |
|---|---|---|
| `TRX_AM_RESULT` | ±2.300 baris/minggu | ±120.000 baris |
| `TRX_AM_CHECK` | ±950 baris/minggu | ±50.000 baris |
| `TRX_FINDING` | tergantung NG | ratusan |
| `LOG_AUDIT` | ±1.500 baris/minggu | ±78.000 baris |

`dbReadByKey()` sudah menghindari pemindaian penuh untuk operasi harian, tapi
agregasi dashboard masih membaca tabel penuh. **Siapkan rutin arsip tahunan ke
spreadsheet terpisah sebelum menembus ±200 ribu baris** — lihat
[07-backlog.md](07-backlog.md).
