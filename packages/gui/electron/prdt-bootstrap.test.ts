/**
 * T-431: GUI in-app prdt bootstrap — unit tests against a fixture HOME + the
 * REAL packages/core payload (same relative-path pattern as
 * onboarding.rosterParity.test.ts). No real ~/.prdt / ~/.claude is touched.
 *
 * The bootstrap is the TS equivalent of install.sh §1/§2/§3/§5 (mirror, env,
 * agents, PATH symlink) plus the SAME installPrdtHooks (§4/§6) the T-305 banner
 * uses, gated by a provenance policy:
 *   - `~/.prdt/bin/prdt` missing            → provision (participant first launch)
 *   - mirror incomplete (hook/doctrine gone) → provision (repair)
 *   - gui marker present, app version drift  → provision (app update refresh)
 *   - complete mirror, NO gui marker         → NEVER touch (repo-managed install:
 *     install.sh/`prdt update` own that machine — the bundled payload must not
 *     downgrade a newer repo mirror)
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { test, expect, beforeEach, afterEach } from 'vitest'
import {
  decideBootstrap,
  runBootstrap,
  ensurePrdtProvisioned,
  guiMarkerPath,
} from './prdt-bootstrap'
import hookManifest from '../../core/scripts/hook-manifest.json'

const HERE = path.dirname(fileURLToPath(import.meta.url))
// packages/gui/electron → packages/core (the real payload shape the app bundles)
const PAYLOAD = path.resolve(HERE, '..', '..', 'core')

let home: string
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-bootstrap-test-'))
})
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true })
})

const APP_V = '0.5.0'
const paths = (over: Partial<{ appVersion: string }> = {}) => ({
  payloadRoot: PAYLOAD,
  homeDir: home,
  appVersion: over.appVersion ?? APP_V,
})

function seedCompleteMirror(homeDir: string): void {
  // Minimal "complete" ~/.prdt as a repo install.sh would leave it.
  const prdt = path.join(homeDir, '.prdt')
  fs.mkdirSync(path.join(prdt, 'hooks'), { recursive: true })
  fs.mkdirSync(path.join(prdt, 'bin'), { recursive: true })
  fs.mkdirSync(path.join(prdt, 'discipline'), { recursive: true })
  fs.writeFileSync(path.join(prdt, 'doctrine.md'), '# doctrine\n')
  fs.writeFileSync(path.join(prdt, 'bin', 'prdt'), '#!/usr/bin/env python3\n', { mode: 0o755 })
  fs.writeFileSync(path.join(prdt, 'bin', 'statusline-prdt.sh'), '#!/bin/bash\n', { mode: 0o755 })
  for (const b of hookManifest.basenames) {
    fs.writeFileSync(path.join(prdt, 'hooks', b), '#!/bin/bash\n', { mode: 0o755 })
  }
}

// ── decideBootstrap ───────────────────────────────────────────────────────────

test('T-431: empty HOME (no ~/.prdt) → provision, reason missing-bin', () => {
  expect(decideBootstrap(paths())).toEqual({ action: 'provision', reason: 'missing-bin' })
})

test('T-431: complete mirror WITHOUT gui marker (repo install) → skip, never touched', () => {
  seedCompleteMirror(home)
  expect(decideBootstrap(paths())).toEqual({ action: 'skip', reason: 'foreign-install' })
})

test('T-431: complete mirror + gui marker at CURRENT app version → skip current', () => {
  seedCompleteMirror(home)
  fs.writeFileSync(guiMarkerPath(home), JSON.stringify({ app_version: APP_V }))
  expect(decideBootstrap(paths())).toEqual({ action: 'skip', reason: 'current' })
})

test('T-431: gui marker at OLDER app version → provision gui-stale (app-update refresh)', () => {
  seedCompleteMirror(home)
  fs.writeFileSync(guiMarkerPath(home), JSON.stringify({ app_version: '0.4.0' }))
  expect(decideBootstrap(paths())).toEqual({ action: 'provision', reason: 'gui-stale' })
})

test('T-431: bin/prdt present but a manifest hook missing → provision incomplete-mirror', () => {
  seedCompleteMirror(home)
  fs.rmSync(path.join(home, '.prdt', 'hooks', hookManifest.basenames[0]))
  expect(decideBootstrap(paths())).toEqual({ action: 'provision', reason: 'incomplete-mirror' })
})

// ── runBootstrap end-to-end on a fresh HOME ───────────────────────────────────

test('T-431: runBootstrap on empty HOME provisions mirror + agents + hooks + statusline + env + marker', () => {
  const res = runBootstrap(paths())
  expect(res.ok).toBe(true)

  const prdt = path.join(home, '.prdt')
  // §1 mirror
  expect(fs.existsSync(path.join(prdt, 'doctrine.md'))).toBe(true)
  expect(fs.existsSync(path.join(prdt, 'discipline', 'contracts.md'))).toBe(true)
  for (const b of hookManifest.basenames) {
    expect(fs.existsSync(path.join(prdt, 'hooks', b))).toBe(true)
  }
  const binPrdt = path.join(prdt, 'bin', 'prdt')
  expect(fs.existsSync(binPrdt)).toBe(true)
  expect(fs.statSync(binPrdt).mode & 0o111).not.toBe(0) // executable
  expect(fs.existsSync(path.join(prdt, 'bin', 'statusline-prdt.sh'))).toBe(true)
  // menus regenerated against the installed mirror (real `prdt menus` run)
  expect(fs.existsSync(path.join(prdt, 'discipline', 'developer', 'playbooks', '_index.md'))).toBe(true)

  // §2 prdt.env
  const env = fs.readFileSync(path.join(prdt, 'prdt.env'), 'utf-8')
  expect(env).toContain(`PRDT_REPO=${PAYLOAD}`)
  expect(env).toContain('PRDT_HOOKS_INSTALLED=true')

  // §3 agents
  expect(fs.existsSync(path.join(home, '.claude', 'agents', 'prdt-po.md'))).toBe(true)
  expect(fs.existsSync(path.join(home, '.claude', 'agents', 'prdt-developer.md'))).toBe(true)

  // §4/§6 settings.json — all 8 hook commands + statusline registered
  const settings = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf-8'))
  const commands: string[] = []
  for (const entries of Object.values(settings.hooks as Record<string, any[]>)) {
    for (const entry of entries) for (const h of entry.hooks) commands.push(h.command)
  }
  for (const b of hookManifest.basenames) {
    expect(commands.some((c) => c.includes(b))).toBe(true)
  }
  expect(settings.statusLine?.command).toContain('statusline-prdt.sh')
  // statusline registered on a fresh install → env flag flipped, install.sh §6 parity
  expect(fs.readFileSync(path.join(prdt, 'prdt.env'), 'utf-8')).toContain('PRDT_STATUSLINE_INSTALLED=true')

  // §5 PATH symlink
  const link = path.join(home, '.local', 'bin', 'prdt')
  expect(fs.lstatSync(link).isSymbolicLink()).toBe(true)

  // marker
  const marker = JSON.parse(fs.readFileSync(guiMarkerPath(home), 'utf-8'))
  expect(marker.app_version).toBe(APP_V)
})

test('T-431: re-running bootstrap is idempotent — no duplicate hook registration, custom statusLine + prdt.env preserved', () => {
  expect(runBootstrap(paths()).ok).toBe(true)

  // User customizes between runs: custom statusLine + edited prdt.env
  const settingsPath = path.join(home, '.claude', 'settings.json')
  const s1 = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  s1.statusLine = { type: 'command', command: '/custom/statusline.sh' }
  fs.writeFileSync(settingsPath, JSON.stringify(s1, null, 2))
  const envPath = path.join(home, '.prdt', 'prdt.env')
  const envBefore = fs.readFileSync(envPath, 'utf-8') + 'USER_CUSTOM=1\n'
  fs.writeFileSync(envPath, envBefore)

  expect(runBootstrap(paths({ appVersion: '0.6.0' })).ok).toBe(true)

  const s2 = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  // custom statusLine preserved (install.sh §6 "auto" semantics)
  expect(s2.statusLine.command).toBe('/custom/statusline.sh')
  // each hook basename registered exactly once
  const commands: string[] = []
  for (const entries of Object.values(s2.hooks as Record<string, any[]>)) {
    for (const entry of entries) for (const h of entry.hooks) commands.push(h.command)
  }
  for (const b of hookManifest.basenames) {
    const uses = commands.filter((c) => c.includes(b))
    // session-start-family hooks ride 2 events (SessionStart + SubagentStart);
    // parity with the manifest, but never MORE than the manifest says.
    const expected = hookManifest.registrations.filter((r) => r.hooks.includes(b)).length
    expect(uses.length).toBe(expected)
  }
  // prdt.env untouched on re-run (existing env is never rewritten/repointed)
  expect(fs.readFileSync(envPath, 'utf-8')).toBe(envBefore)
  // marker refreshed to the new app version
  expect(JSON.parse(fs.readFileSync(guiMarkerPath(home), 'utf-8')).app_version).toBe('0.6.0')
})

test('T-431: ensurePrdtProvisioned on a repo-managed install performs nothing', () => {
  seedCompleteMirror(home)
  const doctrine = path.join(home, '.prdt', 'doctrine.md')
  const before = fs.readFileSync(doctrine, 'utf-8')
  const res = ensurePrdtProvisioned(paths())
  expect(res.performed).toBe(false)
  expect(res.ok).toBe(true)
  expect(fs.readFileSync(doctrine, 'utf-8')).toBe(before) // untouched
  expect(fs.existsSync(guiMarkerPath(home))).toBe(false)  // no marker planted
})

test('T-431: missing python3 → fails BEFORE touching disk, actionable code', () => {
  const res = runBootstrap({ ...paths(), checkPython: () => false })
  expect(res.ok).toBe(false)
  expect(res.code).toBe('missing-python3')
  expect(fs.existsSync(path.join(home, '.prdt'))).toBe(false)
})

// ── Full parity with install.sh (beyond the T-414 hook-shape parity) ──────────
//
// Runs the REAL install.sh into fixture home A and runBootstrap into fixture
// home B, then diffs the machine state both leave behind: the ~/.prdt mirror
// file set, the ~/.claude/agents roster, the settings.json hooks+statusLine
// shape (home-prefix-normalized), and the prdt.env key set. Because both sides
// are the real production code paths, any future install.sh step change that
// the TS bootstrap misses fails loudly here.
test('T-431: runBootstrap leaves the same machine state as install.sh (mirror/agents/settings/env parity)', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-bootstrap-parity-'))
  const homeA = path.join(fixture, 'a') // install.sh
  const homeB = path.join(fixture, 'b') // runBootstrap
  fs.mkdirSync(homeA, { recursive: true })
  fs.mkdirSync(homeB, { recursive: true })
  try {
    const { execFileSync } = require('child_process') as typeof import('child_process')
    execFileSync('bash', [path.join(PAYLOAD, 'scripts', 'install.sh')], {
      env: {
        ...process.env,
        HOME: homeA,
        PRDT_HOME: path.join(homeA, '.prdt'),
        CLAUDE_DIR: path.join(homeA, '.claude'),
      },
      timeout: 60_000,
      stdio: 'ignore',
    })
    expect(runBootstrap({ payloadRoot: PAYLOAD, homeDir: homeB, appVersion: APP_V }).ok).toBe(true)

    const listRec = (dir: string, base = dir): string[] => {
      const out: string[] = []
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) out.push(...listRec(p, base))
        else out.push(path.relative(base, p))
      }
      return out.sort()
    }

    // ~/.prdt mirror file set — identical apart from the documented app-managed
    // marker (gui-bootstrap.json, written only by the GUI bootstrap).
    const setA = listRec(path.join(homeA, '.prdt'))
    const setB = listRec(path.join(homeB, '.prdt')).filter((f) => f !== 'gui-bootstrap.json')
    expect(setB).toEqual(setA)

    // agents roster
    expect(fs.readdirSync(path.join(homeB, '.claude', 'agents')).sort())
      .toEqual(fs.readdirSync(path.join(homeA, '.claude', 'agents')).sort())

    // settings.json hooks + statusLine (normalize the differing home prefixes)
    const norm = (home: string) =>
      JSON.parse(
        fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf-8')
          .split(path.join(home, '.prdt')).join('~PRDT~'),
      )
    const a = norm(homeA)
    const b = norm(homeB)
    expect(b.hooks).toEqual(a.hooks)
    expect(b.statusLine).toEqual(a.statusLine)

    // prdt.env — same keys, same values except created_at (timestamps differ)
    const envKV = (home: string) =>
      Object.fromEntries(
        fs.readFileSync(path.join(home, '.prdt', 'prdt.env'), 'utf-8')
          .split('\n').filter(Boolean)
          .map((l) => l.split('=') as [string, string])
          .map(([k, v]) => [k, k === 'created_at' ? '<ts>' : v]),
      )
    expect(envKV(homeB)).toEqual(envKV(homeA))
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})

test('T-431: missing payload → fails with payload-missing, nothing written', () => {
  const res = runBootstrap({ ...paths(), payloadRoot: path.join(home, 'nowhere') })
  expect(res.ok).toBe(false)
  expect(res.code).toBe('payload-missing')
  expect(fs.existsSync(path.join(home, '.prdt'))).toBe(false)
})
