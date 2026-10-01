# Proses Desain BRONE Reminder — Log Progres

> Rekap living document. Update tiap sesi desain: tambah entri baru di
> [Log sesi](#log-sesi), jangan hapus riwayat.
> Aturan pengikat: `../AGENTS.md` · Token: `TOKENS.md` · Arsip mockup lama: `DESIGN.md`

## 1. Keputusan arah (dikunci 17 Sep 2026)

- **Opt5 Ledger** — grup per matkul (kode + nama asli), time-bar proporsi,
  row per tugas dengan left-border accent 3px urgensi. Tanpa pill/badge,
  tanpa shadow per-row, maks 2 warna semantik aktif per layar.
- **Varian B dibatalkan** (grup Mendesak/Berikutnya, dot + pill, radius 14px,
  aksen sky). `DESIGN.md` diarsipkan sebagai catatan mockup 14 Sep 2026,
  bukan spec aktif. D1–D3 diputuskan: D1 → Opt5, D2 → radius 6px row /
  12–16px kontainer (ikut AGENTS.md), D3 → copy `BRONE Reminder` tetap.
- Token warna/tipografi/radius: `TOKENS.md` (diarsipkan dari brief desain internal, 17 Sep 2026).
- Batasan Figma bridge: hanya memuat Inter/Roboto/Arial — mockup pakai Inter
  (tabular saat implementasi via `JetBrains Mono`/`IBM Plex Mono` + `Manrope`/`Inter`).

## 2. Infrastruktur agent desain

- Subagent opencode: `../.opencode/agents/brone-designer.md`
  (mode subagent, `edit`/`bash` deny, generate murni via plugin Figma).
  Dipanggil via `@brone-designer` atau otomatis untuk task desain UI.
- Proses wajib subagent: rencana dulu → generate → screenshot → self-review
  checklist satu per satu → lapor (termasuk poin yang sempat gagal +
  perbaikannya). Pelanggaran checklist tanpa alasan eksplisit = auto-reject.
- Bridge: `figma-live-bridge/` (HTTP `127.0.0.1:3055`, CLI `send.js`).
  Server dijalankan manual (`node server.js`), Figma Desktop wajib membuka
  plugin "Antigravity Canvas Bridge" agar `figma_connected: true`.
- Script sumber: `opt5l-home.js`, `opt5l-widgets.js` (generator awal),
  `opt5l-medium-regen.js`, `opt5l-small-regen.js` (regen per-frame).

## 3. Log sesi

### 17 Sep 2026 — Instalasi rule + subagent

- `brone-design-system.md` (dari brief internal) dipasang ke `../AGENTS.md`.
- `DESIGN.md` diselaraskan ke Opt5 (status diarsipkan, D1–D3 dikunci, riwayat
  keputusan lama dipertahankan dengan coret).
- `brone-designer.md` (dari brief internal) dipasang ke
  `../.opencode/agents/brone-designer.md` dengan 2 perbaikan:
  referensi putus `docs/design-system.md` → `AGENTS.md` + `docs/TOKENS.md`,
  dan field deprecated `tools:` → `permission: edit/bash deny`.

### 17 Sep 2026 — Regen "Opt5L - Widget Medium" (node 66:2, 4500/950)

- Script: `figma-live-bridge/opt5l-medium-regen.js` (find-by-name, posisi
  dipertahankan, frame lain tidak tersentuh).
- Konten: IF2040 · Tugas bab 6 — "Terlewat 2 jam" (overdue `#8B2E2E`);
  IF2040 · Kuis jaringan — "6 jam lagi" (critical `#C1502E`, fill 25%);
  COMB0051 · Presentasi metopen — "Besok 10.00" **netral** (`ink-600`).
- Keputusan: label ikut token baku ("Terlewat 2 jam", bukan "terlambat");
  kode `COM60051` (script lama) dibetulkan → `COMB0051`;
  row 3 netral agar patuh maks-2-warna (overdue + critical sudah 2).
- Pengecualian beralasan: blok hero di-skip — lebar 360px tidak muat tanpa
  merusak pola ledger; row terlewat dibedakan via aksen tergelap + posisi teratas.
- Self-review 9 poin: lolos semua tanpa revisi ulang.

### 17 Sep 2026 — Regen "Opt5L - Widget Small" (node 66:28, 4500/1200)

- Premis awal ("masih dark + border oranye") terbukti usang saat inspeksi:
  frame sudah light system dari sesi sebelumnya. Regen = penyelarasan + hero.
- Script: `figma-live-bridge/opt5l-small-regen.js` (hanya frame Small).
- Konten: hero tunggal IF2040 · Kuis jaringan — "6 jam lagi" 21px Bold
  critical + aksen full-height + fill 25%; meta "+2 tugas lain".
- Keputusan: judul dipanjangkan ("IF2040 · Kuis" → "IF2040 · Kuis jaringan",
  muat 107px); warna kode faint → `ink-600`; status sync absen (170px tidak
  muat, Medium sudah menampilkan sync persisten).
- Self-review: lolos semua. Pengecualian hero kemarin tidak berlaku lagi —
  frame ini justru jadi hero tunggal.

### 17 Sep 2026 — Audit spacing "Opt5L - Home (Ledger)" (node 58:126, 4500/120)

- Padding horizontal row konsisten: Body 12px kiri/kanan di 4/4 row.
- Tinggi row konsisten: 66px semua — beralasan (tampung tombol "Tandai"
  48×44 sebagai touch target, overflow y −12 dari baris teks 20px).
- Gap antar-row konsisten: Hairline 1px + Gap 8px; jeda antar-grup
  (Gap 8 + Gap 18) seragam di 3 titik — hierarki terjaga.
- Temuan skala 4/8 (belum diperbaiki):
  1. `itemSpacing` 6 (Body) dan 10 (Top/Sub) — sistematis tapi di luar skala,
     saran samakan ke 8.
  2. Gap section-break 18 — sistematis, saran 16.
  3. Spacer ganda Gap 8 + Gap 6 (= 14) sebelum teks "Selesai (1)" —
     satu-satunya tanpa alasan jelas, saran jadikan 8 atau gabung.
- Catatan samping: header grup masih `COM60051` (belum diselaraskan ke `COMB0051`).

### 17 Sep 2026 — Audit UI/UX menyeluruh (Home 58:126, Medium 66:2, Small 66:28)

- 7 kriteria: affordance, touch target, spacing/alignment, kontras WCAG
  (dihitung eksak via relative luminance), hierarki, state interaktif,
  konsistensi antar-frame. Bukti: tree inspeksi + screenshot sesi ini
  (bridge sempat putus saat kompilasi — 2 nilai minor, warna/ukuran teks
  "Tandai" Home, dibaca visual dari screenshot dan ditandai estimasi).
- Temuan utama: tombol "Tandai" (4× Home) tanpa boundary; tap-to-undo
  "Selesai (1)" tanpa boundary + tinggi ±15px (<44px); kontras gagal AA:
  soon `#B8842E` 3,29:1 ("Besok 10.00" Home) dan `ink-400` `#8A8883` 3,54:1
  (teks-teks meta); Home menampilkan 4 warna semantik sekaligus (langgar
  maks-2, dibuat sebelum AGENTS.md); nol state pressed/completed/refreshing;
  judul vs countdown "sama berat" (Medium 11/11 Bold); drift antar-frame
  (padding kontainer 20 vs 14, row 66 vs 44, countdown 13 vs 11).
- Lolos bernama saat audit: area tap "Tandai" 48×44, tinggi row, aksen 3px +
  label di semua countdown, hero Small, sync persisten Home/Medium,
  baseline Medium sejajar (y2/h13 keduanya).

### 17 Sep 2026 — Fix temuan audit #1 (Tandai) + #2 (undo Selesai), Home

- #1: 4 frame Done (58:147/159/182/205, tetap 48×44) jadi outlined button —
  border 1px `ink-600`, radius 6, fill putih, teks "Tandai" naik
  `ink-400`→`ink-600` (sekaligus sembuhkan 4 instans gagal kontras).
  Netral, tanpa warna semantik baru, bukan pill status.
- Temuan proses: tombol terpotong jadi strip 20px karena SEMUA frame
  (Done, Top, Body, row, Home) `clipsContent=true` — button 44px yang
  overflow dari baris teks 20px terclip atas/bawahnya. Diperbaiki dengan
  unclip 4 Top + 4 Body (row/Home tetap clip, tidak memotong apa pun).
  Catatan tooling: screenshot zoom per-node dari bridge tidak memantulkan
  state live (fill merah uji pun tak tampil) — verifikasi wajib pakai
  screenshot full-frame.
- #2: teks "Selesai (1)" (58:212) dibungkus frame UndoRow 76:2 350×44 —
  fill putih, border 1px `ink-600`, radius 6, bahasa sama dengan Tandai;
  teks naik ke `ink-600`; spacer Gap 6 tak beralasan (58:211) dihapus;
  Home diresize 606→629 agar padding bawah tetap 20.
- Self-review keduanya: affordance ✓, touch ≥44 ✓, tanpa warna semantik
  baru ✓, radius konsisten ✓, hanya frame Home yang tersentuh ✓.

### 18 Sep 2026 — Audit anti-slop + rebuild "Instrument Ledger" (mockup HTML)

- Skill desain dibaca langsung dari `../.agents/skills/` (registry sesi ini hanya
  expose `create-skill`, jadi `skill` tool tidak bisa memanggilnya): dipakai
  `avoid-ai-design` (workflow audit → commit direction → rewrite → re-audit),
  `frontend-design` (daftar tell template chrome), `hallmark` (disiplin slop-test
  + stamp arah di kepala CSS). Pack mattpocock terinstall tapi isinya skill
  engineering (tdd/triage/to-spec), bukan desain; `superpowers` & `find-skills`
  tidak ada di `skills-lock.json` maupun di disk.
- Temuan audit pada mockup lama (kode-certian): T1 Inter untuk semua → ganti
  pairing Manrope (judul/body) + IBM Plex Mono (countdown, kode matkul, meta);
  K6 icon-in-rounded-square chip di tiap row → chip dihapus, list jadi time-rail
  vertikal dengan node urgensi; C5/M3 radial glow merah di hero → dihapus;
  CP3 chevron di tiap row → dihapus, row diganti `<button>` asli dengan
  hover/active/focus-visible (sekalian menutup K7 missing states + keluhan user
  "teks kecil yang harusnya button"); S1 spacing uniform 14px → rhythm 12/18/14;
  meta string ber-middle-dot ("4 tugas · sync 5 mnt", "IF2040 · Struktur Data") →
  dipisah jadi elemen berbeda warna/weight tanpa dot.
- Arah terkunci: **timeline-ledger, industrial-utilitarian** — rail vertikal 2px +
  node 8px per row (warna hanya soon/overdue, safe tetap netral), countdown mono
  sebagai anchor visual, satu hero card, ikon Phosphor hanya yang fungsional.
- Copy: "Selesai (1)" → "1 tugas selesai … Kembalikan" (angka mono, CTA aktif);
  ikon check footer dinetralkan ke `ink-400` demi aturan maks-2-warna-semantik
  (overdue + soon sudah aktif).
- File: `design/mockups/instrument-ledger-dark-only.html`; render verifikasi via headless Edge.
- Lanjutan: lembar perbandingan 4 permukaan `design/mockups/instrument-ledger-surfaces.html`
  (desktop widget 360px · app mobile 390px · widget home-screen native Android ·
  settings) dalam satu bahasa visual timeline-ledger. Board native sengaja tanpa
  webfont/ikon font (system sans + mono + dot geometris) sesuai batasan RemoteViews;
  settings memakai chip terpilih fill ink-900 (state, bukan warna brand) dan satu
  CTA primer teal — satu-satunya pemakaian brand accent di layar itu.
  Render: `design/shots/instrument-ledger-surfaces.png`.

### 18 Sep 2026 — Visual multi-source: Google Classroom + event manual

- File baru `design/mockups/instrument-ledger-multisource.html`: 4 board — home sumber
  campuran (BRONE + Classroom + event manual), sheet tambah event manual,
  settings daftar feed (status per feed termasuk error token), widget native
  Android dengan tag source.
- Keputusan: identitas source menempati slot kode mono yang sudah ada
  (`IF2040` / `GCLASS` / `LOCAL`) — bukan pill/warna baru; status per feed
  teks mono di settings; Classroom masuk sebagai feed .ics kedua via Google
  Calendar secret address (tanpa OAuth), custom event via local store —
  keduanya merge ke pipeline task yang sama (doneStore/schedulePlan tak berubah).
- Render: `design/shots/instrument-ledger-multisource.png` (headless Edge 1760×900).

### 18 Sep 2026 — Prototipe interaktif full app (mock data)

- File baru `design/mockups/instrument-ledger-interactive.html`: app mobile utuh yang bisa
  diklik — home (hero + time-rail + mark-done/restore + undo toast), sheet
  tambah event manual, settings (daftar feed + uji/hapus, chips ambang &
  interval, kelola event lokal), countdown live per detik, navigasi antar
  layar + Escape.
- Bug ditemukan saat verifikasi headless: helper `esc` kehilangan `}` penutup
  object literal → seluruh script inline mati (DOM kosong). Diperbaiki;
  verifikasi ulang via `node --check` + dump-dom (taskCount/hero/row/feed
  terisi) + screenshot.
- Render: `design/shots/instrument-ledger-interactive.png`.

### 19 Sep 2026 — Kontrol mark-done di setiap row (bukan hanya hero)

- Umpan balik user: task di bawah hero harus bisa ditindak juga, bukan cuma
  task terdekat.
- Row list dipecah jadi dua kontrol bersaudara: `.row-open` (badan row → buka
  tugas) + `.row-done` (ring 44px → mark-done dengan toast undo). Diterapkan di
  prototipe interaktif dan mockup statis `design/mockups/instrument-ledger-dark-only.html`
  (root preview); delegasi click existing (`data-done`/`data-open`) sudah
  menangani keduanya tanpa perubahan handler.
- Ring row sengaja netral (`ink-400`, hover → `ink-900`) supaya tidak menambah
  warna semantik aktif di layar (rule maks-2-warna tetap lolos).

### 19 Sep 2026 — Sheet FULL DESIGN (pasangan dark+light, states, semua permukaan)

- File `design/mockups/instrument-ledger-full-design.html`: 12 board satu lembar — app home
  dark & light (pasangan dibangun bersama, syarat D-Design-3), settings (feed
  list multi-sumber + chip tema Gelap/Terang), sheet tambah event manual,
  4 states wajib PRD #15-16 (loading skeleton, empty, error/offline + coba
  lagi, setup feed-belum-ada), desktop widget 360px dark & light, panel
  selesai expanded, widget native Android.
- Tema lewat scope class `.dk`/`.lt` pada CSS variables; token light diambil
  dari `TOKENS.md` (#F5F4F1 / #FFFFFF / #E4E2DD, teal #1F6F63, urgensi varian
  light), bukan ditebak.
- Verifikasi: headless Edge 1760×1780 → `design/shots/instrument-ledger-full-design.png`
  (176 KB); dump-dom: phone dk 3, phone lt 1, widget dk 1, widget lt 1, mini 5,
  awidget 1, chip-on 3 baris — sesuai isi sheet.

### 19 Sep 2026 — Implementasi slice 1: event manual lokal (kode app)

- Module murni baru `src/localEvents.js` (validasi/normalisasi input form,
  task ber-`source: 'local'`, merge feed+local sorted) + `test/localEvents.test.js`.
- `src/renderer.js`: seam merge di onUpdate (`state._feedTasks` +
  `withLocalTasks`), panel tambah/hapus event persist `localEvents` di
  settings.json via `settingsWrite`, tag `LOCAL` mono di slot phase row,
  re-merge saat `settings-changed`.
- `src/index.html`: icon-btn `+` (`btn-add-local`) + section `local-panel`
  (judul/tanggal/jam opsional, catatan error, daftar event + tombol hapus).
- `src/style.css`: style panel & input — kontrol ≥44px, radius 6, tanpa warna
  semantik baru (catatan error memakai `--danger` yang sudah ada).
- Keputusan terkunci: widget native Android tetap selalu gelap (kontras di
  wallpaper terang), varian terangnya tidak dibuat.

### 1 Okt 2026 — Catatan Teknis Deduplikasi Kalender BRONE Moodle (E1)

- Evaluasi terhadap entri ganda tugas (seperti kasus LK04b) menyimpulkan bahwa entri tersebut merupakan dua VEVENT resmi terpisah pada kalender akademik Moodle UB, masing-masing dengan UID dan URL penyerahan tugas (*submission link*) yang berbeda. Menghapus salah satunya melalui deduplikasi berbasis nama berisiko menghilangkan tautan pengumpulan tugas mahasiswa di LMS. Oleh karena itu, entri dipertahankan sesuai feed asli.

## 4. Backlog

- [ ] Perbaiki 3 temuan spacing Home (butuh persetujuan user).
- [x] Tandai (4× Home): boundary + teks ink-600 — selesai 17 Sep 2026.
- [x] Tap-to-undo "Selesai (1)": baris UndoRow 350×44 + Gap 6 dihapus —
      selesai 17 Sep 2026 (Home 606→629).
- [ ] Kontras: naikkan `urgency-soon` (3,29:1) dan `ink-400` (3,54:1) hingga
      lolos AA 4,5:1 untuk teks kecil — berlaku untuk teks dan TOKENS.md.
- [ ] Home: turunkan ke maks 2 warna semantik aktif (selaraskan dengan
      perlakuan Medium) atau catat pengecualian beralasan.
- [ ] Desain state pressed (Tandai), completed, dan pull-to-refresh running.
- [ ] Selaraskan `COM60051` → `COMB0051` di frame Home.
- [ ] Generate `tokens.json` (Tokens Studio) + `figma-plugin-code.ts` +
      handoff note dari `TOKENS.md` (bukan dari mockup varian B).
- [ ] Terapkan tabular-nums + font mono/sans asli saat implementasi kode
      (mockup terbatas Inter via bridge).
