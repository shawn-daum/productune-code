/**
 * `prdt dispatch ls [--json] [--all]` (T-695 slice 2 · owed test) — markers
 * under `<PRDT_HOME>/run/dispatches/`, every project, each with the state the
 * dispatch gate (prdt-dispatch-gate.sh) assigns it: "applying the SAME rule to
 * the SAME files so the PO can see why the count is what it is" (cmd_dispatch
 * docstring). This file exists to prove that promise: for one fixture, `ls`'s
 * own count and the gate's own count must agree — never two numbers for the
 * same markers.
 *
 * Covers: live · stopped (hidden by default, shown with `--all`) ·
 * quota-killed (a worker transcript whose last record is the harness's own
 * `"model":"<synthetic>"` placeholder) · transcript-less (phantom once past
 * the start-up grace) · corrupt (unreadable JSON — the whole count degrades
 * to `unmeasured`, on BOTH sides, per T-699's fix to `cmd_dispatch`).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-dispatch-gate.sh')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let sandbox: string
let machineHome: string
let projectDir: string

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-dispatch-ls-')))
  machineHome = path.join(sandbox, 'home')
  fs.mkdirSync(machineHome, { recursive: true })
  projectDir = path.join(sandbox, 'proj')
  // A minimal project marker — enough for the gate's up-walk; `dispatch ls`
  // itself is cwd-independent (it reads $PRDT_HOME machine-wide).
  fs.mkdirSync(path.join(projectDir, '.prdt'), { recursive: true })
  fs.writeFileSync(
    path.join(projectDir, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.10', current_task: null }),
  )
})

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true })
})

// ── `prdt dispatch ls` side ──────────────────────────────────────────────────

interface LsResult { in_flight: number | null; unreadable: string[]; markers: Array<Record<string, unknown>> }

function ls(args: string[] = []): LsResult {
  const out = execFileSync(PYTHON3 as string, [PRDT_CLI, 'dispatch', 'ls', '--json', ...args], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli'),
  })
  return JSON.parse(out)
}

function lsText(args: string[] = []): string {
  return execFileSync(PYTHON3 as string, [PRDT_CLI, 'dispatch', 'ls', ...args], {
    cwd: projectDir,
    env: { ...process.env, PRDT_HOME: machineHome },
    encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli'),
  })
}

// ── fixture markers — same shape `dispatch-gate-hook.test.ts` T-695 tests use ──

const REAL_LAST = '{"type":"assistant","message":{"model":"claude-sonnet-5","role":"assistant","content":[{"type":"text","text":"Now the test."}]},"timestamp":"2026-09-26T07:00:00.000Z"}'
const SYNTHETIC_LAST = '{"parentUuid":"x","isSidechain":true,"type":"assistant","message":{"id":"m","model":"<synthetic>","role":"assistant","type":"message","content":[{"type":"text","text":"You\'ve hit your session limit · resets 6:30pm (Asia/Seoul)"}]},"timestamp":"2026-09-26T06:41:35.903Z"}'

type Worker = 'live' | 'synthetic' | 'none'

/** Writes one `run/dispatches/<name>.json` marker (+ its transcript, unless `worker: 'none'`). */
function marker(name: string, sinceAgoSec: number, opts: { stopped?: boolean; worker?: Worker } = {}): void {
  const { stopped = false, worker = 'live' } = opts
  const dir = path.join(machineHome, 'run', 'dispatches')
  fs.mkdirSync(dir, { recursive: true })
  const since = new Date(Date.now() - sinceAgoSec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const data: Record<string, unknown> = {
    agent_id: name, persona: 'developer', ticket_id: 'T-695', dispatch_id: `d-${name}`,
    project_root: projectDir, session_id: 'sess-1', since,
  }
  if (stopped) data.stopped_at = since
  if (worker !== 'none') {
    const tdir = path.join(machineHome, 'transcripts', 'sess', 'subagents')
    fs.mkdirSync(tdir, { recursive: true })
    const t = path.join(tdir, `agent-${name}.jsonl`)
    fs.writeFileSync(t, `${REAL_LAST}\n${worker === 'synthetic' ? SYNTHETIC_LAST : REAL_LAST}\n`)
    data.transcript = t
  }
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data, null, 2))
}

function corruptMarker(name: string): void {
  const dir = path.join(machineHome, 'run', 'dispatches')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${name}.json`), '{"agent_id": "x", "since": "2026-09-26T0') // half-written
}

// ── gate side — the SAME markers, read by prdt-dispatch-gate.sh ─────────────

const MEMP_OK = 'The system has 2147483648 (524288 pages with a page size of 4096).\n\nStats: \n  Pages free: 100\n\nSystem-wide memory free percentage: 55%\n'

/** A machine every OTHER axis reads as comfortably under cap, so only the
 *  dispatches axis (forced to always-deny via `inflight_max: -1`, or left to
 *  go `unmeasured` on a corrupt marker) drives the gate's reported text. */
function shimBin(): string {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-dispatch-ls-bin-'))
  const write = (name: string, body: string) => {
    const f = path.join(bin, name)
    fs.writeFileSync(f, `#!/bin/sh\n${body}\n`)
    fs.chmodSync(f, 0o755)
  }
  write('sysctl', [
    'for k in "$@"; do case "$k" in',
    "  vm.loadavg) printf '%s\\n' '{ 1.00 1.00 1.00 }';;",
    "  hw.ncpu) echo '14';;",
    "  hw.memsize) echo '38654705664';;",
    'esac; done',
  ].join('\n'))
  write('memory_pressure', `printf '%s' '${MEMP_OK}'`)
  write('ps', "printf '%s\\n' '/sbin/launchd'")
  return bin
}

const VALID_CTX = {
  slug: 'a-missing-backup-remote-hint-points-at-a-push-that-fails',
  goal: 'Own test for `prdt dispatch ls` (T-695) — this payload only needs to pass the [ctx] gate.',
  change_meta: { files: ['a.ts'], user_facing: false, risk_flags: [], stage: 'build' },
  acceptance: 'prdt dispatch ls counts the same markers the gate counts.',
  wiki_refs: [],
  user_lang: 'ko',
  prd_path: 'docs/prd/PRD.md#v1.10',
  dispatch_id: 't699-dispatch-ls-test',
}

function eventJson(sessionId: string): string {
  return JSON.stringify({
    session_id: sessionId,
    transcript_path: path.join(projectDir, 'transcript.jsonl'),
    cwd: projectDir,
    prompt_id: '11111111-2222-3333-4444-555555555555',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: {
      description: 'dispatch ls 카운트 비교',
      prompt: `[ctx] ${JSON.stringify(VALID_CTX)}\n\nrest of the prompt.`,
      subagent_type: 'prdt-developer',
    },
    tool_use_id: 'toolu_01aaaaaaaaaaaaaaaaaaaaaa',
  })
}

/** Runs the gate against the SAME `$PRDT_HOME`, `inflight_max: -1` so its
 *  dispatches count is always printed (deny or not). Returns the gate's
 *  in-flight number, or `null` when the gate calls the axis `unmeasured`. */
function gateInFlight(sessionId = 'sess-gate'): number | null {
  fs.writeFileSync(path.join(machineHome, 'dispatch-caps.json'), JSON.stringify({ inflight_max: -1 }))
  const bin = shimBin()
  const res = spawnSync('bash', [HOOK], {
    input: eventJson(sessionId), encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PRDT_HOME: machineHome },
  })
  expect(res.stderr).toBe('')
  const out = JSON.parse(res.stdout).hookSpecificOutput
  const text: string = out.permissionDecision === 'deny' ? out.permissionDecisionReason : out.additionalContext
  // Full deny text names the axis as "in-flight dispatches: unmeasured (…)";
  // an under-cap run instead gets the short per-session note "unmeasured
  // dispatches" (no other axis over cap to force a full deny reason).
  if (/in-flight dispatches: unmeasured/.test(text) || /unmeasured dispatches\b/.test(text)) return null
  const m = text.match(/in-flight dispatches (\d+) machine-wide/)
  expect(m, `no in-flight count found in: ${text}`).toBeTruthy()
  return Number(m![1])
}

describe.skipIf(!PYTHON3)('prdt dispatch ls (T-695 owed test)', () => {
  test('no markers: "no dispatch markers", in_flight 0', () => {
    expect(lsText().trim()).toBe('no dispatch markers')
    const r = ls()
    expect(r).toMatchObject({ in_flight: 0, unreadable: [], markers: [] })
  })

  test('live / stopped / quota-killed / transcript-less mix: ls names each state, hides `stopped` by default, and its count equals the gate\'s for the SAME fixture', () => {
    marker('live-a', 120, { worker: 'live' })
    marker('live-b', 180, { worker: 'live' })
    marker('done', 60, { stopped: true, worker: 'live' })
    marker('killed-a', 3000, { worker: 'synthetic' })
    marker('killed-b', 3001, { worker: 'synthetic' })
    marker('leaked', 12000, { worker: 'none' }) // well past the 300s start-up grace → phantom

    const r = ls()
    const byId = Object.fromEntries(r.markers.map((m) => [m.agent_id as string, m]))
    expect(byId['live-a'].state).toBe('live')
    expect(byId['live-b'].state).toBe('live')
    expect(byId['done']).toBeUndefined() // stopped, hidden by default
    expect(byId['killed-a'].state).toContain('phantom (harness ended the run')
    expect(byId['killed-b'].state).toContain('phantom (harness ended the run')
    expect(byId['leaked'].state).toContain('phantom (no worker transcript)')
    expect(r.unreadable).toEqual([])
    expect(r.in_flight).toBe(2) // live-a, live-b only

    const all = ls(['--all'])
    expect(all.markers.find((m) => m.agent_id === 'done')).toMatchObject({ state: 'stopped' })
    expect(all.in_flight).toBe(2) // --all only reveals more rows, never changes what counts as live

    expect(gateInFlight()).toBe(r.in_flight)
  })

  test('a transcript-less marker still within the start-up grace counts as live, on both sides', () => {
    marker('starting', 30, { worker: 'none' }) // 30s old, no transcript yet — still "just spawned"
    const r = ls()
    expect(r.markers[0].state).toBe('live (starting, no transcript yet)')
    expect(r.in_flight).toBe(1)
    expect(gateInFlight()).toBe(r.in_flight)
  })

  test('a corrupt marker: unreadable is named, ls never crashes, and the WHOLE count is unmeasured — same as the gate, not a partial count over the readable files', () => {
    marker('fine', 60, { worker: 'live' })
    corruptMarker('half-written')

    const r = ls()
    expect(r.unreadable).toEqual(['half-written.json'])
    expect(r.markers.some((m) => m.agent_id === 'fine')).toBe(true) // the readable marker is still listed
    expect(r.in_flight).toBeNull() // T-699: never a partial number once a marker is corrupt

    const text = lsText()
    expect(text).toContain('unreadable marker: half-written.json')
    expect(text).toContain('in flight (what the dispatch gate counts, machine-wide): unmeasured')

    expect(gateInFlight()).toBeNull() // the gate: MARK_BAD → $inflight = null → "unmeasured"
  })

  test('a stale marker (since past the 4 h window, never stopped) is shown but not counted, on both sides', () => {
    marker('old', 5 * 3600, { worker: 'live' })
    const r = ls()
    expect(r.markers[0].state).toContain('stale')
    expect(r.in_flight).toBe(0)
    expect(gateInFlight()).toBe(0)
  })
})
