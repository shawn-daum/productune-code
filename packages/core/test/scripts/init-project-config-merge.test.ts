/**
 * init-project-config-merge.test.ts — T-365 regression: initProject must be a
 * field-preserving merge over an existing config.json, never a from-scratch
 * rebuild.
 *
 * Landmine (T-364 handoff): the legacy initializer reconstructed config.json
 * keeping only slug/created_at/schema_v/surfaces, so a re-init (GUI heal path,
 * po-session-cycle) silently dropped `meta.allowlist` — and with it the meta
 * split boundary. Same contract as meta-git.ts writeMetaAllowlist: preserve
 * every field you don't own, write atomically.
 *
 * T-PATCH-112 stamp policy (cases A/B/C/D) must survive the fix unchanged.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { test, expect, beforeEach, afterEach } from 'vitest'
// @ts-expect-error — plain .mjs SoT with .d.mts companion resolved at build; vitest imports it directly
import { initProject, latestSchemaV } from '../../scripts/lib/init-project.mjs'

const CORE_ROOT = path.resolve(__dirname, '..', '..')

let projectDir: string
let savedHome: string | undefined

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-merge-'))
  // initProject touches ~/.claude.json (trust accept) + ~/.productune — sandbox HOME
  savedHome = process.env.HOME
  process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'init-merge-home-'))
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
  if (process.env.HOME) fs.rmSync(process.env.HOME, { recursive: true, force: true })
  process.env.HOME = savedHome
})

function configPath(): string {
  return path.join(projectDir, '.productune', 'config.json')
}

function writeConfig(obj: object): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(obj, null, 2))
}

function readConfig(): any {
  return JSON.parse(fs.readFileSync(configPath(), 'utf-8'))
}

const initOpts = () => ({ slug: 'fresh-slug', projectDir, skipDoctrine: true, coreRoot: CORE_ROOT })

test('re-init preserves meta.allowlist and unknown fields (regression)', () => {
  writeConfig({
    slug: 'kept-slug',
    created_at: '2026-01-01T00:00:00Z',
    schema_v: 3,
    surfaces: { gui: true },
    meta: { allowlist: ['.prdt', 'docs/prd', 'docs/backlog.md'] },
    custom_field: 'kept',
  })

  initProject(initOpts())

  const cfg = readConfig()
  expect(cfg.meta).toEqual({ allowlist: ['.prdt', 'docs/prd', 'docs/backlog.md'] })
  expect(cfg.custom_field).toBe('kept')
  expect(cfg.slug).toBe('kept-slug')
  expect(cfg.created_at).toBe('2026-01-01T00:00:00Z')
  expect(cfg.surfaces).toEqual({ gui: true })
})

// ── T-PATCH-112 stamp policy unchanged ────────────────────────────────────────

test('case A: existing schema_v is preserved as-is', () => {
  writeConfig({ slug: 's', schema_v: 2 })
  initProject(initOpts())
  expect(readConfig().schema_v).toBe(2)
})

test('case B: fresh config stamps latest schema_v', () => {
  initProject(initOpts())
  expect(readConfig().schema_v).toBe(latestSchemaV(CORE_ROOT))
  expect(readConfig().slug).toBe('fresh-slug')
})

test('case C: fresh + stampSchemaV:false omits schema_v', () => {
  initProject({ ...initOpts(), stampSchemaV: false })
  expect(readConfig().schema_v).toBeUndefined()
})

test('case D: corrupt config → fresh treat, schema_v omitted', () => {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), '{ not json')
  initProject(initOpts())
  const cfg = readConfig()
  expect(cfg.slug).toBe('fresh-slug')
  expect(cfg.schema_v).toBeUndefined()
})

test('write is atomic — no .tmp residue next to config.json', () => {
  initProject(initOpts())
  const dir = path.dirname(configPath())
  expect(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([])
})
