# 01 — Analisis Sumber Data

Pembedahan tiga file Excel warisan yang menjadi dasar sistem ini. Semua angka di
dokumen ini dihitung langsung dari isi file, bukan estimasi.

## Konteks

Pabrik popok, Departemen Production. Dokumen `DAM/FRM/MEX-08`, dibuat Hendra S,
disetujui Evita. Dua lini produk:

- **AHP** — Adult (popok dewasa), mesin AHP1
- **BHP** — Baby Pants (popok bayi), mesin BHP1–BHP5

Sistem TPM berjalan di dua pilar terpisah:

| File | Pilar | Pelaku | Siklus |
|---|---|---|---|
| Checksheet AM Adult Rev.00 | Autonomous Maintenance | Operator & Packer | Shiftly/Daily/Weekly/Monthly |
| Checksheet AM Baby Pants Rev.4 | Autonomous Maintenance | Operator & Packer | Shiftly/Daily/Weekly/Monthly |
| Form PM03 Maintenance Scheduling 2026 | Planned Maintenance | Teknisi Maintenance | Mingguan (W1–W52) |

## File 1 & 2 — Checksheet AM

**Adult Rev.00**: 33 sheet (11 hidden), 1,5 MB, 25 gambar.
**Baby Pants Rev.4**: 40 sheet (6 hidden), 8,9 MB, 109 gambar (8,4 MB berupa foto).

Tiap form punya sheet kembaran `Vis. …` berisi **visual standard** — foto part
sebagai acuan "seperti apa bersih itu". Ini yang membuat file Baby 6× lebih besar.

### Struktur form

```
No. | Nama Part | Tindakan | Standar Kebersihan | PIC | Senin..Minggu × Shift I/II/III
```

CILT = Cleaning, Inspection, Lubrication, Tightening.

### Pembagian tanggung jawab

OP 1 / OP 2 / OP 3 / OP 4 (operator per zona mesin), Packer 1–7 (bahkan
dibedakan Pria/Wanita), dan tim Palleting 1–2.

### Sheet penting

- **`LIST DOOR`** (hidden, Adult) — pembagian kerja pembersihan pintu mesin per
  unit (#1 Unwinder Tissue, #4 Core pad cutting, #11 Ultrasonic…) dengan
  estimasi durasi menit dan kebutuhan tenaga ("5-6 orang"). Basis perhitungan
  manning untuk cleaning event.
- **`Weekly Monthly (Week 42/44/45/46)`** — bukan template kosong, tapi **hasil
  audit yang sudah diisi** dengan kolom Check `V`/`X` dan catatan alasan.
  Total 214 baris: 192 OK, 12 NG, 10 kosong.
- **`Keterangan Perubahan Rev to Rev`** — riwayat revisi. Baby Rev.3→4:
  penambahan pembersihan katup (OP1), roller elastic (OP2), All Roller (OP3).
  Dokumen ini hidup dan diperbaiki dari temuan lapangan.

## File 3 — Form PM03

32 sheet, 11,6 MB. Arsitekturnya berlapis rapi:

```
Master Tasklist → Helper Form → Maps 2026 → Completion 2026 → Dashboard 2026
(definisi kerja)  (lookup key)  (eksekusi)    (KPI mingguan)   (monitoring live)
```

### Lapisan master

| Sheet | Baris | Isi |
|---|---|---|
| Tasklist Mesin Standar | 2.497 | Master + kategori CILT, flag Dismantle, HTA, standar |
| Tasklist Mesin-AHP | 1.729 | Tasklist lini Adult |
| Tasklist Mesin-BHP | 1.735 | Tasklist lini Baby + nomor material sparepart |
| Tasklist Utility | 1.460 | Kompresor, forklift, panel, water |
| Tasklist TBM | 213 | Time-Based Maintenance + MID material, QTY, FREQ |
| Overhaul | 52 | Rencana overhaul |

Kolom `W1..W5` boolean menentukan pola frekuensi mingguan. Ada distribusi beban
menit per minggu dan nama teknisi (VIQRI, DANDI, YUNAS, IYAN, EGA) untuk
*load leveling*.

### `Maps 2026` — tabel eksekusi utama

**81.007 baris × 12 kolom = 808 ribu sel.**

```
Week | Mesin | No. Order | Unit/Equipment | Op. | Deskripsi operasi
     | Durasi | UoM | Eksekutor | Completion | Reason | Note
```

- **816 unit equipment unik**, **285 jenis operasi**
- Total **244.562 menit ≈ 4.076 jam** kerja PM terjadwal
- Distribusi: BHP3 15.716 · BHP2 14.969 · BHP1 14.914 · AHP1 14.743 · BHP4 11.760 · BHP5 8.905
- Eksekutor berkode A–I; **A memegang 25.556 task (31,5%)** — timpang jauh

### KPI

`Completion 2026` menghitung **OTIF** per minggu dengan breakdown 7 kategori
kegagalan. `Dashboard 2026` punya 616 formula `COUNTIFS` berbasis
`ISOWEEKNUM(TODAY())` membandingkan minggu lalu vs minggu berjalan.

## Kinerja aktual (dihitung dari data W1–W35 2026)

### PM Mesin — sangat baik

- 81.007 task terjadwal → **76.706 selesai = 94,7%**
- Sejak W11 konsisten **>99%** hampir tiap minggu
- Minggu terburuk: **W25 (84,9%)**, W5 (91,0%), W7 (91,8%)
- W35 = 3.232 task, 0 selesai → minggu berjalan. Data konsisten dan masih aktif.

### PM Utility — jauh tertinggal

- 3.866 terjadwal → **2.546 selesai = 65,9%**
- Ada minggu **0%**: W6, W12, W34, W35. W10 hanya 17%. W8 hanya 25%.
- Tidak terlihat menonjol di Dashboard karena Dashboard fokus ke `Maps 2026`.

### Akar penyebab

| Alasan | Mesin | Utility | Total |
|---|---|---|---|
| **Man Power Kurang** | 912 | 856 | **1.768** |
| Produksi Full Plan | 0 | 32 | 32 |
| Kesalahan Planning | 27 | 0 | 27 |
| Spare Part Kosong | 0 | 0 | **0** |

Kesimpulannya tajam: **sepanjang 2026 tidak pernah sekalipun PM gagal karena
sparepart**. Hampir 100% kegagalan adalah kekurangan tenaga kerja. Masalahnya
kapasitas manusia, bukan logistik.

## Risiko & kualitas data

1. **Penanda Completion tidak konsisten.** `X` ada 76.000, tapi ada juga `x`
   kecil (455) dan spasi `' '` (251). Formula sekarang pakai kriteria `"<>"`
   jadi aman — tapi begitu ada yang menulis `COUNTIF(...,"X")`, 455 record
   langsung hilang dari hitungan.

2. **Sheet11 (hidden) — 78.732 formula dalam satu sheet.** 98.469 sel berisi
   rumus `COLUMN`/`AND`/`MOD`. Penyumbang terbesar beban kalkulasi dan ukuran
   file.

3. **Data tahun lalu masih menempel.** `Maps 2025` (hidden) menyimpan 70.267
   baris / 696.282 sel di dalam file aktif 2026. `Maps 2023` juga masih ada.

4. **File ini aslinya Google Sheets.** Ditemukan sisa formula
   `__xludf.DUMMYFUNCTION("XLOOKUP(…IMPORTRANGE("https://docs.google.com/spreadsheets/d/1BWLtQU3mSw…"))")`
   di `Tasklist Utility`, `Trial 2`, `Trial 3`. Artinya **IMPORTRANGE, QUERY,
   FILTER, SORT sudah mati di Excel** — angka di sheet itu beku dan tidak lagi
   update. Ini bug diam yang berbahaya.

5. **Versi berserakan.** `Tasklist Mesin-BHP` vs `…BHP NEW`, `Copy of Tasklist
   Mesin-AHP`, `Copy of Form PM03 NEW`, `Trial 2`, `Trial 3`, `Sheet11/12/14`,
   `OLD TL Mesin`, `Tasklist TBM rev`. Tidak jelas mana yang otoritatif.

6. **COUNTIFS full-column.** 616 formula di Dashboard + 1.144 di Completion
   memindai `$I:$I` (1.048.576 baris) padahal datanya 81.007. Ditambah `TODAY()`
   yang volatile, file dihitung ulang penuh setiap dibuka.

7. **Tidak ada makro/VBA** di ketiganya, dan tidak ada defined name bermakna —
   34 yang ada semuanya sisa `_FilterDatabase` dan `wvu.FilterData`.

## Hasil ekstraksi ke sistem baru

`tools/extract_am_master.py` mengubah kedua Checksheet AM menjadi tabel
ternormalisasi. Kekacauan yang harus ditangani:

| Masalah | Penanganan |
|---|---|
| Layout kolom berbeda antara file Adult dan Baby | Kolom dideteksi dari header, bukan hardcode |
| Header `Kegiatan` ternyata berarti *Standar*, bukan *Tindakan* | Alias header dipetakan ke peran `standard` |
| Sheet Packer di file Baby bernama `Sheet2..Sheet6` | Stasiun disimpulkan dari isi kolom PIC |
| Sheet `Week 42–46` adalah arsip audit, bukan master | Dipisah ke `am_history.csv` |
| PIC gabungan `OP 1,2,3/Packer` | Diurai jadi multi-stasiun |
| Sheet tersembunyi = versi lama | Ditandai `active=FALSE` |

**Hasil: 357 task master (333 aktif) + 214 baris arsip.**

Beban per stasiun: OP1 95 · OP2 86 · OP3 91 · OP4 18 · Packer1–7 total 84 ·
Palleting 10.

## Celah terbesar yang sistem ini tutup

1. **AM dan PM tidak tersambung sama sekali.** Keduanya menutup mesin yang sama,
   tapi tidak ada satu pun link data. Hasil AM tidak pernah masuk dashboard.
2. **Tanda "X" berhenti sebagai coretan.** Tidak ada pemilik, tenggat, atau
   jejak penutupan untuk abnormality yang ditemukan operator.
3. **Cleanliness tidak pernah terukur.** Form kertas hanya mencatat pelaksanaan,
   bukan hasil.
