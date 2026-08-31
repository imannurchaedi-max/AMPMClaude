# Workflow & Data Mapping — AM PM Monitoring

> Memetakan file Excel sumber -> tab Google Sheet (9 sheet) -> fitur webapp.

## 1. Sumber Data

| File Excel | Isi | Digunakan untuk |
|-----------|-----|-----------------|
| Checksheet AM Adult Rev.00.xlsx | CILT mesin AHP | MST_AM_TASK (line=AHP) |
| Checksheet AM Baby Pants Rev.4 (BHP 1-3).xlsx | CILT mesin BHP 1-3 | MST_AM_TASK (line=BHP) |
| Form PM03 - Maintenance Scheduling 2026.xlsx | PM scheduling | (di luar scope fase ini) |

## 2. Mapping Excel -> Google Sheet

### 2.1 Checksheet CILT -> MST_AM_TASK
- Sheet `Shiftly & Daily OP 1/2/3` -> `frequency = SHIFTLY`, `station = OPx`
- Sheet `Weekly & Monthly OP/PACKER` -> `frequency = WEEKLY/MONTHLY`, `station = ...`
- Sheet `LIST DOOR` -> area packer
- Kolom sumber: `No` -> `seq`, `Nama Part` -> `part_name`, `Tindakan` -> `action`,
  `Standar Kebersihan` -> `standard`, `PIC` -> `pic_label`
- `doc_no = DAM/FRM/MEX-08`, `doc_rev`, `doc_effective` diambil dari header dokumen.

### 2.2 Mesin -> MST_MACHINE
- AHP1 (Adult), BHP1..BHP5 (Baby Pants).

### 2.3 Stasiun -> MST_STATION
- OP1..4 (OPERATOR), PACKER1..7 (PACKER), PALLETING1..2 (PALLETING).

### 2.4 User (login)
- Tidak import. Login membaca spreadsheet karyawan (`14OTl9…`) tab `KARYAWAN`.
- Cocokkan NIK + kolom `Password`; ambil `Otorisasi` (activity) + flag akses modul.

## 3. Alur Fitur

### 3.1 Login
1. User masukkan NIK + password.
2. Server baca `KARYAWAN` (spreadsheet `14OTl9…`), cari NIK, cocokkan kolom `Password` (plaintext).
3. Kembalikan `nik`, `name`, `jenis` (prefix NIK), `activity` (Otorisasi), `access` (flag modul).

### 3.2 Tracking (check)
1. Pilih line -> machine -> station -> frequency -> shift -> date.
2. `getTasks()` ambil task CILT terfilter dari `MST_AM_TASK`.
3. Operator tandai tiap task OK / NG / NA.
4. `submitCheck()` tulis header (`TRX_AM_CHECK`) + detail (`TRX_AM_RESULT`).

### 3.3 Verifikasi
- SPV buka Dashboard -> Recent Checks -> **Verify** (`verifyCheck`).
- `TRX_AM_CHECK.status` berubah SUBMITTED -> VERIFIED + `verified_by`/`verified_at`.

### 3.4 Finding (temuan)
- `saveFinding()` buat temuan (severity/reason/assigned/due).
- List dengan filter OPEN / ALL / CLOSED.
- `closeFinding()` tutup temuan (closing note).

### 3.5 Monitoring & Analysis
- Dashboard KPI: total checks, OK/NG/NA, open/total findings.
- Recent Checks (20 terakhir) + detail per check (`getCheckDetail`).

## 4. Relasi

- `TRX_AM_CHECK.machine_id` -> `MST_MACHINE.machine_id`
- `TRX_AM_CHECK.station` -> `MST_STATION.station_id`
- `TRX_AM_CHECK.nik` -> NIK di `KARYAWAN` (spreadsheet eksternal `14OTl9…`, bukan `MST_USER`)
- `TRX_AM_RESULT.check_id` -> `TRX_AM_CHECK.check_id`
- `TRX_AM_RESULT.task_id` -> `MST_AM_TASK.task_id`
- `TRX_FINDING.check_id` -> `TRX_AM_CHECK.check_id`

## 5. Catatan PM03

- Form PM03 (tasklist PM, schedule, overhaul, completion KPI) **BELUM** masuk model ini.
- Dapat ditambahkan sebagai modul berikutnya (prefix `MST_`/`TRX_` baru).
