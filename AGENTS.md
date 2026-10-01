# AGENTS.md — BRONE Reminder Widget v2

> Aturan Figma di bawah arsip dari brief desain internal (17 Sep 2026),
> dipasang 17 Sep 2026 agar berlaku otomatis tiap sesi desain tanpa dijelaskan ulang.
> Token lengkap: `docs/TOKENS.md`. Catatan: Figma bridge hanya memuat
> Inter/Roboto/Arial — untuk mockup pakai Inter tabular sebagai pengganti mono,
> font asli diterapkan saat implementasi kode.

## BRONE Design System — Rule buat Agent Figma

### Aturan mengikat (self-check sebelum output desain apa pun)

Sebelum mengirim hasil desain Figma, verifikasi checklist ini. Kalau ada satu
saja yang gagal, revisi dulu sebelum ditampilkan ke user:

- [ ] **Ikon**: HANYA pakai satu library asli — Untitled UI Icons atau
      Phosphor Icons (pilih satu, jangan campur). DILARANG menggambar path
      SVG ikon sendiri dari nol. DILARANG membuat maskot/karakter kartun
      (robot lucu, wajah, dsb) — itu tell "AI slop" yang sudah pernah ditolak.
- [ ] **Status urgensi**: warna + label kata/angka, TIDAK PERNAH warna saja.
      TIDAK pakai pill/badge bulat berwarna. Pakai left-border accent 2-3px
      atau teks berwarna langsung.
- [ ] **Shadow**: maksimal SATU elevation di seluruh screen (kontainer
      widget/card terluar). TIDAK ADA shadow per-row/per-item.
- [ ] **Warna aktif per layar**: maksimal 2 warna semantik aktif terlihat
      sekaligus (mis. danger + warning). Item yang aman/jauh tenggat TIDAK
      diberi warna — pakai teks netral.
- [ ] **Satu momen fokus**: kalau ada item paling mendesak, angkat jadi satu
      blok visual yang lebih besar/berbeda (hero), sisanya tetap tenang.
      Jangan semua row diberi treatment yang sama rata.
- [ ] **Grounding data**: gunakan data asli (kode matkul, nama tugas asli),
      JANGAN kategori generik ("Kerja/Pribadi/Mendesak") sebagai pengganti
      struktur data yang sebenarnya.
- [ ] **Warna brand**: TIDAK BOLEH ungu/indigo generik atau kombinasi
      krem+terracotta. Lihat token warna di bawah.
- [ ] **Radius & konsistensi lintas layar**: satu skala radius dipakai
      konsisten di semua permukaan (app, widget desktop, widget Android) —
      TIDAK ADA dua bahasa visual berbeda antara app dan widget.
- [ ] Kontrol sentuh ≥44px, judul tugas maks 2 baris, countdown pakai
      tabular figures (digit tidak bergeser lebar).

### Token warna & tipografi (dasar, override kalau BRONE punya brand resmi)

- Surface: `#F5F4F1` (light) / `#14151A` (dark) — bukan krem hangat, bukan
  hitam pekat.
- Brand accent: `#1F6F63` (teal gelap) — dipakai HANYA untuk logo/CTA
  primer, TIDAK untuk status urgensi.
- Urgensi: safe `#3A7D5C`, soon `#B8842E`, critical `#C1502E`,
  overdue `#8B2E2E` — selalu didampingi label.
- Font: mono (`JetBrains Mono` / `IBM Plex Mono`) untuk kode matkul &
  countdown/angka; sans (`Manrope` / `Inter`) untuk judul & body.
- Radius: 6px untuk row/item, 12-16px untuk kontainer terluar saja.

### Arah desain terpilih

Opt5 Ledger — grup per matkul (kode + nama asli), time-bar proporsi per
grup, row per tugas dengan left-border accent urgensi.

### Kalau ragu

Jangan menebak/menghias sendiri. Tanyakan ke user, atau rujuk ke referensi
visual restrained yang sudah disepakati (gaya Linear issue list / Things 3 /
widget Reminders bawaan iOS) — bukan pola "planner app" generik.

## Cara kerja — anti berhenti diam-diam (berlaku tiap sesi)

Aturan ini di atas segalanya kecuali keselamatan: user menuntut tugas
dikerjakan tuntas tanpa reprompt, dan setiap halangan dilaporkan dengan kata,
bukan didiamkan.

- [ ] **Vonis tiap tool call.** Setiap `Run Command`/tool WAJIB diikuti satu
      kalimat hasil: BERHASIL/GAGAL + bukti (exit code, file yang berubah,
      angka test). DILARANG mengakhiri giliran tepat setelah tool call tanpa
      teks. Output tool yang kosong = mencurigakan: verifikasi ulang
      (baca file/log), jangan dianggap selesai.
- [ ] **Jangan buang output.** DILARANG pipe build/test panjang ke
      `Select-Object -Last N` / `head` / `tail` langsung. Selalu redirect ke
      file (`> build.log 2>&1`), lalu baca filenya. Layar kosong bukan bukti.
- [ ] **Tugas panjang = log + polling.** Perintah >2 menit (build Android,
      boot emulator) wajib jalan dengan log file + batas tunggu eksplisit.
      Tiap cek polling laporkan: sudah berapa lama, apa yang terlihat di log,
      kapan cek berikutnya.
- [ ] **Macet >10 menit tanpa output baru = nyatakan MACET.** Tulis penyebab
      yang terlihat (proses apa yang hidup/mati, timestamp file terakhir),
      hentikan yang gantung, usulkan langkah berikutnya. Jangan spinner
      selamanya.
- [ ] **Satu perintah, satu tujuan kecil.** Jangan rantai build + sign +
      install + tes dalam satu perintah. Satu langkah terverifikasi dulu,
      baru lanjut. Kalau satu langkah gagal, berhenti dan lapor — jangan
      lanjut buta ke langkah berikut.
- [ ] **Blokir = lapor, bukan diam.** Izin ditolak, file dikunci, emulator
      offline, RAM habis — tulis persis pesannya + apa yang dibutuhkan dari
      user. Jangan pernah diam lebih dari satu giliran saat menunggu user.
