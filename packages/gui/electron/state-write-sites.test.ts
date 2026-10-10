/**
 * state-write-sites.test.ts — T-848 S4: the GUI main-process writers that touch a
 * project's `.prdt/` state go through core's stateWriteFileSync. Each site, with a
 * link planted at the file, at `.prdt` itself, and dangling: the call reports
 * failure, the victim stays byte-identical, nothing lands outside the project;
 * an existing file keeps its mode.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'

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

import { appendSubagentTurn } from './subagent-cost'
import * as onboarding from './ipc/onboarding'
import * as stateIpc from './ipc/state'

const VICTIM_BODY = 'VICTIM-ORIGINAL\n'
let project: string
let outside: string

beforeEach(() => {
  project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sws-gui-proj-')))
  outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sws-gui-out-')))
  fs.mkdirSync(path.join(project, '.prdt'))
  handlers.clear()
})
afterEach(() => {
  fs.rmSync(project, { recursive: true, force: true })
  fs.rmSync(outside, { recursive: true, force: true })
})

function handler(mod: { register: () => void }, channel: string): Handler {
  mod.register()
  const h = handlers.get(channel)
  if (!h) throw new Error(`no handler ${channel}`)
  return h
}

interface Site {
  name: string
  file: string
  /** seed a valid existing file so the site has something to rewrite */
  seed: string
  /** run the site; true when it reported success */
  run: () => boolean
}

const sites: Site[] = [
  {
    name: 'subagent-cost turns.jsonl (append)',
    file: 'turns.jsonl',
    seed: '{"old":1}\n',
    run: () => appendSubagentTurn(project, 'prdt-developer', {
      usage: { input_tokens: 1, output_tokens: 2 }, model: 'm', cost_usd: 0.01, sessionId: 's',
    } as any),
  },
  {
    name: 'onboarding writeOnboardingPending',
    file: 'onboarding.json',
    seed: '{"status":"pending"}',
    run: () => {
      try { onboarding.writeOnboardingPending(project, 'wizard' as any); return true } catch { return false }
    },
  },
  {
    name: 'onboarding:setDone',
    file: 'onboarding.json',
    seed: '{"status":"pending"}',
    run: () => (handler(onboarding, 'onboarding:setDone')({}, project) as { ok: boolean }).ok,
  },
  {
    name: 'phase:approve (po-state.json)',
    file: 'po-state.json',
    seed: JSON.stringify({ stage: 'define', phase_history: [] }),
    run: () => (handler(stateIpc, 'phase:approve')({}, {
      projectDir: project, toPhase: 'build', userApprovedAt: '2026-10-10T00:00:00Z',
    }) as { ok: boolean }).ok,
  },
]

describe.each(sites)('$name', (site) => {
  const target = () => path.join(project, '.prdt', site.file)

  test('writes normally and keeps an existing file mode (0640)', () => {
    fs.writeFileSync(target(), site.seed)
    fs.chmodSync(target(), 0o640)
    expect(site.run()).toBe(true)
    expect(fs.statSync(target()).mode & 0o7777).toBe(0o640)
    expect(fs.readFileSync(target(), 'utf-8')).not.toBe(site.seed)
    expect(fs.readdirSync(path.join(project, '.prdt'))).toEqual([site.file])
  })

  test('file is a link to a victim → refused, victim byte-identical', () => {
    const v = path.join(outside, 'victim')
    fs.writeFileSync(v, VICTIM_BODY)
    fs.symlinkSync(v, target())
    expect(site.run()).toBe(false)
    expect(fs.readFileSync(v, 'utf-8')).toBe(VICTIM_BODY)
    expect(fs.lstatSync(target()).isSymbolicLink()).toBe(true)
  })

  test('file is a dangling link → nothing created at its target', () => {
    const missing = path.join(outside, 'missing')
    fs.symlinkSync(missing, target())
    expect(site.run()).toBe(false)
    expect(fs.existsSync(missing)).toBe(false)
  })

  test('.prdt is a link to a directory → refused, nothing written outside', () => {
    fs.writeFileSync(path.join(outside, site.file), VICTIM_BODY)
    fs.rmSync(path.join(project, '.prdt'), { recursive: true })
    fs.symlinkSync(outside, path.join(project, '.prdt'))
    expect(site.run()).toBe(false)
    expect(fs.readFileSync(path.join(outside, site.file), 'utf-8')).toBe(VICTIM_BODY)
    expect(fs.readdirSync(outside)).toEqual([site.file])
  })

  test('hard-linked file → refused, victim byte-identical', () => {
    const v = path.join(outside, 'victim')
    fs.writeFileSync(v, VICTIM_BODY)
    fs.linkSync(v, target())
    expect(site.run()).toBe(false)
    expect(fs.readFileSync(v, 'utf-8')).toBe(VICTIM_BODY)
  })
})
