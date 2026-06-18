/**
 * dedupeMessagesById — unit cases for the data-level message-id dedup that
 * resolves the ChatPanel "Encountered two children with the same key" warning
 * (T-PATCH-192).
 *
 * NOTE: the GUI package has no configured unit-test framework (only the
 * Playwright `smoke` spec, and no `test` script). Following the T-PATCH-137
 * (src/lib/useTicketScan.test.ts) and T-PATCH-201 (electron/ipc/costArchive.test.ts)
 * precedent, these cases are a self-contained, framework-free assertion list that
 * `tsc --noEmit` type-checks as part of the build and that any `tsx` / `node`
 * runner can execute directly. The live gate is `tsc --noEmit` + `vite build`.
 *
 * Covers the ticket's core invariant: the same id supplied twice collapses to a
 * single entry (last-write-wins), preserving first-seen order — so the renderer
 * never receives two children with the same React key.
 */

import { dedupeMessagesById } from './workspace'
import type { Message } from '../lib/types'

function msg(id: string, text: string): Message {
  return { id, role: 'assistant', kind: 'po', text, status: 'done', created_at: '2026-06-18T00:00:00Z' }
}

interface Case {
  readonly label: string
  readonly input: Message[]
  readonly expectedIds: string[]
  /** When set, assert the entry for this id carries this text (last-write-wins). */
  readonly expectText?: { id: string; text: string }
  /** When true, the output must be the SAME array reference (no-dup fast path). */
  readonly expectSameRef?: boolean
}

export const DEDUPE_CASES: readonly Case[] = [
  {
    label: 'no duplicates → unchanged (same reference)',
    input: [msg('a', 'A'), msg('b', 'B'), msg('c', 'C')],
    expectedIds: ['a', 'b', 'c'],
    expectSameRef: true,
  },
  {
    label: 'empty array → empty (same reference)',
    input: [],
    expectedIds: [],
    expectSameRef: true,
  },
  {
    label: 'same id appended twice → one entry, last-write-wins',
    input: [msg('m-1', 'first'), msg('m-1', 'second')],
    expectedIds: ['m-1'],
    expectText: { id: 'm-1', text: 'second' },
  },
  {
    label: 'duplicate in the middle keeps original position',
    input: [msg('a', 'A'), msg('dup', 'first'), msg('b', 'B'), msg('dup', 'patched')],
    expectedIds: ['a', 'dup', 'b'],
    expectText: { id: 'dup', text: 'patched' },
  },
  {
    label: 'triple duplicate → single entry with the final copy',
    input: [msg('x', '1'), msg('x', '2'), msg('x', '3')],
    expectedIds: ['x'],
    expectText: { id: 'x', text: '3' },
  },
  {
    label: 'session-restore shape: leading user + dup po segment',
    input: [msg('u-1', 'hello'), msg('seg-1', 'partial'), msg('seg-1', 'final')],
    expectedIds: ['u-1', 'seg-1'],
    expectText: { id: 'seg-1', text: 'final' },
  },
]

export function runDedupeCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of DEDUPE_CASES) {
    const out = dedupeMessagesById(c.input)
    const ids = out.map((m) => m.id)
    if (ids.length !== c.expectedIds.length || ids.some((id, i) => id !== c.expectedIds[i])) {
      failures.push(`${c.label}: expected ids [${c.expectedIds.join(',')}], got [${ids.join(',')}]`)
      continue
    }
    if (c.expectText) {
      const found = out.find((m) => m.id === c.expectText!.id)
      if (found?.text !== c.expectText.text) {
        failures.push(`${c.label}: id ${c.expectText.id} expected text "${c.expectText.text}", got "${found?.text}"`)
        continue
      }
    }
    if (c.expectSameRef && out !== c.input) {
      failures.push(`${c.label}: expected the same array reference (no-dup fast path) but got a new array`)
      continue
    }
  }
  return { passed: DEDUPE_CASES.length - failures.length, failures }
}
