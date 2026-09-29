/**
 * prdt-schedule-record.test.ts — T-773 (T-681 slice S2), black-box over the
 * REAL hooks and CLI: prdt-dispatch-gate.sh (PreToolUse:Agent) → `prdt
 * schedule record` appends a `dispatch` row to `.prdt/schedule.jsonl`;
 * prdt-post-dispatch.sh (SubagentStart / SubagentStop) resolves the marker's
 * ticket from `[ctx].slug` and appends the `stop` row; `prdt schedule report`
 * writes docs/artifacts/<version>/schedule-observation.md.
 *
 * Design SoT: docs/artifacts/v1.11/critical-path.html, tab 「발주 기록」.
 * User decision T-765: an off-path dispatch WARNS and records — never denied.
 *
 * Every run points PRDT_HOME at a scratch dir and cwd at a scratch project;
 * the machine the gate measures is a PATH shim sitting under every cap. The
 * real ~/.prdt and the real project's .prdt are never read or written.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync, execFileSync } from 'child_process'
import { test, expect, describe, beforeEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const GATE = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-dispatch-gate.sh')
const POST = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-post-dispatch.sh')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const PO_HABIT = path.join(CORE_ROOT, 'discipline', 'po', 'habit.md')
const HABIT_CLAUSE = "**Next dispatch** = `prdt schedule`'s top row; another ticket → `[ctx].schedule_reason`."

function tmp(prefix: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
}

// An under-every-cap machine (same shape as dispatch-gate-hook.test.ts's shim).
const BIN = (() => {
  const bin = tmp('prdt-t773-bin-')
  const write = (name: string, body: string) => {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`)
    fs.chmodSync(path.join(bin, name), 0o755)
  }
  write('sysctl', [
    'for k in "$@"; do case "$k" in',
    "  vm.loadavg) echo '{ 1.00 1.00 1.00 }';;",
    "  hw.ncpu) echo '14';;",
    "  hw.memsize) echo '38654705664';;",
    'esac; done',
  ].join('\n'))
  write('memory_pressure', "echo 'System-wide memory free percentage: 60%'")
  write('ps', "echo '/sbin/launchd'")
  return bin
})()

let proj: string
let home: string

function env(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `${BIN}:${process.env.PATH}`, PRDT_HOME: home, PRDT_LANG: 'en', PRDT_META_BACKUP: '0', TZ: 'UTC' }
}

function writeTicket(id: string, fm: { slug?: string; status?: string; deps?: string; assignee?: string; version?: string } = {}) {
  const dir = path.join(proj, 'docs', 'tickets', fm.version ?? 'v1.11')
  fs.mkdirSync(dir, { recursive: true })
  const lines = ['---', `id: ${id}`, `slug: ${fm.slug ?? `s-${id.toLowerCase()}`}`, 'type: impl',
    `status: ${fm.status ?? 'open'}`, `assignee: ${fm.assignee ?? 'developer'}`]
  if (fm.deps) lines.push(`deps: ${fm.deps}`)
  lines.push('created: 2026-09-28', '---', '', '## problem', '', 'x', '', '## acceptance', '', '- x', '')
  fs.writeFileSync(path.join(dir, `${id}.md`), lines.join('\n'))
}

function ctx(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 's-t-1', goal: 'Build the thing.', change_meta: { files: ['a.sh'], user_facing: false, risk_flags: [], stage: 'build' },
    acceptance: 'It works.', wiki_refs: [], user_lang: 'ko', prd_path: 'docs/prd/PRD.md#v1.11', dispatch_id: 'd-1', ...extra,
  }
}

function prompt(c: Record<string, unknown>): string {
  return `[ctx] ${JSON.stringify(c)}\n\nDo the thing.`
}

/** PreToolUse:Agent through the real gate; returns the parsed hook output (or null for silence). */
function gate(c: Record<string, unknown>, toolUseId = 'toolu_1', subagentType = 'prdt-developer'): any {
  const ev = {
    session_id: 'sess-1', transcript_path: path.join(proj, 'parent.jsonl'), cwd: proj, hook_event_name: 'PreToolUse',
    tool_name: 'Agent', tool_input: { description: 'x', prompt: prompt(c), subagent_type: subagentType }, tool_use_id: toolUseId,
  }
  const r = spawnSync('bash', [GATE], { input: JSON.stringify(ev), encoding: 'utf8', env: env(), timeout: subprocessTimeout('hook') })
  expect(r.stderr).toBe('')
  expect(r.status).toBe(0)
  return r.stdout.trim() === '' ? null : JSON.parse(r.stdout).hookSpecificOutput
}

function post(ev: Record<string, unknown>) {
  const r = spawnSync('bash', [POST], { input: JSON.stringify({ session_id: 'sess-1', cwd: proj, ...ev }), encoding: 'utf8', env: env(), timeout: subprocessTimeout('hook') })
  expect(r.status).toBe(0)
}

function cli(args: string[]): { out: string; status: number } {
  try {
    return { out: execFileSync('python3', [PRDT_CLI, ...args], { cwd: proj, encoding: 'utf8', env: env(), stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli') }), status: 0 }
  } catch (e: any) {
    return { out: (e.stdout ?? '') + (e.stderr ?? ''), status: e.status ?? 1 }
  }
}

function rows(): any[] {
  const p = path.join(proj, '.prdt', 'schedule.jsonl')
  if (!fs.existsSync(p)) return []
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

beforeEach(() => {
  proj = tmp('prdt-t773-proj-')
  home = tmp('prdt-t773-home-')
  fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.11', current_task: null }))
  // critical path T-1 → T-2 (length 2); T-3 standalone (slack 1)
  writeTicket('T-1')
  writeTicket('T-2', { deps: '[T-1]' })
  writeTicket('T-3')
})

describe('the dispatch row — one per gate-passed dispatch', () => {
  test('the top row, resolved from [ctx].slug, records as followed with no output', () => {
    expect(gate(ctx())).toBeNull()
    const [r] = rows()
    expect(r).toMatchObject({
      kind: 'dispatch', dispatch_id: 'd-1', tool_use_id: 'toolu_1', persona: 'developer', version: 'v1.11',
      ticket: 'T-1', ticket_source: 'slug', critical_path: ['T-1', 'T-2'], cp_length: 2, top: ['T-1'],
      sent_slack: 0, class: 'followed', reason: null, checkout: 'code', files: ['a.sh'],
    })
    expect(r.ts).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/)
  })

  test('off the top row with no schedule_reason: a warning, never a deny, and reason null', () => {
    const out = gate(ctx({ slug: 's-t-3' }))
    expect(out.permissionDecision).toBeUndefined()
    expect(out.additionalContext).toContain('[prdt dispatch gate] off the critical path: this dispatch sends T-3')
    expect(out.additionalContext).toContain("`prdt schedule`'s top row (T-1; critical path T-1 → T-2)")
    expect(out.additionalContext).toContain('Warning only, this dispatch proceeds (T-765)')
    expect(out.additionalContext).toContain(HABIT_CLAUSE)
    expect(rows()[0]).toMatchObject({ ticket: 'T-3', class: 'deviated', reason: null, sent_slack: 1, top: ['T-1'] })
  })

  test('the quoted PO-habit clause exists verbatim in discipline/po/habit.md', () => {
    expect(fs.readFileSync(PO_HABIT, 'utf8')).toContain(HABIT_CLAUSE)
  })

  test('a blocked ticket (deps open) is deviated too', () => {
    const out = gate(ctx({ slug: 's-t-2' }))
    expect(out.additionalContext).toContain('this dispatch sends T-2')
    expect(rows()[0]).toMatchObject({ ticket: 'T-2', class: 'deviated', sent_state: 'blocked' })
  })

  test('schedule_reason silences the warning and is recorded; [ctx].worktree is the checkout', () => {
    expect(gate(ctx({ slug: 's-t-3', schedule_reason: 'T-3 unblocks the QA VM today', worktree: '/p/tracks/T-3' }))).toBeNull()
    expect(rows()[0]).toMatchObject({ class: 'deviated', reason: 'T-3 unblocks the QA VM today', checkout: '/p/tracks/T-3' })
  })

  test('a second dispatch of the same ticket is a continuation, whatever the top row is', () => {
    gate(ctx({ slug: 's-t-3', schedule_reason: 'r' }), 'toolu_1')
    expect(gate(ctx({ slug: 's-t-3', dispatch_id: 'd-2' }), 'toolu_2', 'prdt-qa')).toBeNull()
    expect(rows().map((r) => r.class)).toEqual(['deviated', 'continuation'])
    expect(rows()[1].persona).toBe('qa')
  })

  test('no ticket resolved, or one outside the graph, is off-graph and silent', () => {
    writeTicket('T-9', { status: 'done' })
    expect(gate(ctx({ slug: 'retro-round', goal: 'Run the retro.', dispatch_id: 'd-r' }))).toBeNull()
    expect(gate(ctx({ slug: 's-t-9', dispatch_id: 'd-9' }), 'toolu_9')).toBeNull()
    expect(rows().map((r) => [r.ticket, r.ticket_source, r.class])).toEqual([[null, null, 'off-graph'], ['T-9', 'slug', 'off-graph']])
  })

  test('with no slug match the T-NNN token in dispatch_id still resolves the ticket', () => {
    gate(ctx({ slug: 'unmatched', dispatch_id: 'd-T1-a' }))
    expect(rows()[0]).toMatchObject({ ticket: 'T-1', ticket_source: 'token', class: 'followed' })
  })

  test('a denied dispatch records nothing', () => {
    const c = ctx()
    delete c.dispatch_id
    expect(gate(c).permissionDecision).toBe('deny')
    expect(rows()).toEqual([])
  })

  test('a ticket already in flight drops out of the top row', () => {
    // a live marker on T-1 (fresh, transcript being written) → T-1 in-flight; T-3 is now the top
    const t = path.join(home, 'agent-a1.jsonl')
    fs.writeFileSync(t, '{"type":"assistant","message":{"model":"claude"}}\n')
    fs.mkdirSync(path.join(home, 'run', 'dispatches'), { recursive: true })
    fs.writeFileSync(path.join(home, 'run', 'dispatches', 'm1.json'), JSON.stringify({
      agent_id: 'a1', persona: 'developer', ticket_id: 'T-1', dispatch_id: 'd-0', project_root: proj,
      since: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), transcript: t, model: 'default',
    }))
    expect(gate(ctx({ slug: 's-t-3', dispatch_id: 'd-3' }), 'toolu_3')).toBeNull()
    expect(rows()[0]).toMatchObject({ ticket: 'T-3', class: 'followed', top: ['T-3'] })
  })
})

describe('the marker and the stop row (prdt-post-dispatch.sh)', () => {
  function parentTranscript(toolUseId: string, c: Record<string, unknown>): string {
    const p = path.join(proj, 'parent.jsonl')
    fs.writeFileSync(p, JSON.stringify({ type: 'assistant', message: { content: [
      { type: 'tool_use', name: 'Agent', id: toolUseId, input: { subagent_type: 'prdt-developer', prompt: prompt(c) } },
    ] } }) + '\n')
    return p
  }

  test('SubagentStart resolves the marker ticket from [ctx].slug, so `prdt schedule` shows it in flight', () => {
    const c = ctx({ dispatch_id: 'd-v111-t1-77' })   // lowercase t1: no T-NNN token anywhere
    const tp = parentTranscript('toolu_1', c)
    post({ hook_event_name: 'SubagentStart', agent_id: 'ag1', agent_type: 'prdt-developer', transcript_path: tp })
    const dir = path.join(home, 'run', 'dispatches')
    const [m] = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    expect(m).toMatchObject({ ticket_id: 'T-1', dispatch_id: 'd-v111-t1-77', tool_use_id: 'toolu_1' })
    // the worker transcript exists and is fresh → live
    fs.mkdirSync(path.dirname(m.transcript), { recursive: true })
    fs.writeFileSync(m.transcript, '{"type":"assistant","message":{"model":"claude"}}\n')
    const s = JSON.parse(cli(['schedule', '--json']).out)
    expect(s.rows.find((r: any) => r.id === 'T-1').state).toBe('in-flight')
  })

  test('SubagentStop appends a stop row joined by tool_use_id: outcome and duration', () => {
    const c = ctx()
    gate(c, 'toolu_1')
    const tp = parentTranscript('toolu_1', c)
    post({ hook_event_name: 'SubagentStart', agent_id: 'ag1', agent_type: 'prdt-developer', transcript_path: tp })
    post({ hook_event_name: 'SubagentStop', agent_id: 'ag1', agent_type: 'prdt-developer', stop_hook_active: false,
      last_assistant_message: '{"persona":"developer","task":"t","summary":"s","confidence":0.9}' })
    const [d, s] = rows()
    expect(d.kind).toBe('dispatch')
    expect(s).toMatchObject({ kind: 'stop', tool_use_id: 'toolu_1', dispatch_id: 'd-1', agent_id: 'ag1', ticket: 'T-1', outcome: 'returned' })
    expect(typeof s.duration_s).toBe('number')
  })

  test('a final message that is not an envelope stops as no-envelope; a <synthetic> tail as quota-killed', () => {
    const c = ctx()
    gate(c, 'toolu_1')
    const tp = parentTranscript('toolu_1', c)
    post({ hook_event_name: 'SubagentStart', agent_id: 'ag1', agent_type: 'prdt-developer', transcript_path: tp })
    post({ hook_event_name: 'SubagentStop', agent_id: 'ag1', agent_type: 'prdt-developer', last_assistant_message: 'done!' })
    const atp = path.join(proj, 'agent-ag2.jsonl')
    fs.writeFileSync(atp, '{"type":"assistant","message":{"model":"<synthetic>","content":[]}}\n')
    gate(ctx({ dispatch_id: 'd-2' }), 'toolu_2')
    fs.writeFileSync(tp, JSON.stringify({ type: 'assistant', message: { content: [
      { type: 'tool_use', name: 'Agent', id: 'toolu_2', input: { subagent_type: 'prdt-developer', prompt: prompt(ctx({ dispatch_id: 'd-2' })) } },
    ] } }) + '\n')
    post({ hook_event_name: 'SubagentStart', agent_id: 'ag2', agent_type: 'prdt-developer', transcript_path: tp })
    post({ hook_event_name: 'SubagentStop', agent_id: 'ag2', agent_type: 'prdt-developer', agent_transcript_path: atp, last_assistant_message: '' })
    expect(rows().filter((r) => r.kind === 'stop').map((r) => r.outcome)).toEqual(['no-envelope', 'quota-killed'])
  })

  test('a stop with no matching dispatch row writes nothing', () => {
    const tp = parentTranscript('toolu_x', ctx())
    post({ hook_event_name: 'SubagentStart', agent_id: 'agx', agent_type: 'prdt-developer', transcript_path: tp })
    post({ hook_event_name: 'SubagentStop', agent_id: 'agx', agent_type: 'prdt-developer', last_assistant_message: '{}' })
    expect(rows()).toEqual([])
  })
})

describe('`prdt schedule report` — the gate observation document', () => {
  const OBS = () => path.join(proj, 'docs', 'artifacts', 'v1.11', 'schedule-observation.md')

  function seed() {
    const lines = [
      { kind: 'dispatch', ts: '2026-09-28T05:00:00Z', dispatch_id: 'd-a', tool_use_id: 'tu-a', persona: 'developer', version: 'v1.11',
        ticket: 'T-1', slug: 's-t-1', critical_path: ['T-1', 'T-2'], top: ['T-1'], class: 'followed', reason: null },
      { kind: 'stop', ts: '2026-09-28T05:12:30Z', tool_use_id: 'tu-a', dispatch_id: 'd-a', outcome: 'returned', duration_s: 750 },
      { kind: 'dispatch', ts: '2026-09-28T05:01:00Z', dispatch_id: 'd-b', tool_use_id: 'tu-b', persona: 'developer', version: 'v1.11',
        ticket: 'T-3', slug: 's-t-3', critical_path: ['T-1', 'T-2'], top: ['T-1'], class: 'deviated', reason: null },
      { kind: 'dispatch', ts: '2026-09-28T05:02:00Z', dispatch_id: 'd-c', tool_use_id: 'tu-c', persona: 'qa', version: 'v1.11',
        ticket: 'T-4', critical_path: ['T-1', 'T-2'], top: ['T-1'], class: 'deviated', reason: 'VM | is free now' },
      { kind: 'dispatch', ts: '2026-09-28T05:03:00Z', dispatch_id: 'd-d', tool_use_id: 'tu-d', persona: 'qa', version: 'v1.11',
        ticket: 'T-1', critical_path: ['T-2'], top: [], class: 'continuation', reason: null },
      { kind: 'dispatch', ts: '2026-09-20T05:00:00Z', dispatch_id: 'd-old', persona: 'developer', version: 'v1.10',
        ticket: 'T-0', critical_path: [], top: [], class: 'followed', reason: null },
    ]
    fs.writeFileSync(path.join(proj, '.prdt', 'schedule.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
  }

  test('writes one row per v1.11 dispatch with the gate columns, then measure 5', () => {
    seed()
    const r = cli(['schedule', 'report'])
    expect(r.status).toBe(0)
    expect(r.out).toContain('docs/artifacts/v1.11/schedule-observation.md — 4 dispatch row(s) for v1.11')
    const md = fs.readFileSync(OBS(), 'utf8')
    expect(md).toContain('| 시각 | 발주 | 그 시점의 critical path | 실제로 보낸 작업 | 따랐는가 | 벗어났다면 이유 | 소요 시간 |')
    expect(md).toContain('| 2026-09-28 05:00 UTC | developer · `d-a` | T-1 → T-2 (최상위 T-1) | T-1 `s-t-1` | 따름 | — | 12분 30초 |')
    expect(md).toContain('| T-3 `s-t-3` | 벗어남 | 이유 없음 | 기록 없음 |')
    expect(md).toContain('| 벗어남 | VM \\| is free now |')
    expect(md).toContain('| T-2 (발주 가능 없음) | T-1 | 이어서 (같은 티켓) | — |')
    expect(md).not.toContain('d-old')
    expect(md).toContain('측정 5 — critical path 를 따른 발주 비율: 따름 1 ÷ (따름 1 + 벗어남 2) = 33%.')
  })

  test('a re-run rewrites only the generated section; the PO text outside it stays byte-identical', () => {
    seed()
    cli(['schedule', 'report'])
    const first = fs.readFileSync(OBS(), 'utf8')
    const po = '\n## 측정 1~4\n\n| 측정 | 기준값 | 관측값 |\n|---|---|---|\n| 1 | 0 | 3 |\n'
    fs.writeFileSync(OBS(), first + po)
    fs.appendFileSync(path.join(proj, '.prdt', 'schedule.jsonl'), JSON.stringify({ kind: 'dispatch', ts: '2026-09-28T06:00:00Z',
      persona: 'developer', version: 'v1.11', ticket: 'T-2', critical_path: ['T-2'], top: ['T-2'], class: 'followed', reason: null }) + '\n')
    cli(['schedule', 'report'])
    const second = fs.readFileSync(OBS(), 'utf8')
    expect(second.endsWith(po)).toBe(true)
    expect(second).toContain('따름 2 ÷ (따름 2 + 벗어남 2) = 50%')
    expect(second.split('prdt:schedule-report:begin').length).toBe(2)
  })

  test('--version picks another bucket; no rows is a zero-row table, not a crash', () => {
    const r = cli(['schedule', 'report', '--version', 'v1.12'])
    expect(r.status).toBe(0)
    const md = fs.readFileSync(path.join(proj, 'docs', 'artifacts', 'v1.12', 'schedule-observation.md'), 'utf8')
    expect(md).toContain('v1.12 발주 0건')
    expect(md).toContain('측정 불가 (분모 0)')
  })
})
