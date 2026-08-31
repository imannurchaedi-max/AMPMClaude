# 06 — Deployment

## Target

| Aset | Nilai |
|---|---|
| Spreadsheet | **AM PM MONITORING** — [`1x1kmQem…uFkb8`](https://docs.google.com/spreadsheets/d/1x1kmQemH80GlVZaT1QVr3QSITsHIYIHzVursa7uFkb8/edit) |
| Apps Script | [`1kedA00V…3Sflg`](https://script.google.com/home/projects/1kedA00V42dUXfdFkalnljEgGQJMDB-1Mmv9bmMAZJYi6RmojDG93Sflg/edit) |
| Pemilik | `manex.dam@gmail.com` |
| Keterikatan | **Container-bound** — `parentId` script = ID spreadsheet |

Karena script terikat pada spreadsheet, `SpreadsheetApp.getActiveSpreadsheet()`
otomatis menunjuk database yang benar. `CFG.DEFAULT_DB_ID` hanya berperan sebagai
cadangan bila fungsi dipanggil dari pemicu waktu.

## Status saat ini

- [x] clasp terkonfigurasi (`.clasp.json` + `.claspignore`)
- [x] clasp login sebagai `manex.dam@gmail.com`
- [x] 14 berkas ter-push ke Apps Script
- [x] `am_tasks.csv` diunggah ke Drive `manex.dam@gmail.com`
- [x] `Setup_initDatabase()` dijalankan
- [x] `Setup_seedMaster()` dijalankan
- [x] `Setup_importAmTasks()` dijalankan
- [x] `Setup_quickAdmin()` dijalankan
- [x] Deploy sebagai Web app
- [x] Deployment stabil diarahkan ke v4 (desain diselaraskan DAM PORTAL; v3 = foto bukti wajib OK/NG; v2 = login direktori karyawan)
- [ ] `Setup_auditEmployeeMapping()` diperiksa
- [ ] Uji coba login oleh operator sungguhan

### Berkas seed di Drive

`am_tasks.csv` (94.868 byte) sudah berada di Drive `manex.dam@gmail.com`:
[`1ktGZkbEmzXytPmMfKDVtqWuPzva46oYa`](https://drive.google.com/file/d/1ktGZkbEmzXytPmMfKDVtqWuPzva46oYa/view)

`Setup_importAmTasks()` mencarinya berdasarkan **nama**, jadi berkas harus
berada di Drive akun yang sama dengan pemilik script. Setelah master direvisi,
unggah ulang dengan nama yang sama lalu jalankan fungsinya kembali.

### Catatan kredensial clasp

`~/.clasprc.json` sekarang berisi kredensial `manex.dam@gmail.com`.
Kredensial lama (`iman.nurchaedi@gmail.com`) dicadangkan di
`~/.clasprc.backup-iman-20260829.json`.

Proyek Apps Script milik `iman.nurchaedi@gmail.com` (DAM - MODUL_REPORT, QDash,
dll) **tidak bisa diakses clasp** selama kredensial ini aktif. Untuk kembali:

```bash
cp ~/.clasprc.backup-iman-20260829.json ~/.clasprc.json
```

## Prasyarat

- Akun Google dengan akses tulis ke spreadsheet tersebut
- Python 3 + `openpyxl` (untuk ekstraksi master)
- Node.js (untuk menjalankan uji lokal)
- `clasp` bila ingin push dari terminal — opsional

## Langkah 1 — Siapkan master data

```bash
cd "project claude/active"
python tools/extract_am_master.py
```

Keluaran yang diharapkan:

```
master task  : 357
arsip audit  : 214 baris
per lini     : {'AHP': 200, 'BHP': 157}
aktif/nonaktif: {'TRUE': 333, 'FALSE': 24}
```

Menghasilkan `seed/am_tasks.csv`, `seed/am_history.csv`, `seed/am_master.json`.

Script menelusuri folder ke atas untuk menemukan file `.xlsx` warisan, jadi
tetap jalan meski struktur folder digeser.

## Langkah 2 — Uji lokal

```bash
node tools/gas_harness.js
```

Harus menghasilkan `HASIL: 104 lulus, 0 gagal`. **Jangan lanjut bila ada yang
gagal.**

## Langkah 3 — Buat proyek Apps Script

Buka spreadsheet → **Extensions → Apps Script**. Ini membuat script yang terikat
(*container-bound*) pada spreadsheet, sehingga `SpreadsheetApp.getActiveSpreadsheet()`
langsung menunjuk database yang benar.

### Opsi A — salin manual

Buat berkas satu per satu di editor, salin isi dari `active/webapp/src/`.

**Penting:** berkas HTML harus dinamai persis `ui/Index`, `ui/Style`, `ui/App`
(dengan garis miring) agar `include()` menemukannya.

### Opsi B — clasp

`.clasp.json` dan `.claspignore` **sudah tersedia** di `active/webapp/`:

```json
{
  "scriptId": "1kedA00V42dUXfdFkalnljEgGQJMDB-1Mmv9bmMAZJYi6RmojDG93Sflg",
  "rootDir": "src"
}
```

```bash
cd "project claude/active/webapp"
clasp show-authorized-user     # pastikan akun yang benar
clasp status                   # harus melacak 14 berkas
clasp push
```

**Catatan penting:** `appsscript.json` harus berada di dalam `rootDir`
(`src/appsscript.json`), bukan di `webapp/`. clasp hanya mengirim manifest yang
ada di dalam rootDir.

#### Syarat akses

clasp 3.x memakai scope OAuth `drive.file`, yang **hanya memberi akses ke berkas
yang dibuat atau dibuka oleh clasp sendiri**. Akun yang menjalankan clasp harus
benar-benar punya akses ke script target.

Verifikasi cepat:

```bash
clasp status      # bila "The caller does not have permission" -> akun salah
                  # atau script belum dibagikan ke akun tersebut
```

Bila gagal, pilihannya:

1. Bagikan script **dan** spreadsheet ke akun yang dipakai clasp (izin Editor)
2. `clasp login` ulang dengan akun pemilik script
3. Buat script baru lewat clasp agar otomatis dimiliki akun tersebut:
   `clasp create-script --type sheets --parentId <SPREADSHEET_ID>`

## Langkah 4 — Inisialisasi database

Jalankan berurutan dari editor Apps Script (menu **Run**), periksa
**Execution log** setiap selesai:

| Urutan | Fungsi | Hasil |
|---|---|---|
| 1 | `Setup_initDatabase()` | Membuat 9 tab, semua kolom diformat teks, tab bawaan `Sheet1` dihapus |
| 2 | `Setup_seedMaster()` | 6 mesin (AHP1, BHP1–5) + 13 stasiun |
| 3 | `Setup_importAmTasks()` | Impor `am_tasks.csv` — **unggah dulu ke Drive** |
| 4 | `Setup_quickAdmin()` | Akun admin darurat `ADMIN` / `123456` |

Saat pertama kali dijalankan, Apps Script meminta otorisasi scope Spreadsheet
dan Drive. Setujui.

`Setup_initDatabase()` aman dijalankan berulang: tab yang sudah ada tidak
disentuh isinya, hanya header dan formatnya yang diselaraskan dengan `SCHEMA`.

Segera ganti lewat menu Ganti Password setelah login pertama.

Karyawan biasa **tidak perlu dibuatkan akun** — mereka login dengan NIK dan
password dari direktori DATA KARYAWAN.

## Langkah 5 — Deploy webapp

**Deploy → New deployment → Web app**

| Setelan | Nilai | Alasan |
|---|---|---|
| Execute as | **Me** | Operator tidak punya akun Google; script harus berjalan dengan otoritas Anda |
| Who has access | **Anyone** | Diperlukan agar operator anonim bisa mencapai layar login |

Setelan ini wajib. Otorisasi pengguna sesungguhnya ditangani lapisan NIK+password,
bukan lapisan Google — lihat [05-rules.md](05-rules.md) bagian B6.

Salin URL webapp dan bagikan ke operator. Jangan sebarkan di luar keperluan
operasional.

## Langkah 6 — Periksa pemetaan jabatan

**Tidak ada pembuatan pengguna.** Semua karyawan di direktori DATA KARYAWAN
otomatis bisa login begitu jabatannya terpetakan.

Jalankan `Setup_auditEmployeeMapping()` di editor untuk melihat jabatan mana
yang belum punya stasiun — orang dengan jabatan itu akan ditolak login:

```
===== AUDIT PEMETAAN KARYAWAN =====
Total karyawan     : 982
Bisa memakai AM    : 561
Peran              : {"OPERATOR":895,"LEADER":67,"MANAGER":20}

Jabatan TANPA stasiun (login AM ditolak):
  60 orang - GA Vendor
  40 orang - QC Produksi
  ...
===================================
```

Tambahkan jabatan yang seharusnya boleh mengisi checksheet ke
`JABATAN_STATIONS` di `09_Employee.gs`, lalu `clasp push --force`.

## Lupa password admin

NIK admin adalah `ADMIN`. Password tidak bisa dibaca ulang — hanya bisa direset.

Langkahnya ada di [08-operasional.md](08-operasional.md#login--akun).

## Memperbarui kode

```bash
cd "project claude/active"
node tools/gas_harness.js     # wajib lolos dulu
cd webapp && clasp push
```

Lalu **Deploy → Manage deployments → Edit → Version: New version**.
Tanpa membuat versi baru, perubahan tidak terlihat pengguna.

## Mengubah skema

1. Sunting `SCHEMA` di `00_Config.gs`
2. `clasp push`
3. Jalankan `Setup_migrateSchema()` — menambah kolom baru tanpa menghapus data

## Memperbarui master task

Setelah checksheet direvisi:

```bash
python tools/extract_am_master.py
```

Unggah ulang `am_tasks.csv` ke Drive, jalankan `Setup_importAmTasks()`.
Impor bersifat **replace**, jadi aman dijalankan berulang.

## Pemecahan masalah

| Gejala | Penyebab | Perbaikan |
|---|---|---|
| `Tabel tidak ditemukan: MST_...` | `Setup_initDatabase()` belum dijalankan | Jalankan langkah 4 |
| `File tidak ditemukan di Drive: am_tasks.csv` | CSV belum diunggah | Unggah ke root Drive akun yang sama |
| Layar login kosong / blank | Berkas HTML salah nama | Pastikan bernama `ui/Index`, `ui/Style`, `ui/App` |
| `Sistem sedang sibuk` | Lock tertahan >20 detik | Biasanya operasi lain sedang menulis; coba lagi |
| Tanggal kacau di dashboard | Kolom tidak berformat teks | Jalankan ulang `Setup_initDatabase()` |
| Perubahan kode tidak terlihat | Deployment masih versi lama | Manage deployments → New version |
| `clasp push` → `The caller does not have permission` | Akun clasp tidak punya akses ke script target | Bagikan script ke akun tersebut, atau `clasp login` dengan akun pemilik |
| `clasp push` mengirim manifest lama | `appsscript.json` di luar `rootDir` | Pastikan berada di `src/appsscript.json` |
