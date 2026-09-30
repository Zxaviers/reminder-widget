# DESIGN.md — BRONE Reminder Mobile + Widget v2

> Sumber: `docs/mobile-design.html` (mockup hi-fi, 14 Sep 2026) + `src/style.css` + layout widget native.
> Status: **DIARSIPKAN 17 Sep 2026 — arah pengikat sekarang Opt5 Ledger, lihat
> `../AGENTS.md` + `TOKENS.md`.** Isi varian B di bawah dipertahankan sebagai
> arsip mockup 14 Sep 2026, BUKAN spec aktif. (Sebelumnya: DRAFT menunggu
> sign-off, rekomendasi B — dibatalkan oleh keputusan Opt5.)
> Verifikasi visual: render headless Chrome 14 Sep 2026, `docs/shots/shot-dark.png` +
> `shot-light.png`. Kedua tema lolos baca sekilas; widget tetap gelap di wallpaper
> pada kedua tema (sesuai spec). Satu temuan visual: judul tugas terpotong
> ellipsis pada lebar 340px — aplikasi disarankan clamp 2 baris untuk judul,
> bukan 1 baris ellipsis seperti mockup.

## 1. Vibe

**Tenang tapi siaga.** Layar daftar adalah *Monitor*: memantau deadline yang
berubah, kepadatan + hierarki sekilas lebih penting dari dekorasi — tanpa
hero, tanpa ilustrasi, tanpa metrik pajangan. Urgensi dibaca < 1 detik lewat
kombinasi dot warna + label teks (warna tidak pernah berdiri sendiri).
Bahasa Indonesia, angka tabular yang tidak goyang tiap detik, semua target
sentuh min 44px. Rasa keseluruhan: gelap, presisi, fungsional — seperti
kokpit, bukan brosur.

## 2. Palet

| Token | Dark | Light | Pakai |
|---|---|---|---|
| bg / surface / card | `#11131d` / `#16182a` / `#1e293b` | `#f1f5f9` / `#ffffff` / `#ffffff` | Latar, permukaan, kartu |
| ink / muted / faint | `#f1f5f9` / `#94a3b8` / `#64748b` | `#0f172a` / `#64748b` / `#94a3b8` | Teks, sekunder, tersier |
| line | `#334155` | `#e2e8f0` | Border, divider |
| ok / warn / bad | `#7ee787` / `#ffb454` / `#ff6b72` | sama | Urgensi normal / ≤24 jam / terlewat |
| accent | `#38bdf8` | sama | Toggle aktif, link, hasil test — BUKAN badge urgensi |
| radius kartu / pill / widget | `14px` / `99px` / `20px` | sama | Kartu sentuh, countdown, kartu wallpaper |

Catatan: radius mock (14px) vs aplikasi saat ini (7–9px) — dikunci ke mock
saat implementasi (keputusan D-terbuka, butuh sign-off).

## 3. Tipografi

- Stack: `system-ui, 'Segoe UI', Roboto, sans-serif` (native, tanpa webfont).
- Skala: judul bar 15px bold · judul tugas 13,5px · meta 11,5px ·
  pill/label 10–11px bold · section label 11px uppercase + tracking.
- **Semua countdown memakai tabular-nums** — anti-goyang tiap detik.
- Sentence case untuk heading. Copy terkunci: **`BRONE Reminder`**
  (singular — menggantikan `BRONE Reminders` plural dan `Deadlines`;
  lihat temuan F3).

## 4. Surface

- **Daftar (Monitor)** — varian B (rekomendasi): grup `Mendesak` /
  `Berikutnya` / `Selesai (n)` + restore ↺. Header: nama app + hitung
  tugas + umur sync. Footer: umur sync + hint gesture.
- **Pengaturan (Configure)** — satu layar (keputusan D2 plan Android):
  Feed Kalender (URL + Test Koneksi + status hasil terlihat) · ambang
  pengingat (chips 24/6/1) · interval refresh (15/20/30, default 20) ·
  section desktop-only tampil redup berlabel (bukan fitur mati misterius).
- **Widget 4×2 (read-only)** — cermin 1:1 `widget_reminder_layout.xml`:
  header 13sp bold + sync 10sp · maks 3 baris tugas (dot 8dp, judul
  11sp, matkul 9sp, badge 10sp) · varian kosong
  (`Tidak ada deadline mendekat / Buka aplikasi untuk sinkronisasi`) ·
  selalu gelap agar terbaca di wallpaper apa pun · ketuk membuka aplikasi.

## 5. Komponen

- `task row`: dot urgensi + judul (ellipsis) + matkul/sisa + pill countdown + tombol `OK` 44px.
- `pill`: border 1px warna urgensi + teks 11px bold tabular.
- `done-btn` / `icobtn` / `chip` / `btn44`: min 44px, radius 10–12px (99px untuk chip).
- `setgroup`: kartu section pengaturan + `h4` uppercase.
- `donerow`: baris selesai (dashed border, judul strikethrough) + tombol ↺.
- Widget: `wrow` (read-only, tanpa tombol), `wempty`.

## 6. Micro-interaction & motion

- Countdown tick tiap detik tanpa pergeseran layout (tabular-nums).
- Pull-to-refresh daftar; ketuk kartu → detail; ketuk `OK` → pindah ke Selesai + batalkan jadwal notif tugas itu.
- Transisi 120–200ms ease-out; hormati `prefers-reduced-motion`
  (nonaktifkan animasi non-esensial).

## 7. Aksesibilitas (gerbang handoff)

- Kontras teks AA di kedua tema; urgensi selalu dot + label teks.
- Semua kontrol 44px, reachable keyboard di web; fokus terlihat.
- Widget: informasi tidak bergantung warna saja (ada teks sisa waktu).

## 8. States (wajib per view)

- Daftar: loading (skeleton) · kosong (`Tidak ada deadline mendekat`) · error feed (pesan + tombol coba lagi) · data parsial.
- Widget: terisi · kosong. Tidak menjadwalkan sendiri — alarm diperbarui
  tiap aplikasi dibuka (loop reschedule).

## 9. Temuan untuk kode (dari mockup → implementasi)

- **F1.** Badge normal widget native memakai sky `#38bdf8`
  (`widget_time_1`) — samakan ke hijau urgensi `#7ee787`.
- **F2.** Header + empty state native memakai emoji
  (`📅 BRONE Reminders`, `🎉`) — ganti teks polos (tanpa-emoji).
- **F3.** Kunci satu nama `BRONE Reminder` di semua permukaan.

## 10. Keputusan (dikunci 17 Sep 2026 — menggantikan D1–D3 terbuka di bawah)

- **D1: Varian B DIBATALKAN → Opt5 Ledger.** Grup per matkul (kode + nama asli),
  time-bar proporsi per grup, row per tugas dengan left-border accent urgensi.
  Tanpa pill/badge, tanpa dot saja. Lihat `../AGENTS.md`.
- **D2: Radius mengikuti AGENTS.md** — 6px row/item, 12–16px kontainer terluar
  saja. Angka 14px/99px/20px di §2/§5 adalah arsip mockup, tidak berlaku.
- **D3: Copy judul** `BRONE Reminder` di semua permukaan (F3) — TETAP, tidak berubah.
- Setelah ini → generate `tokens.json` (Tokens Studio) + `figma-plugin-code.ts`
  + handoff note dari `TOKENS.md`, bukan dari mockup varian B.

### Arsip keputusan terbuka sebelumnya (usang, dipertahankan sebagai riwayat)

- ~~**D1: Kunci varian B** (rekomendasi mockup) dan arsipkan A/C.~~ → dibatalkan, lihat D1 baru.
- ~~**D2: Radius 14px** (mock) vs 7–9px (aplikasi saat ini).~~ → diputuskan, lihat D2 baru.
- ~~**D3: Copy judul** `BRONE Reminder` di semua permukaan (F3).~~ → tetap, lihat D3 baru.
- Setelah D1–D3 dikunci → generate `tokens.json` (Tokens Studio) +
  `figma-plugin-code.ts` + handoff note.
