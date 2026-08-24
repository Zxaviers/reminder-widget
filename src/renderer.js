'use strict'

/**
 * renderer.js
 * ---------------------------------------------------------------------------
 * Renders the task list and keeps countdowns live.
 *
 * Architecture change from v1: the widget page itself owns fetching, parsing,
 * notifications and the done-map. The Rust shell owns only native surfaces
 * (window, tray, toasts, secrets). Relative times are recomputed locally every
 * 30s without touching the network.
 */

import { api } from './api.js'
import { CalendarFetcher } from './fetchCalendar.js'
import { parseTasks, DAY_MS, DEFAULT_KEEP_OVERDUE_MS } from './parseTasks.js'
import { createDoneStore } from './doneStore.js'

const el = {
  panel: document.getElementById('panel'),
  status: document.getElementById('status'),
  groups: document.getElementById('groups'),
  digest: document.getElementById('digest'),
  body: document.getElementById('body'),
  stale: document.getElementById('stale'),
  staleText: document.getElementById('stale-text'),
  errorTitle: document.getElementById('error-title'),
  errorNote: document.getElementById('error-note'),
  errorFix: document.getElementById('error-fix'),
  undoBar: document.getElementById('undo-bar'),
  undoText: document.getElementById('undo-text'),
  btnUndo: document.getElementById('btn-undo'),
  btnCollapse: document.getElementById('btn-collapse'),
  placeholders: {
    loading: document.getElementById('ph-loading'),
    empty: document.getElementById('ph-empty'),
    setup: document.getElementById('ph-setup'),
    error: document.getElementById('ph-error')
  }
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const SOON_MS = DAY // the 24-hour highlight window
const TICK_MS = 30 * 1000

/** Notify once per task as it crosses each of these remaining-time marks. */
const NOTIFY_THRESHOLDS_MS = [24 * HOUR, 6 * HOUR, HOUR]

let state = { tasks: [], meta: { configured: false, status: 'idle' }, settings: {} }
let settingsDoc = {}
let lastSignature = ''
let busy = false
let fetcher = null

/** taskId -> fired thresholds. Persisted inside settings.json (v1 parity). */
let notified = new Map()
/** Mark-done state (see doneStore.js). */
let done = createDoneStore({})
let undoTimer = null
let persistTimer = null

// ------------------------------------------------------------------ formatting

const timeFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const weekdayFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long' })
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' })
const weekdayShortFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short' })
const fullDateFmt = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short', day: 'numeric', month: 'short',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})

function startOfDay (ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function countdown (deltaMs) {
  const abs = Math.abs(deltaMs)
  if (abs < MINUTE) return 'now'
  if (abs < HOUR) return `${Math.floor(abs / MINUTE)}m`
  if (abs < DAY) {
    let hours = Math.floor(abs / HOUR)
    let minutes = Math.round((abs % HOUR) / MINUTE)
    if (minutes >= 60) { hours += 1; minutes = 0 }
    if (hours >= 24) return '1d'
    return minutes >= 5 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  const days = Math.floor(abs / DAY)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return weeks < 5 ? `${weeks}w` : `${Math.floor(days / 30)}mo`
}

function groupLabel (dayStartMs, todayStartMs) {
  const dayDelta = Math.round((dayStartMs - todayStartMs) / DAY)
  if (dayDelta < 0) return 'Terlewat (Overdue)'
  if (dayDelta === 0) return 'Hari Ini'
  if (dayDelta === 1) return 'Besok'
  if (dayDelta < 7) return weekdayFmt.format(new Date(dayStartMs))
  return `${weekdayShortFmt.format(new Date(dayStartMs))}, ${dateFmt.format(new Date(dayStartMs))}`
}

const PHASE_LABEL = { due: 'due', closes: 'closes', opens: 'opens', event: 'event' }

// ------------------------------------------------------------- persistence

function schedulePersist () {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(async () => {
    try {
      // Both maps go over as plain objects: serde BTreeMap round-trips
      // objects, not array-of-pairs.
      await api.settingsWrite({ done: done.toJSON(), notified: Object.fromEntries(notified) })
    } catch { /* best effort */ }
  }, 400)
}

/** settings.json may carry an object or legacy array-of-pairs. */
function toMap (value) {
  if (Array.isArray(value)) return new Map(value)
  if (value && typeof value === 'object') {
    return new Map(Object.entries(value).map(([k, v]) => [k, Array.isArray(v) ? v : []]))
  }
  return new Map()
}

// -------------------------------------------------------------- notifications

/**
 * Fires at most once per (task, threshold) as deadlines approach.
 * Done tasks never notify — that is the point of marking them.
 */
function evaluateNotifications (tasksAll) {
  if (!settingsDoc.notifications) return

  const now = Date.now()
  const crossed = []

  for (const task of tasksAll) {
    if (done.isDone(task.id)) continue
    const remaining = task.dueMs - now
    if (remaining < 0 || remaining > NOTIFY_THRESHOLDS_MS[0]) continue

    const already = notified.get(task.id) ?? []
    const threshold = NOTIFY_THRESHOLDS_MS.filter((t) => remaining <= t).sort((a, b) => a - b)[0]
    if (threshold === undefined || already.includes(threshold)) continue

    notified.set(task.id, [...already, threshold])
    crossed.push({ task, remaining })
  }

  if (crossed.length === 0) return
  schedulePersist()

  if (crossed.length > 2) {
    const soonest = [...crossed].sort((a, b) => a.remaining - b.remaining)[0]
    api.notify(`${crossed.length} deadlines approaching`, `Soonest: ${soonest.task.title} — ${formatRelative(soonest.remaining)}`)
    return
  }

  for (const { task, remaining } of crossed) {
    const course = task.course ? `${task.course} · ` : ''
    api.notify(task.title, `${course}${formatRelative(remaining)}`)
  }
}

function formatRelative (deltaMs) {
  const overdue = deltaMs < 0
  const abs = Math.abs(deltaMs)
  const minutes = Math.floor(abs / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  let text
  if (minutes < 1) text = 'due now'
  else if (minutes < 60) text = `${minutes}m`
  else if (hours < 24) text = `${hours}h ${minutes % 60}m`
  else text = `${days}d ${hours % 24}h`

  if (text === 'due now') return 'due now'
  return overdue ? `${text} overdue` : `in ${text}`
}

// --------------------------------------------------------------------- render

function signatureOf (tasks) {
  return tasks.map((t) => `${t.id}:${t.dueMs}`).join('|')
}

function svg (paths, viewBox = '0 0 16 16') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  node.setAttribute('viewBox', viewBox)
  node.setAttribute('aria-hidden', 'true')
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    node.appendChild(path)
  }
  return node
}

const CHECK_ICON = ['M3.5 8.5 6.5 11.5 12.5 5']

/**
 * Builds one row. Uses textContent throughout: feed values are untrusted
 * remote content and never become markup.
 */
function taskRow (task, now, { animate, index }) {
  const delta = task.dueMs - now
  const overdue = delta < 0
  const soon = !overdue && delta <= SOON_MS
  const dueDate = new Date(task.dueMs)

  const row = document.createElement('li')
  row.className = 'task'
  if (overdue) row.classList.add('task--overdue')
  else if (soon) row.classList.add('task--soon')

  if (animate) {
    row.classList.add('task--enter')
    row.style.setProperty('--stagger', `${Math.min(index, 8) * 28}ms`)
  }

  // -- countdown gutter (countdown + time)
  const when = document.createElement('div')
  when.className = 'task__when'

  const value = document.createElement('span')
  value.className = 'task__value'
  value.textContent = countdown(delta)

  const at = document.createElement('span')
  at.className = 'task__at'
  at.textContent = task.allDay ? 'sepanjang hari' : timeFmt.format(dueDate)

  when.append(value, at)

  // -- title + course & exact due date
  const meat = document.createElement('div')
  meat.className = 'task__meat'

  const title = document.createElement('span')
  title.className = 'task__title'
  title.textContent = task.title

  const course = document.createElement('div')
  course.className = 'task__course'

  const phase = PHASE_LABEL[task.phase]
  if (phase) {
    const phaseNode = document.createElement('span')
    phaseNode.className = 'task__phase'
    phaseNode.textContent = phase
    course.appendChild(phaseNode)
  }

  if (task.course) {
    const courseNode = document.createElement('span')
    courseNode.className = 'task__course-name'
    courseNode.textContent = task.course
    course.appendChild(courseNode)
  }

  const dueSpan = document.createElement('span')
  dueSpan.className = 'task__duedate'
  dueSpan.textContent = task.allDay ? dateFmt.format(dueDate) : fullDateFmt.format(dueDate)
  course.appendChild(dueSpan)

  meat.append(title, course)

  // -- mark-done button (the v2 feature): stops propagation so opening the
  // task URL stays a click-on-the-row action only.
  const doneBtn = document.createElement('button')
  doneBtn.type = 'button'
  doneBtn.className = 'task__done-btn'
  doneBtn.title = 'Tandai selesai (sudah dikumpulkan)'
  doneBtn.setAttribute('aria-label', `Tandai ${task.title} selesai`)
  doneBtn.appendChild(svg(CHECK_ICON))
  doneBtn.addEventListener('click', (event) => {
    event.stopPropagation()
    markDone(task)
  })

  row.append(when, meat, doneBtn)

  const spoken = [
    task.title,
    task.course,
    `Deadline: ${fullDateFmt.format(dueDate)}`,
    overdue ? `Terlewat ${countdown(delta)}` : `Sisa waktu ${countdown(delta)}`
  ]
    .filter(Boolean)
    .join(', ')
  row.setAttribute('aria-label', spoken)
  row.title = spoken

  if (task.url) {
    row.classList.add('task--link')
    row.tabIndex = 0
    row.setAttribute('role', 'link')
    const open = () => api.openExternal(task.url)
    row.addEventListener('click', open)
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        open()
      }
    })
  }

  return row
}

function renderList (animate) {
  const now = Date.now()
  const todayStart = startOfDay(now)
  el.groups.replaceChildren()

  const buckets = new Map()
  for (const task of state.tasks) {
    const key = task.dueMs < now ? -1 : startOfDay(task.dueMs)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(task)
  }

  let index = 0
  for (const [key, items] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const overdue = key === -1
    const section = document.createElement('section')
    section.className = 'group'
    if (overdue) section.classList.add('group--overdue')
    else if (key === todayStart) section.classList.add('group--today')

    const label = document.createElement('h2')
    label.className = 'group__label'

    const name = document.createElement('span')
    name.textContent = overdue ? 'Overdue' : groupLabel(key, todayStart)

    const count = document.createElement('span')
    count.className = 'group__count'
    count.textContent = String(items.length)

    label.append(name, count)

    const list = document.createElement('ul')
    list.className = 'group__items'
    for (const task of items) {
      list.appendChild(taskRow(task, now, { animate, index }))
      index += 1
    }

    section.append(label, list)
    el.groups.appendChild(section)
  }

  renderDigest(now)
}

/** Collapsed mode shows exactly one thing: the next undone deadline. */
function renderDigest (now) {
  el.digest.replaceChildren()
  const next = state.tasks.find((task) => task.dueMs >= now) ?? state.tasks[0]
  if (!next) {
    const note = document.createElement('span')
    note.className = 'placeholder__note'
    note.textContent = 'Nothing due'
    el.digest.appendChild(note)
    return
  }
  const row = taskRow(next, now, { animate: false, index: 0 })
  row.classList.remove('task')
  el.digest.append(...row.childNodes)
}

// ---------------------------------------------------------------- status text

const ERROR_FIX = {
  URL_MISSING: null,
  URL_INVALID: 'The saved calendar URL is not a valid URL.',
  URL_PROTOCOL: 'The URL must start with https://',
  UNAUTHORIZED: 'Export a fresh calendar URL from BRONE and reconnect in Settings.',
  NOT_CALENDAR: 'That URL returned a web page, not a calendar. Use the "Get calendar URL" link.',
  TIMEOUT: 'The server did not answer in time. It may be busy.',
  NETWORK: 'Check your internet connection.',
  HTTP_ERROR: 'The server rejected the request. It may be down for maintenance.',
  TOO_LARGE: 'The feed is unexpectedly large.',
  ICS_PARSE_FAILED: 'The feed downloaded but could not be read.'
}

const STATUS_TEXT = {
  loading: 'Loading',
  refreshing: 'Refreshing',
  ready: 'Synced',
  stale: 'Offline',
  error: 'Error',
  unconfigured: 'Not configured',
  idle: 'Idle'
}

function relativeSync (iso) {
  if (!iso) return null
  const delta = Date.now() - Date.parse(iso)
  if (!Number.isFinite(delta)) return null
  if (delta < 90 * 1000) return 'just now'
  if (delta < HOUR) return `${Math.round(delta / MINUTE)}m ago`
  if (delta < DAY) return `${Math.round(delta / HOUR)}h ago`
  return `${Math.round(delta / DAY)}d ago`
}

function renderStatus () {
  const meta = state.meta ?? {}
  const count = state.tasks.length
  const status = meta.status ?? 'idle'

  busy = status === 'loading' || status === 'refreshing'
  el.panel.dataset.busy = String(busy)
  el.panel.dataset.state = status

  let text
  if (!meta.configured) {
    text = STATUS_TEXT.unconfigured
  } else if (busy && count === 0) {
    text = STATUS_TEXT[status]
  } else {
    const synced = relativeSync(meta.lastFetchedAt)
    const label = count === 1 ? '1 task' : `${count} tasks`
    if (status === 'stale' || status === 'error') {
      text = synced ? `${label} · updated ${synced}` : STATUS_TEXT[status]
    } else {
      text = synced ? `${label} · synced ${synced}` : label
    }
  }
  el.status.textContent = text

  const failedWithData = Boolean(meta.error) && count > 0
  el.stale.hidden = !failedWithData
  if (failedWithData) {
    const fix = ERROR_FIX[meta.error.code]
    const message = typeof meta.error.message === 'string' ? meta.error.message.trim() : ''
    el.staleText.textContent = fix || message || "Couldn't refresh. Showing the last synced copy."
  }
}

function showPlaceholder (which) {
  for (const [key, node] of Object.entries(el.placeholders)) {
    node.hidden = key !== which
  }
  el.groups.hidden = which !== null
}

function renderError () {
  const meta = state.meta ?? {}
  const error = meta.parseError ?? meta.error ?? {}
  el.errorTitle.textContent =
    error.code === 'NOT_CALENDAR' ? "That's not a calendar feed" : "Can't reach the feed"
  const message = typeof error.message === 'string' ? error.message.trim() : ''
  el.errorNote.textContent = message || 'The calendar feed could not be loaded.'
  const fix = ERROR_FIX[error.code]
  el.errorFix.textContent = fix ?? ''
  el.errorFix.hidden = !fix
}

// ----------------------------------------------------------------- autosizing

function desiredHeight () {
  const bar = document.getElementById('bar').offsetHeight
  const stale = el.stale.hidden ? 0 : el.stale.offsetHeight
  const undo = el.undoBar.hidden ? 0 : el.undoBar.offsetHeight
  const collapsed = el.panel.dataset.collapsed === 'true'
  const content = collapsed ? el.digest.offsetHeight : el.body.scrollHeight
  return bar + content + stale + undo + 24
}

let lastSent = 0
function autosize () {
  const height = desiredHeight()
  if (height <= 24 || Math.abs(height - lastSent) < 2) return
  lastSent = height
  api.autosize(height)
}

const observer = new ResizeObserver(() => autosize())
observer.observe(el.groups)
observer.observe(el.digest)
for (const node of Object.values(el.placeholders)) observer.observe(node)

// ------------------------------------------------------------ mark-done flow

function markDone (task) {
  done.mark(task.id, new Date().toISOString())
  applyVisibleTasks()

  el.undoText.textContent = `"${task.title}" ditandai selesai`
  el.undoBar.hidden = false
  clearTimeout(undoTimer)
  undoTimer = setTimeout(() => { el.undoBar.hidden = true }, 6000)
  requestAnimationFrame(autosize)
  schedulePersist()
}

function undoLastMark () {
  done.undo()
  el.undoBar.hidden = true
  clearTimeout(undoTimer)
  applyVisibleTasks()
  schedulePersist()
}

// --------------------------------------------------------------- state update

/**
 * Placeholder decision (v1 apply() parity): exactly one of setup / error /
 * loading / empty is shown, or none when the task list is on screen.
 */
function renderPlaceholders () {
  const meta = state.meta ?? {}
  const count = state.tasks.length

  if (!meta.configured) {
    showPlaceholder('setup')
  } else if (count > 0) {
    showPlaceholder(null)
  } else if (meta.parseError || (meta.error && !meta.hasData)) {
    showPlaceholder('error')
    renderError()
  } else if (meta.status === 'loading' && !meta.hasData) {
    showPlaceholder('loading')
  } else {
    showPlaceholder('empty')
  }
}

/** Recompute the visible list from the full parsed set + done map. */
function applyVisibleTasks ({ animate = false } = {}) {
  const tasksAll = Array.isArray(state._allTasks) ? state._allTasks : []
  state.tasks = done.visible(tasksAll)
  renderPlaceholders()
  renderList(animate && signatureChanged())
  renderStatus()
  updateTrayTooltip()
  requestAnimationFrame(autosize)
}

function signatureChanged () {
  const signature = signatureOf(state.tasks)
  const changed = signature !== lastSignature
  lastSignature = signature
  return changed
}

function updateTrayTooltip () {
  const now = Date.now()
  const next = state.tasks.find((t) => t.dueMs >= now)
  if (!next) {
    api.trayTooltip(state.meta.configured ? 'Reminder Widget — nothing upcoming' : 'Reminder Widget — not configured')
    return
  }
  const delta = next.dueMs - now
  api.trayTooltip(`Reminder Widget — next: ${next.title} (${formatRelative(delta)})`)
}

async function refreshNow () {
  if (!fetcher || busy) return
  busy = true
  el.panel.dataset.busy = 'true'
  try {
    await fetcher.refresh({ force: true })
  } finally {
    busy = false
  }
}

async function startFeed () {
  fetcher?.stop()
  const url = await api.feedUrlGetFull().catch(() => null)

  state.meta = {
    ...(state.meta ?? {}),
    configured: Boolean(url),
    status: url ? 'loading' : 'unconfigured'
  }
  state.tasks = []
  lastSignature = ''

  fetcher = new CalendarFetcher({
    url,
    handlers: {
      onUpdate: ({ ics, meta }) => {
        state.meta = { ...meta, configured: true }
        try {
          state._allTasks = parseTasks(ics)
          delete state.meta.parseError
        } catch (error) {
          state.meta.parseError = { code: error.code ?? 'PARSE_FAILED', message: error.message }
          state._allTasks = []
        }
        // Retire done-entries for events Moodle removed long ago.
        done.prune(state._allTasks, DEFAULT_KEEP_OVERDUE_MS, Date.now())
        evaluateNotifications(state._allTasks)
        applyVisibleTasks({ animate: true })
        schedulePersist()
      },
      onStatus: (meta) => {
        state.meta = { ...state.meta, ...meta }
        renderPlaceholders()
        renderStatus()
        updateTrayTooltip()
        requestAnimationFrame(autosize)
      },
      onError: (error) => {
        state.meta.error = { code: error?.code, message: error?.message }
        renderPlaceholders()
        renderStatus()
      }
    }
  })

  await fetcher.start().catch(() => {})
}

// ------------------------------------------------------------------ rendering

function applyCollapsed (collapsed) {
  el.panel.dataset.collapsed = String(collapsed)
  el.btnCollapse.setAttribute('aria-expanded', String(!collapsed))
  el.btnCollapse.title = collapsed ? 'Expand' : 'Collapse'
  el.btnCollapse.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse')
}

function tick () {
  if (state.tasks.length > 0 && el.groups.hidden === false) {
    renderList(false)
  }
  renderStatus()
}

// -------------------------------------------------------------------- wiring

el.btnUndo?.addEventListener('click', undoLastMark)

document.getElementById('btn-refresh')?.addEventListener('click', refreshNow)
document.getElementById('btn-retry-error')?.addEventListener('click', refreshNow)
document.getElementById('btn-retry-stale')?.addEventListener('click', refreshNow)
document.getElementById('btn-hide')?.addEventListener('click', () => api.hide())

// Quick-login from the setup panel: surface the outcome in the status line so
// a failed assisted login is never silent.
document.getElementById('btn-quick-login')?.addEventListener('click', async () => {
  const result = await api.loginBrone().catch((error) => ({ ok: false, message: String(error) }))
  if (!result?.ok && el.status) {
    el.status.textContent = result?.canceled
      ? 'Login ditutup'
      : `Login gagal: ${result?.message ?? 'coba lagi'}`
  }
})

for (const id of ['btn-open-settings', 'btn-open-settings-2']) {
  document.getElementById(id)?.addEventListener('click', () => api.openSettings())
}

document.getElementById('btn-collapse').addEventListener('click', async () => {
  const collapsed = el.panel.dataset.collapsed !== 'true'
  applyCollapsed(collapsed)
  requestAnimationFrame(autosize)
  settingsDoc.collapsed = collapsed
  await api.settingsWrite({ collapsed })
  await api.settingsChanged()
})

document.addEventListener('contextmenu', (event) => event.preventDefault())

api.listen('tray-command', async (command) => {
  if (command === 'refresh') await refreshNow()
})

api.listen('settings-changed', async () => {
  const doc = await api.settingsRead().catch(() => ({}))
  settingsDoc = { ...settingsDoc, ...doc }
  notified = toMap(doc.notified)
  applyCollapsed(Boolean(settingsDoc.collapsed))
  applyVisibleTasks()
})

api.listen('feed-changed', () => startFeed())

// Safety net for missed saves: every time the widget is revealed, re-check
// the configured URL if we still think there is none.
api.listen('widget-shown', () => {
  if (!state.meta.configured) startFeed()
})

// ---------------------------------------------------------------------- boot

;(async () => {
  const doc = await api.settingsRead().catch(() => ({}))
  settingsDoc = { ...doc }
  notified = toMap(doc.notified)
  done = createDoneStore(doc.done ?? {})
  applyCollapsed(Boolean(settingsDoc.collapsed))

  await startFeed()
  setInterval(tick, TICK_MS)
})()
