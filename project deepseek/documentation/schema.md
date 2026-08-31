# Skema Kolom Google Sheet — AM PM Monitoring

> Kontrak data antara Google Sheet dan Apps Script. Header mengikuti `AM PM MONITORING.xlsx`.
> Konvensi: `MST_` (master), `TRX_` (transaksi), `LOG_` (log), `CFG_` (config). Nama kolom snake_case.

## 1. MST_USER (master) — user + PIN auth

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `nik` | string | ID unik user (PK) |
| `name` | string | nama |
| `pin_hash` | string | hash PIN (SHA-1 hex) |
| `role` | string | peran (ADMIN / SPV / OPERATOR / ...) |
| `line` | string | lini mesin (AHP / BHP) |
| `stations` | string | stasiun yang diampu |
| `active` | boolean | TRUE / FALSE |
| `created_at` | datetime | waktu dibuat |
| `last_login` | datetime | login terakhir |

## 2. MST_MACHINE (master) — mesin

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `machine_id` | string | ID mesin (PK): AHP1, BHP1..BHP5 |
| `line` | string | lini (AHP / BHP) |
| `name` | string | nama mesin |
| `seq` | number | urutan |
| `active` | boolean | TRUE / FALSE |

## 3. MST_STATION (master) — stasiun/pos

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `station_id` | string | ID stasiun (PK): OP1..4, PACKER1..7, PALLETING1..2 |
| `label` | string | label |
| `type` | string | OPERATOR / PACKER / PALLETING |
| `seq` | number | urutan |
| `active` | boolean | TRUE / FALSE |

## 4. MST_AM_TASK (master) — task AM/CILT (358 task)

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `task_id` | string | ID unik task (PK, hash) |
| `line` | string | lini (AHP / BHP) |
| `machines` | string | mesin yang berlaku |
| `station` | string | stasiun utama |
| `stations` | string | stasiun alternatif |
| `frequency` | string | SHIFTLY / WEEKLY / MONTHLY |
| `seq` | number | urutan item |
| `part_name` | string | nama part |
| `action` | string | tindakan |
| `standard` | string | standar hasil |
| `pic_label` | string | label PIC (OP 1, Packer 1, ...) |
| `doc_no` | string | nomor dokumen (DAM/FRM/MEX-08) |
| `doc_rev` | string | revisi dokumen |
| `doc_effective` | string | tanggal efektif |
| `source_sheet` | string | sheet Excel asal (audit impor) |
| `active` | boolean | TRUE / FALSE |

> Kunci unik: `task_id`. Relasi: `station` -> MST_STATION.station_id, `machines` -> MST_MACHINE.machine_id.

## 5. TRX_AM_CHECK (transaksi) — header submit checksheet

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `check_id` | string | ID submit (PK) |
| `period_key` | string | kunci periode (mis. 2026-W35) |
| `check_date` | date | tanggal cek |
| `shift` | string | shift (1 / 2 / 3) |
| `line` | string | lini |
| `machine_id` | string | mesin |
| `station` | string | stasiun |
| `nik` | string | user yang submit |
| `frequency` | string | SHIFTLY / WEEKLY / MONTHLY |
| `total_task` | number | total task |
| `ok_count` | number | jumlah OK |
| `ng_count` | number | jumlah NG |
| `na_count` | number | jumlah NA |
| `status` | string | SUBMITTED / VERIFIED |
| `submitted_at` | datetime | waktu submit |
| `verified_by` | string | verifikator |
| `verified_at` | datetime | waktu verifikasi |
| `note` | string | catatan |

## 6. TRX_AM_RESULT (transaksi) — hasil per task

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `result_id` | string | ID hasil (PK) |
| `check_id` | string | FK -> TRX_AM_CHECK.check_id |
| `task_id` | string | FK -> MST_AM_TASK.task_id |
| `seq` | number | urutan |
| `result` | string | OK / NG / NA |
| `note` | string | catatan |
| `photo_url` | string | URL foto (opsional) |
| `recorded_at` | datetime | waktu rekam |

## 7. TRX_FINDING (transaksi) — temuan/defect

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `finding_id` | string | ID temuan (PK) |
| `check_id` | string | FK -> TRX_AM_CHECK.check_id |
| `task_id` | string | FK -> MST_AM_TASK.task_id |
| `line` | string | lini |
| `machine_id` | string | mesin |
| `station` | string | stasiun |
| `part_name` | string | nama part |
| `description` | string | deskripsi temuan |
| `severity` | string | HIGH / MEDIUM / LOW |
| `reason` | string | alasan/kategori |
| `status` | string | OPEN / ASSIGNED / CLOSED |
| `raised_by` | string | pelapor |
| `raised_at` | datetime | waktu lapor |
| `assigned_to` | string | penanggung jawab |
| `due_date` | date | tenggat |
| `closed_by` | string | penutup |
| `closed_at` | datetime | waktu tutup |
| `closing_note` | string | catatan penutupan |

## 8. LOG_AUDIT (log) — jejak audit

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `ts` | datetime | timestamp |
| `nik` | string | user |
| `action` | string | aksi (LOGIN, SUBMIT, VERIFY, ...) |
| `entity` | string | entitas |
| `entity_id` | string | ID entitas |
| `detail` | string | detail |

## 9. CFG_KV (config) — key-value

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `key` | string | kunci |
| `value` | string | nilai |
| `updated_at` | datetime | waktu update |
| `updated_by` | string | user |

## Catatan

- `MST_USER` TIDAK dipakai untuk login. Login membaca spreadsheet karyawan eksternal (`14OTl9…`) tab `KARYAWAN` (cocokkan NIK + kolom `Password`).
- `active` / flag boolean disimpan sebagai string `TRUE`/`FALSE`.
- Semua timestamp memakai format ISO 8601 (`new Date().toISOString()`).

