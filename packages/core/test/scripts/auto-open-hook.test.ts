/**
 * prdt-auto-open.sh — T-409 CLI auto-open decision logic.
 *
 * Contract under test (see the hook's own header for the full narrow-allowlist
 * rationale):
 * - Write tool only; any other tool_name → silent no-op.
 * - $PRDT_GUI_SESSION set → silent no-op (GUI already auto-surfaces in-app).
 * - $PRDT_HOME/auto-open = "off" → silent no-op; missing/invalid → default on.
 * - Classification: PRD.md / html / images / pdf → `open <path>`; installer/
 *   archive extensions → `open -R <path>` (Finder reveal); an oversized
 *   (>25MB) light-matched file escalates to reveal; anything unmatched
 *   (source, tickets, wiki, lockfiles, …) → silent no-op.
 *
 * `open` itself is never really invoked — a fake `open` shim earlier on PATH
 * logs its argv to a file so this suite never pops a real macOS app window
 * (acceptance: no real-machine app-window spam), matching this repo's
 * subprocess-hook-test convention (fact--cli-pty-testing).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-auto-open.sh')

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

/** A throwaway dir with a fake `open` shim (logs argv, never opens anything)
 *  prepended to PATH ahead of the real macOS /usr/bin/open. */
function fakeOpenBin(): { bin: string; log: string; path: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t409-open-'))
  const log = path.join(dir, 'open.log')
  const bin = path.join(dir, 'open')
  fs.writeFileSync(bin, `#!/usr/bin/env bash\necho "$@" >> "${log}"\nexit 0\n`)
  fs.chmodSync(bin, 0o755)
  return { bin, log, path: `${dir}:${process.env.PATH}` }
}

function readLog(log: string): string {
  try { return fs.readFileSync(log, 'utf8').trim() } catch { return '' }
}

interface RunOpts {
  toolName?: string
  filePath?: string
  prdtHome?: string
  guiSession?: boolean
  autoOpenMode?: string
  debounceSecs?: number
  fakePath?: string
  log?: string
  agentType?: string
  agentId?: string
  content?: string
}

function run(opts: RunOpts): { stdout: string; log: string; prdtHome: string } {
  const { path: fakePath, log } = opts.fakePath !== undefined && opts.log !== undefined
    ? { path: opts.fakePath, log: opts.log }
    : fakeOpenBin()
  const prdtHome = opts.prdtHome ?? fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t409-home-'))
  if (opts.autoOpenMode !== undefined) {
    fs.mkdirSync(prdtHome, { recursive: true })
    fs.writeFileSync(path.join(prdtHome, 'auto-open'), opts.autoOpenMode)
  }
  const event: Record<string, unknown> = {
    hook_event_name: 'PostToolUse',
    tool_name: opts.toolName ?? 'Write',
    tool_input: {
      file_path: opts.filePath ?? '',
      ...(opts.content !== undefined ? { content: opts.content } : {}),
    },
  }
  // Subagent PostToolUse payloads carry these as TOP-LEVEL members (T-559,
  // empirically observed against Claude Code 2.1.259 — see the hook's header).
  if (opts.agentType !== undefined) event.agent_type = opts.agentType
  if (opts.agentId !== undefined) event.agent_id = opts.agentId
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: fakePath, PRDT_HOME: prdtHome }
  if (opts.guiSession) env.PRDT_GUI_SESSION = '1'
  else delete env.PRDT_GUI_SESSION
  if (opts.debounceSecs !== undefined) env.PRDT_AUTO_OPEN_DEBOUNCE_SECS = String(opts.debounceSecs)
  else delete env.PRDT_AUTO_OPEN_DEBOUNCE_SECS
  const stdout = execFileSync('bash', [HOOK], { input: JSON.stringify(event), encoding: 'utf8', env })
  return { stdout, log, prdtHome }
}

/** cksum-derived debounce marker filename for a given file_path, matching the
 *  hook's own `cksum | tr -s ' ' '-'` keying so tests can seed/inspect it
 *  directly instead of depending on real elapsed time. */
function debounceKeyFor(filePath: string): string {
  const out = execFileSync('bash', ['-c', `printf '%s' "$1" | cksum | tr -s ' ' '-'`, '_', filePath], { encoding: 'utf8' })
  return out.trim()
}

function makeFile(basename: string, sizeBytes = 16): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t409-file-'))
  const p = path.join(dir, basename)
  fs.writeFileSync(p, 'x'.repeat(sizeBytes))
  return p
}

/** Same as makeFile, but nested under one or more path segments (relative to
 *  a fresh tmpdir) — used to exercise the `.prdt/` segment exclusion. */
function makeNestedFile(relDir: string, basename: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t409-file-'))
  const full = path.join(dir, relDir)
  fs.mkdirSync(full, { recursive: true })
  const p = path.join(full, basename)
  fs.writeFileSync(p, 'x')
  return p
}

describe('classification — light open', () => {
  test.skipIf(!hasJq())('PRD.md → open <path>', () => {
    const p = makeFile('PRD.md')
    const { stdout, log } = run({ filePath: p })
    expect(stdout).toBe('{}')
    expect(readLog(log)).toBe(p)
  })

  test.skipIf(!hasJq())('docs/artifacts/*.html → open <path>', () => {
    const p = makeFile('some-artifact.html')
    const { log } = run({ filePath: p })
    expect(readLog(log)).toBe(p)
  })

  test.skipIf(!hasJq())('screenshot.png → open <path>', () => {
    const p = makeFile('screenshot.png')
    const { log } = run({ filePath: p })
    expect(readLog(log)).toBe(p)
  })

  test.skipIf(!hasJq())('report.pdf → open <path>', () => {
    const p = makeFile('report.pdf')
    const { log } = run({ filePath: p })
    expect(readLog(log)).toBe(p)
  })
})

describe('classification — heavy reveal', () => {
  test.skipIf(!hasJq())('installer.dmg → open -R <path>', () => {
    const p = makeFile('installer.dmg')
    const { log } = run({ filePath: p })
    expect(readLog(log)).toBe(`-R ${p}`)
  })

  test.skipIf(!hasJq())('archive.zip → open -R <path>', () => {
    const p = makeFile('archive.zip')
    const { log } = run({ filePath: p })
    expect(readLog(log)).toBe(`-R ${p}`)
  })

  test.skipIf(!hasJq())('oversized png (>25MB) → open -R <path>, not a launched viewer', () => {
    const p = makeFile('huge.png', 26 * 1024 * 1024 + 1)
    const { log } = run({ filePath: p })
    expect(readLog(log)).toBe(`-R ${p}`)
  })
})

describe('classification — unmatched → silent, open never invoked', () => {
  for (const name of ['T-409.md', 'index.md', 'foo.ts', 'pnpm-lock.yaml', 'design.md']) {
    test.skipIf(!hasJq())(`${name} → no open call`, () => {
      const p = makeFile(name)
      const { stdout, log } = run({ filePath: p })
      expect(stdout).toBe('{}')
      expect(readLog(log)).toBe('')
    })
  }
})

describe('scope guards', () => {
  test.skipIf(!hasJq())('non-Write tool (Edit) → no open call even for PRD.md', () => {
    const p = makeFile('PRD.md')
    const { log } = run({ filePath: p, toolName: 'Edit' })
    expect(readLog(log)).toBe('')
  })

  test.skipIf(!hasJq())('PRDT_GUI_SESSION set → no open call (GUI already auto-surfaces)', () => {
    const p = makeFile('PRD.md')
    const { log } = run({ filePath: p, guiSession: true })
    expect(readLog(log)).toBe('')
  })

  test.skipIf(!hasJq())('auto-open=off → no open call', () => {
    const p = makeFile('PRD.md')
    const { log } = run({ filePath: p, autoOpenMode: 'off\n' })
    expect(readLog(log)).toBe('')
  })

  test.skipIf(!hasJq())('auto-open missing (default on) → open call proceeds', () => {
    const p = makeFile('PRD.md')
    const { log } = run({ filePath: p })
    expect(readLog(log)).toBe(p)
  })

  test.skipIf(!hasJq())('auto-open=garbage (invalid) → defaults to on', () => {
    const p = makeFile('PRD.md')
    const { log } = run({ filePath: p, autoOpenMode: 'garbage\n' })
    expect(readLog(log)).toBe(p)
  })

  test.skipIf(!hasJq())('file_path missing from tool_input → silent, never throws', () => {
    const { stdout, log } = run({ filePath: '' })
    expect(stdout).toBe('{}')
    expect(readLog(log)).toBe('')
  })

  test.skipIf(!hasJq())('file_path points at a nonexistent file → silent (Write reported but not on disk)', () => {
    const { stdout, log } = run({ filePath: '/nonexistent/PRD.md' })
    expect(stdout).toBe('{}')
    expect(readLog(log)).toBe('')
  })

  test.skipIf(!hasJq())('empty stdin → silent, never throws', () => {
    const { path: fakePath } = fakeOpenBin()
    const stdout = execFileSync('bash', [HOOK], { input: '', encoding: 'utf8', env: { ...process.env, PATH: fakePath } })
    expect(stdout).toBe('{}')
  })
})

// T-409 후속 보강 (2026-07-24): QA grill confirmed PostToolUse fires on
// subagent Write calls too — designer/QA delegated Writes (repeated artifact
// saves, scratch harnesses) shouldn't spam N app-open windows.
describe('.prdt/ path exclusion', () => {
  test.skipIf(!hasJq())('file under a .prdt/ segment (even PRD.md basename) → no open call', () => {
    const p = makeNestedFile('.prdt/scratch', 'PRD.md')
    const { stdout, log } = run({ filePath: p })
    expect(stdout).toBe('{}')
    expect(readLog(log)).toBe('')
  })

  test.skipIf(!hasJq())('file under a nested .prdt/ segment (project/.prdt/state/x.html) → no open call', () => {
    const p = makeNestedFile(path.join('project', '.prdt', 'state'), 'artifact.html')
    const { log } = run({ filePath: p })
    expect(readLog(log)).toBe('')
  })

  test.skipIf(!hasJq())('directory merely NAMED like .prdt (.prdtx, not an exact segment) → not excluded, still opens', () => {
    const p = makeNestedFile('.prdtx', 'PRD.md')
    const { log } = run({ filePath: p })
    expect(readLog(log)).toBe(p)
  })
})

// T-559: narrow firing to the main session. Payload shapes (`agent_type` /
// `agent_id` as top-level PostToolUse members on a subagent Write, absent on
// a main-session Write) were empirically probed against Claude Code 2.1.259
// before writing this discriminator — not assumed. See the hook's own header
// for the probe method and the fail-direction rationale.
describe('T-559 — main-session-only firing', () => {
  test.skipIf(!hasJq())('subagent Write (agent_type present) of PRD.md → no open call', () => {
    const p = makeFile('PRD.md')
    const { stdout, log } = run({ filePath: p, agentType: 'designer', agentId: 'abc123' })
    expect(stdout).toBe('{}')
    expect(readLog(log)).toBe('')
  })

  test.skipIf(!hasJq())('main-session Write (no agent_type key) of PRD.md → still opens', () => {
    const p = makeFile('PRD.md')
    const { log } = run({ filePath: p })
    expect(readLog(log)).toBe(p)
  })

  test.skipIf(!hasJq())('agent_type present but empty string → treated as subagent, no open call', () => {
    // Defensive: an empty-but-present key is not the "absent" shape a real
    // main session produces — fail toward skip, per the hook's documented
    // direction, rather than assume it means "no identity".
    const p = makeFile('PRD.md')
    const { log } = run({ filePath: p, agentType: '' })
    expect(readLog(log)).toBe('')
  })

  test.skipIf(!hasJq())('literal "agent_type" text inside tool_input.content does not forge a main-session skip or a subagent open', () => {
    // Anti-spoofing property (fact--claude-hooks T-518 "첫 매치" pitfall):
    // jq's top-level addressing must not be fooled by the substring living
    // two levels deep inside tool_input. A real main-session write with this
    // content still opens.
    const p = makeFile('spoofed.html')
    const { log } = run({ filePath: p, content: '"agent_type":"designer" mentioned in the body, not top-level' })
    expect(readLog(log)).toBe(p)
  })

  test.skipIf(!hasJq())('subagent Write is still subject to the .prdt/ exclude and debounce (narrowing changes WHO fires, not the other guards)', () => {
    const p = makeNestedFile('.prdt/scratch', 'artifact.html')
    const { stdout, log } = run({ filePath: p, agentType: 'qa' })
    expect(stdout).toBe('{}')
    expect(readLog(log)).toBe('')
  })
})

describe('same-path debounce', () => {
  test.skipIf(!hasJq())('immediate second Write of the same path → first opens, second is silent', () => {
    const p = makeFile('PRD.md')
    const { path: fakePath, log } = fakeOpenBin()
    const prdtHome = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t409-home-'))

    const r1 = run({ filePath: p, fakePath, log, prdtHome })
    expect(r1.stdout).toBe('{}')
    expect(readLog(log)).toBe(p)

    const r2 = run({ filePath: p, fakePath, log, prdtHome })
    expect(r2.stdout).toBe('{}') // debounce is a silent no-op, not an error
    expect(readLog(log)).toBe(p) // unchanged — second call never invoked `open`
  })

  test.skipIf(!hasJq())('two different paths sharing PRDT_HOME are NOT debounced against each other', () => {
    const p1 = makeFile('PRD.md')
    const p2 = makeFile('report.pdf')
    const { path: fakePath, log } = fakeOpenBin()
    const prdtHome = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t409-home-'))

    run({ filePath: p1, fakePath, log, prdtHome })
    run({ filePath: p2, fakePath, log, prdtHome })
    const lines = readLog(log).split('\n')
    expect(lines).toEqual([p1, p2])
  })

  test.skipIf(!hasJq())('marker older than the debounce window → fires again (time-independent: marker age is seeded, not slept)', () => {
    const p = makeFile('PRD.md')
    const { path: fakePath, log } = fakeOpenBin()
    const prdtHome = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t409-home-'))

    run({ filePath: p, fakePath, log, prdtHome })
    expect(readLog(log)).toBe(p)

    const key = debounceKeyFor(p)
    const markerPath = path.join(prdtHome, '.auto-open-debounce', key)
    expect(fs.existsSync(markerPath)).toBe(true)
    // Seed the marker to look 1 hour old — well past the default 30s window —
    // without any real sleep.
    fs.writeFileSync(markerPath, String(Math.floor(Date.now() / 1000) - 3600))

    run({ filePath: p, fakePath, log, prdtHome })
    expect(readLog(log).split('\n')).toEqual([p, p])
  })

  test.skipIf(!hasJq())('PRDT_AUTO_OPEN_DEBOUNCE_SECS=0 disables debounce entirely', () => {
    const p = makeFile('PRD.md')
    const { path: fakePath, log } = fakeOpenBin()
    const prdtHome = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t409-home-'))

    run({ filePath: p, fakePath, log, prdtHome, debounceSecs: 0 })
    run({ filePath: p, fakePath, log, prdtHome, debounceSecs: 0 })
    expect(readLog(log).split('\n')).toEqual([p, p])
  })
})
