# Rules & Konvensi — Project DeepSeek

> Berlaku untuk semua IDE/agent yang mengerjakan project ini.

## 1. Scope Kerja

- Hanya bekerja di dalam folder `project deepseek/`.
- `active/` = **kode** (Apps Script). `documentation/` = **dokumen**.
- Jangan menyentuh file di luar `project deepseek/` kecuali diminta eksplisit.

## 2. Deployment (clasp)

- Apps Script project (standalone): `1eNISxuCDXvSF549_cvDVsUuSqzGRUuy_h3MmVqhs7O2dnY3zRnhjRX43`
- Akun clasp: `manex.dam@gmail.com`
- Push dari `active/`: `clasp push --force` (pakai `--force` karena manifest berbeda)
- `.clasp.json` (di `active/`): `scriptId` + `fileExtension: "gs"`


## 3. Aturan Kode (Apps Script)

- **Executable code wajib ASCII-only.** Tidak ada karakter non-ASCII di nama fungsi,
  variabel, logika, atau string yang dieksekusi. (patokan: `scan_exec_chars.py` = 0 temuan)
- Non-ASCII hanya boleh untuk:
  - nama tab/sheet yang memang sudah ada,
  - label menu/UI yang sudah disepakati,
  - isi data (bukan kode).
- Fungsi Apps Script: `camelCase`; fungsi private diberi akhiran `_`
  (contoh: `getMasterSpreadsheet_()`).
- Konstanta global: `UPPER_SNAKE_CASE`.
- Nama sheet (tab): prefix `MST_` (master), `TRX_` (transaksi), `LOG_` (log), `CFG_` (config), UPPER_SNAKE.

## 4. Data & Konfigurasi

- **Google Sheet master = source of truth.** Jangan hardcode ID spreadsheet di banyak
  tempat; simpan di `CFG_KV` dan baca via `config.gs`.
- Jangan mengubah baris kunci `CFG_KV` tanpa instruksi eksplisit user.
- Setiap log/transaksi wajib menyimpan timestamp + identitas user.
- Autentikasi: login baca spreadsheet karyawan (`14OTl9…`) tab `KARYAWAN` — cocokkan NIK + kolom `Password` (tanpa PIN/hash).

## 5. Sebelum Mengubah Kode

- Pahami dampak perubahan (analog `gitnexus impact`) sebelum edit fungsi/shared.
- Jangan rename symbol dengan find-and-replace; lacak pemakaiannya dulu.

## 6. Setelah Mengubah Kode / Dokumen

1. Update dokumentasi yang terdampak (arsitektur/mapping/rules) — jangan biarkan basi.
2. Tambah entri **changelog** di `documentation/architecture.md` §10 (atau file changelog).
3. Pastikan tidak ada karakter non-ASCII baru di executable code.

## 7. Safety & Validasi

- Semua endpoint **tulis** wajib: validasi auth (`auth.gs`) + validasi input.
- Endpoint `import` hanya boleh dijalankan sekali/terkontrol (guarded) agar tidak duplikat.
- Waspadai duplikasi baris saat impor: gunakan kunci unik (contoh: `FUN LOC + SEQ + TASKLIST`).

## 8. Konvensi Dokumentasi

- Bahasa dokumentasi: Indonesia.
- Identifiers (sheet, fungsi, kolom): Inggris / ASCII.
- Nama file dokumentasi: `snake_case.md`.
