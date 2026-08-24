'use strict'

/**
 * settings.js
 * ---------------------------------------------------------------------------
 * Settings sheet logic. Ported from v1 with Tauri IPC:
 * - Assisted BRONE login window (1-click) + clipboard paste.
 * - Manual .ics calendar feed URL configuration and testing.
 * - Display mode switching (Always on top vs Desktop wallpaper layer).
 * - Windows autostart and notification preferences.
 */

import { api } from './api.js'

const el = {
  url: document.getElementById('url'),
  test: document.getElementById('test'),
  save: document.getElementById('save'),
  close: document.getElementById('close'),
  btnOpenBrowserMain: document.getElementById('btn-open-browser-main'),
  btnPasteClipboard: document.getElementById('btn-paste-clipboard'),
  modeAlwaysTop: document.getElementById('mode-always-top'),
  modeDesktop: document.getElementById('mode-desktop'),
  manualDetails: document.getElementById('manual-details'),
  result: document.getElementById('result'),
  resultIcon: document.querySelector('.result__icon'),
  resultTitle: document.getElementById('result-title'),
  resultNote: document.getElementById('result-note'),
  sub: document.getElementById('sub'),
  autostart: document.getElementById('autostart'),
  notify: document.getElementById('notify'),
  footnote: document.getElementById('footnote')
}

const ICONS = {
  ok: ['M13.5 4.5 6.5 11.5 2.5 7.5'],
  bad: ['M8 2.5 15 14.5H1z', 'M8 6.6v3.2', 'M8 12.2v.1'],
  busy: ['M8 2.5a5.5 5.5 0 1 1-5.5 5.5', 'M8 2.5V5']
}

let busy = false

function setIcon (kind) {
  if (!el.resultIcon) return
  el.resultIcon.replaceChildren()
  for (const d of ICONS[kind] ?? []) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    el.resultIcon.appendChild(path)
  }
}

function showResult (kind, title, note) {
  if (!el.result) return
  el.result.hidden = false
  el.result.className = `result result--${kind}`
  setIcon(kind)
  if (el.resultTitle) el.resultTitle.textContent = title
  if (el.resultNote) el.resultNote.textContent = note ?? ''
}

function clearResult () {
  if (el.result) el.result.hidden = true
}

function setBusy (value, label) {
  busy = value
  if (el.test) el.test.disabled = value
  if (el.save) el.save.disabled = value
  if (el.btnPasteClipboard) el.btnPasteClipboard.disabled = value
  if (value) showResult('busy', label ?? 'Memproses…', '')
}

/** Turn a due ISO string into something short and human. */
function describeNext (next) {
  if (!next) return 'Belum ada tugas mendesak dalam rentang waktu.'
  const due = new Date(next.due)
  const when = due.toLocaleString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
  const course = next.course ? ` · ${next.course}` : ''
  return `Terdekat: ${next.title}${course} — ${when}`
}

function extractUrlFromText (rawText) {
  if (typeof rawText !== 'string') return ''
  const trimmed = rawText.trim()
  const match = trimmed.match(/https:\/\/[^\s"'<>]+/i)
  return match ? match[0] : trimmed
}

async function pasteFromClipboardAndConnect () {
  try {
    setBusy(true, 'Membaca clipboard...')
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      text = ''
    }

    const extracted = extractUrlFromText(text)
    if (!extracted || !extracted.startsWith('http')) {
      setBusy(false)
      showResult(
        'bad',
        'Belum Ada Link di Clipboard',
        'Silakan salin (copy) URL kalender dari browser terlebih dahulu, lalu klik tombol ini lagi. Jika diblokir, gunakan kolom manual (Ctrl+V).'
      )
      return
    }

    if (el.url) el.url.value = extracted
    setBusy(false)
    await save()
  } catch (err) {
    setBusy(false)
    showResult('bad', 'Gagal Membaca Clipboard', err.message || 'Izin clipboard ditolak.')
  }
}

async function test () {
  const url = el.url.value.trim()
  if (url === '') {
    showResult('bad', 'URL Kosong', 'Tempelkan URL feed kalender terlebih dahulu.')
    return null
  }

  setBusy(true, 'Menghubungi server kampus…')
  const result = await api.testFeed(url)
  setBusy(false)

  if (result.ok) {
    const count = result.count === 1 ? '1 tugas ditemukan' : `${result.count} tugas ditemukan`
    showResult('ok', `Feed valid — ${count}`, describeNext(result.next))
  } else {
    showResult('bad', 'Koneksi Gagal', result.message)
  }
  return result
}

/** Persist the feed URL and tell the widget page to rebuild its fetcher. */
async function commitFeed (rawUrl) {
  await api.feedUrlSet(rawUrl === '' ? null : rawUrl)
  await window.__TAURI__.event.emit('feed-changed')
}

async function save () {
  const url = el.url.value.trim()

  if (url === '') {
    setBusy(true, 'Menghapus konfigurasi…')
    await commitFeed('')
    setBusy(false)
    showResult('ok', 'Feed Dihapus', 'Widget kembali ke status belum terhubung.')
    return
  }

  setBusy(true, 'Memverifikasi & menyimpan feed kalender…')
  const probe = await api.testFeed(url)
  if (!probe || !probe.ok) {
    setBusy(false)
    showResult('bad', 'Koneksi Gagal', probe?.message || 'Tidak dapat memuat feed kalender.')
    return
  }

  await commitFeed(url)
  setBusy(false)

  const count = probe.count === 1 ? '1 tugas' : `${probe.count} tugas`
  showResult('ok', `Berhasil Terhubung! (${count})`, 'Widget sedang aktif di desktop.')
  setTimeout(() => api.closeSettings(), 600)
}

async function load () {
  const config = await api.getSettings()

  if (el.url) el.url.value = config.feedUrl ?? ''
  if (el.autostart) el.autostart.checked = Boolean(config.openAtLogin)
  if (el.notify) el.notify.checked = Boolean(config.notifications)

  const mode = config.displayMode || 'alwaysOnTop'
  if (mode === 'desktop') {
    if (el.modeDesktop) el.modeDesktop.checked = true
  } else if (el.modeAlwaysTop) {
    el.modeAlwaysTop.checked = true
  }

  if (config.feedUrl) {
    if (el.sub) el.sub.textContent = 'Terhubung'
  } else if (config.envMasked) {
    if (el.sub) el.sub.textContent = 'Menggunakan .env'
    if (el.manualDetails) el.manualDetails.open = true
    showResult('ok', 'Menggunakan CALENDAR_FEED_URL', `${config.envMasked} — simpan di sini jika ingin mengganti.`)
  } else if (el.sub) {
    el.sub.textContent = 'Belum Terhubung'
  }

  if (el.footnote) {
    el.footnote.textContent =
      'URL kalender tersimpan aman di Windows Credential Manager. Refresh otomatis tiap 20 menit.'
  }
}

// Event Listeners
if (el.btnOpenBrowserMain) {
  el.btnOpenBrowserMain.addEventListener('click', () => {
    api.openExternal('https://brone.ub.ac.id/calendar/export.php')
  })
}

if (el.btnPasteClipboard) {
  el.btnPasteClipboard.addEventListener('click', pasteFromClipboardAndConnect)
}

if (el.test) el.test.addEventListener('click', test)
if (el.save) el.save.addEventListener('click', save)
if (el.close) el.close.addEventListener('click', () => api.closeSettings())

if (el.modeAlwaysTop) {
  el.modeAlwaysTop.addEventListener('change', () => {
    if (el.modeAlwaysTop.checked) api.setDisplayMode('alwaysOnTop')
  })
}

if (el.modeDesktop) {
  el.modeDesktop.addEventListener('change', () => {
    if (el.modeDesktop.checked) api.setDisplayMode('desktop')
  })
}

if (el.url) el.url.addEventListener('input', clearResult)

if (el.url) {
  el.url.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      save()
    }
  })
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !busy) api.closeSettings()
})

if (el.autostart) {
  el.autostart.addEventListener('change', async () => {
    await api.autostartSet(el.autostart.checked)
    // Keep settings.json in sync for the tray checkbox.
    await api.settingsWrite({ openAtLogin: Boolean(await api.autostartGet()) })
    await api.settingsChanged()
  })
}

if (el.notify) {
  el.notify.addEventListener('change', async () => {
    await api.settingsWrite({ notifications: el.notify.checked })
    await api.settingsChanged()
  })
}

document.addEventListener('contextmenu', (event) => {
  if (event.target !== el.url) event.preventDefault()
})

load().catch((error) => {
  showResult('bad', 'Gagal Memuat Pengaturan', error.message)
})
