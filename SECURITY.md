# Kebijakan Keamanan (Security Policy) — BRONE Reminder Widget

Proyek BRONE Reminder Widget sangat memperhatikan keamanan data dan privasi pengguna. Dokumen ini menjelaskan cakupan keamanan, cara melaporkan kerentanan, dan panduan mitigasi token feed kalender.

---

## 1. Versi yang Didukung (Supported Versions)

| Versi | Platform | Status Dukungan |
|---|---|---|
| `1.2.x` | Android (`arm64-v8a`) | :white_check_mark: Didukung (Pembaruan aktif) |
| `1.0.0` | Windows (10/11 x64) | :white_check_mark: Didukung (Versi rilis stabil desktop) |
| `< 1.0.0` | Semua | :x: Tidak didukung |

---

## 2. Melaporkan Kerentanan Keamanan (Reporting a Vulnerability)

> [!IMPORTANT]
> **JANGAN MEMBUAT PUBLIC ISSUE UNTUK CELAH KEAMANAN!**
> Mempublikasikan detail kerentanan di issue publik dapat membahayakan pengguna lain sebelum perbaikan tersedia.

Jika Anda menemukan potensi kerentanan keamanan (seperti kebocoran kredensial, eksploitasi webview, injeksi parser, atau bypass izin OS):
1. Laporkan secara privat melalui **[GitHub Security Advisories](https://github.com/Zxaviers/reminder-widget/security/advisories/new)**.
2. Cantumkan rincian berikut:
   - Deskripsi lengkap masalah dan dampaknya.
   - Langkah-langkah reproduksi (proof-of-concept / PoC).
   - Platform dan versi sistem operasi yang terdampak (Windows atau Android).
3. Pengelola repositori akan merespons dalam waktu 48 jam untuk memvalidasi laporan dan mendiskusikan langkah perbaikan.

---

## 3. Peringatan Penting Mengenai URL Feed Kalender (Moodle / BRONE)

URL ekspor iCalendar dari BRONE UB (Moodle) atau Google Calendar berisi parameter rahasia (`authtoken` atau private URL):
- **Tingkat Akses**: Token ini memberikan hak akses baca (*read-only*) ke seluruh agenda, jadwal kuliah, dan tenggat waktu tugas akademik Anda.
- **Peringatan Privasi**: Jangan pernah membagikan URL feed tersebut kepada siapa pun, jangan menempelkannya ke public issue, tangkapan layar, atau commit repositori publik.
- **Langkah Jika URL Feed Bocor**:
  Jika URL feed BRONE Anda tanpa sengaja terekspos ke publik:
  1. Masuk ke portal BRONE UB (`https://brone.ub.ac.id/`).
  2. Buka menu **Profil / Preferences** &rarr; **Security Keys** (*Kunci Keamanan*) atau buka menu **Calendar** &rarr; **Export Calendar**.
  3. Lakukan regenerasi / reset token ekspor kalender Anda. Token lama akan otomatis hangus dan tidak dapat digunakan lagi.
  4. Perbarui URL feed baru di dalam aplikasi BRONE Reminder Widget.

---

## 4. Model Penyimpanan Data Lokal

- **Windows**: URL feed disimpan aman di dalam Windows Credential Manager bawaan OS menggunakan API `keyring` Rust.
- **Android**: URL feed disimpan di dalam direktori penyimpanan privat internal aplikasi (`secret.json`). Pengguna disarankan untuk tidak memasang aplikasi di perangkat yang di-root guna menjaga integritas sandbox aplikasi Android (lihat pelacak isu [#5](https://github.com/Zxaviers/reminder-widget/issues/5)).
- **Tanpa Telemetri**: Aplikasi ini tidak memiliki pelacak (*analytics*), tidak mengirim data ke server pihak ketiga, dan koneksi HTTP hanya dilakukan langsung ke domain sumber kalender Anda.
