/**
 * detectProductuneLayout — dual-mode open detection (T-284 / adapter A1).
 *
 * Proves the acceptance "GUI opens both a legacy and a prdt project without
 * error" at the detection layer: a `.prdt/` project and a `.productune/` project
 * both classify as 'self-current' with the right config, and prdt's briefs/·po.lock
 * markers do NOT downgrade it to legacy. Legacy classification is unchanged.
 *
 * Builds throwaway project dirs under os.tmpdir mkdtemp; electron/core imports are
 * stubbed by vitest.setup.ts. Case-list + vitest-driver idiom (costArchive.test.ts).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { detectProductuneLayout } from './project'

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

/** Temp project dir with a state dir seeded with the given files. */
function makeProject(stateDirName: string, files: Record<string, string> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-detect-'))
  const sd = path.join(root, stateDirName)
  fs.mkdirSync(sd, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(sd, name), content, 'utf-8')
  }
  return root
}

const ok = { ok: true } as const
const fail = (detail: string) => ({ ok: false, detail })

export const DETECT_CASES: readonly Case[] = [
  {
    label: 'prdt project (.prdt/config.json) → self-current with config',
    run: () => {
      const d = makeProject('.prdt', { 'config.json': JSON.stringify({ slug: 'my-prdt' }) })
      const r = detectProductuneLayout(d)
      if (r.kind !== 'self-current') return fail(`kind=${r.kind}`)
      if (r.config?.slug !== 'my-prdt') return fail(`slug=${JSON.stringify(r.config?.slug)}`)
      return ok
    },
  },
  {
    label: 'prdt project without config → self-current, basename slug (no heal)',
    run: () => {
      const d = makeProject('.prdt', { 'po-state.json': '{"schema_version":1}' })
      const r = detectProductuneLayout(d)
      if (r.kind !== 'self-current') return fail(`kind=${r.kind}`)
      if (r.config?.slug !== path.basename(d)) return fail(`slug=${JSON.stringify(r.config?.slug)}`)
      return ok
    },
  },
  {
    label: 'prdt project with legacy-style markers (briefs/po.lock) → still self-current (not legacy)',
    run: () => {
      const d = makeProject('.prdt', { 'config.json': JSON.stringify({ slug: 'p' }) })
      fs.mkdirSync(path.join(d, '.prdt', 'briefs'), { recursive: true })
      fs.writeFileSync(path.join(d, '.prdt', 'po.lock'), '')
      const r = detectProductuneLayout(d)
      return r.kind === 'self-current' ? ok : fail(`kind=${r.kind}`)
    },
  },
  {
    label: 'legacy project (.productune/config.json) → self-current (unchanged)',
    run: () => {
      const d = makeProject('.productune', { 'config.json': JSON.stringify({ slug: 'legacy' }) })
      const r = detectProductuneLayout(d)
      if (r.kind !== 'self-current') return fail(`kind=${r.kind}`)
      return r.config?.slug === 'legacy' ? ok : fail(`slug=${JSON.stringify(r.config?.slug)}`)
    },
  },
  {
    label: 'legacy config-less with briefs/po.lock → self-legacy (unchanged)',
    run: () => {
      const d = makeProject('.productune')
      fs.mkdirSync(path.join(d, '.productune', 'briefs'), { recursive: true })
      fs.writeFileSync(path.join(d, '.productune', 'po.lock'), '')
      const r = detectProductuneLayout(d)
      return r.kind === 'self-legacy' ? ok : fail(`kind=${r.kind}`)
    },
  },
  {
    label: 'no state dir → none',
    run: () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-detect-empty-'))
      const r = detectProductuneLayout(root)
      return r.kind === 'none' ? ok : fail(`kind=${r.kind}`)
    },
  },
]

export function runDetectCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of DETECT_CASES) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run()
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: DETECT_CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('detectProductuneLayout: all dual-mode detection cases pass', () => {
  const { passed, failures } = runDetectCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(DETECT_CASES.length)
})
