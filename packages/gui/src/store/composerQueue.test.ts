/**
 * composerQueue — unit cases for the T-309 composer queue pure helpers
 * (enqueueText / removeQueuedAt / joinQueueForFlush) exported from
 * store/workspace.ts.
 *
 * The store's `enqueueMessage` / `removeQueuedMessage` actions and ChatPanel's
 * flush effect are thin wrappers over these three functions — the GUI's vitest
 * setup (vitest.setup.ts) stubs the whole `zustand` module, so a real store
 * instance never exists under test (mirrors the dedupeMessagesById.test.ts
 * precedent: exercise the pure logic directly, not the mocked store).
 *
 * Covers the ticket's acceptance ⑤: queue order, individual removal, and
 * flush-join order.
 */

import { test, expect } from 'vitest'
import { enqueueText, removeQueuedAt, joinQueueForFlush } from './workspace'

test('enqueueText: appends to the end (FIFO order)', () => {
  let queue: string[] = []
  queue = enqueueText(queue, 'first')
  queue = enqueueText(queue, 'second')
  queue = enqueueText(queue, 'third')
  expect(queue).toEqual(['first', 'second', 'third'])
})

test('enqueueText: does not mutate the input array', () => {
  const original = ['a']
  const next = enqueueText(original, 'b')
  expect(original).toEqual(['a'])
  expect(next).toEqual(['a', 'b'])
  expect(next).not.toBe(original)
})

test('removeQueuedAt: removes only the targeted index, preserves order of the rest', () => {
  const queue = ['a', 'b', 'c']
  expect(removeQueuedAt(queue, 1)).toEqual(['a', 'c'])
  expect(removeQueuedAt(queue, 0)).toEqual(['b', 'c'])
  expect(removeQueuedAt(queue, 2)).toEqual(['a', 'b'])
})

test('removeQueuedAt: out-of-range index is a no-op (array unaffected)', () => {
  const queue = ['a', 'b']
  expect(removeQueuedAt(queue, 5)).toEqual(['a', 'b'])
  expect(removeQueuedAt(queue, -1)).toEqual(['a', 'b'])
})

test('removeQueuedAt: does not mutate the input array', () => {
  const original = ['a', 'b', 'c']
  const next = removeQueuedAt(original, 1)
  expect(original).toEqual(['a', 'b', 'c'])
  expect(next).not.toBe(original)
})

test('removeQueuedAt: empty queue stays empty', () => {
  expect(removeQueuedAt([], 0)).toEqual([])
})

test('joinQueueForFlush: joins queued items with newline, preserving FIFO order', () => {
  expect(joinQueueForFlush(['one', 'two', 'three'])).toBe('one\ntwo\nthree')
})

test('joinQueueForFlush: single-item queue has no newline', () => {
  expect(joinQueueForFlush(['solo'])).toBe('solo')
})

test('joinQueueForFlush: empty queue joins to an empty string', () => {
  expect(joinQueueForFlush([])).toBe('')
})

test('enqueue → remove → flush: end-to-end order is stable across the full lifecycle', () => {
  let queue: string[] = []
  queue = enqueueText(queue, 'a')
  queue = enqueueText(queue, 'b')
  queue = enqueueText(queue, 'c')
  // user cancels the middle item (chip X) before the turn ends
  queue = removeQueuedAt(queue, 1)
  expect(queue).toEqual(['a', 'c'])
  expect(joinQueueForFlush(queue)).toBe('a\nc')
})
