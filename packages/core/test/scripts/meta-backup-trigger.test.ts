/**
 * meta-backup-trigger.test.ts — T-504: WHERE the automatic meta backup fires.
 *
 * The decision + push live in core (meta-backup.test.ts proves their scope);
 * this file proves the two call sites and their negative space, black-box over
 * the real `prdt` CLI and the real session-start hook with a FAKE bridge
 * (`dist/bin/meta-cli.cjs` under a fixture PRDT_REPO that only logs its argv):
 *  - `prdt <any command>` spawns `meta-cli backup <projectRoot>` once, detached;
 *    `PRDT_META_BACKUP=0` suppresses it; `prdt meta …` never spawns it.
 *  - the PO SessionStart hook spawns it; SubagentStart (the per-dispatch path)
 *    and a non-PO SessionStart do NOT — the persona-turn paths stay network-free.
 *  - failure visibility: a recorded failed attempt is said on the next `prdt`
 *    run (stderr) and by `prdt doctor`.
 * No real remote and no network anywhere here.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const SESSION_START_HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-session-start.sh')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')
const NODE = which('node')
const JQ = which('jq')

let projectDir: string
let fakeRepo: string
let callsLog: string

function makeFakeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t504-repo-'))
  fs.mkdirSync(path.join(repo, 'dist', 'bin'), { recursive: true })
  callsLog = path.join(repo, 'calls.log')
  fs.writeFileSync(
    path.join(repo, 'dist', 'bin', 'meta-cli.cjs'),
    `require('fs').appendFileSync(${JSON.stringify(callsLog)}, process.argv.slice(2).join(' ') + '\\n')\n` +
    `process.stdout.write('{"ok":true}\\n')\n`,
  )
  return repo
}

/** ~/.prdt/prdt.env in the sandboxed HOME, pointing PRDT_REPO at the fake repo. */
function pointPrdtEnvAt(repo: string, home = process.env.HOME as string): void {
  fs.mkdirSync(path.join(home, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(home, '.prdt', 'prdt.env'), `PRDT_REPO=${repo}\n`)
}

function calls(): string[] {
  try { return fs.readFileSync(callsLog, 'utf8').split('\n').filter(Boolean) } catch { return [] }
}

/** The bridge is spawned detached — give it a moment to write its line. */
async function waitForCalls(n: number, ms = 4000): Promise<string[]> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const c = calls()
    if (c.length >= n) return c
    await new Promise((r) => setTimeout(r, 50))
  }
  return calls()
}

// The developer's shell may carry the kill switch (PRDT_META_BACKUP=0 — the
// standing rule while this mechanism is under review): these tests assert the
// spawn itself, so they turn the switch ON explicitly. Safe: HOME is the vitest
// sandbox, so `~/.prdt/prdt.env` resolves to the FAKE bridge above and the tick
// runs against the fixture project — no real bridge, no real remote, no network.
const ARMED = { PRDT_META_BACKUP: '1' }

function runPrdt(args: string[], env: Record<string, string> = {}): { stdout: string; stderr: string; status: number | null } {
  const r = spawnSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir, encoding: 'utf-8', timeout: 20000,
    env: { ...process.env, ...ARMED, ...env },
  })
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status }
}

function metaGit(args: string[]): string {
  return execFileSync('git', ['--git-dir', path.join(projectDir, '.prdt', 'meta.git'), '--work-tree', projectDir, ...args], {
    cwd: projectDir, encoding: 'utf-8',
  }).trim()
}

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t504-proj-'))
  fakeRepo = makeFakeRepo()
})

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true })
  fs.rmSync(fakeRepo, { recursive: true, force: true })
  try { fs.rmSync(path.join(process.env.HOME as string, '.prdt', 'prdt.env'), { force: true }) } catch { /* sandbox home */ }
})

describe.skipIf(!PYTHON3 || !NODE)('prdt CLI main — detached backup tick (T-504)', () => {
  test('any subcommand spawns `backup <projectRoot>` once; PRDT_META_BACKUP=0 and `prdt meta` do not', async () => {
    const init = JSON.parse(execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
      cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    }))
    expect(fs.existsSync(path.join(projectDir, '.prdt', 'meta.git', 'HEAD'))).toBe(true)
    pointPrdtEnvAt(fakeRepo)

    const r = runPrdt(['tickets'])
    expect(r.status).toBe(0)
    const c1 = await waitForCalls(1)
    expect(c1).toHaveLength(1)
    const [cmd, root] = c1[0].split(' ')
    expect(cmd).toBe('backup')
    expect(fs.realpathSync(root)).toBe(fs.realpathSync(init.root ?? projectDir))

    runPrdt(['tickets'], { PRDT_META_BACKUP: '0' })
    await new Promise((r) => setTimeout(r, 300))
    expect(calls()).toHaveLength(1)

    // `prdt meta …` is the explicit path — the fake bridge answers its own call
    // (remote-list) but no `backup` line may appear.
    runPrdt(['meta', 'remote'])
    await new Promise((r) => setTimeout(r, 300))
    expect(calls().filter((l) => l.startsWith('backup '))).toHaveLength(1)
  })

  test('no meta split → no spawn', async () => {
    fs.mkdirSync(path.join(projectDir, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, '.prdt', 'po-state.json'),
      JSON.stringify({ schema_version: 1, stage: 'build', version: 'v0.1', current_task: null }))
    fs.writeFileSync(path.join(projectDir, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
    pointPrdtEnvAt(fakeRepo)
    runPrdt(['tickets'])
    await new Promise((r) => setTimeout(r, 300))
    expect(calls()).toEqual([])
  })

  test('a recorded failed attempt is said on the next run (stderr) and by `prdt doctor`', async () => {
    execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
      cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t504-bare-'))
    execFileSync('git', ['init', '--bare', '-q', bare])
    metaGit(['remote', 'add', 'backup', bare])
    fs.writeFileSync(path.join(projectDir, '.prdt', 'meta.git', 'prdt-backup-state.json'), JSON.stringify({
      remote: 'backup', branch: 'main', last_attempt_at: '2026-09-11T01:02:03.000Z', last_ok: false,
      last_error: 'fatal: unable to access — could not resolve host',
    }))
    // no PRDT_REPO → no spawn, so the state file stays as written
    const r = runPrdt(['tickets'])
    expect(r.stderr).toContain('메타 자동 백업 실패')
    expect(r.stderr).toContain('could not resolve host')
    expect(r.stderr).toContain('prdt meta push backup')

    // the kill switch mutes the notice with the tick (the mechanism is off) …
    expect(runPrdt(['tickets'], { PRDT_META_BACKUP: '0' }).stderr).not.toContain('메타 자동 백업 실패')

    // … but doctor reads the latch regardless
    const d = runPrdt(['doctor'], { PRDT_META_BACKUP: '0' })
    expect(d.stdout).toMatch(/meta: automatic backup push FAILED at 2026-09-11T01:02Z .*could not resolve host/)
    expect(d.stdout).toContain('`prdt meta push backup`')
    // the state file itself never shows up as meta drift / untracked
    expect(d.stdout).not.toContain('prdt-backup-state')
    fs.rmSync(bare, { recursive: true, force: true })
  })

  test('QA F2 — `prdt doctor` warns when meta.backup_remote names a remote the meta repo does not have (renamed), latch or no latch', async () => {
    execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
      cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t504-bare-'))
    execFileSync('git', ['init', '--bare', '-q', bare])
    metaGit(['remote', 'add', 'backup', bare])
    metaGit(['push', '-q', 'backup', 'HEAD'])
    metaGit(['remote', 'rename', 'backup', 'vault'])
    // no latch at all — the tick never ran here; doctor must still say it
    expect(fs.existsSync(path.join(projectDir, '.prdt', 'meta.git', 'prdt-backup-state.json'))).toBe(false)
    const d = runPrdt(['doctor'], { PRDT_META_BACKUP: '0' })
    expect(d.stdout).toMatch(/meta: `meta\.backup_remote` = 'backup' names a remote the meta repo does not have \(have: vault\)/)

    // and the tick's own record of it (what core writes on a real run) is said on the next run
    fs.writeFileSync(path.join(projectDir, '.prdt', 'meta.git', 'prdt-backup-state.json'), JSON.stringify({
      remote: 'backup', last_attempt_at: '2026-09-11T04:05:06.000Z', last_ok: false,
      last_error: "meta.backup_remote 'backup' names no remote of the meta repo (have: vault)",
    }))
    expect(runPrdt(['tickets']).stderr).toMatch(/메타 자동 백업 실패 .*names no remote of the meta repo \(have: vault\)/)
    fs.rmSync(bare, { recursive: true, force: true })
  })

  // Own test: each `prdt` run is seconds under load, and the file's 15s budget is per test.
  test('QA F1 shape in config — `prdt doctor` names an illegal meta.backup_remote value', async () => {
    execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
      cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t504-bare-'))
    execFileSync('git', ['init', '--bare', '-q', bare])
    metaGit(['remote', 'add', 'backup', bare])
    fs.writeFileSync(path.join(projectDir, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj', meta: { backup_remote: '--force' } }))
    const d = runPrdt(['doctor'], { PRDT_META_BACKUP: '0' })
    expect(d.stdout).toMatch(/meta: `meta\.backup_remote` = '--force' is not a legal remote name/)
    fs.rmSync(bare, { recursive: true, force: true })
  })
})

describe.skipIf(!NODE || !JQ || !PYTHON3)('session-start hook — PO SessionStart only (T-504)', () => {
  function makePrdtHome(): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t504-home-'))
    const disc = path.join(home, 'discipline')
    for (const p of ['po', 'developer']) fs.mkdirSync(path.join(disc, p, 'playbooks'), { recursive: true })
    fs.writeFileSync(path.join(home, 'doctrine.md'), '# doctrine\n')
    fs.writeFileSync(path.join(disc, 'contracts.md'), '# contracts\n')
    for (const p of ['po', 'developer']) {
      fs.writeFileSync(path.join(disc, p, 'habit.md'), `# ${p} habit\n`)
      fs.writeFileSync(path.join(disc, p, 'playbooks', '_index.md'), '# menu\n')
    }
    fs.writeFileSync(path.join(home, 'prdt.env'), `PRDT_REPO=${fakeRepo}\n`)
    return home
  }
  function makeSplitProject(): string {
    fs.mkdirSync(path.join(projectDir, '.prdt', 'meta.git'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, '.prdt', 'po-state.json'),
      JSON.stringify({ schema_version: 1, stage: 'build', version: 'v0.1', current_task: null }))
    fs.writeFileSync(path.join(projectDir, '.prdt', 'meta.git', 'HEAD'), 'ref: refs/heads/main\n')
    return projectDir
  }
  function runHook(event: Record<string, string>, prdtHome: string, extraEnv: Record<string, string> = {}): void {
    spawnSync('bash', [SESSION_START_HOOK], {
      input: JSON.stringify(event), encoding: 'utf8', timeout: 20000,
      env: { ...process.env, ...ARMED, PRDT_HOME: prdtHome, ...extraEnv },
    })
  }

  test('PO SessionStart in a split project → one `backup <projectRoot>` spawn', async () => {
    const home = makePrdtHome()
    const proj = makeSplitProject()
    runHook({ hook_event_name: 'SessionStart', agent_type: 'prdt-po', cwd: proj }, home)
    const c = await waitForCalls(1)
    expect(c).toHaveLength(1)
    const [cmd, root] = c[0].split(' ')
    expect(cmd).toBe('backup')
    expect(fs.realpathSync(root)).toBe(fs.realpathSync(proj))
    fs.rmSync(home, { recursive: true, force: true })
  })

  test('SubagentStart (per-dispatch), a worker SessionStart, a plain session, and the kill switch → no spawn', async () => {
    const home = makePrdtHome()
    const proj = makeSplitProject()
    runHook({ hook_event_name: 'SubagentStart', agent_type: 'prdt-po', cwd: proj }, home)
    runHook({ hook_event_name: 'SessionStart', agent_type: 'prdt-developer', cwd: proj }, home)
    runHook({ hook_event_name: 'SessionStart', agent_type: '', cwd: proj }, home)
    runHook({ hook_event_name: 'SessionStart', agent_type: 'prdt-po', cwd: proj }, home, { PRDT_META_BACKUP: '0' })
    await new Promise((r) => setTimeout(r, 500))
    expect(calls()).toEqual([])
    fs.rmSync(home, { recursive: true, force: true })
  })

  test('PO SessionStart in a project WITHOUT the meta split → no spawn', async () => {
    const home = makePrdtHome()
    fs.mkdirSync(path.join(projectDir, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(projectDir, '.prdt', 'po-state.json'),
      JSON.stringify({ schema_version: 1, stage: 'build', version: 'v0.1', current_task: null }))
    runHook({ hook_event_name: 'SessionStart', agent_type: 'prdt-po', cwd: projectDir }, home)
    await new Promise((r) => setTimeout(r, 500))
    expect(calls()).toEqual([])
    fs.rmSync(home, { recursive: true, force: true })
  })
})
