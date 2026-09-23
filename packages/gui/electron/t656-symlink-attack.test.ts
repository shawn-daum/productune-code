/**
 * t656-symlink-attack.test.ts — T-656 slice D2.
 *
 * Each of the seven GUI write sites slice C moved onto `atomicWriteFileSync`
 * is one row. Every row runs the SAME attack twice: plant `<target>.tmp` as a
 * symlink to a victim file, then fire the site's real entry point (the IPC
 * handler the renderer invokes, or the exported function) —
 *   • against the PINNED pre-fix body (`test-fixtures/pre-t656-*.ts`, copied
 *     from 71ef974, the commit before 054fe17) → the victim IS clobbered;
 *   • against the live body → the victim is untouched and the target holds
 *     the payload as a regular file.
 * Both halves are asserted in every row, so a row whose attack does not land
 * on the pre-fix body fails instead of passing vacuously.
 *
 * File-level vi.mock('electron') captures `ipcMain.handle` registrations
 * (urlRoute.test.ts precedent). Pre-fix and live modules register the same
 * channel names, so each run registers and reads its handler immediately.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import hookManifest from '../../core/scripts/hook-manifest.json'

type Handler = (event: unknown, ...args: any[]) => unknown
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => { handlers.set(channel, fn) },
    on: vi.fn(),
    off: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => os.tmpdir(), getVersion: () => '0.0.0', setLoginItemSettings: vi.fn(), getLoginItemSettings: () => ({}) },
  shell: { openExternal: vi.fn() },
}))

const VICTIM_BODY = 'VICTIM-ORIGINAL\n'

interface Ctx {
  home: string
  project: string
}

interface Row {
  site: string
  pre: () => Promise<any>
  live: () => Promise<any>
  /** Build whatever the site needs; return the destination file path it writes. */
  arrange: (ctx: Ctx) => string
  /** Fire the site; returns whatever the entry point returns. */
  act: (mod: any, ctx: Ctx) => unknown
}

/** Register the module's IPC handlers and return the one for `channel`. */
function handlerOf(mod: any, channel: string): Handler {
  handlers.clear()
  mod.register()
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`${channel} was never registered`)
  return fn
}

function makePrdtProject(root: string): void {
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.prdt', 'config.json'),
    JSON.stringify({ slug: 'demo', schema_v: 4 }, null, 2),
  )
}

function seedPrdtMirror(home: string): void {
  const hooksDir = path.join(home, '.prdt', 'hooks')
  fs.mkdirSync(hooksDir, { recursive: true })
  for (const b of hookManifest.basenames as string[]) fs.writeFileSync(path.join(hooksDir, b), '#!/bin/bash\n')
  fs.mkdirSync(path.join(home, '.prdt', 'bin'), { recursive: true })
  fs.writeFileSync(path.join(home, '.prdt', 'bin', 'statusline-prdt.sh'), '#!/bin/bash\n')
}

const ROWS: Row[] = [
  {
    site: 'po-session-config.ts setPoSessionOverride → .prdt/config.json',
    pre: () => import('./test-fixtures/pre-t656-po-session-config'),
    live: () => import('./po-session-config'),
    arrange: ({ project }) => {
      makePrdtProject(project)
      return path.join(project, '.prdt', 'config.json')
    },
    act: (m, { project }) => m.setPoSessionOverride(project, { model: 'opus', effort: 'high' }),
  },
  {
    site: 'ipc/settings.ts persona:writeSpec → ~/.claude/agents/<id>.md',
    pre: () => import('./test-fixtures/pre-t656-settings'),
    live: () => import('./ipc/settings'),
    arrange: ({ home }) => {
      const p = path.join(home, '.claude', 'agents', 'prdt-po.md')
      fs.mkdirSync(path.dirname(p), { recursive: true })
      return p
    },
    act: (m) => handlerOf(m, 'persona:writeSpec')(null, 'prdt-po', '# spec payload\n'),
  },
  {
    site: 'ipc/mcp.ts writeClaudeJson (mcp:save with projectDir) → ~/.claude.json',
    pre: () => import('./test-fixtures/pre-t656-mcp'),
    live: () => import('./ipc/mcp'),
    arrange: ({ home }) => path.join(home, '.claude.json'),
    act: (m, { project }) =>
      handlerOf(m, 'mcp:save')(null, 'demo-server', { command: 'echo' }, project),
  },
  {
    site: 'ipc/mcp.ts writeClaudeSettings (mcp:save without projectDir) → ~/.claude/settings.json',
    pre: () => import('./test-fixtures/pre-t656-mcp'),
    live: () => import('./ipc/mcp'),
    arrange: ({ home }) => {
      const p = path.join(home, '.claude', 'settings.json')
      fs.mkdirSync(path.dirname(p), { recursive: true })
      return p
    },
    act: (m) => handlerOf(m, 'mcp:save')(null, 'demo-server', { command: 'echo' }),
  },
  {
    site: 'ipc/doctrine.ts doctrine:writeFile → <project>/docs/po/habit.md',
    pre: () => import('./test-fixtures/pre-t656-doctrine'),
    live: () => import('./ipc/doctrine'),
    arrange: ({ project }) => {
      const p = path.join(project, 'docs', 'po', 'habit.md')
      fs.mkdirSync(path.dirname(p), { recursive: true })
      return p
    },
    act: (m, { project }) =>
      handlerOf(m, 'doctrine:writeFile')(null, path.join(project, 'docs', 'po', 'habit.md'), '# habit payload\n', null, project),
  },
  {
    site: 'ipc/html.ts html:writeFile → <project>/page.html',
    pre: () => import('./test-fixtures/pre-t656-html'),
    live: () => import('./ipc/html'),
    arrange: ({ project }) => path.join(project, 'page.html'),
    act: (m, { project }) =>
      handlerOf(m, 'html:writeFile')(null, project, path.join(project, 'page.html'), '<p>payload</p>\n', null),
  },
  {
    site: 'ipc/onboarding.ts installPrdtHooks → writeSettingsAtomic(~/.claude/settings.json)',
    pre: () => import('./test-fixtures/pre-t656-onboarding'),
    live: () => import('./ipc/onboarding'),
    arrange: ({ home }) => {
      seedPrdtMirror(home)
      const p = path.join(home, '.claude', 'settings.json')
      fs.mkdirSync(path.dirname(p), { recursive: true })
      return p
    },
    act: (m, { home }) => m.installPrdtHooks(path.join(home, '.claude', 'settings.json'), home),
  },
]

interface Observed {
  victimBody: string
  targetIsSymlink: boolean
  targetBody: string | null
  returned: unknown
}

let savedHome: string | undefined
let scratch: string[] = []

beforeEach(() => {
  savedHome = process.env.HOME
})

afterEach(() => {
  if (savedHome === undefined) delete process.env.HOME
  else process.env.HOME = savedHome
  for (const d of scratch) fs.rmSync(d, { recursive: true, force: true })
  scratch = []
})

/** One attack run on a fresh home + project + victim. */
async function attack(row: Row, load: () => Promise<any>): Promise<Observed> {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 't656-d2-')))
  scratch.push(base)
  const ctx: Ctx = { home: path.join(base, 'home'), project: path.join(base, 'project') }
  fs.mkdirSync(ctx.home, { recursive: true })
  fs.mkdirSync(ctx.project, { recursive: true })
  // Every os.homedir() the site computes lands in this run's own home.
  process.env.HOME = ctx.home
  expect(os.homedir()).toBe(ctx.home)

  const victim = path.join(base, 'victim.txt')
  fs.writeFileSync(victim, VICTIM_BODY)
  const target = row.arrange(ctx)
  fs.symlinkSync(victim, target + '.tmp')

  const mod = await load()
  const returned = await row.act(mod, ctx)

  let targetIsSymlink = false
  let targetBody: string | null = null
  try {
    targetIsSymlink = fs.lstatSync(target).isSymbolicLink()
    targetBody = fs.readFileSync(target, 'utf-8')
  } catch { /* target absent */ }
  return { victimBody: fs.readFileSync(victim, 'utf-8'), targetIsSymlink, targetBody, returned }
}

describe('T-656 D2 — GUI write sites vs a symlink planted at <target>.tmp', () => {
  it.each(ROWS.map((r) => [r.site, r] as const))('%s', async (_site, row) => {
    // Pre-fix half: the attack must LAND, or this row proves nothing.
    const pre = await attack(row, row.pre)
    expect(pre.victimBody, `pre-fix did not clobber the victim (returned ${JSON.stringify(pre.returned)})`).not.toBe(VICTIM_BODY)
    expect(pre.targetIsSymlink).toBe(true)

    // Live half: the victim survives and the payload lands in a regular file.
    const live = await attack(row, row.live)
    expect(live.victimBody).toBe(VICTIM_BODY)
    expect(live.targetIsSymlink).toBe(false)
    // Payloads embed per-run paths (home, project), so compare shape, not bytes.
    expect(live.targetBody).not.toBeNull()
    expect(live.targetBody!.length).toBeGreaterThan(0)
  })
})
