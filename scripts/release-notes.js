#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const targetVersion = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2].replace(/^v/, '')
  : pkg.version;

const changelogPath = path.join(rootDir, 'CHANGELOG.md');
const changelog = fs.readFileSync(changelogPath, 'utf8');

// Regex to capture the version section: ## [x.y.z] ... up until next ## [ or EOF
const sectionRegex = new RegExp(
  `##\\s*\\[${targetVersion.replace(/\./g, '\\.')}\\][^\n]*\n([\\s\\S]*?)(?=\n##\\s*\\[|$)`,
  'i'
);

const match = changelog.match(sectionRegex);
const notesBody = match
  ? match[1].trim()
  : `Rilis versi ${targetVersion}. Silakan lihat riwayat commit untuk ringkasan perubahan.`;

const standardBlocks = `
---

### 📦 Berkas Unduhan / Downloads

> [!NOTE]
> **Status Platform**: Rilis baru ini menerbitkan pembaruan untuk platform **Android**. Untuk desktop **Windows**, versi yang dirilis tetap menggunakan versi stabil **v1.0.0**.

| Berkas | Platform | Status | Deskripsi |
|---|---|---|---|
| [\`BRONE-Reminder-arm64.apk\`](https://github.com/Zxaviers/reminder-widget/releases/latest/download/BRONE-Reminder-arm64.apk) | Android 7.0+ (arm64) | Rilis Terbaru | APK mandiri untuk Android arm64-v8a |
| [\`SHA256SUMS.txt\`](https://github.com/Zxaviers/reminder-widget/releases/latest/download/SHA256SUMS.txt) | Android | Rilis Terbaru | Hash SHA-256 untuk verifikasi integritas APK |
| [\`Reminder.Widget.1.0.0.Setup.exe\`](https://github.com/Zxaviers/reminder-widget/releases/download/v1.0.0/Reminder.Widget.1.0.0.Setup.exe) | Windows 10/11 x64 | Rilis v1.0.0 | Installer NSIS resmi Windows (Start Menu, tray, autostart) |
| [\`Reminder.Widget.1.0.0.exe\`](https://github.com/Zxaviers/reminder-widget/releases/download/v1.0.0/Reminder.Widget.1.0.0.exe) | Windows 10/11 x64 | Rilis v1.0.0 | Biner portabel resmi Windows (tanpa instalasi) |

---

### 🛡️ Catatan Keamanan & Panduan Instalasi

#### Instalasi APK Android
1. Unduh \`BRONE-Reminder-arm64.apk\` ke perangkat Android Anda.
2. Buka berkas APK melalui browser atau pengelola berkas (*File Manager*).
3. Jika muncul dialog perizinan, aktifkan opsi **Install unknown apps** (*Pasang aplikasi tidak dikenal*).
4. Pengguna pengembang juga dapat memasang via ADB:
   \`\`\`bash
   adb install -r BRONE-Reminder-arm64.apk
   \`\`\`

#### Verifikasi Integritas Checksum Android (SHA-256)
- **Linux / macOS**:
  \`\`\`bash
  sha256sum -c SHA256SUMS.txt
  \`\`\`
- **Windows (PowerShell)**:
  \`\`\`powershell
  Get-FileHash .\\BRONE-Reminder-arm64.apk -Algorithm SHA256
  \`\`\`

#### Catatan Windows Desktop (v1.0.0)
Jika Anda menggunakan Windows, silakan unduh rilis stabil v1.0.0 di atas. Windows SmartScreen mungkin menampilkan layar biru perlindungan (*"Windows protected your PC"*):
1. Klik **More info** (*Informasi selengkapnya*).
2. Klik tombol **Run anyway** (*Tetap jalankan*).

---

### ⚙️ Persyaratan Sistem
- **Android**: Android 7.0 (Nougat / API 24) ke atas, arsitektur prosesor 64-bit (\`arm64-v8a\`).
- **Windows**: Windows 10 atau 11 (64-bit), dengan [Microsoft Edge WebView2 Evergreen Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).
`;

const fullReleaseNotes = `${notesBody}\n\n${standardBlocks.trim()}\n`;

const outIdx = process.argv.indexOf('--out');
if (outIdx !== -1 && process.argv[outIdx + 1]) {
  const outFile = path.resolve(rootDir, process.argv[outIdx + 1]);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, fullReleaseNotes, 'utf8');
  console.log(`Release notes written to ${outFile}`);
} else {
  process.stdout.write(fullReleaseNotes);
}
