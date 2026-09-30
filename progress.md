# Log Progres Workspace

File ini mencatat seluruh riwayat penataan, modifikasi, dan progres dalam workspace `coding`. Aturan: SELALU append (tambahkan di bawah), JANGAN PERNAH menimpa riwayat sebelumnya.

---

## [2026-09-04] Inisialisasi Penataan Direktori Menyeluruh
- **Status**: Memulai Fase Eksekusi Penataan Workspace
- **Rencana**: Berdasarkan `implementation_plan.md` yang telah disetujui.
- **Tujuan**: Merapikan struktur direktori, standardisasi penamaan (*kebab-case*), mengamankan riwayat pemulihan, dan menjaga integrasi tool / MCP server tanpa kehilangan data (*zero data loss*).

## [2026-09-04] Eksekusi Penataan Menyeluruh Selesai
- **Struktur Baru Diimplementasikan**:
  - `kuliah/`: Seluruh mata kuliah terstandarisasi ke *kebab-case*. Subfolder baru: `alin/`, `siskom/`, `tugas-kelompok/`. Konsolidasi `pemdas/` (`praktikum/`, `tugas/`, `latihan/`, `arsip-v1/`) dan `relan/` (`materi/`, `tugas/`). Riwayat `_recovery/` tetap terjaga utuh.
  - `competitive-programming/`: Folder diubah dari `Competitive Programming` menjadi kebab-case, seluruh 11 file C++ distandarisasi ke format kebab-case.
  - `database/`: Mengonsolidasikan model Workbench (`.mwb`), kueri SQL, diagram relasi Drawio (`diagrams/`), dan skrip ERD (`scripts/`).
  - `docs/`: Mengelompokkan seluruh diagram Drawio ke `architecture/` dan `flowcharts/`.
  - `scripts/`: Merapikan skrip menjadi `image-processing/`, `algorithms/`, dan `scratch/`. Kode latihan kuliah dialihkan ke mata kuliah yang relevan.
  - `project/web_projects/`: Menghilangkan spasi pada subfolder (`web-template`, `music-player`, `dump-react`, `meme-generator`, `weather-apps`, `tailwind`).
  - `_cleanup_staging/`: Menampung artefak build usang (`a.out`, file 0-byte, log build lama) secara aman untuk verifikasi pengguna sebelum dihapus.
  - `README.md`: Dibuat di root sebagai indeks dan katalog navigasi workspace.
- **Hasil Verifikasi**: Tidak ada file kode atau materi yang terhapus (Zero Data Loss). Seluruh git repository dan MCP server tetap valid dan aman.

## [2026-09-16] Perbaikan Environment Python & ModuleNotFoundError: No module named 'requests'
- **Masalah**: Eksekusi skrip `_cleanup_staging/test.py` via Python di `C:/Users/riski/AppData/Local/Python/bin/python.exe` (Python 3.14) menghasilkan `ModuleNotFoundError: No module named 'requests'`. Perintah `pip install requests` sebelumnya menginstal library ke Python 3.13 (`C:\Python313`) karena ketidaksesuaian interpreter default di PATH.
- **Tindakan**:
  - Menginvestigasi perbedaan interpreter aktif antara terminal PATH (Python 3.13) dan interpreter IDE (`C:/Users/riski/AppData/Local/Python/bin/python.exe` - Python 3.14).
  - Menginstal modul `requests` langsung ke environment interpreter target menggunakan `& "C:/Users/riski/AppData/Local/Python/bin/python.exe" -m pip install requests`.
- **Hasil Verifikasi**: Skrip `test.py` berhasil dijalankan tanpa error dan mengembalikan output unduhan dengan status sukses (Exit Code 0).

## [2026-09-16] Refaktor & Perapihan Kode `_cleanup_staging/test.py`
- **Tindakan**:
  - Merapikan struktur kode dan memperbaiki *syntax/line break* yang terputus pada deklarasi `def download(url):` dan fungsi `print(...)`.
  - Mengimplementasikan *multithreading* (`threading.Thread`) secara rapi sesuai standar PEP 8 (indentasi 4 spasi, konsistensi baris kosong, dan format list).
- **Hasil Verifikasi**: Skrip dieksekusi dan berjalan sukses, waktu download konkuren turun drastis dari ~9-13 detik menjadi ~3.61 detik.

## [2026-09-16] Konfigurasi Python Auto-Formatter (Alt + Shift + F & Format on Save)
- **Tindakan**:
  - Mengidentifikasi bahwa ekstensi formatter Python belum terpasang di VS Code meskipun setting `charliermarsh.ruff` telah ditulis di `.vscode/settings.json`.
  - Menginstal ekstensi resmi `charliermarsh.ruff` (Ruff) dan `ms-python.black-formatter` (Black) ke VS Code.
  - Memasang paket `black` ke environment interpreter Python 3.14 aktif.
  - Mengonfigurasi `.vscode/settings.json` dengan:
    - `"editor.defaultFormatter": "charliermarsh.ruff"` untuk bahasa Python.
    - `"editor.formatOnSave": true` untuk otomatis merapikan saat file disimpan (`Ctrl + S`).
    - Shortcut bawaan VS Code `Alt + Shift + F` kini langsung aktif memformat file Python secara instan.
- **Hasil Verifikasi**: Ekstensi dan konfigurasi berhasil terpasang dan aktif di workspace.

## [2026-09-29] Implementasi Desktop Floating Widget OpenCode Zen Limit Counter
- **Tujuan**: Membuat widget pemantau kuota limit model OpenCode Zen (Free Tier) yang tampil di desktop secara real-time untuk mencegah terputusnya sesi akibat error `HTTP 429: Rate limit exceeded`.
- **Komponen yang Dibuat**:
  - `project/opencode-zen-counter/zen_tracker.py`: Engine backend yang membaca transaksi model OpenCode secara *read-only* dari database SQLite lokal `opencode.db` (`%USERPROFILE%\.local\share\opencode\opencode.db`). Menghitung jumlah request hari ini (UTC), sisa kuota, persentase sisa, akumulasi token, dan sisa waktu menuju reset 00:00 UTC.
  - `project/opencode-zen-counter/zen_widget.py`: GUI desktop floating HUD modern berbasis Tkinter (dark mode, borderless/frameless, draggable, pin Always-on-Top, progress bar dinamis, dan dialog kustomisasi batas kuota).
  - `project/opencode-zen-counter/test_tracker.py`: Rangkaian pengujian unit test untuk verifikasi kalkulasi metrik, status threshold, countdown reset, dan parsing database.
  - `project/opencode-zen-counter/zen-counter.vbs` & `zen-counter.bat`: Launcher praktis untuk meluncurkan widget di desktop tanpa memunculkan jendela konsol hitam.
  - `project/opencode-zen-counter/README.md`: Panduan dokumentasi lengkap cara penggunaan dan konfigurasi widget.
- **Hasil Verifikasi**:
  - Seluruh 6 unit test di `test_tracker.py` lulus 100% (PASS).
  - Eksekusi engine terhadap database aktif berhasil mendeteksi dan menghitung kuota hari ini secara akurat.
  - Widget GUI berhasil diinisialisasi dan diuji render tanpa error.

## [2026-09-30] Zenith Portfolio — Task B1: Contact Form Reliability & Email Fallback
- **Branch**: `ux/gemini-fixes` di `project/web_projects/zenith`
- **Tujuan**: Mencegah silent failure pada form kontak transmission, menerapkan batas panjang input payload, masking internal error 500, penanganan missing API key (503 di production), serta fallback link direct mailto.
- **Komponen & File yang Diubah**:
  - `app/api/transmission/route.ts`:
    - Mengembalikan status `503` jika API key `WEB3FORMS_ACCESS_KEY` tidak disetel di lingkungan production.
    - Pada lingkungan development (tanpa key), logging hanya mencatat timestamp dan panjang pesan (tidak membocorkan data pribadi).
    - Menambahkan batas panjang karakter: nama <= 100, email <= 254, pesan <= 5000 (status `400`).
    - Menyembunyikan pesan error internal dalam blok catch menjadi status `500` generik yang aman.
  - `components/sections/Transmission.tsx`:
    - Menambahkan link email langsung "Prefer email? <siteConfig.socials.email>" di dekat form dan di dalam banner error transmisi dengan styling token `star` & pola focus ring aksesibel.
  - `__tests__/transmission-route.test.ts`:
    - Menambahkan pengujian vitest di environment node (missing key prod -> 503, bot honeypot -> 400, invalid email -> 400, mocked success -> 200 & fetch called once, mocked error -> 500 generik, batas payload).
- **Hasil Verifikasi**:
  - `npm test`: Seluruh 17 pengujian (10 UI tests + 7 route tests) lolos 100% (PASS).
  - `npm run build`: Build Next.js 15 berhasil tanpa error.
- **Commit**: `fix: contact form fails loudly, add email fallback and route tests` (e196dad)

## [2026-09-30] Zenith Portfolio — Task B2: Static About Text & Chat UI Accessibility
- **Branch**: `ux/gemini-fixes` di `project/web_projects/zenith`
- **Tujuan**: Menampilkan deskripsi About yang statis, crawlable, dan selalu terlihat di dalam HTML (tanpa JS/klik typewriter), menyelaraskan label peran menjadi 'Computer Engineering student', menyempurnakan persona dialog Zenith, dan mengoptimalkan pembaca layar (screen reader).
- **Komponen & File yang Diubah**:
  - `components/sections/MissionControl.tsx`:
    - Merender ringkasan statis "OPERATOR DOSSIER" dengan `PixelPanel` di atas dialog chat agar ramah SEO, crawlers, dan no-JS.
    - Menambahkan label panduan sebelum chat: "Prefer a conversation? Pick a topic:".
    - Mengubah sub-label pembicara dari "Rizky Mardhani · Engineer" menjadi "Rizky Mardhani · Computer Engineering student".
    - Menulis ulang dialog Zenith agar berbicara sebagai persona ship-computer / AI kokpit ("Zenith here — ...").
    - Menambahkan elemen `sr-only` dengan `aria-live="polite"` dan `aria-atomic="true"` untuk teks utuh pesan aktif, serta memberi atribut `aria-hidden="true"` pada tampilan teks beranimasi typewriter guna mencegah screen reader mengeja per karakter.
- **Hasil Verifikasi**:
  - `npm test`: Seluruh 17 test lulus 100% (PASS).
  - `npm run build`: Build Next.js 15 berhasil tanpa error.
- **Commit**: `ux: static about intro, honest role label, accessible chat text` (c542a55)

## [2026-09-30] Zenith Portfolio — Task B5: Hero & Profile Cleanup
- **Branch**: `ux/gemini-fixes` di `project/web_projects/zenith`
- **Tujuan**: Merapikan hirarki visual Hero agar lebih terstruktur dan jujur, menyematkan role statis di bawah H1, memindahkan badge arcade ke bawah CTA dengan visual sekunder, merefleksikan tingkat keahlian (Proficient, Familiar, Basic) secara realistis, menyembunyikan persentase angka mentah, dan menghapus status 'Online 🚀'.
- **Komponen & File yang Diubah**:
  - `components/sections/Hero.tsx`:
    - Merender `siteConfig.role` sebagai teks statis di bawah H1.
    - Menghapus role dari rotasi typewriter `PHRASES`, menambahkan `aria-hidden="true"` pada elemen typewriter.
    - Memindahkan badge "ARCADE READY: Play Void Miner →" ke bawah tombol CTA sebagai kontrol sekunder tanpa efek glow berlebih.
    - Menjaga urutan layout: headline -> role line -> CTAs -> arcade badge.
  - `components/sections/Constellation.tsx`:
    - Menyesuaikan level skill menjadi proporsional berdasarkan proyek aktif repo: Next.js & TypeScript (`Familiar`), PCB Design (`Basic`), Sensor Networks (`Familiar`), Linux (`Basic`), dsb.
    - Menghilangkan persentase angka ("Proficiency Telemetry 92%") dari UI dan menggantinya dengan label level (`Proficient`, `Familiar`, `Basic`).
  - `components/sections/FlightPath.tsx`:
    - Menghapus baris "Status: Online 🚀" dari kartu About Me.
- **Hasil Verifikasi**:
  - `npm test`: Seluruh 17 test lulus 100% (PASS).
  - `npm run build`: Build Next.js 15 berhasil tanpa error.
- **Commit**: `ux: hero role line, quieter arcade badge, honest skill levels` (3d359df)

## [2026-09-30] Zenith Portfolio — Task B4: Session Preloader & Skip Control
- **Branch**: `ux/gemini-fixes` di `project/web_projects/zenith`
- **Tujuan**: Memastikan preloader hanya muncul sekali per sesi peramban, mencegah flicker/flash bagi pengunjung berulang dengan pre-paint detection, menyediakan tombol "Skip" dan shortcut tombol Escape, mempercepat durasi boot menjadi <= 1.2 detik, dan mempertahankan preferensi reduced motion.
- **Komponen & File yang Diubah**:
  - `app/layout.tsx`:
    - Menambahkan script inline pre-paint di dalam `<head>` yang memeriksa `sessionStorage.getItem('zenith:boot-seen')` dan menyematkan atribut `data-boot-seen="true"` pada elemen `<html>`.
  - `app/globals.css`:
    - Menambahkan aturan CSS `html[data-boot-seen='true'] [data-preloader-overlay] { display: none !important; }` sehingga overlay disembunyikan seketika sebelum frame pertama digambar tanpa flash.
  - `components/layout/Preloader.tsx`:
    - Menambahkan tombol "Skip [Esc] →" yang dapat difokuskan keyboard (`aria-label="Skip intro"`).
    - Menambahkan event listener `Escape` untuk dismiss instan.
    - Menyimpan status sesi ke `sessionStorage.setItem('zenith:boot-seen', 'true')` dengan pembungkus `try/catch`.
    - Memangkas durasi animasi boot menjadi 1.1s (interval 200ms per baris log).
- **Hasil Verifikasi**:
  - `npm test`: Seluruh 17 test lulus 100% (PASS).
  - `npm run build`: Build Next.js 15 berhasil tanpa error.
- **Commit**: `ux: show boot screen once per session with skip control` (afc8cfb)

## [2026-09-30] Zenith Portfolio — Task B3: Modular MissionLog & Action Links
- **Branch**: `ux/gemini-fixes` di `project/web_projects/zenith`
- **Tujuan**: Memecah file raksasa `MissionLog.tsx` (~620 baris) menjadi subkomponen modular, menampilkan link aksi nyata ("Live" & "Repo") dengan tinggi sentuh minimal 44px, mengganti teks case study menjadi ghost button yang aksesibel, memisahkan proyek WIP (`comingSoon: true`) ke blok "Building now" tersendiri, dan memperbarui counter carousel / star-map dot indicator.
- **Komponen & File yang Diubah**:
  - `components/sections/mission-log/DetailPanel.tsx` (Baru):
    - Komponen modal detail proyek dengan layoutId, penutup Escape, penguncian scroll body, dan link aksi footer.
  - `components/sections/mission-log/StarMapIndicator.tsx` (Baru):
    - Indikator dot rute celestial interaktif untuk mobile carousel.
  - `components/sections/mission-log/MissionCard.tsx` (Baru):
    - Menampilkan tombol aksi "🚀 Live" dan "⚡ Repo" jika proyek memiliki link terkait (min-h-[44px]).
    - Mengganti teks `[ Read full case study → ]` menjadi ghost `PixelButton` "Case study →" ber-`aria-label`.
    - Menghapus teks redundan "⚡ Deployment in progress...".
  - `components/sections/MissionLog.tsx`:
    - Mengimpor komponen dari `mission-log/`.
    - Menyaring proyek yang sudah dirilis (`!comingSoon`) untuk carousel mobile & desktop grid.
    - Menambahkan blok section H3 "Building now" (IN ACTIVE DEVELOPMENT) di bawah grid utama yang menampilkan proyek WIP (`comingSoon: true`) secara kompak lengkap dengan badge "In progress", cuplikan deskripsi 2-baris, tag teknologi, dan pemicu buka DetailPanel.
- **Hasil Verifikasi**:
  - `npm test`: Seluruh 17 test lulus 100% (PASS).
  - `npm run build`: Build Next.js 15 berhasil tanpa error.
- **Commits**:
  - Commit 1: `refactor: split MissionLog into card, panel and indicator components` (61c25ef)
  - Commit 2: `ux: card action links, building-now strip` (3e47f63)

## [2026-09-30] Zenith Portfolio — Review Feedback & Pre-Merge Refinements
- **Branch**: `ux/gemini-fixes` di `project/web_projects/zenith`
- **Tujuan**: Memperbaiki skrip linting agar mengabaikan direktori `.netlify`, menambahkan `suppressHydrationWarning` pada tag `<html>` untuk mencegah peringatan hidrasi dari skrip inline preloader, memperbarui data level keahlian di `Constellation.tsx` agar selaras dengan rekam jejak portofolio asli, dan memverifikasi keberadaan teks About statis di HTML server.
- **Komponen & File yang Diubah**:
  - `eslint.config.js`:
    - Menambahkan `'.netlify'` ke dalam array konfigurasi `globalIgnores`. `npm run lint` kini berjalan cepat (~2s) tanpa error memory leak dari scanning cache build webpack.
  - `app/layout.tsx`:
    - Menambahkan atribut `suppressHydrationWarning` pada elemen `<html>` agar Next.js tidak memicu peringatan mismatch atribut saat atribut `data-boot-seen="true"` disematkan oleh inline pre-paint script.
  - `components/sections/Constellation.tsx`:
    - Mengoreksi rating keahlian sesuai bukti riil codebase:
      - `Next.js`: `'Proficient'` (levelScore: 88)
      - `TypeScript`: `'Proficient'` (levelScore: 88)
      - `PCB Schematic Design`: `'Familiar'` (levelScore: 78)
      - `Linux / Terminal`: `'Familiar'` (levelScore: 80)
- **Hasil Verifikasi**:
  - `npm run lint`: Berhasil 100% tanpa error (Exit Code 0).
  - `npm test`: 17/17 tests PASS (7 route tests, 10 component tests).
  - `npm run build:next`: Build Next.js 15 berhasil mengompilasi seluruh rute statis & SSG (Exit Code 0).
  - Prerender Verification: String "Computer Engineering student" terverifikasi ada langsung di dalam payload HTML server mentah (SSR/SSG) tanpa mengeksekusi JavaScript di client.
- **Commit**: `fix: ignore netlify in eslint, suppress html hydration warning, refine skill levels` (476bcff)

## [2026-09-30] Zenith Portfolio — Post-Review Audit Fixes & Accessibility Polish
- **Branch**: `ux/gemini-fixes` di `project/web_projects/zenith`
- **Tujuan**: Memperbaiki 5 temuan peninjauan: aksesibilitas keyboard kartu "Building now", mitigasi hidrasi mismatch dan penyesuaian durasi pada Preloader, eliminasi elemen interaktif bersarang (`<button>` di dalam `<a>`), penanganan payload JSON `null`/malformed dengan status 400, dan pembersihan pesan validasi.
- **Komponen & File yang Diubah**:
  - `components/sections/MissionLog.tsx`:
    - Mengganti wrapper kartu "Building now" dari `motion.div` menjadi `motion.button type="button"`.
    - Menambahkan `aria-label="View project details for [Title]"`, penanganan fokus keyboard native (Enter / Spasi), dan styling `focus-visible:ring-2` yang aksesibel.
  - `components/layout/Preloader.tsx`:
    - Menghilangkan fungsi lazy `sessionStorage` pada initial state `useState(true)` untuk menjamin sinkronisasi deterministik antara SSR dan hidrasi React klien (mencegah hydration mismatch).
    - Memangkas timer dismiss menjadi 900ms dan durasi progress bar menjadi 0.8s (total waktu boot ~1.15s, di bawah target 1.2 detik).
  - `components/ui/PixelButton.tsx`:
    - Mengekspor komponen baru `PixelLink` yang merender tag `<a>` semantik murni dengan token & styling pixel-frame button.
  - `components/sections/mission-log/MissionCard.tsx` & `components/sections/mission-log/DetailPanel.tsx`:
    - Mengganti pola bersarang `<a><PixelButton>` dan `<Link><PixelButton>` menjadi `<PixelLink>` dan styled `<Link>`. Menghilangkan nested interactive elements, memastikan 1 tab stop per link, dan menghilangkan pembacaan ganda oleh screen reader.
  - `app/api/transmission/route.ts`:
    - Membungkus parsing JSON dalam blok try/catch untuk menangani payload `null`, array, atau body tidak valid dengan status `400` yang tepat (sebelumnya memicu 500).
    - Mengubah teks validasi menjadi pesan langsung: "Name is required.", "Name must be 100 characters or fewer.", dan "Message must be at least 5 characters.".
  - `__tests__/transmission-route.test.ts` & `__tests__/components.test.tsx`:
    - Menambahkan test case untuk payload JSON `null` & array (`400`).
    - Menambahkan unit test untuk memverifikasi bahwa `PixelLink` merender elemen `<a>` tanpa elemen `<button>` bersarang di dalamnya.
- **Hasil Verifikasi**:
  - `npm run lint`: Lolos 100% tanpa error (Exit Code 0).
  - `npm test`: Seluruh 19 test lulus 100% (8 route tests, 11 component tests).
  - `npm run build:next`: Seluruh 16 rute berhasil dikompilasi secara statis & SSG (Exit Code 0).
- **Commit**: `fix(ux): keyboard building cards, preloader hydration, unnest button links, safe null body` (5499f9d)
- **Remote Push**: Berhasil di-push ke remote `origin/ux/gemini-fixes`.

## [2026-09-30] Zenith Portfolio — TASK C1: Eliminasi Seluruh Elemen Bersarang <a><PixelButton> / <Link><PixelButton>
- **Branch**: `ux/gemini-fixes` di `project/web_projects/zenith`
- **Tujuan**: Menghapus sisa pola nested `<button>` di dalam elemen tautan (`<a>` / `<Link>`) pada seluruh aplikasi untuk mengeliminasi dual tab stops pada keyboard dan pembacaan dobel oleh screen reader.
- **Komponen & File yang Diubah**:
  - `components/ui/PixelButton.tsx`:
    - Mengekstrak fungsi helper `pixelLinkClass(variant, extra?)` dan `pixelLinkStyle(variant)`.
    - Memperbarui `PixelLink` agar menggunakan helper tersebut tanpa merubah tampilan visual sama sekali.
  - `components/sections/Transmission.tsx`:
    - Mengganti tautan unduhan `<a><PixelButton>` pada tombol "Download CV" menjadi `<PixelLink>` langsung dengan mempertahankan atribut `href`, `download`, serta ikon `<span aria-hidden="true">📄</span>`.
  - `app/projects/[slug]/page.tsx`:
    - Mengganti tautan eksternal `<a><PixelButton>` pada "Visit Live Site →" menjadi `<PixelLink>` dengan mempertahankan atribut `target="_blank"` dan `rel="noopener noreferrer"`.
  - `app/not-found.tsx`:
    - Mengganti `<Link><PixelButton>` pada tombol "Return to Base" menjadi `<Link>` Next.js langsung dengan atribut `className={pixelLinkClass('comet')}` dan `style={pixelLinkStyle('comet')}`.
  - `app/arcade/page.tsx`:
    - Mengganti `<Link><PixelButton>` pada tombol "← Return to Mission Base" menjadi `<Link>` Next.js langsung dengan `className={pixelLinkClass('comet', ...)}` dan `style={pixelLinkStyle('comet')}`.
  - `components/sections/mission-log/DetailPanel.tsx`:
    - Mengganti class dan style inline manual pada tautan internal `<Link>` ("📄 Details") menjadi helper `className={pixelLinkClass('ghost', ...)}` dan `style={pixelLinkStyle('ghost')}` dengan tinggi sentuh minimum 44px.
  - `__tests__/components.test.tsx`:
    - Menambahkan unit test baru untuk memastikan tautan tombol Next.js `<Link>` yang distyling dengan `pixelLinkClass` dan `pixelLinkStyle` tidak menghasilkan elemen `<button>` bersarang di dalam `<a>`.
- **Hasil Verifikasi**:
  - `git grep -n -B2 "<PixelButton" app components | grep -E "<a |<Link"`: 0 hasil (tidak ada sisa `<PixelButton>` di dalam tautan).
  - `npm test`: Seluruh 20 test lulus 100% (8 route tests, 12 component tests).
  - `npm run lint`: Bersih 100% dengan 0 errors / 0 warnings.
  - `npm run build:next`: 16/16 rute berhasil dikompilasi secara statis & SSG.
  - Verifikasi Tampilan: **Tidak ada perubahan tampilan** sama sekali (pixel frame, warna, padding, tipografi, dan state hover/pressable 100% identik).
- **Commit**: `fix(a11y): remove remaining nested link/button patterns` (30f2e0d)
- **Remote Push**: Berhasil di-push ke remote `origin/ux/gemini-fixes`.

## [2026-09-30] Zenith Portfolio — Pull Request #1 & Merge ke Main
- **PR**: https://github.com/Zxaviers/zenith/pull/1
- **Target**: `main` <- `ux/gemini-fixes`
- **CI Status**:
  - `GitGuardian Security Checks`: PASS
  - `lint-test-build`: PASS (54s)
- **Status Merge**: BERHASIL DIMERGE ke `main` (commit `f2e29ea`).
## [2026-09-30] Zenith Portfolio — Streamline Navbar (Hapus Item Arcade)
- **Branch**: `feat/navbar-more-and-skill-tuning` di `project/web_projects/zenith`
- **Tujuan**: Menyederhanakan navigasi navbar desktop dan mobile dengan menghapus item `Arcade` agar navbar lebih ringkas dan proporsional (7 item), dengan tetap mempertahankan `Devlog` di navbar serta `Arcade` di badge Hero dan footer/kartu referensi.
- **Komponen & File yang Diubah**:
  - `components/layout/Navbar.tsx`:
    - Menghapus item `{ type: 'route', label: 'Arcade', href: '/arcade', ... }` dari array `NAV_ITEMS`.
    - Membersihkan percabangan `isArcade` pada renderer tautan desktop dan drawer mobile.
    - Memastikan *scroll-spy* (`IntersectionObserver`) dan pelacakan `activeSection` pada `section[id]` tetap berjalan normal dan akurat.
- **Hasil Verifikasi**:
  - `npm test`: Seluruh 20 test lulus 100% (8 route tests, 12 component tests).
  - `npm run lint`: Bersih 100% dengan 0 error / 0 warning.
  - `npm run build:next`: 16/16 rute berhasil dikompilasi secara statis & SSG (Exit Code 0).
- **Commit**: `ux(nav): remove Arcade from navbar to streamline navigation` (0476faf)
- **Remote Push**: Berhasil di-push ke remote `origin/feat/navbar-more-and-skill-tuning`.

## [2026-09-30] Zenith Portfolio — TASK C2: Finalisasi Level Skill (Constellation)
- **Branch**: `feat/navbar-more-and-skill-tuning` di `project/web_projects/zenith`
- **Tujuan**: Menyelaraskan tingkat keahlian (*skill levels*) pada komponen `Constellation.tsx` sesuai distribusi final (9 Proficient, 6 Familiar, 1 Basic) tanpa mengubah posisi, links, maupun styling starchart.
- **Komponen & File yang Diubah**:
  - `components/sections/Constellation.tsx`:
    - Entry `vscode` (`VS Code & Antigravity`): `level` diubah dari `'Proficient'` menjadi `'Familiar'`, `levelScore` diubah dari `92` menjadi `80`.
    - Entry `vite` (`Vite & Build Tools`): `level` diubah dari `'Familiar'` menjadi `'Basic'`, `levelScore` diubah dari `78` menjadi `65`, dan deskripsi diganti menjadi `'Bundling and dev-server fundamentals: modules, HMR, and PostCSS setup.'`.
    - 14 skill lainnya, koordinat x/y, link rute celestial, `LEVEL_SIZE`, dan `LEVEL_BADGE` dipertahankan utuh tanpa perubahan.
- **Hasil Verifikasi**:
  - Distribusi Skill: Tepat 9 Proficient, 6 Familiar, 1 Basic terverifikasi via query counter.
  - `npm test`: Seluruh 20 test lulus 100% (8 route tests, 12 component tests).
  - `npm run lint`: Bersih 100% dengan 0 error / 0 warning.
  - `npm run build:next`: 16/16 rute berhasil dikompilasi secara statis & SSG (Exit Code 0).
- **Commit**: `content: finalize skill levels (vscode Familiar, vite Basic)` (e22b49c)
- **Remote Push**: Berhasil di-push ke remote `origin/feat/navbar-more-and-skill-tuning`.

## [2026-09-30] Zenith Portfolio — Pull Request #2 & Merge ke Main
- **PR**: https://github.com/Zxaviers/zenith/pull/2
- **Judul**: `ux: simplify navbar and finalize skill levels`
- **Target**: `main` <- `feat/navbar-more-and-skill-tuning`
- **CI Status**:
  - `GitGuardian Security Checks`: PASS (1s)
  - `lint-test-build`: PASS (42s)
- **Status Merge**: BERHASIL DIMERGE ke `main` via `gh pr merge --merge`.

## [2026-09-30] Zenith Portfolio — TASK V1: Diagnosis & Perbaikan Deployment Vercel
- **Project**: `zxaviers-projects/zxaviers` (Hobby) | Domain: `zenithcode.my.id`
- **Akar Masalah (Root Cause)**:
  - Project Vercel `zxaviers` sebelumnya terhubung ke repository profil GitHub `Zxaviers/Zxaviers` (Repo ID `1089663507`), bukan repository portofolio `Zxaviers/zenith` (Repo ID `1333050496`).
  - Akibatnya, commit lama pada repository `Zxaviers/Zxaviers` gagal karena ketiadaan Next.js (`No Next.js version detected`), sedangkan push terbaru ke `Zxaviers/zenith` (`6d6b217`, `f2e29ea`, `9ebbb86`) tidak pernah memicu webhook build di Vercel.
- **Tindakan Perbaikan (Fix)**:
  - Menghubungkan ulang (*reconnect*) project Vercel `zxaviers` ke `https://github.com/Zxaviers/zenith` dengan Production Branch `main` via `vercel git connect`.
  - Memicu deployment Production resmi melalui commit kosong `chore: trigger vercel deploy` (`a39dd86`) yang di-push ke `origin main`.
- **Hasil Deployment Vercel**:
  - Deployment ID: `dpl_DN2pwtJNgQt9YPKzppRX17aN5Dji` (`https://zxaviers-bm5mglify-zxaviers-projects.vercel.app`)
  - Status: **● Ready (Production)** dalam durasi 52s (seluruh 16 halaman SSG/statis sukses dikompilasi).
  - Aliases Otomatis Aktif: `zenithcode.my.id`, `www.zenithcode.my.id`, `zxaviers.vercel.app`.
- **Hasil Verifikasi Live Site (`https://www.zenithcode.my.id/`)**:
  - `curl -s https://www.zenithcode.my.id/ | grep -c "Kemudikan"` $\rightarrow$ **0** (PASS).
  - `curl -s https://www.zenithcode.my.id/ | grep -o "Building now"` $\rightarrow$ **Muncul** (PASS).
  - `curl -s https://www.zenithcode.my.id/ | grep -o "Computer Engineering student"` $\rightarrow$ **Muncul** (PASS).
  - Verifikasi Navigasi: Tautan `Arcade` **tidak ada** di `<nav>`, tautan `Devlog` **muncul** dan aktif (PASS).


## [2026-10-01] Pengambilan Screenshot Audit 2.0 Build v8 (Commit `b455aef`)
- **Tujuan**: Menghasilkan artefak screenshot build v8 resmi untuk audit UI/UX, mencakup 6 file wajib dan file tambahan, disimpan di folder `Audit 2.0/`.
- **Rincian Screenshot Build v8 (`b455aef`)**:
  1. `01-home-gelap-b455aef.png`: Home tema gelap dengan status bar terlihat jelas, hero urgency, dan ledger task list (A1, C2, C3, C4, C8, N1).
  2. `02-home-terang-b455aef.png`: Home tema terang dengan kontras WCAG AA terpenuhi (C2, C3, C4, C8, N1).
  3. `03-settings-atas-gelap-b455aef.png`: Pengaturan tema gelap bagian atas (kartu Hubungkan dan Sumber feed) (A1, C1, C5, N2, N4).
  4. `04-settings-kontrol-gelap-b455aef.png`: Pengaturan digulir ke chips ambang, interval refresh, slider opasitas, dan checkbox (F1, N3, N5). Kartu desktop tersembunyi rapi di Android.
  5. `05-sheet-gelap-b455aef.png`: Bottom sheet tambah event manual lokal dengan keyboard tertutup dan tombol aksi Batal/Simpan teal (A1, B2, C9).
  6. `06-widget-b455aef.png`: Android home widget dengan status bar terlihat, waktu 104dp tanpa terpotong, overdue < 1 jam ("Terlewat 36mnt"), dan fixture 7 baris yang memicu baris terpotong secara natural (D1, D2, A3, A7, B7, C7).
  7. `07-settings-atas-terang-b455aef.png`: Tambahan settings atas tema terang.
  8. `08-settings-kontrol-terang-b455aef.png`: Tambahan settings kontrol tema terang (verifikasi checkbox teal & slider).
  9. `09-tugas-selesai-terbuka-b455aef.png`: Tambahan panel "3 tugas selesai" dalam keadaan terbuka dengan aksi pemulihan (*restore*) per task (B3).
- **Lokasi Penyimpanan**:
  - `c:\Users\riski\Downloads\Desktop\coding\Audit 2.0\`
  - `c:\Users\riski\Downloads\Desktop\coding\project\reminder-widget-v2\Audit 2.0\`
  - `c:\Users\riski\Downloads\Desktop\coding\project\reminder-widget-v2\docs\audit\2.0\`
  - `c:\Users\riski\Downloads\Desktop\coding\project\reminder-widget-v2\docs\audit\Audit 2.0\`
- **Metode Pengambilan**: Menggunakan `screencap -p /sdcard/<file>.png` lalu `adb pull` secara presisi tanpa streaming pipe.

## [2026-10-01] Penyelesaian Evaluasi Lulus Penuh Audit 2.0 (Commit `b455aef`)
- **Tujuan**: Menuntaskan semua butir evaluasi lanjutan Audit 2.0 (N1, N2, N3, N4, A1, A4, A7, B3, B5, C1-C5, C9, D1, E1) dan memperbarui tangkapan layar `09-tugas-selesai-b455aef.png` dan `06-widget-b455aef.png`.
- **Hasil Perbaikan & Verifikasi**:
  1. **N1 & A1 (Status Bar Sinkron Tema Terang)**: Ikon status bar (jam, wifi, seluler, baterai) kini terbukti hitam pekat (>15:1) pada semua layar mode terang, termasuk pada saat accordion tugas selesai dibuka (`09-tugas-selesai-b455aef.png`). Tidak ada lagi desinkronisasi warna ikon status bar.
  2. **B3 & B5 (Kolom Judul Tugas Selesai & Ukuran Ikon)**: Pada panel tugas selesai, judul tugas berada pada kolom sejajar sempurna dengan baris aktif (x=352), menggunakan bobot font reguler (400), dengan teks coret dan tombol restore di batas kanan layar.
  3. **A7, D1, D2 (Widget Homescreen Android 6 Baris Tanpa Footer)**: Widget Android di homescreen kini menampilkan minimal 6 item (1 hero + 5 baris daftar) secara simultan, scrollable lancar hingga tugas ke-7 ("29 hari lagi"), footer teks "Ketuk untuk buka aplikasi" telah dihapus sepenuhnya dari layout XML, dan tidak ada baris terpotong di tepi bawah.
  4. **N2 (Pembersihan Marker v8)**: Judul bottom sheet bersih tanpa embel-embel " · v8".
  5. **N3 (Khusus Desktop Tersembunyi)**: Bagian kartu khusus desktop dan opsi non-mobile tersembunyi total pada perangkat Android.
  6. **N4 (Format Satuan Waktu Hari)**: Format waktu overdue pada hero dan list dieja konsisten ("hari", misal "Terlewat 2 hari"), menghindarkan kebingungan dengan "hr" (hour).
  7. **E1 (Catatan Teknis Deduplikasi Kalender BRONE Moodle)**: Entri ganda tugas (seperti LK04b) merupakan dua VEVENT resmi terpisah di kalender akademik Moodle UB dengan UID dan URL penyerahan tugas (*submission link*) yang berbeda. Menghapus salah satunya via deduplikasi nama berisiko menghilangkan tautan pengumpulan tugas mahasiswa di LMS.
- **Lokasi Artefak Terverifikasi**:
  - `c:\Users\riski\Downloads\Desktop\coding\Audit 2.0\`
  - `c:\Users\riski\Downloads\Desktop\coding\project\reminder-widget-v2\Audit 2.0\`





