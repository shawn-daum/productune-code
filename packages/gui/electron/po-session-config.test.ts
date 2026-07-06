/**
 * po-session-config — GUI model/effort override persistence (T-310).
 *
 * Cases cover:
 *   - prdt project: read defaults ({} / supported=true), round-trip set→get,
 *     clearing back to inherit, invalid-value rejection (write ignored / read
 *     falls back to inherit), and existing config keys surviving the merge
 *     write (jq-style merge, not a full-object rewrite).
 *   - legacy `.productune` project: always `{}` / `supported:false`, and a
 *     write attempt is refused WITHOUT touching the file on disk.
 *   - missing config.json: write refused (config-missing) rather than creating one.
 *
 * Mirrors the case-list + vitest driver idiom of project-paths.test.ts.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  getPoSessionOverride,
  getPoSessionConfig,
  setPoSessionOverride,
} from './po-session-config'

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

const eq = (got: unknown, want: unknown): { ok: boolean; detail?: string } =>
  JSON.stringify(got) === JSON.stringify(want)
    ? { ok: true }
    : { ok: false, detail: `got=${JSON.stringify(got)} want=${JSON.stringify(want)}` }

/** Make a temp prdt project with a seeded config.json (default: minimal realistic shape). */
function makePrdtProject(configExtra: Record<string, unknown> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-posession-'))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  const cfg = { slug: 'demo', created_at: '2026-01-01T00:00:00.000Z', schema_v: 4, ...configExtra }
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify(cfg, null, 2))
  return root
}

/** Make a temp legacy project with a seeded .productune/config.json. */
function makeLegacyProject(configExtra: Record<string, unknown> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-posession-legacy-'))
  fs.mkdirSync(path.join(root, '.productune'), { recursive: true })
  const cfg = { slug: 'demo-legacy', ...configExtra }
  fs.writeFileSync(path.join(root, '.productune', 'config.json'), JSON.stringify(cfg, null, 2))
  return root
}

function readCfg(root: string, ...segments: string[]): any {
  return JSON.parse(fs.readFileSync(path.join(root, ...segments), 'utf-8'))
}

export const PO_SESSION_CONFIG_CASES: readonly Case[] = [
  {
    label: 'prdt project, no keys set → getPoSessionOverride() === {}',
    run: () => eq(getPoSessionOverride(makePrdtProject()), {}),
  },
  {
    label: 'prdt project, no keys set → getPoSessionConfig() supported=true, both null',
    run: () => eq(getPoSessionConfig(makePrdtProject()), { supported: true, model: null, effort: null }),
  },
  {
    label: 'prdt project → set model+effort round-trips through getPoSessionOverride',
    run: () => {
      const dir = makePrdtProject()
      const w = setPoSessionOverride(dir, { model: 'opus', effort: 'high' })
      if (!w.ok) return { ok: false, detail: `write failed: ${w.error}` }
      return eq(getPoSessionOverride(dir), { model: 'opus', effort: 'high' })
    },
  },
  {
    label: 'prdt project → existing unrelated config keys survive the merge write (no full rewrite)',
    run: () => {
      const dir = makePrdtProject({ surfaces: { gui: { type: 'electron' } } })
      setPoSessionOverride(dir, { model: 'sonnet' })
      const cfg = readCfg(dir, '.prdt', 'config.json')
      const r1 = eq(cfg.slug, 'demo')
      if (!r1.ok) return r1
      const r2 = eq(cfg.schema_v, 4)
      if (!r2.ok) return r2
      const r3 = eq(cfg.surfaces, { gui: { type: 'electron' } })
      if (!r3.ok) return r3
      return eq(cfg.gui_model, 'sonnet')
    },
  },
  {
    label: 'prdt project → clearing (null) removes the key, resolves back to inherit',
    run: () => {
      const dir = makePrdtProject()
      setPoSessionOverride(dir, { model: 'opus', effort: 'max' })
      setPoSessionOverride(dir, { model: null, effort: null })
      const r1 = eq(getPoSessionOverride(dir), {})
      if (!r1.ok) return r1
      const cfg = readCfg(dir, '.prdt', 'config.json')
      const r2 = eq('gui_model' in cfg, false)
      if (!r2.ok) return r2
      return eq('gui_effort' in cfg, false)
    },
  },
  {
    label: 'prdt project → omitted field in a set() call leaves the OTHER field untouched',
    run: () => {
      const dir = makePrdtProject()
      setPoSessionOverride(dir, { model: 'opus', effort: 'high' })
      setPoSessionOverride(dir, { model: 'sonnet' }) // effort omitted
      return eq(getPoSessionOverride(dir), { model: 'sonnet', effort: 'high' })
    },
  },
  {
    label: 'prdt project → out-of-allowlist value on disk is ignored (falls back to inherit)',
    run: () => {
      const dir = makePrdtProject({ gui_model: 'not-a-real-model', gui_effort: 'ultra' })
      return eq(getPoSessionOverride(dir), {})
    },
  },
  {
    label: 'legacy project → getPoSessionOverride() always {} even with gui_model/gui_effort present',
    run: () => eq(getPoSessionOverride(makeLegacyProject({ gui_model: 'opus', gui_effort: 'high' })), {}),
  },
  {
    label: 'legacy project → getPoSessionConfig() supported=false',
    run: () => eq(getPoSessionConfig(makeLegacyProject()), { supported: false, model: null, effort: null }),
  },
  {
    label: 'legacy project → setPoSessionOverride() refused, legacy config.json untouched',
    run: () => {
      const dir = makeLegacyProject()
      const before = fs.readFileSync(path.join(dir, '.productune', 'config.json'), 'utf-8')
      const w = setPoSessionOverride(dir, { model: 'opus' })
      const r1 = eq(w.ok, false)
      if (!r1.ok) return r1
      const after = fs.readFileSync(path.join(dir, '.productune', 'config.json'), 'utf-8')
      return eq(after, before)
    },
  },
  {
    label: 'prdt project with no config.json yet → setPoSessionOverride() refused (config-missing), no file created',
    run: () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-posession-noconfig-'))
      fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
      const w = setPoSessionOverride(root, { model: 'opus' })
      const r1 = eq(w.ok, false)
      if (!r1.ok) return r1
      return eq(fs.existsSync(path.join(root, '.prdt', 'config.json')), false)
    },
  },
]

export function runPoSessionConfigCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of PO_SESSION_CONFIG_CASES) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run()
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: PO_SESSION_CONFIG_CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('T-310: po-session-config override read/write cases pass', () => {
  const { passed, failures } = runPoSessionConfigCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(PO_SESSION_CONFIG_CASES.length)
})
