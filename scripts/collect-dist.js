'use strict'

/**
 * scripts/collect-dist.js
 * ---------------------------------------------------------------------------
 * electron-builder's dedicated "portable" target does not exist in Tauri; the
 * compiled release binary IS the portable app. This copies the NSIS installer
 * and the raw binary into dist/ under the friendly names users saw in v1.
 *
 * Usage: npm run dist   (builds, then collects)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const src = path.join(root, 'src-tauri', 'target', 'release')
const outDir = path.join(root, 'dist')

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version

const artifacts = [
  {
    from: path.join(src, 'bundle', 'nsis', `Reminder Widget_${version}_x64-setup.exe`),
    to: path.join(outDir, 'Reminder-Widget-Setup-x64.exe')
  },
  {
    from: path.join(src, 'reminder-widget.exe'),
    to: path.join(outDir, 'Reminder-Widget-Portable-x64.exe')
  }
]

fs.mkdirSync(outDir, { recursive: true })
let missing = false
for (const { from, to } of artifacts) {
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, to)
    console.log(`dist <- ${path.basename(to)}`)
  } else {
    missing = true
    console.error(`missing: ${from}`)
  }
}
process.exitCode = missing ? 1 : 0
