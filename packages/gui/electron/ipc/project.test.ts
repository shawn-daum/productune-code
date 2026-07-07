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
import { detectProductuneLayout, buildRecentsWithMeta, readPrdtConfig } from './project'

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

// ── recents:listWithMeta — migrated (.prdt) project regression (T-321) ────────
//
// QA (T-320) confirmed live that a project migrated from `.productune/` to
// `.prdt/` (with the old dir renamed to `.productune.migrated/`, not deleted)
// shows up correctly in the launcher — but that code path (buildRecentsWithMeta,
// the pure builder backing the `recents:listWithMeta` IPC handler) had zero
// landed tests. This locks the behavior in and, per doctrine #4, proves the
// assertion set is discriminating: a naive legacy-only interpretation
// (checking only `.productune/config.json`) is asserted to give exists:false
// for the SAME fixture, so a regression that reintroduces that naive check
// would fail this test.

/** Migrated-project fixture: `.prdt/` state dir + a renamed (non-live) legacy dir. */
function makeMigratedProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-migrated-'))
  const prdtDir = path.join(root, '.prdt')
  fs.mkdirSync(prdtDir, { recursive: true })
  fs.writeFileSync(path.join(prdtDir, 'config.json'), JSON.stringify({ slug: 'migrated-proj' }), 'utf-8')
  fs.writeFileSync(path.join(prdtDir, 'po-state.json'), JSON.stringify({ version: 'v1.1', stage: 'build' }), 'utf-8')
  // Sibling of the OLD legacy dir, renamed by migration — NOT a live `.productune/`.
  fs.mkdirSync(path.join(root, '.productune.migrated'), { recursive: true })
  return root
}

/** Throwaway fixture $HOME seeded with a single recents.json entry for `projectDir`. */
function makeFixtureHome(projectDir: string): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-migrated-home-'))
  fs.mkdirSync(path.join(home, '.productune'), { recursive: true })
  const entries = [{ slug: 'migrated-proj-recent', projectDir, openedAt: new Date().toISOString() }]
  fs.writeFileSync(path.join(home, '.productune', 'recents.json'), JSON.stringify(entries), 'utf-8')
  return home
}

/** The OLD (pre-adapter) legacy-only interpretation — checks only `.productune/config.json`. */
function legacyOnlyExists(projectDir: string): boolean {
  return fs.existsSync(path.join(projectDir, '.productune', 'config.json'))
}

export const MIGRATED_RECENTS_CASES: readonly Case[] = [
  {
    label: 'migrated .prdt project → recents:listWithMeta resolves exists:true, version/stage/slug from .prdt config',
    run: () => {
      const projectDir = makeMigratedProject()
      const home = makeFixtureHome(projectDir)
      const rows = buildRecentsWithMeta(home)
      const row = rows.find((r) => r.projectDir === projectDir)
      if (!row) return fail(`no row for ${projectDir}; rows=${JSON.stringify(rows)}`)
      if (row.exists !== true) return fail(`exists=${row.exists}`)
      if (row.version !== 'v1.1') return fail(`version=${JSON.stringify(row.version)}`)
      if (row.stage !== 'build') return fail(`stage=${JSON.stringify(row.stage)}`)
      if (row.slug !== 'migrated-proj') return fail(`slug=${JSON.stringify(row.slug)}`)
      return ok
    },
  },
  {
    // Discrimination: the SAME fixture, judged by the naive legacy-only check
    // that a regression could reintroduce, must resolve to false — proving
    // the exists:true above genuinely depends on `.prdt/` recognition, not a
    // trivial always-true default.
    label: 'discrimination: same fixture under legacy-only (.productune/config.json) check → exists:false',
    run: () => {
      const projectDir = makeMigratedProject()
      return legacyOnlyExists(projectDir) === false ? ok : fail('legacy-only check unexpectedly true')
    },
  },
]

export function runMigratedRecentsCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of MIGRATED_RECENTS_CASES) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run()
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: MIGRATED_RECENTS_CASES.length - failures.length, failures }
}

// ── readPrdtConfig — create/migrate return-shape contract (T-319) ─────────────
//
// After `prdt init`/`prdt migrate` writes `.prdt/`, the IPC handlers read the
// config shape the renderer consumes (`result.config.slug` etc.) back off disk.
// This locks that read-back: slug/created_at come from config.json, version from
// po-state.json, with graceful fallbacks when a field/file is absent (so a create
// never returns a broken shape and the renderer's setProject({slug}) always works).

export const READ_PRDT_CONFIG_CASES: readonly Case[] = [
  {
    label: 'full .prdt state → slug/created_at from config.json, version from po-state.json',
    run: () => {
      const d = makeProject('.prdt', {
        'config.json': JSON.stringify({ slug: 'born-prdt', created_at: '2026-07-07T00:00:00Z' }),
        'po-state.json': JSON.stringify({ schema_version: 1, stage: 'define', version: 'v3', current_task: null }),
      })
      const c = readPrdtConfig(d, 'fallback-slug')
      if (c.slug !== 'born-prdt') return fail(`slug=${JSON.stringify(c.slug)}`)
      if (c.created_at !== '2026-07-07T00:00:00Z') return fail(`created_at=${JSON.stringify(c.created_at)}`)
      if (c.version !== 'v3') return fail(`version=${JSON.stringify(c.version)}`)
      return ok
    },
  },
  {
    label: 'absent .prdt files → graceful fallbacks (fallbackSlug, synthesized created_at, fallbackVersion)',
    run: () => {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-readcfg-'))
      const c = readPrdtConfig(d, 'fallback-slug', 'v9')
      if (c.slug !== 'fallback-slug') return fail(`slug=${JSON.stringify(c.slug)}`)
      if (c.version !== 'v9') return fail(`version=${JSON.stringify(c.version)}`)
      if (typeof c.created_at !== 'string' || c.created_at.length === 0) return fail(`created_at=${JSON.stringify(c.created_at)}`)
      return ok
    },
  },
]

export function runReadPrdtConfigCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of READ_PRDT_CONFIG_CASES) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run()
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: READ_PRDT_CONFIG_CASES.length - failures.length, failures }
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

test('recents:listWithMeta: migrated .prdt project resolves exists:true (with legacy-only discrimination)', () => {
  const { passed, failures } = runMigratedRecentsCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(MIGRATED_RECENTS_CASES.length)
})

test('T-319: readPrdtConfig maps .prdt state → renderer config shape (with fallbacks)', () => {
  const { passed, failures } = runReadPrdtConfigCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(READ_PRDT_CONFIG_CASES.length)
})
