# Arsitektur Webapp AM PM Monitoring — Project DeepSeek

> Tanggal: 30 Agustus 2026. Status: diselaraskan dengan struktur `AM PM MONITORING.xlsx`.

## 1. Tujuan

Webapp Google Apps Script untuk tracking/monitoring/analysis aktivitas **Autonomous Maintenance (AM/CILT)**:
checklist kebersihan–inspeksi–pelumasan mesin AHP & BHP per shift/harian/mingguan/bulanan.

## 2. Konteks & Batasan

| Item | Nilai |
|------|-------|
| Platform | Google Apps Script (webapp), deploy via **clasp** |
| Apps Script project (standalone) | `1eNISxuCDXvSF549_cvDVsUuSqzGRUuy_h3MmVqhs7O2dnY3zRnhjRX43` |
| Akun clasp | `manex.dam@gmail.com` |
| Google Sheet master | `1x1kmQemH80GlVZaT1QVr3QSITsHIYIHzVursa7uFkb8` |
| Spreadsheet karyawan (auth) | `14OTl9xYINyRIqnJ2AEaCJFD_D9tNRRueNgFby6FjY9o` (tab `KARYAWAN`) |
| Sumber struktur | `AM PM MONITORING.xlsx` (9 sheet) |
| Sumber data task | `Checksheet AM Adult` + `Checksheet AM Baby Pants` |

## 3. Struktur Folder

```
project deepseek/
├── active/            -> kode Apps Script (.gs, .html, appsscript.json, .clasp.json)
└── documentation/     -> arsitektur, rules, schema, workflow_mapping
```

## 4. Struktur Google Sheet (9 sheet)

| Sheet | Jenis | Fungsi |
|-------|-------|--------|
| `MST_USER` | master | user (referensi lokal; login via `KARYAWAN`) |
| `MST_MACHINE` | master | mesin (AHP1, BHP1-5) |
| `MST_STATION` | master | stasiun (OP / PACKER / PALLETING) |
| `MST_AM_TASK` | master | task AM/CILT (358) |
| `TRX_AM_CHECK` | transaksi | header submit checksheet |
| `TRX_AM_RESULT` | transaksi | hasil per task |
| `TRX_FINDING` | transaksi | temuan/defect |
| `LOG_AUDIT` | log | jejak audit |
| `CFG_KV` | config | key-value |

## 5. Modul Apps Script

| File | Fungsi |
|------|--------|
| `Code.gs` | `doGet()` + RPC entry (`ping`, `getConfig`) |
| `config.gs` | `SHEETS`/`HEADERS`, helper spreadsheet, `readSheetObjects_`, `bootstrapSheets()` |
| `auth.gs` | login via `KARYAWAN` (`authenticate`), `getEmployeeByNik_`, `getEmployeeType_`, `logAudit_` |
| `master_domain.gs` | `getList`, `getTasks` (filter CILT) |
| `check_domain.gs` | `submitCheck`, `verifyCheck`, `getRecentChecks`, `getCheckDetail` |
| `finding_domain.gs` | `saveFinding`, `getFindings`, `updateFinding`, `closeFinding` |
| `dashboard_domain.gs` | `getDashboard` (KPI) |
| `index.html` | frontend SPA (login + check + finding + dashboard) |
| `appsscript.json` | manifest (webapp, scope) |

## 6. RPC (google.script.run)

| Function | Deskripsi |
|----------|-----------|
| `ping()` | cek koneksi |
| `authenticate(nik, password)` | login (NIK + password dari tab `KARYAWAN`) |
| `getConfig()` | baca `CFG_KV` |
| `getList(type)` | baca master (`machine`/`station`/`task`/`user`) |
| `getTasks(line, machineId, station, frequency)` | ambil task CILT terfilter |
| `submitCheck(payload)` | simpan checksheet (`TRX_AM_CHECK` + `TRX_AM_RESULT`) |
| `verifyCheck(checkId, nik)` | verifikasi check (SPV) |
| `getRecentChecks(limit)` | riwayat check terbaru |
| `getCheckDetail(checkId)` | detail check + hasil per task |
| `saveFinding(payload)` | simpan temuan |
| `getFindings(status)` | daftar temuan (OPEN/CLOSED/ALL) |
| `updateFinding(...)` / `closeFinding(...)` | kelola temuan |
| `getDashboard()` | KPI (check, ok/ng/na, findings) |
| `bootstrapSheets()` | buat 9 tab + header |

## 7. Alur Data

```
Checksheet Excel -> (import) -> MST_AM_TASK -> (RPC) -> index.html
                      -> TRX_AM_CHECK / TRX_AM_RESULT / TRX_FINDING -> dashboard
```

## 8. Autentikasi

- Login membaca spreadsheet karyawan eksternal (`14OTl9…`) tab `KARYAWAN` (**TIDAK import**).
- Frontend kirim `nik` + `password`; server cari NIK, cocokkan kolom `Password` (plaintext).
- Hasil login: `nik`, `jenis` (STAFF/NON_STAFF/MK dari prefix NIK), `activity` (kolom `Otorisasi`), `access` (flag modul).
- Tanpa PIN / tanpa hashing.

## 9. Deployment (clasp)

1. `cd "project deepseek/active"`
2. `clasp push --force` (update ke HEAD deployment)
3. `clasp run bootstrapSheets` (sekali)
4. `clasp deploy` (webapp)

URL webapp (HEAD, selalu kode terbaru):
`https://script.google.com/macros/s/AKfycbwiyD7ttzjNUayEmJqYkZbICZAp58VuKYORIzwVjGk/exec`

> Akses saat ini `MYSELF` (khusus `manex.dam@gmail.com`); ubah `webapp.access` di manifest bila perlu dibuka ke semua user.

## 10. Changelog

- **30 Agu 2026** — Diselaraskan ke 9 sheet (`MST_`/`TRX_`/`LOG_`/`CFG_`); auth via `KARYAWAN` eksternal (NIK + password).
- **30 Agu 2026 (part 2)** — Implementasi penuh: submit check, verifikasi SPV, temuan (create/list/close), riwayat + detail check, dashboard KPI.
- **30 Agu 2026 (part 3)** — Login NIK+password (`KARYAWAN`) terverifikasi berjalan; arsitektur & workflow disinkronkan.
