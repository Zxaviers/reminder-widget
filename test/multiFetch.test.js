import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeFeedTasks } from '../src/multiFetch.js'

const task = (id, dueMs, title = 'Tugas') => ({ id, dueMs, title })

test('tags each task with its feed origin', () => {
  const out = mergeFeedTasks([
    { feed: { id: 'brone', kind: 'brone' }, tasks: [task('a::1', 100, 'A')] },
    { feed: { id: 'g1', kind: 'google' }, tasks: [task('b::2', 50, 'B')] }
  ])
  assert.equal(out.length, 2)
  assert.equal(out[0].feedId, 'g1')
  assert.equal(out[0].feedKind, 'google')
  assert.equal(out[1].feedId, 'brone')
})

test('sorts nearest deadline first across feeds', () => {
  const out = mergeFeedTasks([
    { feed: { id: 'brone' }, tasks: [task('a::3', 300, 'C'), task('b::1', 100, 'A')] },
    { feed: { id: 'g1' }, tasks: [task('c::2', 200, 'B')] }
  ])
  assert.deepEqual(out.map((t) => t.id), ['b::1', 'c::2', 'a::3'])
})

test('same id in two feeds keeps the first occurrence', () => {
  const out = mergeFeedTasks([
    { feed: { id: 'brone', kind: 'brone' }, tasks: [task('x::1', 100, 'BRONE')] },
    { feed: { id: 'g1', kind: 'google' }, tasks: [task('x::1', 100, 'Google')] }
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].title, 'BRONE')
  assert.equal(out[0].feedId, 'brone')
})

test('tolerates error rows, missing feeds and empty input', () => {
  assert.deepEqual(mergeFeedTasks([]), [])
  assert.deepEqual(mergeFeedTasks(null), [])
  const out = mergeFeedTasks([
    null,
    { feed: null, tasks: [task('a', 1)] },
    { feed: { id: 'g1' } },
    { feed: { id: 'g1' }, tasks: [task('b::1', 5, 'B')] }
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].id, 'b::1')
})
