# Panduan Rilis (Release Guide) — BRONE Reminder Widget

Dokumen ini menjelaskan prosedur resmi pembuatan rilis baru untuk desktop Windows dan Android, mulai dari penyiapan kredensial, pengujian lokal, alur CI/CD GitHub Actions, hingga verifikasi integritas biner rilis.

---

## 1. Prasyarat & Rahasia (GitHub Secrets)

Agar pipeline rilis Android dapat menandatangani APK rilis secara otomatis di GitHub Actions, pemilik repositori harus menambahkan rahasia berikut di **Settings → Secrets and variables → Actions**:

| Secret Name | Deskripsi |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Berkas keystore rilis asli (keystore v1.1.0) yang telah di-encode ke base64 (`base64 -w 0 signing.keystore` atau `[Convert]::ToBase64String([IO.File]::ReadAllBytes('signing.keystore'))`). |
| `ANDROID_KEYSTORE_PASSWORD` | Password untuk membuka berkas keystore. |
| `ANDROID_KEY_ALIAS` | Nama alias kunci di dalam keystore. |
| `ANDROID_KEY_PASSWORD` | Password untuk kunci alias tersebut. |

> [!CAUTION]
> **Keystore Keberlanjutan Update Android**:
> Kunci penandatanganan harus **SAMA PERSIS** dengan yang digunakan untuk menandatangani APK `v1.1.0`. Android menolak pembaruan aplikasi jika kunci penandatanganan berbeda (pengguna harus menghapus instalan lama dan kehilangan pengaturan). Jangan pernah membuat keystore baru jika keystore lama masih tersedia. Simpan cadangan keystore di tempat aman di luar repositori git.

> [!WARNING]
> **Peringatan `tauri android init`**:
> Berkas `src-tauri/gen/android/app/build.gradle.kts` ter-track di git dan telah dikonfigurasi untuk membaca variabel lingkungan penandatanganan di atas. Menjalankan perintah `npx tauri android init` akan menimpa file ini dengan template bawaan Tauri. Jika pernah di-init ulang, pastikan konfigurasi `signingConfigs` dan `buildTypes.release` disalin kembali.

---

## 2. Format Penamaan Aset Rilis Baku

> [!NOTE]
> **Status Platform**: Sesuai kebijakan rilis, desktop **Windows** tetap dipertahankan pada rilis stabil **v1.0.0** (`Reminder.Widget.1.0.0.Setup.exe` dan `Reminder.Widget.1.0.0.exe`). Pipeline otomatis tag `v*` hanya membangun dan menerbitkan pembaruan untuk platform **Android**. Job Windows hanya dijalankan melalui pemicu manual `workflow_dispatch` sebagai artifact CI.

Format penamaan aset:

| Aset | Nama Berkas | Rilis Target | Deskripsi |
|---|---|---|---|
| Android APK | `BRONE-Reminder-arm64.apk` | Rilis Otomatis (`latest`) | APK mandiri 64-bit untuk Android 7.0+ |
| Checksum | `SHA256SUMS.txt` | Rilis Otomatis (`latest`) | Berkas teks berisi hash SHA-256 APK Android |
| Windows Installer | `Reminder.Widget.1.0.0.Setup.exe` | Rilis Stabil v1.0.0 | Setup NSIS resmi untuk Windows 10/11 x64 |
| Windows Portable | `Reminder.Widget.1.0.0.exe` | Rilis Stabil v1.0.0 | Biner tunggal resmi langsung jalan (tanpa instalasi) |
| Windows Artifact (CI) | `Reminder-Widget-Setup-x64.exe` / `Portable` | `workflow_dispatch` | Biner pengujian Windows (hanya artifact CI) |

---

## 3. Langkah Rilis Standar (Step-by-Step)

### Langkah 1: Naikkan Versi & Catat Changelog
1. Buat branch baru dari `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b chore/bump-vX.Y.Z
   ```
2. Naikkan versi di `package.json`:
   ```bash
   npm version X.Y.Z --no-git-tag-version
   ```
3. Perbarui `src-tauri/Cargo.toml` agar field `version = "X.Y.Z"`.
4. Jalankan `cargo check --manifest-path src-tauri/Cargo.toml` untuk memperbarui `Cargo.lock`.
5. Tambahkan entri baru di [`CHANGELOG.md`](../CHANGELOG.md) mengikuti format Keep a Changelog.
6. Jalankan pengujian:
   ```bash
   npm test
   cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
   ```
7. Buat commit, push, buka PR, dan merge ke `main`.

### Langkah 2: Uji Coba Kering (Dry Run via GitHub Actions)
Sebelum membuat tag rilis resmi:
1. Buka tab **Actions** di repositori GitHub.
2. Pilih workflow **Release**.
3. Klik **Run workflow**, biarkan centang `Dry run: true`, lalu jalankan.
4. Workflow akan membangun biner Windows dan APK Android, menguji `versionCode`, memastikan ukuran APK ≤ 15 MB, menghitung hash `SHA256SUMS.txt`, dan mengunggah artifact tanpa mempublikasikan rilis GitHub.

### Langkah 3: Picu Rilis Resmi (Tag Publik)
Setelah dry run hijau dan diverifikasi:
1. Pastikan branch `main` berada di commit terbaru:
   ```bash
   git checkout main
   git pull origin main
   ```
2. Buat tag git beranotasi dan push ke remote:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
3. Workflow **Release** akan berjalan otomatis, memverifikasi kesamaan tag dengan `package.json`, membangun APK Android, memverifikasi `versionCode` > v1.1.0, memeriksa tanda tangan sertifikat dan guard ukuran ≤ 15 MB, mengekstrak catatan rilis dari `CHANGELOG.md`, dan membuat GitHub Release resmi beserta aset `BRONE-Reminder-arm64.apk` dan `SHA256SUMS.txt`.

---

## 4. Verifikasi Pasca-Rilis

Setelah rilis terbit di GitHub Releases:
1. **Unduh Aset Rilis**:
   Pastikan berkas `BRONE-Reminder-arm64.apk` dan `SHA256SUMS.txt` ada dan dapat diunduh dari halaman rilis.
2. **Verifikasi Checksum SHA-256**:
   - Di terminal Linux/macOS:
     ```bash
     sha256sum -c SHA256SUMS.txt
     ```
   - Di Windows PowerShell:
     ```powershell
     Get-FileHash .\BRONE-Reminder-arm64.apk -Algorithm SHA256
     ```
     Bandingkan nilainya dengan yang tertera di `SHA256SUMS.txt`.
3. **Verifikasi Sertifikat APK Android**:
   ```bash
   apksigner verify --print-certs BRONE-Reminder-arm64.apk
   ```
   Pastikan SHA-256 digest dari sertifikat APK cocok dengan sertifikat rilis `v1.1.0`.
4. **Uji Pasang**:
   - Pasang APK Android di atas perangkat yang telah terpasang versi sebelumnya (`v1.1.0`) untuk memastikan update berjalan mulus tanpa konflik tanda tangan (*signature mismatch*).
   - Pengguna desktop Windows tetap menggunakan installer/portable stabil v1.0.0.

---

## 5. Prosedur Rollback / Perbaikan Darurat

Jika ditemukan bug kritis setelah rilis terbit:
- **JANGAN PERNAH menghapus tag git publik** yang sudah di-fetch oleh pengguna atau bot packaging.
- Edit halaman rilis di GitHub untuk menambahkan peringatan di bagian atas deskripsi rilis.
- Jika biner rusak total, Anda dapat menandai rilis tersebut sebagai *Pre-release* di GitHub UI.
- Segera buat branch perbaikan (hotfix), naikkan nomor patch di `package.json` dan `Cargo.toml`, lalu rilis versi baru (misal `v1.2.1`).
