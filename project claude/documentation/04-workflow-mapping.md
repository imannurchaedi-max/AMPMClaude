# 04 — Workflow Mapping

Peta alur kerja lama (kertas) ke sistem baru, per peran.

## Ringkasan pemetaan

| Proses lama (kertas) | Proses baru (sistem) |
|---|---|
| Daftar operator dikelola terpisah tiap sistem | Identitas dibaca langsung dari DATA KARYAWAN setiap login |
| Form dicetak per bulan per stasiun | Checklist muncul otomatis sesuai jatuh tempo |
| Operator centang kolom hari × shift | Tap `OK` / `NG` / `NA` per item |
| Tanda `X` untuk item bermasalah | `NG` + catatan wajib → temuan bernomor otomatis |
| Pengawas tanda tangan di kertas | Leader menekan Verifikasi → periode terkunci |
| Rekap manual, sering tidak dilakukan | Compliance & cleanliness terhitung real-time |
| Arsip form di ordner | `TRX_AM_CHECK` + `TRX_AM_RESULT`, dapat ditelusuri |
| Visual standard di sheet `Vis.` terpisah | *(belum — lihat backlog)* |

---

## Alur 0 — Login pertama kali

Hanya terjadi sekali per orang, tapi menentukan apakah seluruh jejak audit bisa
dipercaya.

```
Buka URL webapp
  │
  ▼
Isi NIK + password perusahaan (DAM1234567)
  │  Sistem mencari NIK di tab KARYAWAN direktori karyawan.
  │  Tidak ada pendaftaran — semua karyawan otomatis dikenali.
  ▼
Sistem menurunkan hak akses
  │  Otorisasi → peran      (Buat/Verifikasi/Validasi)
  │  Jabatan   → kelompok stasiun
  ▼
┌─ Jabatan tidak terpetakan? ──► DITOLAK dengan pesan bernama:
│                                "Jabatan X belum dipetakan ke stasiun AM"
▼
LAYAR GANTI PASSWORD — dipaksa, tidak bisa dilewati
  │  Password baru minimal 6 karakter dan tidak boleh sama
  │  dengan password perusahaan.
  ▼
Password pribadi tersimpan ter-hash
  │  Sejak titik ini password perusahaan DITOLAK untuk NIK tersebut.
  ▼
Masuk ke beranda
```

**Kenapa dipaksa:** password perusahaan dipakai bersama oleh 981 dari 982
karyawan. Selama seseorang masih memakainya, catatan "siapa mengisi checksheet
ini" belum bisa dipercaya.

---

## Alur 1 — Operator mengisi checksheet

```
Login (NIK + password pribadi)
  │
  ▼
Pilih Mesin · Stasiun · Tanggal · Shift
  │  Hanya kelompok stasiun sesuai Jabatan yang muncul — Packer melihat
  │  PACKER1..7, Operator Produksi melihat OP1..4. Operator memilih
  │  stasiun yang dipegangnya shift itu.
  │  Pembatasan ditegakkan di server, bukan sekadar disembunyikan di UI.
  ▼
Sistem menyusun task yang jatuh tempo
  │  Dikelompokkan per frekuensi (SHIFTLY, WEEKLY, …) karena tiap
  │  frekuensi punya periode dan penguncian sendiri.
  ▼
Pilih grup → isi tiap item
  │  Tap OK / NG / NA. Tekan lagi untuk membatalkan pilihan.
  │  Memilih NG memunculkan kolom catatan.
  ▼
Tombol Simpan aktif hanya bila semua item terisi
  │
  ▼
Submit
  ├─ Server menolak bila ada NG tanpa catatan
  ├─ Header + detail ditulis dalam satu lock
  ├─ Tiap NG melahirkan temuan (bila belum ada yang terbuka)
  └─ Tercatat di LOG_AUDIT
```

**Submit ulang diperbolehkan** selama periode belum diverifikasi. `check_id`
deterministik membuat submisi kedua memperbarui baris yang sama, bukan
menduplikasi — perlindungan terhadap tap ganda dan sinyal terputus.

---

## Alur 2 — Leader memverifikasi

```
Login → menu Temuan / Dashboard
  │
  ▼
Lihat checksheet berstatus SUBMITTED
  │
  ▼
Verifikasi
  ├─ status → VERIFIED
  ├─ periode terkunci: operator tidak bisa mengubah lagi
  └─ tercatat siapa dan kapan
```

Hanya checksheet berstatus `SUBMITTED` yang bisa diverifikasi. Operator ditolak
di sisi server bila mencoba memverifikasi.

Peran `LEADER` datang dari kolom `Otorisasi` bernilai **Verifikasi** di direktori
karyawan — 67 orang. Tidak perlu ditetapkan manual.

---

## Alur 3 — Siklus temuan

Ini bagian yang **tidak ada padanannya di sistem kertas**. Di form lama, tanda
`X` berhenti sebagai coretan tanpa tindak lanjut.

```
Operator menandai NG + catatan
  │
  ▼
TEMUAN dibuat otomatis  ── status OPEN
  │
  │  Satu task yang NG berulang pada periode berbeda tetap satu temuan
  │  selama temuan sebelumnya belum ditutup — agar daftar tidak membanjir.
  ▼
Leader menugaskan: PIC + tenggat  ── status IN_PROGRESS
  │
  ▼
Leader menutup + catatan penutupan (wajib)  ── status CLOSED
  │
  └─ opsional: pilih `reason` dari 7 kategori Form PM03
```

Temuan yang lewat tenggat ditandai merah dan naik ke urutan teratas daftar.

---

## Alur 4 — Monitoring

Dashboard menampilkan dua metrik yang **sengaja dipisah** karena sering
berlawanan arah:

| Metrik | Rumus | Padanan Form PM03 |
|---|---|---|
| **Compliance** | checksheet terisi ÷ checksheet jatuh tempo | `Completion` |
| **Cleanliness** | item OK ÷ (OK + NG) | *tidak ada* |

Compliance bisa 100% sementara cleanliness turun — artinya operator rajin mengisi
tapi kondisi mesin memburuk. Sebaliknya cleanliness tinggi dengan compliance
rendah berarti hanya sebagian stasiun yang dipantau, dan angkanya tidak bisa
dipercaya.

`NA` tidak dihitung dalam cleanliness — item yang tidak berlaku tidak boleh
mengerek atau menurunkan nilai.

Selain itu ditampilkan:
- Kartu temuan terbuka dan yang lewat tenggat
- Tren mingguan volume task dan NG
- **Part paling sering NG** — titik masuk untuk kaizen

---

## Pemetaan peran

Peran **tidak diisi manual**. Semuanya diturunkan dari kolom `Otorisasi` dan
`Jabatan` di direktori karyawan.

| Peran lapangan | Lama | Baru | Diturunkan dari |
|---|---|---|---|
| Operator OP1–OP4 | Isi form stasiunnya | `OPERATOR`, boleh pilih OP1–OP4 | Jabatan `Operator Produksi` / `Operator Production` |
| Packer 1–7 | Isi form packer | `OPERATOR`, boleh pilih PACKER1–PACKER7 | Jabatan `Packer` / `Produksi Harian` / `Produksi Borongan` |
| Palleting 1–2 | Isi form palleting | `OPERATOR`, boleh pilih PALLETING1–2 | Jabatan `Operator Forklift` / `Operator Reachtruck` / `Checker` |
| Pengawas / Line Leader | Tanda tangan konfirmasi | `LEADER` — verifikasi + kelola temuan | Otorisasi `Verifikasi` |
| Manajemen | Minta rekap manual | `MANAGER` — dashboard langsung | Otorisasi `Validasi` |
| Planner | Revisi master checksheet | `PLANNER` | Ditetapkan manual di `MST_USER` |
| — | *(tidak ada)* | `ADMIN` — akun darurat, reset password | Akun lokal `MST_USER` |

Jabatan di luar daftar itu **ditolak login**. Dari 982 karyawan, yang tidak
berkepentingan dengan AM antara lain GA Vendor (60), QC Produksi (40), QC Lab
(13), Admin WSP (7). Jalankan `Setup_auditEmployeeMapping()` untuk daftar
terkini.

---

## Pemetaan stasiun

Perbedaan penting dari sistem kertas: di form lama, satu lembar dicetak untuk
"Packer 3" dan diberikan ke orang tertentu. Di sistem baru, **stasiun dipilih
saat membuka checksheet**.

```
Data karyawan       Sistem                    Operator memilih
─────────────       ──────                    ────────────────
Jabatan: Packer  →  boleh: PACKER1..PACKER7 →  hari ini PACKER3
Jabatan: Op Prod →  boleh: OP1..OP4         →  hari ini OP2
Line Leader      →  boleh: semua 13 stasiun →  sesuai kebutuhan
```

Alasannya: data karyawan tidak pernah menyebut nomor stasiun — hanya "Packer".
Dan itu memang tidak bisa disimpulkan, karena operator berotasi antar stasiun
tiap shift. Memaksakan penugasan tetap justru akan salah.

Bila suatu saat seseorang perlu dikunci ke stasiun tertentu, isi kolom
`stations` di `MST_USER` untuk NIK itu — nilai di sana menimpa hasil Jabatan.

---

## Pemetaan frekuensi

Penanda seksi di kolom A checksheet kertas (`SHIFTLY`, `WEEKLY`, `MONTHLY`)
menjadi kolom `frequency`, yang menentukan periode dan penguncian.

| Penanda di kertas | `frequency` | Perilaku |
|---|---|---|
| SHIFTLY | `SHIFTLY` | Muncul tiap shift |
| DAILY | `DAILY` | Muncul sekali sehari (diwakili shift 1) |
| WEEKLY | `WEEKLY` | Terbuka sepanjang minggu ISO |
| 2 WEEKLY | `BIWEEKLY` | Terbuka sepanjang periode 2 minggu |
| MONTHLY | `MONTHLY` | Terbuka sepanjang bulan |

Catatan pada form kertas — *"poin-poin pada AM Monthly ditandai pada minggu
pelaksanaan saja"* — itulah alasan frekuensi panjang dibiarkan terbuka sepanjang
periodenya, bukan dipatok ke hari tertentu.

**Sejak 31 Agu 2026**, grup WEEKLY di checklist juga menampilkan task
SHIFTLY sebagai rekap/double-check mingguan (ditandai `recap: true`,
tampil di bawah task WEEKLY asli dengan pemisah visual). Task SHIFTLY
**tetap** wajib diisi tiap shift seperti biasa — ini tambahan tampilan di
grup WEEKLY, bukan pengganti. Lihat [05-rules.md](05-rules.md) A1c.

---

## Perubahan data: siapa mengubah apa, di mana

| Yang berubah | Diubah di | Berlaku kapan |
|---|---|---|
| Karyawan baru / resign | Spreadsheet DATA KARYAWAN | Maks 10 menit (cache), atau segera lewat `empRefresh()` |
| Mutasi jabatan / otorisasi | Spreadsheet DATA KARYAWAN | Sama seperti di atas |
| Master checksheet direvisi | File `.xlsx` → `extract_am_master.py` → `Setup_importAmTasks()` | Segera |
| Pemetaan jabatan → stasiun | `JABATAN_STATIONS` di `09_Employee.gs` | Setelah `clasp push` + versi baru |
| Penyimpangan peran/stasiun per orang | Tab `MST_USER` | Login berikutnya |
| Mesin / stasiun baru | `Setup_seedMaster()` atau langsung di tab | Segera |

Prinsipnya: **data orang di HR, data kerja di aplikasi.** Aplikasi tidak pernah
menulis ke direktori karyawan.

---

## Yang belum terpetakan

| Elemen kertas | Status |
|---|---|
| Sheet `Vis.` (visual standard, 134 foto) | Belum — kolom `photo_url` sudah disiapkan |
| `LIST DOOR` (pembagian pembersihan pintu + durasi) | Belum dimodelkan |
| Kolom "Konfirmasi oleh pengawas" | Diganti mekanisme Verifikasi |
| Blok kop dokumen (No. Dokumen, Revisi, Tgl Berlaku) | Tersimpan di `MST_AM_TASK` sebagai metadata |
| Pembatasan lini (Adult=AHP, Baby=BHP) | Tidak aktif — kolom `Section` ada di tab `Sheet6`, bukan `KARYAWAN`. Lini ditentukan mesin yang dipilih |
