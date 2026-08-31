# AM/PM Tracker — Dokumentasi

Digitalisasi sistem TPM pabrik popok: **Autonomous Maintenance (AM)** untuk
operator, dan nantinya **Planned Maintenance (PM)** untuk teknisi.

Dibangun sebagai webapp Google Apps Script di atas spreadsheet
[`1x1kmQem…uFkb8`](https://docs.google.com/spreadsheets/d/1x1kmQemH80GlVZaT1QVr3QSITsHIYIHzVursa7uFkb8/edit).

## Peta dokumen

| Dokumen | Isi |
|---|---|
| [01-analisis-sumber.md](01-analisis-sumber.md) | Pembedahan 3 file Excel warisan: struktur, angka kinerja nyata, risiko data |
| [02-arsitektur.md](02-arsitektur.md) | Arsitektur sistem, lapisan, keputusan desain beserta alasannya |
| [03-model-data.md](03-model-data.md) | Skema 9 tabel, kunci, relasi, strategi pertumbuhan data |
| [04-workflow-mapping.md](04-workflow-mapping.md) | Peta alur kerja kertas → sistem, per peran |
| [05-rules.md](05-rules.md) | Aturan bisnis yang ditegakkan sistem + konvensi coding |
| [06-deployment.md](06-deployment.md) | Langkah deploy pertama kali, setup database, konfigurasi |
| [07-backlog.md](07-backlog.md) | Yang belum dikerjakan, anomali data, roadmap fase berikutnya |
| [08-operasional.md](08-operasional.md) | **Runbook harian** — login, lupa password, pemetaan jabatan, pemecahan masalah |

## Cari cepat

| Pertanyaan | Jawabannya di |
|---|---|
| Karyawan login pakai apa? | [08-operasional.md](08-operasional.md) — NIK + password direktori, lalu wajib set password pribadi |
| Lupa password admin? | [08-operasional.md](08-operasional.md) — NIK `ADMIN`, reset lewat `Setup_quickAdmin()` |
| Karyawan tidak bisa login | [08-operasional.md](08-operasional.md) — biasanya jabatan belum dipetakan |
| ID spreadsheet / script / akun apa? | [08-operasional.md](08-operasional.md) — kartu referensi cepat |
| Checksheet direvisi, cara update? | [08-operasional.md](08-operasional.md) — tugas rutin |
| Ada error, artinya apa? | [08-operasional.md](08-operasional.md) — tabel pemecahan masalah |
| Kenapa dirancang begini? | [02-arsitektur.md](02-arsitektur.md) |
| Aturan apa saja yang ditegakkan? | [05-rules.md](05-rules.md) |

## Status

| Fase | Cakupan | Status |
|---|---|---|
| **1** | Fondasi + modul AM (checksheet, temuan, dashboard, foto bukti) | Ter-deploy, 104 uji lolos |
| **2** | Foto temuan, notifikasi, arsip otomatis | Belum |
| **3** | Modul PM (migrasi Form PM03) | Belum |
| **4** | Modul Utility + TBM | Belum |

## Struktur folder

```
project claude/
  active/                    semua kode
    webapp/
      appsscript.json        manifest
      src/*.gs               10 modul backend
      src/ui/*.html          antarmuka
    tools/
      extract_am_master.py   ekstraksi master dari .xlsx warisan
      gas_harness.js         uji lokal (104 asersi)
    seed/
      am_tasks.csv           357 task master
      am_history.csv         214 baris arsip audit
  documentation/             folder ini
```

## Sistem yang tersambung

| Sistem | Peran | Akses aplikasi |
|---|---|---|
| **AM PM MONITORING** | Database aplikasi — 9 tab | Baca-tulis |
| **DATA KARYAWAN** | Sumber identitas — 982 karyawan | Hanya dibaca |
| Apps Script `1kedA00V…` | Kode + webapp, container-bound | — |

URL webapp dan seluruh ID tercatat di [08-operasional.md](08-operasional.md).

## Ringkasan keputusan

Empat keputusan yang paling membentuk sistem:

1. **AM lebih dulu, bukan PM.** PM sudah berjalan di Excel dengan completion
   94,7% — mengganggunya berisiko tanpa imbalan. AM masih 100% kertas.
2. **Identitas dibaca langsung dari DATA KARYAWAN, tidak disalin.** Karyawan
   baru, mutasi jabatan, dan resign otomatis terpakai tanpa impor ulang. Peran
   diturunkan dari kolom `Otorisasi` yang sudah dipakai sistem lain di pabrik.
3. **Password dua lapis.** Kolom `Password` di direktori dipakai bersama oleh
   981 dari 982 karyawan, jadi ia hanya jadi kunci masuk pertama — setiap orang
   wajib menetapkan password pribadi sebelum bisa mengisi checksheet.
4. **Database dibangun ulang ternormalisasi**, bukan menyalin struktur Excel.
   `Maps 2026` yang 81.007 baris terdenormalisasi bukan fondasi yang sehat
   untuk aplikasi.

Sembilan keputusan lengkap beserta alasannya ada di
[02-arsitektur.md](02-arsitektur.md).
