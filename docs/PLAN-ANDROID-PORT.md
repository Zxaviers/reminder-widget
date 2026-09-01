# Plan Lengkap: Port BRONE Reminder Widget ke Android (Tauri 2)

> **Status: DRAFT — BELUM DIEKSEKUSI.** Dokumen ini hanya rencana. Tidak ada
> instalasi, perubahan kode, atau build yang dijalankan sampai disetujui.
>
> Disusun 2026-09-01 dari audit langsung codebase `reminder-widget-v2`
> (9 modul Rust, 14 file frontend vanilla JS, capabilities, CI, test suite)
> + matrix dukungan mobile plugin resmi Tauri (plugins-workspace, per
> commit Aug 2026) + cek toolchain live di mesin ini.

---

## 0. Ringkasan Eksekutif

**Verdict: LAYAK — jalur pendek.** Arsitektur v2 (Tauri) sudah 80% siap mobile.
Inti pekerjaan: pasang toolchain Android (1 jam), cfg-gate modul desktop-only
(3–6 jam), build APK (1–2 jam), lalu wiring perilaku mobile: permission
notifikasi + **notifikasi terjadwal** sebagai pengganti konsep "widget selalu
menyala" (2–4 jam). **Total estimasi 1–2 hari kerja.**

Prinsip pengaman di seluruh plan: **zero perubahan perilaku desktop** — semua
perbedaan platform di balik `#[cfg]` / deteksi runtime; CI desktop
(`npm test` + `cargo clippy -D warnings` + build nsis) wajib tetap hijau di
setiap langkah.

**UX Android yang dipilih:** aplikasi normal (bukan overlay widget) — buka app
→ lihat daftar deadline → tutup. Pengingat tetap hidup **walau app ditutup**
karena dijadwalkan ke sistem (AlarmManager via `Schedule.at()` plugin
notification). Ini pergeseran model mental dari desktop, dan itu OK: di HP,
"notifikasi tepat waktu" lebih bernilai daripada "jendela selalu terlihat".

---

## 1. Audit Kondisi Saat Ini (terverifikasi, bukan asumsi)

### 1.1 Yang sudah mobile-ready (tidak perlu disentuh)

| Item | Bukti |
|---|---|
| Entry point mobile | `#[cfg_attr(mobile, tauri::mobile_entry_point)]` sudah ada di lib.rs |
| Bridge IPC frontend | `window.__TAURI__.core.invoke` + `withGlobalTauri: true` — jalan apa adanya di Android WebView |
| Fetch feed .ics | lewat `window.__TAURI__.http.fetch` (plugin-http, bypass CORS) — **✅ Android** |
| Cache feed | `localStorage` di webview — jalan di Android |
| Logic inti | `parseTasks.js`, `doneStore.js`, `notifyConfig.js`, `submissionQueue.js` — JS murni, zero porting; sudah ada 4 file test (`node --test`) |
| Settings store | `settings.rs` → `app_config_dir()` — otomatis map ke direktori privat app di Android |
| Buka link tugas | `open_external` (plugin-opener) — **✅ Android** |
| Clipboard paste URL | `clipboard-manager` — **✅ Android**; UI settings sudah punya tombol paste + field manual + tombol "Test Koneksi" |
| Jendela widget | dibuat programatik (`app.windows: []`), label `"widget"` — label bisa dipertahankan di mobile |
| Feed tanpa login | URL ber-authtoken bersifat portable — login BRONE hanyalah *cara mendapatkan URL*; di HP cukup paste URL dari desktop |

### 1.2 Yang desktop-only / harus digate (terverifikasi ❌ mobile)

| Item | Lokasi | Aksi |
|---|---|---|
| plugin-single-instance | lib.rs builder | `#[cfg(desktop)]` — ❌ Android |
| plugin-autostart | lib.rs builder + `autostart_get/set` | cfg-gate init; command jadi stub `false` di mobile |
| tray icon | `tray.rs` + `tray::create()` di setup | `#[cfg(desktop)]` modul + call |
| Guard thread pin-wallpaper | lib.rs setup (loop 4 dtk) | `#[cfg(desktop)]` |
| `win32.rs` (send_to_bottom, tool window) | sudah `#[cfg(windows)]` | aman, tak perlu ubah |
| `brone_login.rs` (hidden webview + polling `document.title`) | modul + command `auth_brone_login` | cfg(desktop) modul; command tetap terdaftar, body mobile → `Err("Login BRONE hanya di desktop; di HP gunakan paste URL")` |
| `detect.rs` (auto-detect submission via hidden webview) | modul + command `submission_check` | sama: cfg(desktop) modul, command mobile → no-op `Ok(())` |
| `keyring` crate (`windows-native`) → Credential Manager | `secret.rs` | **swap backend di mobile** → file JSON di `app_config_dir()` (sandbox per-app Android; lihat §5.4) |
| Cargo feature `tray-icon`, `image-png` | `[dependencies] tauri` | pindah ke `[target.'cfg(desktop)'.dependencies]` |
| Jendela always-on-top / skip-taskbar / bounds | `create_widget`, `apply_display_mode` | mobile: window normal fullscreen (lihat §5.5) |
| Jendela settings sebagai window kedua | `open_settings` (`WebviewWindowBuilder`) | mobile: navigasi dalam satu window (`location.href`) — multi-window di Android rapuh (lihat §5.6) |

### 1.3 Toolchain saat ini (cek live 2026-09-01)

| Komponen | Status | Kebutuhan |
|---|---|---|
| Rust / cargo 1.95.0 | ✅ ada | ≥1.77.2 terpenuhi |
| tauri-cli 2.11.4 (via npx) | ✅ ada | cukup |
| Node + npm | ✅ ada | — |
| JDK | ❌ cuma Java 8 (`1.8.0_471`) | **wajib JDK 17** (Gradle/AGP modern menolak Java 8; komunitas Tauri: JDK 17 atau 21) |
| Android SDK / NDK | ❌ `ANDROID_HOME` kosong | SDK + NDK + platform-tools |
| Rust targets Android | ❌ belum | 4 target ABI |

---

## 2. Matrix Dukungan Plugin (sumber: plugins-workspace resmi, Aug 2026)

| Plugin di project | Win | Android | Konsekuensi |
|---|---|---|---|
| http | ✅ | ✅ | feed .ics jalan |
| notification | ✅ | ✅ (+ `Schedule.at/every`) | notifikasi terjadwal **didukung** → fondasi Fase 3 |
| clipboard-manager | ✅ | ✅ | paste URL jalan |
| opener | ✅ | ✅ | buka link tugas jalan |
| autostart | ✅ | ❌ | cfg-gate (tak relevan di HP) |
| single-instance | ✅ | ❌ | cfg-gate (redundan di HP) |

---

## 3. Keputusan Desain

| # | Keputusan | Alasan |
|---|---|---|
| D1 | Mobile = app normal satu window, label tetap `"widget"` | Semua `get_webview_window("widget")` yang ada tetap valid; perilaku show/hide tetap masuk akal (background/foreground app) |
| D2 | Settings di mobile = **navigasi** (`location.href='settings.html'`), bukan window kedua | Multi-WebviewWindow di Android tidak se-andal desktop; navigasi + tombol back lebih native |
| D3 | Login BRONE (webview assist) dimatikan di mobile; alur HP = paste URL feed | Hidden-webview + polling `document.title` rapuh di Android; URL feed sendiri portable (bisa dikirim dari desktop via clipboard/share) |
| D4 | Secret store mobile = file JSON di `app_config_dir()` | `keyring` tidak support Android; sandbox per-app Android sudah private; upgrade enkripsi-at-rest dicatat sebagai backlog, bukan blocker |
| D5 | Pengingat mobile = **scheduled notifications** (H-24/H-6/H-1 sesuai `notifyConfig`) yang dijadwalkan ulang tiap refresh feed | Mengganti "app selalu nyala" — notif statis tetap bunyi walau app ditutup (AlarmManager). Deadline Moodle hampir statis; drift kecil ditambal reschedule saat app dibuka |
| D6 | Semua gate pakai `#[cfg(desktop)]`/`#[cfg(mobile)]`/`#[cfg(windows)]` + deteksi runtime via command `platform()` | Desktop build tidak boleh berubah sama sekali |
| D7 | `gen/android` di-commit | Tauri merekomendasikan commit gen dir agar build reproducible |
| D8 | Deteksi otomatis submission (`detect.rs`) tidak dibawa ke mobile v1 | Hidden webview per-task di Android = risiko tinggi, nilai rendah |

---

## 4. FASE 0 — Toolchain (sekali jalan; ±1 jam, mayoritas download)

> Jalankan sebagai user biasa (tidak perlu admin kecuali winget meminta).
> Semua env var **user-level** (`setx`), bukan system.

### Langkah (copy-paste ready)

```bash
# 1. JDK 17
winget install --id Microsoft.OpenJDK.17 -e
# lalu set JAVA_HOME ke path hasil install, contoh:
#   C:\Program Files\Microsoft\jdk-17.0.15.6-hotspot
setx JAVA_HOME "C:\Program Files\Microsoft\jdk-17.0.15.6-hotspot"

# 2. Android cmdline-tools (tanpa Android Studio)
#    unduh dari https://developer.android.com/studio#command-line-tools-only
#    (commandlinetools-win-<build>_latest.zip) lalu ekstrak ke:
#    %LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest   (isi = bin/, lib/, ...)
SDK="$LOCALAPPDATA/Android/Sdk"
mkdir -p "$SDK/cmdline-tools"
# (ekstrak zip sehingga struktur: cmdline-tools\latest\bin\sdkmanager.bat)

# 3. Komponen SDK (jawab y untuk semua license)
SDKM="$SDK/cmdline-tools/latest/bin/sdkmanager.bat"
yes | "$SDKM" --licenses
"$SDKM" "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.3.13750724"

# 4. Env var permanen
setx ANDROID_HOME "$SDK"            # tulis path Windows-style
setx NDK_HOME "$SDK\ndk\27.3.13750724"

# 5. Rust targets Android
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

### Gerbang verifikasi Fase 0 (semua harus lulus sebelum Fase 1)

```bash
java -version                 # harus 17.x (bukan 1.8)
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager.bat --list_installed"
#   ^ platform-tools, android-36, build-tools, ndk terlihat
rustup target list --installed # 4 target android ada
npx tauri info                 # bagian "Android development" hijau/terdeteksi
```

**Catatan versi:** pasangan versi di atas (NDK 27.3 / android-36 / build-tools 36 /
JDK 17) mengikuti panduan setup Tauri-Android komunitas 2026 yang terbukti
jalan; jika `tauri android init` kelak menuntut versi lain, ikuti pesannya.

---

## 5. FASE 1 — Portabilitas Kode (3–6 jam; desktop wajib tetap hijau)

> Dikerjakan di branch `feat/android-port`. Setiap sub-langkah diakhiri gate:
> `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` + `npm test`.

### 5.1 `src-tauri/Cargo.toml` — dua lapis perbaikan ( hasil eksperimen cargo-cfg 2026-09-01 )

> **Temuan eksperimen** (repro: folder temp `cargo-cfg-test` a/b/c):
> 1. **`[target.'cfg(desktop)'.dependencies]` SILENTLY TIDAK MATCH** — Cargo
>    mengenali manifest tanpa error, tapi section di-skip: `cfg(desktop)`/
>    `cfg(mobile)` adalah alias yang di-inject **tauri-build** (source
>    `tauri-build-2.6.3/src/lib.rs:476-477` — `cfg_alias("desktop", !mobile)`
>    via `cargo:rustc-cfg=`) ke compiler RUST **setelah** dependency resolution;
>    Cargo manifest selector hanya mengenali cfg `target_os`/`target_vendor`/
>    dsb. Jadi plan lama §5.1 (draft v1) tidak akan pernah mengaktifkan
>    tray-icon di desktop manapun — bug plan, bukan sekadar gaya.
> 2. **Duplikasi base + target-section TIDAK ditolak** — cargo menggabungkan
>    secara additif per-platform (verifikasi: `cargo tree -f '{p} <{f}>'`:
>    Windows → `serde <derive,serde_derive>`, Android → `serde <>`). Ini pola
>    yang sama dengan yang dipakai dokumentasi resmi Tauri untuk plugin
>    desktop-only (`cargo add tauri-plugin-single-instance --target 'cfg(any(target_os = "macos", windows, target_os = "linux"))'`).
>    **Syarat:** deklarasi base dulu (default-features konsisten), lalu
>    target-section hanya MENAMBAH. Versions harus identik di keduanya.

**Perubahan konkret:**

```toml
# SEBELUM (saat ini, di repo):
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
keyring = { version = "3", features = ["windows-native"] }

# SESUDAH:
[dependencies]
tauri = { version = "2", features = [] }          # base tanpa tray-icon/image-png

[target.'cfg(any(windows, target_os = "macos", target_os = "linux"))'.dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }   # merge additif

[target.'cfg(windows)'.dependencies]
keyring = { version = "3", features = ["windows-native"] }        # tidak berubah jalurnya
# (dep `windows` yang sudah cfg(windows) tetap; keyring non-Windows → file store §5.4)
```

**Aturan main yang ditetapkan dari eksperimen:**
- Base+target duplication diterima Cargo dengan **merge additif per-platform** (bukan ditolak) — asalkan versi identik dan `default-features` konsisten di kedua deklarasi.
- Enumerasi eksplisit OS desktop (windows/macos/linux) > alias `cfg(desktop)` di manifest — alias itu hanya valid di kode Rust (`#[cfg(desktop)]`), di-inject tauri-build, dan terbukti tidak dikenal selector manifest Cargo.
- Verification gate Fase 1 langkah pertama (wajib hijau sebelum lanjut ke §5.2):
  ```bash
  # (grep 'tauri v' tidak selalu match — baris tree diawali └──; pakai pola bebas-prefix)
  cargo tree -f '{p} <{f}>' --target x86_64-pc-windows-msvc | grep 'tauri v'   # HARUS memuat <..., tray-icon, image-png, ...>
  cargo tree -f '{p} <{f}>' --target aarch64-linux-android | grep 'tauri v'   # TIDAK boleh memuat tray-icon/image-png
  cargo check --manifest-path src-tauri/Cargo.toml                             # manifest valid + compiles
  cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings             # desktop code path
  ```

### 5.2 `src-tauri/src/lib.rs`

1. Module gates:
   ```rust
   #[cfg(desktop)] mod brone_login;   // + cfg(desktop) mod detect;
   #[cfg(desktop)] mod tray;
   #[cfg(windows)]  mod win32;        // sudah ada, tetap
   ```
2. Builder chain — pecah agar plugin desktop bisa digate:
   ```rust
   let builder = tauri::Builder::default()
       .plugin(tauri_plugin_opener::init())
       .plugin(tauri_plugin_notification::init())
       .plugin(tauri_plugin_http::init())
       .plugin(tauri_plugin_clipboard_manager::init())
       .invoke_handler(...);  // daftar command TIDAK berubah
   #[cfg(desktop)]
   let builder = builder
       .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
       .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
           show_widget(app);
       }));
   ```
3. `setup()`:
   - `tray::create(&handle)?` → bungkus `#[cfg(desktop)]`
   - guard thread pin-wallpaper → `#[cfg(desktop)]`
   - `create_widget(&handle)` → tetap dipanggil di mobile, tapi lihat §5.5
   - first-run buka settings: desktop → window; mobile → emit event
     `navigate` yang didengar renderer (`location.href='settings.html'`)
4. `on_window_event`: handler aman di mobile (`set_always_on_top` dsb.
   sudah di-ignore dengan `let _`); tambahkan `#[cfg(windows)]` pada blok
   win32 saja (sudah ada). Tidak ada perubahan perilaku desktop.

### 5.3 `src-tauri/src/commands.rs`

- `autostart_get` / `autostart_set`:
  ```rust
  #[tauri::command]
  pub fn autostart_get() -> bool { #[cfg(mobile)] { false } #[cfg(desktop)] { ...asli... } }
  ```
  (pola body-cfg; tanda tangan stabil supaya `generate_handler!` tak berubah)
- `auth_brone_login`:
  - `#[cfg(desktop)]` → `crate::brone_login::start(...)` (asli)
  - `#[cfg(mobile)]` → `Err("Login terbantu hanya di desktop. Di HP: buka widget di PC → Settings → copy feed URL, lalu paste di sini.")`
- `submission_check`:
  - `#[cfg(desktop)]` → `crate::detect::run_check(...)`
  - `#[cfg(mobile)]` → `Ok(())` (no-op; UI auto-detect disembunyikan di mobile §5.7)
- `open_config_folder` → mobile: no-op (tombol disembunyikan)
- `window_metrics` / `widget_autosize` / `reset_position` → aman dibiarkan
  (di Android resize window adalah no-op yang di-ignore; tidak crash)
- **Baru:** `platform() -> String` → `"mobile" | "desktop"` via `#[cfg]`
  (dasar branching UI frontend; lebih murah dari menambah plugin-os)
- **Baru:** `schedule_notify(task_id, title, body, at_ms_epoch)` → lihat §7.2
- `notify` yang lama tetap (dipakai desktop + in-app instant di mobile)

### 5.4 `src-tauri/src/secret.rs`

Interface `get/set/clear` **tidak berubah** (pemanggil di commands.rs bebas
diubah). Backend per platform:

```rust
// struktur file (windows): persis seperti sekarang (keyring)
#[cfg(windows)] mod imp { /* keyring — kode asli dipindah ke sini */ }

// mobile + non-windows desktop fallback: file feed-url.json di app_config_dir
#[cfg(not(windows))] mod imp {
    // path: app_config_dir()/secret.json  {"url": "..."}  (atomic write tmp+rename)
    // catatan risiko di D4: sandbox per-app; enkripsi at-rest = backlog
}
pub fn get() -> Result<Option<String>, String> { imp::get() }
// dst untuk set/clear
```

(Non-windows desktop juga dapat file-store — bonus portabilitas Linux/macOS,
tanpa menyentuh jalur Windows yang ada.)

### 5.5 `create_widget` — cabang mobile

```rust
let win = WebviewWindowBuilder::new(app, WIDGET_LABEL, WebviewUrl::App("index.html".into()))
    #[cfg(desktop)] { ...seluruh config frameless/bounds/always_on_top/skip_taskbar... }
    #[cfg(mobile)] { /* default: window normal; tidak set geometry desktop */ }
    .build()?;
```

Praktisnya: ekstrak config desktop ke fungsi cfg(desktop), mobile cukup
`.build()` polos. `apply_display_mode` di mobile jadi no-op aman
(`set_always_on_top` di-ignore); tambahkan early-return `#[cfg(mobile)]` untuk
kejelasan.

### 5.6 `open_settings` / `settings_close` — cabang mobile

- Desktop: tetap `WebviewWindowBuilder` window "settings" (kode asli).
- Mobile: `app.emit_to("widget", "navigate", "settings.html")` → renderer
  `location.href = payload`; `settings_close` → emit `navigate` ke
  `index.html` (atau `history.back()`).
- Frontend `api.js` menambah listener event `navigate` (satu tempat, dipakai
  index & settings).

### 5.7 Frontend (vanilla JS — tidak ada bundler, tidak ada dep baru)

| File | Perubahan |
|---|---|
| `index.html` + `settings.html` (+ `checker.html`) | tambah `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` (wajib di webview mobile; desktop tak terpengaruh) |
| `style.css` | media query kecil: `@media (max-width: 480px)` — panel full-width, padding safe-area (`env(safe-area-inset-*)`), tap target ≥44px. Widget fixed-width desktop tidak berubah (media query tidak match di desktop) |
| `api.js` | + `isMobile()` (cache hasil `cmd('platform')`); + `openSettings`/`closeSettings` branch (mobile → `location.href`); + listener `navigate`; + `scheduleNotification(...)` & `cancelNotification(...)` via `window.__TAURI__.notification` global (verifikasi ketersediaan global di Fase 2 smoke; fallback Rust §7.2) |
| `settings.js` | sembunyikan section "Login BRONE 1-klik" & "Buka folder config" & toggle auto-detect & display-mode & autostart saat `isMobile()`; **pertahankan**: field URL manual + tombol paste clipboard + "Test Koneksi" + threshold notifikasi + refresh interval |
| `renderer.js` | (a) sembunyikan tombol/tray-only UI di mobile; (b) lihat §7.3 reschedule loop |

### 5.8 Capabilities (`src-tauri/capabilities/*.json`)

Audit hasil: `default.json` (http allow `brone.ub.ac.id/*`, windows: widget/
settings/brone-login/checker) dan `settings.json` (clipboard read) — **keduanya
valid juga di Android**; tidak ada perubahan wajib. Checklist Fase 2: pastikan
`gen/schemas` mobile build tidak menolak entri; bila schema mobile berbeda,
tambah file capability terpisah dengan `"platforms": ["android"]`.

### 5.9 Gerbang Fase 1 (semua wajib hijau)

```bash
npm test                                              # 4 suite JS tetap lulus
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo check  --manifest-path src-tauri/Cargo.toml    # host/desktop
npx tauri build                                       # binary desktop + nsis tetap jalan
# smoke manual desktop: widget muncul, tray jalan, settings window jalan
```

---

## 6. FASE 2 — Init & Build APK Pertama (1–2 jam; first build 10–20 mnt)

```bash
# 1. Generate project Android (sekali)
npx tauri android init          # → src-tauri/gen/android (gradle project)

# 2. Ikon: pastikan src-tauri/icons/icon.png resolusi cukup (≥512px).
#    Bila perlu regenerate set: npx tauri icon assets/icon.png
#    (adaptive icon Android dibuat otomatis dari source)

# 3. Build APK per-ABI
npx tauri android build --apk --split-per-abi
#    output: src-tauri/gen/android/app/build/outputs/apk/...
#    (arm64 = yang dipakai HP modern; ~20–40 MB per ABI)

# 4. Install ke device (aktifkan USB Debugging di HP)
adb install app-universal-arm64-v8a.apk     # path sesuai output
#    ATAU dev langsung: npx tauri android dev
```

**Iterasi yang wajar di build pertama (anggaran 2–3 putaran):**
- `NDK_HOME not set` → env Fase 0 belum ke-load di shell baru (buka ulang terminal)
- Gradle menolak JDK → pastikan `java -version` 17, bukan 1.8 (PATH)
- Linker/target mismatch → pastikan 4 rust target terpasang
- Commit `gen/android` + `Cargo.lock` hasil build sukses

**Smoke test di HP (gerbang Fase 2):**
- app terbuka, list deadline tampil dari feed asli (validasi: fetch + parse + cache jalan)
- settings terbuka via navigasi (bukan window), paste URL + "Test Koneksi" bekerja
- `window.__TAURI__.notification` terdefinisi (kunci untuk Fase 3)

---

## 7. FASE 3 — Perilaku Mobile (2–4 jam)

### 7.1 Permission notifikasi (Android 13+ wajib, 12- otomatis)

Alur first-run mobile di `renderer.js`:
```js
const granted = await window.__TAURI__.notification.isPermissionGranted()
if (!granted) await window.__TAURI__.notification.requestPermission()
```
Tanpa ini, semua notifikasi senyap — gerbang wajib sebelum scheduling.

### 7.2 Notifikasi terjadwal (inti fitur mobile)

Desain memakai ulang mekanisme `notified` yang sudah ada di settings.json:

- Rust command baru `schedule_notify(task_id, title, body, at_ms)`:
  memanggil plugin-notification **dengan payload schedule**. Jalur primer:
  JS global `window.__TAURI__.notification.send({ ..., schedule: { at: Date } })`;
  `Schedule.at()` sudah terverifikasi ada di API JS plugin. Bila global tidak
  ter-ekspose di webview Android (dicek smoke Fase 2), fallback: command Rust
  membangun payload schedule via API Rust plugin (payload-nya serde JSON yang
  sama; satu tempat investigasi kecil, sudah diantisipasi).
- Cancel/reschedule: command `cancel_scheduled(task_id_prefix)` / atau
  reschedule = cancel + add (id stabil dari `taskId`, format id:
  `rw-{taskId}-{threshold}h`).

### 7.3 Loop reschedule di `renderer.js`

Setiap selesai refresh feed (dan saat app dibuka):
1. Ambil daftar task aktif + `notifyThresholdsHours` dari settings (sudah ada).
2. **Mobile:** untuk tiap task × threshold yang belum lewat:
   - jika `remaining_ms <= threshold` → **notif instant** (jalur `api.notify`
     lama; sama seperti desktop) — jangan jadwalkan yang sudah due.
   - else → `scheduleNotify(taskId+threshold, at = due - threshold)`.
   - Simpan marker threshold di `settings.notified` **yang sudah ada**
     (map `taskId -> [fired thresholds]`) supaya tidak double-fire saat
     instant & scheduled bertemu; prunning lama tetap dipakai.
3. **Desktop:** behavior sama sekali tidak berubah (branch `isMobile()`).

Known-limitation yang diterima untuk v1 mobile (dicatat di README):
deadline yang *baru muncul* di feed setelah app terakhir dibuka tidak akan
punya notif terjadwal sampai app dibuka lagi (refresh → reschedule).
Mitigasi masa depan: §8.2 background periodic fetch.

### 7.4 Sentuhan mobile lainnya

- Back button Android: navigasi berbasis `location.href` memberi history alami;
  kalau kurang (keluar dari settings harus ke index, bukan exit), tambah
  handler history kecil — nice-to-have, bukan blocker.
- "Buka tugas" → `open_external` (opener) — sudah jalan; verifikasi visual di
  HP (custom tab / browser).
- `app_quit`: tombol keluar di settings mobile → sama (app.exit(0)).

---

## 8. Backlog — sengaja DI LUAR scope v1 mobile

| Item | Kenapa ditunda |
|---|---|
| 8.1 Home-screen widget Android asli | Butuh Kotlin AppWidgetProvider native di gen/android + glue Rust; UX "notifikasi terjadwal" dulu sudah menjawab kebutuhan inti |
| 8.2 Background refresh berkala (workmanager) | Plugin komunitas; menambah kompleksitas baterai/permission; selesaikan setelah v1 terpakai |
| 8.3 Login BRONE berbantu di HP | Hidden-webview + title-polling rapuh di Android; paste URL cukup untuk v1 |
| 8.4 Auto-detect submission di HP | detect.rs = hidden webview per-task; nilai rendah di mobile, risiko tinggi |
| 8.5 iOS | Butuh macOS untuk signing; pipeline CI macOS runner bisa ditambah nanti dengan perubahan kode yang sama (semua gate sudah cfg-based) |
| 8.6 Enkripsi at-rest secret file mobile | Sandbox per-app sudah private; keychain-class encryption = upgrade |

---

## 9. Testing & CI

### 9.1 Gate manual per fase (sudah di tiap bagian; rekap)
- Fase 1: `npm test` + `cargo clippy -D warnings` + `cargo check` + desktop build hijau
- Fase 2: APK ter-install & smoke list feed + settings navigasi
- Fase 3: permission flow + scheduled notif terbukti (uji threshold 1 menit dengan deadline dummy)

### 9.2 CI baru: `.github/workflows/ci-android.yml` (ditambahkan di Fase 2/3)
```yaml
name: CI Android
on: [push, pull_request]
jobs:
  android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: dtolnay/rust-toolchain@stable
      - run: rustup target add aarch64-linux-android
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - uses: android-actions/setup-android@v3
      - run: sdkmanager "platforms;android-36" "build-tools;36.0.0" "ndk;27.3.13750724"
      - run: npm ci
      - run: npx tauri android build --apk --target aarch64
```
CI desktop (`ci.yml`) tidak disentuh.

### 9.3 Test JS baru (Fase 3, ikut `npm test`)
- `test/schedulePlan.test.js`: fungsi murni baru `planSchedules(tasks, thresholdsMs, now, notified)` → daftar {id, at, kind: instant|scheduled} — ekstrak logika §7.3 jadi modul murni `src/schedulePlan.js` agar teruji tanpa device (pola sama seperti parseTasks/doneStore).

---

## 10. Risiko & Mitigasi

| Risiko | Prob | Mitigasi |
|---|---|---|
| Build Android gagal di env (NDK/JDK/PATH) | tinggi (jarang build mobile lolos attempt 1) | Fase 0 memakai kombinasi versi terbukti 2026; anggaran 2–3 iterasi; log lengkap via `--verbose` |
| `window.__TAURI__.notification` tidak terekspos di webview | sedang | dicek di smoke Fase 2; fallback Rust command (payload serde sama) sudah dirancang §7.2 |
| Vendor Android membatasi alarm (MIUI "battery saver" membunuh AlarmManager exact) | sedang | uji di device fisik user; fallback in-app check saat dibuka; dokumentasikan whitelist baterai di README mobile |
| Multi-ABI build lambat | rendah | `--split-per-abi`; CI build hanya aarch64 |
| Perilaku desktop berubah tak sengaja | rendah | semua gate cfg + gate wajib `npx tauri build` + clippy + npm test di tiap langkah; PR review diff per file |
| keyring→file dianggap regresi keamanan | rendah | hanya jalur non-Windows; Windows tetap Credential Manager; mobile = sandbox per-app |

---

## 11. Estimasi & Urutan Kerja

| Fase | Isi | Estimasi | Prasyarat |
|---|---|---|---|
| 0 | JDK 17, SDK/NDK, rust targets | ±1 jam | approval user (winget + download ±1–2 GB) |
| 1 | cfg-gates + secret file-store + navigasi mobile + viewport/CSS + platform() | 3–6 jam | selesai 0 (sebagian bisa paralel) |
| 2 | android init, ikon, build APK, install, smoke | 1–2 jam | selesai 0+1 |
| 3 | permission, scheduling, reschedule loop, test | 2–4 jam | selesai 2 |
| — | CI android + README mobile | 1 jam | kapan saja setelah 2 |
| **Total** | | **1–2 hari kerja** | |

Urutan pengerjaan disarankan: 0 → 1 (dari 5.1 ke 5.7 berurutan, gate tiap langkah) → 2 → 3 → CI/README.

---

## 12. Definition of Done

- [ ] APK ter-install di HP user; daftar deadline tampil dari feed BRONE asli
- [ ] Paste URL feed + "Test Koneksi" bekerja di HP
- [ ] Permission notifikasi diminta saat first-run; notif muncul
- [ ] Notifikasi terjadwal H-24/H-6/H-1 **muncul walau app ditutup** (uji riil ≥1 deadline; uji cepat pakai threshold 1 menit + dummy task)
- [ ] Buka tugas → browser/custom tab terbuka
- [ ] Desktop: `npm test` hijau, `cargo clippy -D warnings` hijau, `npx tauri build` (nsis) sukses, tray/widget/settings berperilaku identik
- [ ] `gen/android` + `Cargo.lock` ter-commit; branch `feat/android-port` siap PR
- [ ] README: bagian "Mobile (Android)" — cara build, known-limitation background refresh, tips battery-whitelist vendor

## 13. Rollback & Strategi Branch

- Branch `feat/android-port` dari `main`; setiap sub-langkah Fase 1 = commit terpisah dengan gate hijau → bisect mudah.
- Semua perubahan di balik cfg/deteksi platform → `git revert` merge = desktop kembali 100% identik.
- Bila Fase 2 mentok total (misal >1 hari cuma di env): stop, simpan progres branch, jadwalkan ulang; tidak ada setengah-port di `main`.

## 14. Lampiran: Peta File yang Disentuh

```
reminder-widget-v2/
├─ docs/PLAN-ANDROID-PORT.md            (dokumen ini)
├─ package.json                          + scripts android:build / android:dev
├─ src/
│  ├─ index.html                         + viewport meta
│  ├─ settings.html                      + viewport meta
│  ├─ style.css                          + media query mobile + safe-area
│  ├─ api.js                             + isMobile, navigate listener, schedule/cancel notif, branch openSettings
│  ├─ settings.js                        + sembunyikan section desktop-only di mobile
│  ├─ renderer.js                        + branch mobile UI, loop reschedule §7.3
│  └─ schedulePlan.js                    (BARU, murni) + test/schedulePlan.test.js (BARU)
└─ src-tauri/
   ├─ Cargo.toml                         deps per-target (§5.1)
   ├─ capabilities/                       (audit saja; perubahan hanya bila schema mobile menuntut)
   └─ src/
      ├─ lib.rs                          cfg gates builder/setup/tray/guard-thread (§5.2)
      ├─ commands.rs                     stub mobile autostart/login/submission; + platform(); + schedule/cancel (§5.3)
      ├─ secret.rs                       backend keyring (win) / file (non-win) (§5.4)
      ├─ brone_login.rs                  mod cfg(desktop) (§5.2)
      ├─ detect.rs                       mod cfg(desktop) (§5.2)
      └─ tray.rs                         mod cfg(desktop) (§5.2)
   gen/android/                          (BARU via tauri android init; di-commit)
.github/workflows/ci-android.yml         (BARU; §9.2)
```
