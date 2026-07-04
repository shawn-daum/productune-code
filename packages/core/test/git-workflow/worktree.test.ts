/**
 * worktree.test.ts — T-284 QA-HIGH regression (same-pattern defect #3).
 *
 * `worktreeDir()` hardcoded `<projectDir>/.productune/worktrees/<ticketId>`.
 * In a prdt (`.prdt`-only) project this would resolve worktree state under a
 * shadow `.productune/` dir instead of `.prdt/`. `worktreeExists()` is the
 * only exported surface driven by the internal `worktreeDir()` path, so it is
 * used here to pin the resolved location without invoking real git.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect } from 'vitest'
import { worktreeExists } from '../../src/git-workflow/worktree'

function makeProject(subdirs: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'core-worktree-'))
  for (const s of subdirs) fs.mkdirSync(path.join(root, s), { recursive: true })
  return root
}

test('prdt project (.prdt only): worktree path resolves under .prdt/worktrees, not .productune', async () => {
  const d = makeProject(['.prdt'])
  const ticketId = 'T-284'

  // Not created yet under either layout.
  expect(await worktreeExists(d, ticketId)).toBe(false)

  fs.mkdirSync(path.join(d, '.prdt', 'worktrees', ticketId), { recursive: true })
  expect(await worktreeExists(d, ticketId)).toBe(true)

  // A worktree created at the legacy shadow location must NOT be picked up.
  fs.rmSync(path.join(d, '.prdt', 'worktrees'), { recursive: true, force: true })
  fs.mkdirSync(path.join(d, '.productune', 'worktrees', ticketId), { recursive: true })
  expect(await worktreeExists(d, ticketId)).toBe(false)
})

test('legacy project (.productune only): worktree path still resolves under .productune (unchanged)', async () => {
  const d = makeProject(['.productune'])
  const ticketId = 'T-284'

  fs.mkdirSync(path.join(d, '.productune', 'worktrees', ticketId), { recursive: true })
  expect(await worktreeExists(d, ticketId)).toBe(true)
})
