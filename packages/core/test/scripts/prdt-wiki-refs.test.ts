/**
 * prdt-wiki-refs.test.ts — T-448 `prdt wiki refs`, black-box over the REAL `prdt`
 * CLI (idiom: prdt-wiki-machine-store.test.ts).
 *
 * Why it exists: `[ctx].wiki_refs` was recalled from memory. In T-442 three
 * dispatches went out with an empty array while `machine:fact--qa-cua-vm` ("this
 * machine: window focus / synthetic keys / IME verification runs in the VM") sat
 * one lookup away — QA booted a GUI on the host. The regression test below feeds
 * that dispatch's own `change_meta` and demands the machine page come back.
 *
 * The other three tests pin the properties that keep it usable every dispatch:
 * precision (a word most pages carry drags nothing in), a clean empty return, and
 * the honesty line — the tool matches WORDING, so the class it cannot see has to
 * be stated rather than left for the PO to discover by being burned again.
 *
 * `PRDT_HOME` drives the machine store, so no test reads or writes the real ~/.prdt.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let sandbox: string
let machineHome: string
let proj: string

function runPrdt(args: string[]): string {
  return execFileSync('python3', [PRDT_CLI, ...args], {
    cwd: proj, env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
  })
}

/** `prdt wiki refs <json>` → the candidate page names, in rank order. */
function refs(payload: unknown): string[] {
  return runPrdt(['wiki', 'refs', JSON.stringify(payload)])
    .split('\n')
    .filter((l) => l && !l.startsWith(' ') && !l.startsWith('matched on') && !l.startsWith('('))
    .map((l) => l.split(' — ')[0])
}

function writePage(dir: string, name: string, title: string, body: string) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${name}.md`),
    `---\ntitle: ${title}\ntype: ${name.split('--')[0]}\nstatus: live\n---\n${body}\n`)
}
const projectPage = (n: string, t: string, b: string) => writePage(path.join(proj, 'docs', 'wiki'), n, t, b)
const machinePage = (n: string, t: string, b: string) => writePage(path.join(machineHome, 'wiki'), n, t, b)

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-wiki-refs-'))
  machineHome = path.join(sandbox, 'prdt-home')
  fs.mkdirSync(path.join(machineHome, 'wiki'), { recursive: true })
  proj = path.join(sandbox, 'proj')
  fs.mkdirSync(proj, { recursive: true })
  execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: proj, env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000,
  })
})

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt wiki refs (T-448)', () => {
  /** The T-442 dispatch, verbatim from the transcript — it shipped `wiki_refs: []`. */
  const T442 = {
    slug: 'electron-runaway-spawn-guard',
    change_meta: {
      files: [
        'code/packages/gui/tests/smoke.spec.ts',
        'code/packages/gui/tests/theme.spec.ts',
        'code/packages/gui/electron/toolchain.ts',
        'code/packages/gui/playwright.config.ts',
      ],
      user_facing: true,
      risk_flags: ['machine-hang', 'test-isolation-violation', 'real-home-mutation', 'uncommitted-diff'],
      stage: 'build',
    },
  }

  test('the T-442 dispatch surfaces the machine page it missed, ahead of project pages', () => {
    machinePage('fact--qa-cua-vm', 'QA CUA VM — isolation env',
      'Window focus, synthetic keys and IME switching run inside the lume VM, never on the host. ' +
      'Isolation was proven end to end with playwright driving Electron in the guest; a host run ' +
      'leaked keystrokes into the real session.')
    projectPage('decision--team-git-rules', 'team git rules',
      'Trunk based development, conventional commits, one worktree per track.')
    projectPage('term--stage', 'stage', 'define, build, ship, retro, idle.')

    const out = runPrdt(['wiki', 'refs', JSON.stringify(T442)])
    expect(out).toMatch(/^machine:fact--qa-cua-vm/)
    // scope is unmistakable — a machine page must never read as a page of this project
    expect(out).toMatch(/\[machine wiki — this machine, any project on it\]/)
    // and the reason is shown, so a wrong hit costs one glance to dismiss
    expect(out).toMatch(/matched: .*(isolation|playwright|electron)/)
    // pages sharing no wording with the change stay out
    expect(out).not.toMatch(/decision--team-git-rules|term--stage/)
  })

  test('a word carried by most pages pulls nothing in, and the list stays short', () => {
    // every page in a prdt wiki says "prdt" and "wiki" — matching on those would
    // return the whole store, which the PO then loads whole or discards whole.
    for (const n of ['fact--a', 'fact--b', 'fact--c', 'fact--d', 'learning--e', 'decision--f'])
      projectPage(n, `page ${n}`, 'A prdt wiki page about the prdt project and its wiki.')
    projectPage('fact--hooks', 'hook behavior', 'SessionStart hooks inject additionalContext each turn.')

    const got = refs({ slug: 'prdt-wiki-change', change_meta: { files: ['scripts/prdt'], risk_flags: [] } })
    expect(got).toEqual([])

    const hookRefs = refs({
      slug: 'hook-injection-fix',
      change_meta: { files: ['scripts/hooks/session-start.sh'], risk_flags: ['inject-additionalcontext'] },
    })
    expect(hookRefs).toEqual(['fact--hooks'])
    expect(hookRefs.length).toBeLessThanOrEqual(3)
  })

  test('no matching page returns cleanly — not an error, not a dump', () => {
    projectPage('fact--unrelated', 'unrelated', 'Nothing here concerns the change being dispatched.')
    const out = runPrdt(['wiki', 'refs', JSON.stringify({ files: ['src/zzz/qqq.rs'], risk_flags: [] })])
    expect(out).toMatch(/no candidate/)
    expect(out).not.toMatch(/fact--unrelated/)
    expect(out.trim().split('\n').length).toBe(2)   // the empty line + the honesty line
  })

  test('every run states what it matched on and the class it cannot see', () => {
    machinePage('fact--qa-cua-vm', 'QA CUA VM', 'playwright drives Electron inside the VM for isolation.')
    for (const payload of [T442, { files: ['src/zzz/qqq.rs'], risk_flags: [] }]) {
      const out = runPrdt(['wiki', 'refs', JSON.stringify(payload)])
      expect(out).toMatch(/matched on wording only \(file paths · risk flags · slug\)/)
      expect(out).toMatch(/relevant by concept while sharing no wording/)
    }
  })

  test('the whole [ctx] and the bare change_meta are the same query — no re-typing', () => {
    machinePage('fact--qa-cua-vm', 'QA CUA VM', 'playwright drives Electron inside the VM for isolation.')
    const viaCtx = refs(T442)
    const viaChangeMeta = refs(T442.change_meta)
    expect(viaCtx).toContain('machine:fact--qa-cua-vm')
    expect(viaChangeMeta).toEqual(viaCtx)
  })
})
