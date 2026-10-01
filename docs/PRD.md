# PRD — BRONE Reminder Widget v1.1.0

> Status: **PEMENANG DIPUTUSKAN — Opt5 Ledger. Lanjut ke tiket + implementasi.**
> Token: `docs/TOKENS.md` (diarsip dari brief, + delta dark: urgency diangkat
> untuk kontras, teal dark `#5BB5A6`).
> Sumber: analisis arsitektur + desain + status git + 4 putaran Figma, 16–17 Sep 2026.
> Dokumen terkait: `docs/DESIGN.md` (mockup varian A/B/C), `docs/PLAN-ANDROID-PORT.md`,
> `CHANGELOG.md` (riwayat v1.0.0).

## Problem Statement

Mahasiswa memantau deadline tugas BRONE/Moodle lewat widget desktop, tetapi
pengalaman lintas platform belum tuntas. Ke depan sumber feed mencakup
Google Classroom (roadmap, bukan v1.1.0):

1. Di Android, pengingat terjadwal mati total setelah reboot (alarm tidak
   dijadwal-ulang), permission notifikasi/alarm Android 12/13+ belum diminta
   saat runtime, dan home-screen widget tidak dijamin segar setelah reboot.
2. Arah visual belum fix. Eksplorasi Figma-first menghasilkan 6 arah
   (inventaris di D-Design-1); satu arah dipilih lewat review sebelum
   implementasi. Prinsip anti-slop mengikat: referensi tempelan ditolak,
   keputusan diturunkan dari first principles produk (aturan §D-Design-2).
3. Cacat UX kecil tapi berulang: target sentuh di bawah 44px, judul terpotong
   satu baris, badge urgensi salah warna, emoji sebagai ikon di widget native.

## Solution

Rilis v1.1.0 yang menuntaskan loop Android (boot → reschedule → notifikasi →
widget segar) dan memperbaiki cacat UX terukur — tanpa mengubah arsitektur
(refaktor struktur masuk rilis berikutnya). Visual mengikuti pemenang review
Figma; token final disebar ke semua permukaan termasuk widget native.

## Goals

- G1: Setelah reboot, widget Android segar dan notifikasi terjadwal aktif
  kembali tanpa aksi manual selain membuka app sekali.
- G2: Opt5 Ledger (grup matkul + time-bar + left-border urgency, teal brand)
  diterapkan konsisten di app, widget desktop, dan widget native Android,
  pasangan terang + gelap sesuai `docs/TOKENS.md`.
- G3: Semua kontrol sentuh ≥ 44px; urgensi tidak pernah warna saja (selalu
  ada kata/angka pendamping).
- G4: Zero regression: 48/48 unit test hijau, clippy `-D warnings` bersih,
  CI desktop + Android hijau.

## User Stories

### Android reliability

1. Sebagai mahasiswa Android, saya ingin widget home-screen tetap menampilkan
   deadline terbaru setelah HP di-restart, sehingga saya tidak ketinggalan info.
2. Sebagai mahasiswa Android, saya ingin notifikasi H-24/H-6/H-1 tetap berbunyi
   walau HP sempat mati, sehingga pengingat tidak hilang diam-diam.
3. Sebagai pengguna Android 13+, saya ingin diminta izin notifikasi secara
   eksplisit saat pertama setup, sehingga saya paham kenapa notifikasi
   perlu izin.
4. Sebagai pengguna Android 12+, saya ingin diberi tahu jika izin exact-alarm
   ditolak vendor (MIUI/battery-saver), sehingga saya tahu cara memperbaikinya.
5. Sebagai mahasiswa, saya ingin interval sync dan ambang notifikasi tetap
   mematuhi batas sopan (min 15 menit), sehingga akun BRONE tidak di-rate-limit.

### Widget & daftar (arah mengikuti hasil review Figma)

6. Sebagai mahasiswa, saya ingin tugas yang genting terbaca < 1 detik tanpa
   scroll (mekanisme mengikuti arah desain terpilih), sehingga
   saya tidak melewatkan deadline.
7. Sebagai mahasiswa, saya ingin menandai tugas selesai dengan satu ketukan
   dan mengembalikannya dari grup Selesai, sehingga kesalahan mudah dibatalkan.
8. Sebagai mahasiswa, saya ingin countdown live per detik tanpa teks bergeser,
   sehingga widget tenang dibaca sekilas.
9. Sebagai mahasiswa, saya ingin judul panjang tetap terbaca (maks 2 baris),
   sehingga saya tidak salah tugas.
10. Sebagai mahasiswa, saya ingin status sync ("sync 5 mnt lalu") selalu
    terlihat, sehingga saya tahu data masih segar atau basi.
11. Sebagai pengguna wallpaper terang maupun gelap, saya ingin widget selalu
    terbaca, sehingga saya tidak perlu ganti wallpaper.

### Pengaturan

12. Sebagai mahasiswa, saya ingin menempel URL feed kalender + uji koneksi di
    satu layar dengan hasil yang terlihat, sehingga setup gagal cepat ketahuan.
13. Sebagai mahasiswa, saya ingin ambang pengingat (24/6/1) dan interval refresh
    (15/20/30) sebagai pilihan sekali ketuk, sehingga tidak salah ketik angka.
14. Sebagai pengguna desktop, saya ingin opsi khusus desktop (tray, wallpaper
    mode, auto-start, auto-detect) tetap ada; sebagai pengguna HP saya ingin
    opsi itu tampil redup berlabel, bukan hilang misterius.

### Edge states

15. Sebagai mahasiswa offline, saya ingin melihat skeleton + data terakhir +
    tombol coba-lagi saat feed gagal, sehingga app tidak terlihat rusak.
16. Sebagai mahasiswa tanpa deadline dekat, saya ingin empty-state yang jelas
    ("Tidak ada deadline mendekat"), sehingga saya yakin bukan error sync.

### Roadmap (pasca-v1.1.0)

17. Sebagai mahasiswa yang kelasnya memakai Google Classroom, saya ingin
    deadline Classroom tampil di widget yang sama, sehingga satu tempat
    untuk semua tugas.

## Implementation Decisions

- D-Android-1: `BootReceiver` + permission manifest di-commit atomik dalam satu
  commit (manifest merujuk class yang harus ada). Noise CRLF pada `Cargo.toml`
  dibuang dulu, tidak ikut commit.
- D-Android-2: Reschedule-on-open: setiap cold start, perencana notifikasi
  membangun ulang jadwal dari tugas + ambang + peta "sudah diberitahu",
  menimpa jadwal basi. Satu-satunya seam satuan adalah modul konfigurasi
  notifikasi (satuan jam di UI, ms di transport — konversi di satu tempat).
- D-Android-3: Runtime permission diminta di seam adapter IPC yang sama dengan
  penjadwalan notifikasi; penolakan dicatat dan ditampilkan sebagai fallback
  di layar (bukan gagal diam-diam).
- D-Design-1: PEMENANG = Opt5 Ledger (grup matkul + time-bar + left-border,
  teal brand, token mengikat di `docs/TOKENS.md`). Opsi lain (Opt1 Agenda,
  Opt2L/Opt2D, Opt3L/Opt3D, Opt4 Signal, Opt6 Minggu) diarsip di canvas
  Figma, tidak diimplementasi.
- D-Design-2: Brief kendala untuk semua opsi (tidak dinegosiasikan ulang
  saat review): kontrol sentuh ≥ 44px; urgensi tidak pernah warna saja;
  judul maks 2 baris; tanpa emoji sebagai ikon; status sync selalu terlihat;
  widget terbaca di wallpaper apa pun; countdown tabular.
- D-Design-3: Theme system YA — pasangan terang + gelap dibangun bersama
  (mockup Opt5L/Opt5D paritas struktur, token di `docs/TOKENS.md`),
  disebar ke semua permukaan termasuk widget native.
- D-Design-4: Anti-slop bukan selera sesaat: keputusan desain dirujuk ke
  skill yang terinstall (`design-taste-frontend`, `impeccable`,
  `avoid-ai-design`, `hallmark`, `frontend-design`); pola tempelan
  (pil-dot-kartu triple-encoding, ungu di mana-mana, chrome pinjaman)
  ditolak eksplisit.
- Seams yang dipakai (tidak ada seam baru): adapter transport/store fetcher
  kalender, adapter IPC JS↔Rust (event feed-changed/settings-changed), modul
  perencana notifikasi murni, modul done-store murni. Konfirmasi: seam ini
  sesuai harapan? (sketsa awal — beri tahu jika ingin diubah sebelum eksekusi.)

## Testing Decisions

- Standar test yang baik di repo ini: uji perilaku eksternal modul murni
  (`node:test`), bukan detail implementasi; pola prior: suite parser,
  done-store, submission-queue, notify-config, schedule-plan, capabilities.
- Yang diuji: reschedule pasca-reboot (simulasi: jadwal kosong → cold start →
  jadwal terisi), normalisasi ambang, done/prune, parser iCal (tetap hijau).
- Integrasi: build APK (`tauri android build`) di CI + lokal; uji manual
  emulator (reboot → widget segar; tolak izin → fallback tampil).
- Desktop: `npm test` 48/48 + `node --check` 8 file + `cargo clippy -D warnings`.

## Out of Scope (v1.2.0+)

- Refaktor struktur: modul notifikasi tunggal, unifikasi satuan `notified`,
  penggabungan title-poll hidden-webview, unifikasi validasi URL.
- Enkripsi `secret.json` non-Windows; auto-detect submission di mobile;
  background refresh Android; 1-klik login BRONE di HP.
- Opsi Figma yang kalah review (diarsip, bukan diimplementasi).
- Konektor Google Classroom — roadmap pasca-v1.1.0 (butuh riset: API vs
  ekspor iCal, auth OAuth, mapping kursus→matkul). v1.1.0 tidak boleh
  menutup pintu (seam fetcher tetap adapter-based).

## Further Notes

- Keputusan blocking (butuh jawaban sebelum eksekusi):
  1. ~~Pemenang review Figma~~ → **Opt5 Ledger** (diputuskan via token brief).
  2. ~~Theme system?~~ → **YA** (pasangan Opt5L/Opt5D).
  3. Commit `docs/design/shots/` PNG (~880KB) atau gitignore?
  4. Fase fungsional dulu atau refaktor struktur dulu? (rekomendasi: fungsional)
- Setelah PRD disetujui: pecah jadi tiket via `to-tickets`, publish ke issue
  tracker dengan label `ready-for-agent` (butuh `setup-matt-pocock-skills`
  dulu bila tracker-nya GitHub issues).
- Risiko rilis: CI Android belum pernah mengompilasi receiver/permission baru;
  vendor tertentu (MIUI/Samsung) membatasi exact-alarm walau izin diberikan.
- Peralatan: bridge Figma berjalan (mendukung `--timeout`); 61 skill
  terinstall termasuk 5 skill desain anti-slop.
