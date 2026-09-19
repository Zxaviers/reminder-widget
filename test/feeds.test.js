import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FEED_KINDS,
  isValidFeedId,
  normalizeFeed,
  feedMetaFrom,
  upsertFeedMeta
} from '../src/feeds.js'

test('feed ids accept alphanumerics, dash, underscore, dot', () => {
  assert.equal(isValidFeedId('brone'), true)
  assert.equal(isValidFeedId('google-1'), true)
  assert.equal(isValidFeedId('kelas_a.2'), true)
  assert.equal(isValidFeedId(''), false)
  assert.equal(isValidFeedId('ada spasi'), false)
  assert.equal(isValidFeedId('a'.repeat(65)), false)
})

test('normalizeFeed accepts brone, google and generic ics', () => {
  for (const kind of FEED_KINDS) {
    const out = normalizeFeed({ id: 'x1', kind, url: 'https://example.com/cal.ics' })
    assert.equal(out.ok, true)
    assert.equal(out.feed.kind, kind)
    assert.equal(out.feed.enabled, true)
  }
})

test('normalizeFeed rejects bad id, kind and url', () => {
  assert.equal(normalizeFeed({ id: '', kind: 'brone', url: 'https://x' }).ok, false)
  assert.equal(normalizeFeed({ id: 'a', kind: 'dropbox', url: 'https://x' }).ok, false)
  assert.equal(normalizeFeed({ id: 'a', kind: 'brone', url: 'ftp://x' }).ok, false)
  assert.equal(normalizeFeed({ id: 'a', kind: 'brone', url: '' }).ok, false)
})

test('normalizeFeed defaults label to id and enabled to true', () => {
  const out = normalizeFeed({ id: 'g1', kind: 'google', url: 'https://calendar.google.com/x' })
  assert.equal(out.ok, true)
  assert.equal(out.feed.label, 'g1')
  assert.equal(out.feed.enabled, true)
})

test('feedMetaFrom strips the secret url', () => {
  const meta = feedMetaFrom({ id: 'g1', kind: 'google', label: 'Kelas', enabled: true, url: 'https://secret' })
  assert.deepEqual(meta, { id: 'g1', kind: 'google', label: 'Kelas', enabled: true })
  assert.ok(!('url' in meta))
})

test('upsertFeedMeta replaces by id without mutating input', () => {
  const base = [{ id: 'brone', kind: 'brone', label: 'BRONE', enabled: true }]
  const next = upsertFeedMeta(base, { id: 'g1', kind: 'google', label: 'Kelas', enabled: true })
  assert.equal(next.length, 2)
  assert.equal(base.length, 1)
  const over = upsertFeedMeta(next, { id: 'g1', kind: 'google', label: 'Baru', enabled: false })
  assert.equal(over.find((m) => m.id === 'g1').label, 'Baru')
  assert.equal(over.find((m) => m.id === 'g1').enabled, false)
})
