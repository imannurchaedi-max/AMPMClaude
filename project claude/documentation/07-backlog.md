# 07 — Backlog

## Anomali data warisan — butuh keputusan Anda

Ditemukan saat ekstraksi. Sengaja **tidak ditebak sendiri** oleh script karena
menebak akan menghasilkan data master yang salah dan sulit dilacak kemudian.

| # | Temuan | Jumlah | Yang perlu diputuskan |
|---|---|---|---|
| 1 | Task ber-PIC hanya `"OP"` tanpa nomor | 2 task | OP berapa yang dimaksud? |
| 2 | Task ber-PIC `"Packer"` generik | 11 task | Packer 1–7 yang mana? Atau memang semua? |
| 3 | Task ber-PIC `"Palleting"` generik | 4 task | Palleting 1 atau 2? |
| 4 | Sheet `Weekly & Monthly` (Baby) berisi PIC campuran `OP 1,2,3/Packer` | 26 task | Sudah dipetakan multi-stasiun, tapi sebaiknya dipecah agar sejalan dengan sheet per-stasiun |
| 5 | Task dari sheet tersembunyi, ditandai `active=FALSE` | 24 task | Konfirmasi memang sudah tidak berlaku |

Setelah diputuskan, perbaikannya cukup di `tools/extract_am_master.py` lalu
impor ulang — tidak perlu menyunting spreadsheet manual.

## Fase 2 — Pelengkap modul AM

### 2.1 Foto bukti hasil — SELESAI (31 Agu 2026)
Diimplementasikan di `10_Photo.gs` + `photo.upload` pada `ROUTES`. Hasil
**OK/NG kini wajib disertai foto** (ditegakkan di `amSubmit()`, bukan cuma
disarankan) — NA dikecualikan karena tidak ada yang bisa difoto. Alasan
mewajibkan: form kertas maupun versi awal sistem ini hanya merekam pilihan
Ya/Tidak, Sudah/Belum, Good/NG tanpa bukti — tidak ada yang menjamin kondisi
mesin sesungguhnya sesuai klaim operator.

- Kompresi di klien lewat `<canvas>` (maks dimensi 1280px, kualitas JPEG
  turun bertahap) sebelum dikirim sebagai base64 lewat `photo.upload`.
- Server (`photoUpload()`) memvalidasi ulang tipe dan ukuran — batas final
  **1 MB**, klien bisa dilewati, server tidak.
- Disimpan ke folder Drive `1tvOOIdJHK-C0CZy0Wj3QR_Q-aR6xsSps`, dibagikan
  `ANYONE_WITH_LINK` + `VIEW` supaya tampil di `<img>` webapp.
- Setiap unggahan tercatat di `LOG_AUDIT` (`UPLOAD_PHOTO`).
- Diuji lewat `gas_harness.js` bagian 7b (6 asersi): validasi tipe, ukuran,
  sesi, dan penolakan submit tanpa foto.

Belum digarap: pembersihan foto lama dari Drive saat submit ulang mengganti
hasil (foto sebelumnya jadi yatim, tidak terhubung ke `photo_url` mana pun) —
lihat utang teknis di bawah.

### 2.2 Visual standard
File warisan punya **134 foto** di sheet `Vis.` — acuan "seperti apa bersih itu".
Ini aset berharga yang saat ini tidak terpakai di sistem baru.

Rencana: ekstrak dari `.xlsx` (sudah bisa lewat `zipfile`, ada di `xl/media/`),
unggah ke Drive, tautkan ke `MST_AM_TASK` lewat kolom baru `visual_url`.
Operator bisa menekan item untuk melihat standar visualnya.

### 2.3 Arsip otomatis
`TRX_AM_RESULT` bertambah ±2.300 baris/minggu (±120.000/tahun). `dbReadByKey()`
sudah menghindari pemindaian penuh untuk operasi harian, tapi agregasi dashboard
masih membaca tabel penuh.

**Ambang tindakan: ±200.000 baris.** Rencana: pemicu tahunan yang memindahkan
data tahun lalu ke spreadsheet arsip terpisah, menyisakan tahun berjalan.

### 2.4 Notifikasi
- Pengingat checksheet yang belum diisi menjelang akhir shift
- Peringatan temuan yang mendekati atau melewati tenggat

Apps Script bisa lewat email. WhatsApp perlu layanan pihak ketiga — perlu
keputusan terpisah.

### 2.5 Mode luring
Lantai produksi sering ber-sinyal buruk. Saat ini kegagalan jaringan berarti
kehilangan isian.

Rencana: simpan draf di `localStorage`, kirim ulang saat sinyal kembali.
`check_id` yang deterministik sudah membuat pengiriman ulang aman.

## Fase 3 — Modul PM

Migrasi Form PM03. Struktur targetnya sudah terpetakan di
[01-analisis-sumber.md](01-analisis-sumber.md):

| Sumber | Tabel target |
|---|---|
| `Tasklist Mesin-AHP/BHP/Standar` (5.961 baris) | `MST_PM_TASK` |
| `Maps 2026` (81.007 baris) | `TRX_PM_SCHEDULE` + `TRX_PM_RESULT` |
| `Completion 2026` | Dihitung, bukan disimpan |
| `Tasklist TBM` (213 baris) | `MST_TBM_TASK` + rencana material |
| `Overhaul` (52 baris) | `MST_OVERHAUL` |

Fondasi yang sudah siap menampungnya:
- `CFG.REASONS` sudah sama persis dengan 7 kategori `Completion 2026`
- Perhitungan minggu sudah ISO-8601, sama dengan `ISOWEEKNUM()`
- `MST_MACHINE` sudah memuat 6 mesin yang sama
- Pola `period_key` tinggal ditambah tipe untuk siklus PM

**Yang perlu diputuskan sebelum mulai:** apakah PM tetap di Excel selama masa
transisi (dua sistem paralel, risiko data ganda), atau langsung pindah penuh.

## Fase 4 — Utility & TBM

Prioritas tinggi meski scope kecil: **completion Utility hanya 65,9%** dengan
beberapa minggu 0% (W6, W12, W34, W35), sementara PM Mesin 94,7%.

Ini blind spot terbesar di seluruh sistem, dan tidak terlihat menonjol di
Dashboard 2026 karena dashboard tersebut fokus ke `Maps 2026` (mesin saja).

Scope: 3.866 baris, 9 eksekutor bernama (RIO, DANIEL, TAHATA, NELSON, NAZRIEL,
AMAT, DEA, YUNAS, IQBAL).

## Utang teknis

| Item | Dampak | Prioritas |
|---|---|---|
| Agregasi dashboard membaca tabel penuh | Melambat seiring data tumbuh | Sedang — tertangani oleh 2.3 |
| `deleteResultsOf_` memakai `deleteRow` dalam loop | Lambat bila satu check >100 item; saat ini maks 34 | Rendah |
| Tidak ada uji untuk lapisan UI | Regresi UI tidak tertangkap harness | Sedang |
| `LOG_AUDIT` tidak pernah dipangkas | Tumbuh ±78.000 baris/tahun | Rendah — ikut 2.3 |
| Belum ada ekspor ke Excel/PDF | Audit eksternal mungkin memintanya | Perlu dikonfirmasi |
| Foto lama tidak dihapus dari Drive saat submit ulang | Kuota Drive terisi berkas yatim seiring waktu | Rendah — perlu kebijakan retensi dulu |

## Pertanyaan terbuka

1. **Apakah audit mutu memerlukan cetakan fisik?** Bila ya, perlu fitur ekspor
   PDF yang meniru layout form `DAM/FRM/MEX-08`.
2. **Berapa lama data harus disimpan?** Menentukan strategi arsip.
3. **Apakah operator memakai HP pribadi atau tablet bersama?** Menentukan apakah
   mode luring dan sesi panjang cukup, atau perlu pola login cepat.
4. **Siapa yang berwenang merevisi master checksheet?** Saat ini peran `PLANNER`
   sudah ada di skema tapi belum punya antarmuka.
