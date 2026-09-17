/**
 * prdt doctor — resident machine resources, report-only (T-592).
 *
 * T-591 puts the stop duty on the persona that booted a resource; this
 * check is the second line of defense for what that duty misses — a
 * resource still up after its dispatch returned. It must never act: no
 * process signalled, no VM stopped, no container touched. These tests drive
 * `lume` / `docker` / `uptime` / `memory_pressure` through fake stand-ins on
 * PATH (never the real tools) so the threshold logic (resident hours AND
 * machine load) is pinned against a machine-state fixture, not read off the
 * source.
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
let projectDir: string
let binDir: string

/** A real executable on PATH that is neither `lume` nor `docker` nor
 *  `uptime` nor `memory_pressure` — every OTHER name resolves through a
 *  symlink to the real binary, so nothing outside this check's own tools is
 *  disturbed. Built fresh per test from the real PATH. */
function isolatedBinDir(hide: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-isobin-'))
  const seen = new Set<string>()
  for (const p of (process.env.PATH || '').split(':')) {
    let entries: string[] = []
    try { entries = fs.readdirSync(p) } catch { continue }
    for (const name of entries) {
      if (hide.includes(name) || seen.has(name)) continue
      const target = path.join(p, name)
      try {
        if (!fs.statSync(target).isFile()) continue
        fs.symlinkSync(target, path.join(dir, name))
        seen.add(name)
      } catch { /* dup or perm — skip */ }
    }
  }
  return dir
}

function writeFakeBin(name: string, script: string) {
  const p = path.join(binDir, name)
  fs.writeFileSync(p, script)
  fs.chmodSync(p, 0o755)
}

const FAKE_LUME = `#!/usr/bin/env python3
import sys, json, os
running = [n for n in os.environ.get("FAKE_LUME_RUNNING", "").split(",") if n]
print(json.dumps([{"name": n, "status": "running"} for n in running]))
`

const FAKE_DOCKER = `#!/usr/bin/env python3
import os
rows = [r for r in os.environ.get("FAKE_DOCKER_ROWS", "").split(";") if r]
for row in rows:
    name, project, created = row.split("|")
    print(f"{name}\\t{project}\\t{created}")
`

const FAKE_UPTIME = `#!/usr/bin/env python3
import os
load = os.environ.get("FAKE_LOAD", "1.0")
print(f"12:00  up 1 day, 2 users, load averages: {load} {load} {load}")
`

const FAKE_MEMPRESSURE = `#!/usr/bin/env python3
import os
pct = os.environ.get("FAKE_MEM_PCT", "50")
print(f"System-wide memory free percentage: {pct}%")
`

function residentStatePath(): string {
  return path.join(machineHome, 'run', 'resident-vm-since.json')
}

/** Seeds the VM's tracked first-seen marker `hours` in the past, so the
 *  threshold fires immediately instead of needing wall-clock time to pass. */
function seedVmSince(name: string, hoursAgo: number) {
  fs.mkdirSync(path.dirname(residentStatePath()), { recursive: true })
  const since = new Date(Date.now() - hoursAgo * 3600_000).toISOString()
  fs.writeFileSync(residentStatePath(), JSON.stringify({ [name]: since }))
}

/** Seeds a T-591 resource ownership marker directly (the file `prdt resource
 *  up` itself writes) — `~/.prdt/run/resources/<name>/<dispatch>.json`. Used
 *  to drive the doctor's marker-based ownership judgment (`_resource_owner`)
 *  without shelling out to the CLI a second time per test. */
function seedResourceMarker(name: string, dispatch: string) {
  const dir = path.join(machineHome, 'run', 'resources', name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${dispatch}.json`), JSON.stringify({
    resource: name, dispatch, project: 'proj', since: new Date().toISOString(),
  }))
}

function runDoctor(env: Record<string, string> = {}, pathOverride?: string): { out: string; code: number } {
  try {
    const out = execFileSync(PYTHON3 as string, [PRDT_CLI, 'doctor'], {
      cwd: projectDir,
      env: { ...process.env, PRDT_HOME: machineHome, PATH: pathOverride || `${binDir}:${process.env.PATH}`, ...env },
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
    })
    return { out, code: 0 }
  } catch (e: any) {
    return { out: (e.stdout || '') + (e.stderr || ''), code: e.status ?? 1 }
  }
}

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-doctor-resident-'))
  machineHome = path.join(sandbox, 'home')
  fs.mkdirSync(path.join(machineHome, 'hooks'), { recursive: true })
  projectDir = path.join(sandbox, 'proj')
  fs.mkdirSync(projectDir, { recursive: true })
  execFileSync(PYTHON3 as string, [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
  })
  binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-fakebin-'))
  writeFakeBin('lume', FAKE_LUME)
  writeFakeBin('docker', FAKE_DOCKER)
  writeFakeBin('uptime', FAKE_UPTIME)
  writeFakeBin('memory_pressure', FAKE_MEMPRESSURE)
})

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
  fs.rmSync(binDir, { recursive: true, force: true })
})

describe.skipIf(!PYTHON3)('prdt doctor — resident machine resources (T-592, report only)', () => {
  test('never acts: the added source carries no stop/kill/shutdown/quit/rm verb reaching a subprocess call', () => {
    const src = fs.readFileSync(PRDT_CLI, 'utf-8')
    const start = src.indexOf('# ── resident machine resources')
    const end = src.indexOf('def cmd_doctor(_args):')
    expect(start).toBeGreaterThan(0)
    const section = src.slice(start, end)
    // The one shutdown string that exists is a QUOTED command inside a
    // warning line (CUA_STOP_CMD), never itself the argv of a subprocess
    // call — every subprocess.run in this section is read-only.
    const calls = [...section.matchAll(/subprocess\.run\(\s*\[([^\]]*)\]/g)].map((m) => m[1])
    expect(calls.length).toBeGreaterThan(0)
    for (const argv of calls) {
      expect(argv).not.toMatch(/\bstop\b|\bkill\b|shutdown|\bquit\b|\brm\b/i)
    }
  })

  test('marked cua VM (prdt-owned, repair command) and an unmarked Docker stack (user-owned, no command) both warn in one run', () => {
    seedVmSince('cua', 30)
    seedResourceMarker('cua', 'd1')  // T-591: a marker, not the VM's name, makes it prdt-owned
    const { out, code } = runDoctor({
      FAKE_LUME_RUNNING: 'cua',
      FAKE_DOCKER_ROWS: 'db_1|daum-mini-games|2026-01-01 00:00:00 +0000;studio_1|daum-mini-games|2026-01-01 00:00:00 +0000',
      FAKE_LOAD: '12.0',
      FAKE_MEM_PCT: '40',
    })
    expect(code).toBe(0)
    const cuaLine = out.split('\n').find((l) => l.includes("machine: vm 'cua'"))
    const dockerLine = out.split('\n').find((l) => l.includes("machine: docker-stack 'daum-mini-games'"))
    expect(cuaLine, out).toBeTruthy()
    expect(dockerLine, out).toBeTruthy()
    // prdt-owned line carries the exact repair command this machine needs
    // (`lume stop` exits 130 here — measured, T-591).
    expect(cuaLine).toContain('lume ssh cua')
    expect(cuaLine).toContain('prdt-owned')
    // unmarked docker stack: user-owned, never carries a command of any kind.
    expect(dockerLine).not.toMatch(/lume ssh|docker stop|`/)
    expect(dockerLine).toContain('user-owned')
    expect(dockerLine).toContain('2 container(s)')
    // available memory is cited via memory_pressure, never vm_stat.
    expect(cuaLine).toContain('memory_pressure')
    expect(cuaLine).not.toMatch(/vm_stat/)
  })

  test('ownership is the marker, never the kind: an unmarked cua VM is user-owned, a MARKED Docker stack is prdt-owned', () => {
    seedVmSince('cua', 30)
    // Deliberately NO marker for cua (the fixed name that used to hard-code
    // it prdt-owned) — a marked Docker stack instead (the kind that used to
    // be hard-coded ALWAYS user-owned, unconditionally).
    seedResourceMarker('daum-mini-games', 'd2')
    const { out } = runDoctor({
      FAKE_LUME_RUNNING: 'cua',
      FAKE_DOCKER_ROWS: 'db_1|daum-mini-games|2026-01-01 00:00:00 +0000',
      FAKE_LOAD: '12.0',
      FAKE_MEM_PCT: '40',
    })
    const cuaLine = out.split('\n').find((l) => l.includes("machine: vm 'cua'"))
    const dockerLine = out.split('\n').find((l) => l.includes("machine: docker-stack 'daum-mini-games'"))
    expect(cuaLine, out).toBeTruthy()
    expect(dockerLine, out).toBeTruthy()
    expect(cuaLine).toContain('user-owned')
    expect(cuaLine).not.toMatch(/lume ssh|`/)
    expect(dockerLine).toContain('prdt-owned')
    // No known repair command is mapped for this stack's name, so even
    // prdt-owned, no command is offered — the lookup decides, not the kind.
    expect(dockerLine).not.toMatch(/docker stop|`/)
  })

  test('below the load threshold: long-resident VM stays silent', () => {
    seedVmSince('cua', 100)
    const { out } = runDoctor({ FAKE_LUME_RUNNING: 'cua', FAKE_LOAD: '2.0' })
    expect(out).not.toContain("machine: vm 'cua'")
  })

  test('below the resident-hours threshold: fresh VM under high load stays silent', () => {
    // No seed — first observation this run, resident_hours ≈ 0.
    const { out } = runDoctor({ FAKE_LUME_RUNNING: 'cua', FAKE_LOAD: '12.0' })
    expect(out).not.toContain("machine: vm 'cua'")
  })

  test('nothing resident: no new warning line even under high load', () => {
    const { out } = runDoctor({ FAKE_LOAD: '15.0' })
    expect(out).not.toMatch(/machine: (vm|docker-stack) '/)
  })

  test('neither lume nor docker on PATH: no warning and no error, reported as could-not-look', () => {
    const bare = isolatedBinDir(['lume', 'docker'])
    try {
      const { out, code } = runDoctor({}, bare)
      expect(code).toBe(0)
      expect(out).not.toMatch(/machine: (vm|docker-stack) '/)
      expect(out).toContain('could not look at resident VM/container state')
    } finally {
      fs.rmSync(bare, { recursive: true, force: true })
    }
  })
})
