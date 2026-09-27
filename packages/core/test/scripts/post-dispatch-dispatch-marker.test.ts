/**
 * post-dispatch-dispatch-marker.test.ts — T-682 (slice 2, rebuilt in slice 3).
 *
 * The WRITE side of the statusline's `running` footer segment: the in-flight
 * dispatch marker `<PRDT_HOME>/run/dispatches/<sha256(agent_id)>.json`
 * maintained by `prdt-post-dispatch.sh`. `statusline-running-waiting.test.ts`
 * covers the READ side. `run/` is a tooling-owned carve-out — every test here
 * points `PRDT_HOME` at a throwaway scratch dir, never the real one.
 *
 * Slice 3 (QA grill F1/F2/F9/F10): the marker's START moved from
 * PostToolUse:Agent to SubagentStart. Measured event order (Claude Code
 * 2.1.283, QA's probe re-run by the developer 2026-09-26):
 *   FOREGROUND  SubagentStart → SubagentStop → PostToolUse:Agent
 *   BACKGROUND  SubagentStart → PostToolUse:Agent → SubagentStop
 *   RESUME      PostToolUse:SendMessage → SubagentStart → SubagentStop (same agent_id)
 * Every test below REPLAYS one of those measured orders into the real hook —
 * the events are fixtures, the hook is the production script.
 *
 * Marker lifecycle pinned here:
 *   SubagentStart   writes (or revives) the marker; ticket id from — in order —
 *                   the marker already on disk for that agent_id (resume), the
 *                   parent transcript's oldest unclaimed pending Agent tool_use
 *                   of that agent_type (its `[ctx]` prompt), po-state's
 *                   current_task.
 *   PostToolUse     refines an existing marker's pairing from the authoritative
 *                   (agentId ↔ `[ctx]`) source; never revives a stopped one;
 *                   creates one only for `status:"async_launched"` with none.
 *   SubagentStop    stamps `stopped_at` (file kept for the resume case).
 *   prune           the hook removes files past 24 h (`stopped_at`, else
 *                   `since`) at every event it handles — F10: the tooling that
 *                   owns run/ removes stale markers, the statusline never does.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-post-dispatch.sh')
const PERSONA_TYPE = 'prdt-developer'

let root: string
let prdtHome: string

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function makeProject(currentTask: Record<string, unknown> | null = null): string {
  // realpath'd (macOS: /tmp -> /private/tmp) — the hook resolves `os.path.realpath(cwd)`
  // before walking for `.prdt/po-state.json`, so an un-resolved fixture root would never
  // equal the marker's recorded `project_root`.
  const r = fs.realpathSync(tmp('prdt-t682-proj-'))
  fs.mkdirSync(path.join(r, '.prdt'), { recursive: true })
  fs.writeFileSync(
    path.join(r, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.10', current_task: currentTask }),
  )
  return r
}

function markerPath(home: string, agentId: string): string {
  const hex = crypto.createHash('sha256').update(agentId, 'utf8').digest('hex')
  return path.join(home, 'run', 'dispatches', `${hex}.json`)
}

type Marker = {
  agent_id: string; persona: string; dispatch_id: string | null; ticket_id: string | null
  tool_use_id: string | null; project_root: string; since: string; stopped_at?: string; resumed_from?: string | null
  session_id?: string | null; transcript?: string | null
}

function readMarker(home: string, agentId: string): Marker {
  return JSON.parse(fs.readFileSync(markerPath(home, agentId), 'utf8'))
}

function markerExists(home: string, agentId: string): boolean {
  return fs.existsSync(markerPath(home, agentId))
}

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

type HookRun = { status: number | null; stderr: string; stdout: string }

function runHook(ev: Record<string, unknown>, home: string): HookRun {
  const res = spawnSync('bash', [HOOK], {
    input: JSON.stringify(ev),
    encoding: 'utf8',
    env: { ...process.env, PRDT_HOME: home },
    timeout: subprocessTimeout('hook'),
  })
  return { status: res.status, stderr: res.stderr, stdout: res.stdout }
}

function ctxPrompt(ctx: Record<string, unknown>): string {
  return `[ctx] ${JSON.stringify(ctx)}\nDo the thing.`
}

/** SubagentStart — measured payload: session_id · transcript_path (the PARENT's) ·
 *  cwd · prompt_id · agent_id · agent_type · hook_event_name. No prompt, no [ctx]. */
function subagentStart(opts: { agentId: string; transcriptPath?: string; cwd?: string; home?: string }): HookRun {
  const ev: Record<string, unknown> = {
    session_id: 'sess-1', cwd: opts.cwd ?? root, agent_id: opts.agentId, agent_type: PERSONA_TYPE,
    hook_event_name: 'SubagentStart',
  }
  if (opts.transcriptPath) ev.transcript_path = opts.transcriptPath
  return runHook(ev, opts.home ?? prdtHome)
}

/** SubagentStop — same agent_id/agent_type; `agent_transcript_path` optional. */
function subagentStop(opts: { agentId: string; transcriptPath?: string; cwd?: string; home?: string }): HookRun {
  const ev: Record<string, unknown> = {
    session_id: 'sess-1', cwd: opts.cwd ?? root, agent_id: opts.agentId, agent_type: PERSONA_TYPE,
    hook_event_name: 'SubagentStop', stop_hook_active: false,
  }
  if (opts.transcriptPath) ev.agent_transcript_path = opts.transcriptPath
  return runHook(ev, opts.home ?? prdtHome)
}

/** PostToolUse:Agent — measured payload: the `[ctx]` prompt in tool_input, the agentId
 *  and `status` ("completed" for a finished foreground call, "async_launched" for a
 *  background launch) in tool_response, plus tool_use_id. */
function postToolUseAgent(opts: {
  agentId: string; ctx: Record<string, unknown>; status?: 'completed' | 'async_launched'
  toolUseId?: string; cwd?: string; home?: string
}): HookRun {
  const ev = {
    session_id: 'sess-1', cwd: opts.cwd ?? root, hook_event_name: 'PostToolUse', tool_name: 'Agent',
    tool_input: { subagent_type: PERSONA_TYPE, prompt: ctxPrompt(opts.ctx), description: 'x' },
    tool_response: { status: opts.status ?? 'completed', agentId: opts.agentId, agentType: PERSONA_TYPE, prompt: ctxPrompt(opts.ctx) },
    tool_use_id: opts.toolUseId ?? `toolu_${opts.agentId}`,
  }
  return runHook(ev, opts.home ?? prdtHome)
}

/** A parent-transcript fixture in the shape the hook reads: one assistant record per
 *  Agent/SendMessage tool_use, one user record per tool_result. */
type TranscriptItem =
  | { toolUse: string; subagentType?: string; ctx: Record<string, unknown> }
  | { sendMessage: string; to: string }
  | { toolResult: string }
function writeTranscript(items: TranscriptItem[], name = 'parent.jsonl'): string {
  const lines = items.map((it) => {
    if ('toolUse' in it) {
      return JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: it.toolUse, name: 'Agent', input: { subagent_type: it.subagentType ?? PERSONA_TYPE, description: 'd', prompt: ctxPrompt(it.ctx) } }] } })
    }
    if ('sendMessage' in it) {
      return JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: it.sendMessage, name: 'SendMessage', input: { to: it.to, message: 'more' } }] } })
    }
    return JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: it.toolResult, content: [{ type: 'text', text: 'ok' }] }] } })
  })
  const p = path.join(root, name)
  fs.writeFileSync(p, lines.join('\n') + '\n')
  return p
}

function sessions(r: string): Record<string, { agent_id?: string; last_seen?: string }> {
  return JSON.parse(fs.readFileSync(path.join(r, '.prdt', 'sessions.json'), 'utf8'))
}

function lastTurn(r: string): Record<string, unknown> {
  const p = path.join(r, '.prdt', 'turns.jsonl')
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n')
  return JSON.parse(lines[lines.length - 1])
}

function expectSilent(res: HookRun): void {
  expect(res.status).toBe(0)
  expect(res.stderr).toBe('')
  expect(res.stdout).toBe('') // never additionalContext from SubagentStart/SubagentStop (T-490 slice 3)
}

beforeEach(() => {
  root = makeProject()
  prdtHome = tmp('prdt-t682-home-')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(prdtHome, { recursive: true, force: true })
})

describe('T-682 slice 3 — F1: the marker follows the measured event order of each mode', () => {
  test('FOREGROUND (SubagentStart → SubagentStop → PostToolUse:Agent): no live marker once finished', () => {
    const agentId = 'agent-fg'
    const transcript = writeTranscript([{ toolUse: 'toolu_fg', ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T682-s3-fg' } }])

    const r1 = subagentStart({ agentId, transcriptPath: transcript })
    expectSilent(r1)
    const m1 = readMarker(prdtHome, agentId)
    expect(m1).toMatchObject({ agent_id: agentId, persona: 'developer', dispatch_id: 'd-T682-s3-fg', ticket_id: 'T-682', tool_use_id: 'toolu_fg', project_root: root })
    expect(m1.stopped_at).toBeUndefined()
    // marker-only event: nothing else of the hook's recording fires at start
    expect(fs.existsSync(path.join(root, '.prdt', 'sessions.json'))).toBe(false)
    expect(fs.existsSync(path.join(root, '.prdt', 'turns.jsonl'))).toBe(false)

    const r2 = subagentStop({ agentId })
    expectSilent(r2)
    expect(readMarker(prdtHome, agentId).stopped_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)

    // PostToolUse:Agent fires LAST for a foreground call — it must not revive the marker
    // (slice 1/2 keyed the start here, which showed finished dispatches as running for hours).
    const r3 = postToolUseAgent({ agentId, ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T682-s3-fg' }, status: 'completed' })
    expect(r3.status).toBe(0)
    expect(r3.stderr).toBe('')
    const m3 = readMarker(prdtHome, agentId)
    expect(m3.stopped_at).toBeDefined()
    expect(m3.ticket_id).toBe('T-682')
    // the hook's pre-existing recording at PostToolUse is unchanged
    expect(sessions(root).developer).toMatchObject({ agent_id: agentId })
  })

  test('BACKGROUND (SubagentStart → PostToolUse:Agent → SubagentStop): live while running, stopped on stop', () => {
    const agentId = 'agent-bg'
    const transcript = writeTranscript([{ toolUse: 'toolu_bg', ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T690-s1-bg' } }])

    expectSilent(subagentStart({ agentId, transcriptPath: transcript }))
    expect(readMarker(prdtHome, agentId)).toMatchObject({ ticket_id: 'T-690', tool_use_id: 'toolu_bg' })

    const r2 = postToolUseAgent({ agentId, ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T690-s1-bg' }, status: 'async_launched', toolUseId: 'toolu_bg' })
    expect(r2.status).toBe(0)
    const m2 = readMarker(prdtHome, agentId)
    expect(m2.stopped_at).toBeUndefined() // still running
    expect(m2).toMatchObject({ ticket_id: 'T-690', dispatch_id: 'd-T690-s1-bg' })

    expectSilent(subagentStop({ agentId }))
    expect(readMarker(prdtHome, agentId).stopped_at).toBeDefined()
  })

  test('PostToolUse:Agent alone (settings.json predating the SubagentStart registration): creates a marker only for a background launch', () => {
    const fg = postToolUseAgent({ agentId: 'agent-old-fg', ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T682-old' }, status: 'completed' })
    expect(fg.status).toBe(0)
    expect(markerExists(prdtHome, 'agent-old-fg')).toBe(false)
    expect(fs.existsSync(path.join(prdtHome, 'run', 'dispatches'))).toBe(false) // nothing to write → dir not even created
    expect(sessions(root).developer).toMatchObject({ agent_id: 'agent-old-fg' }) // the rest of the hook still ran

    const bg = postToolUseAgent({ agentId: 'agent-old-bg', ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T682-old' }, status: 'async_launched' })
    expect(bg.status).toBe(0)
    expect(readMarker(prdtHome, 'agent-old-bg')).toMatchObject({ ticket_id: 'T-682', persona: 'developer', project_root: root })
    expect(readMarker(prdtHome, 'agent-old-bg').stopped_at).toBeUndefined()
  })
})

describe('T-682 slice 3 — F2: a resumed worker (same agent_id) runs under its original ticket', () => {
  test('RESUME (PostToolUse:SendMessage → SubagentStart → SubagentStop): live again, ticket id kept, then stopped', () => {
    const agentId = 'agent-resume'
    const t1 = writeTranscript([{ toolUse: 'toolu_r1', ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T682-s3-r' } }])
    expectSilent(subagentStart({ agentId, transcriptPath: t1 }))
    expectSilent(subagentStop({ agentId }))
    postToolUseAgent({ agentId, ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T682-s3-r' }, status: 'completed', toolUseId: 'toolu_r1' })
    const stopped = readMarker(prdtHome, agentId)
    expect(stopped.stopped_at).toBeDefined()

    // PostToolUse:SendMessage never reaches this hook (matcher: Agent). The transcript now
    // ends in a SendMessage tool_use — no pending Agent call at all to pair with.
    const t2 = writeTranscript([
      { toolUse: 'toolu_r1', ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T682-s3-r' } }, { toolResult: 'toolu_r1' },
      { sendMessage: 'toolu_sm', to: agentId },
    ], 'parent2.jsonl')
    expectSilent(subagentStart({ agentId, transcriptPath: t2 }))
    const revived = readMarker(prdtHome, agentId)
    expect(revived.stopped_at).toBeUndefined()
    expect(revived).toMatchObject({ ticket_id: 'T-682', dispatch_id: 'd-T682-s3-r', resumed_from: stopped.since })
    expect(revived.since >= stopped.since).toBe(true)

    expectSilent(subagentStop({ agentId }))
    expect(readMarker(prdtHome, agentId).stopped_at).toBeDefined()
  })
})

describe('T-695 slice 2 — the marker names the worker transcript the gate probes for liveness', () => {
  test('SubagentStart derives <parent dir>/<session_id>/subagents/agent-<id>.jsonl and records session_id', () => {
    const parent = path.join(root, 'projects', '-Users-u-dev-p', 'sess-1.jsonl')
    fs.mkdirSync(path.dirname(parent), { recursive: true })
    fs.writeFileSync(parent, '')
    expectSilent(subagentStart({ agentId: 'agent-t695', transcriptPath: parent }))
    const m = readMarker(prdtHome, 'agent-t695')
    expect(m.session_id).toBe('sess-1')
    expect(m.transcript).toBe(path.join(root, 'projects', '-Users-u-dev-p', 'sess-1', 'subagents', 'agent-agent-t695.jsonl'))
  })

  test('no parent transcript_path in the event: transcript is null, the marker is still written', () => {
    expectSilent(subagentStart({ agentId: 'agent-t695b' }))
    expect(readMarker(prdtHome, 'agent-t695b').transcript).toBeNull()
  })
})

describe('T-682 slice 3 — the ticket id at SubagentStart (no [ctx] in that event)', () => {
  test('fan-out: two pending same-persona Agent calls pair FIFO, each tool_use claimed once; PostToolUse corrects a wrong pairing', () => {
    const transcript = writeTranscript([
      { toolUse: 'toolu_a', ctx: { slug: 'first', goal: 'g', dispatch_id: 'd-T701-a' } },
      { toolUse: 'toolu_b', ctx: { slug: 'second', goal: 'g', dispatch_id: 'd-T702-b' } },
    ])
    expectSilent(subagentStart({ agentId: 'agent-1', transcriptPath: transcript }))
    expectSilent(subagentStart({ agentId: 'agent-2', transcriptPath: transcript }))
    expect(readMarker(prdtHome, 'agent-1')).toMatchObject({ ticket_id: 'T-701', tool_use_id: 'toolu_a' })
    expect(readMarker(prdtHome, 'agent-2')).toMatchObject({ ticket_id: 'T-702', tool_use_id: 'toolu_b' })

    // the harness pairs agent-1 with the SECOND call after all: the authoritative
    // (agentId ↔ [ctx]) source at PostToolUse:Agent overrides the FIFO guess
    postToolUseAgent({ agentId: 'agent-1', ctx: { slug: 'second', goal: 'g', dispatch_id: 'd-T702-b' }, status: 'async_launched', toolUseId: 'toolu_b' })
    expect(readMarker(prdtHome, 'agent-1')).toMatchObject({ ticket_id: 'T-702', tool_use_id: 'toolu_b' })
  })

  test('a resolved (tool_result present) Agent call is not a candidate; an Agent call of another persona is not either', () => {
    const transcript = writeTranscript([
      { toolUse: 'toolu_done', ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T111-done' } }, { toolResult: 'toolu_done' },
      { toolUse: 'toolu_qa', subagentType: 'prdt-qa', ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T222-qa' } },
      { toolUse: 'toolu_mine', ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T333-mine' } },
    ])
    expectSilent(subagentStart({ agentId: 'agent-x', transcriptPath: transcript }))
    expect(readMarker(prdtHome, 'agent-x')).toMatchObject({ ticket_id: 'T-333', tool_use_id: 'toolu_mine' })
  })

  test('no pairable transcript: po-state current_task is the fallback; nothing at all still writes a persona-only marker', () => {
    fs.rmSync(root, { recursive: true, force: true })
    root = makeProject({ ticket_id: 'T-555', slug: 'cur', assignee: 'developer' })
    expectSilent(subagentStart({ agentId: 'agent-po' })) // no transcript_path at all
    expect(readMarker(prdtHome, 'agent-po')).toMatchObject({ ticket_id: 'T-555', dispatch_id: null, tool_use_id: null })

    fs.rmSync(root, { recursive: true, force: true })
    root = makeProject(null)
    expectSilent(subagentStart({ agentId: 'agent-none' }))
    const m = readMarker(prdtHome, 'agent-none')
    expect(m.ticket_id).toBeNull()
    expect(m.persona).toBe('developer')
    expect(m.stopped_at).toBeUndefined()
    // …and SubagentStop still has something to stamp
    expectSilent(subagentStop({ agentId: 'agent-none' }))
    expect(readMarker(prdtHome, 'agent-none').stopped_at).toBeDefined()
  })

  test('heuristic order and F9 boundaries: dispatch_id (hyphen-less) > goal > slug; "GPT-4" is not T-4; "t444" is not a ticket', () => {
    const transcript = writeTranscript([
      { toolUse: 'toolu_1', ctx: { slug: 's', goal: 'T-111: unrelated', dispatch_id: 'd-T222-x' } },
      { toolUse: 'toolu_2', ctx: { slug: 'some-slug', goal: 'T-333: do the thing', dispatch_id: 'd-nomatch-1' } },
      { toolUse: 'toolu_3', ctx: { slug: 'fix-t444-thing', goal: 'evaluate GPT-4 output', dispatch_id: 'd-nomatch-2' } },
      { toolUse: 'toolu_4', ctx: { slug: 's', goal: 'compare T-6829 with GPT-4', dispatch_id: 'd-nomatch-3' } },
    ])
    for (const a of ['agent-h1', 'agent-h2', 'agent-h3', 'agent-h4']) expectSilent(subagentStart({ agentId: a, transcriptPath: transcript }))
    expect(readMarker(prdtHome, 'agent-h1').ticket_id).toBe('T-222')
    expect(readMarker(prdtHome, 'agent-h2').ticket_id).toBe('T-333')
    expect(readMarker(prdtHome, 'agent-h3').ticket_id).toBeNull() // F9: left boundary; lowercase never matches
    expect(readMarker(prdtHome, 'agent-h4').ticket_id).toBe('T-6829') // whole digit run, never a prefix of it
  })
})

describe('T-682 slice 3 — F10: stale markers leave the disk through this hook, never the statusline', () => {
  test('files past 24 h (stopped_at, else since) are removed at the next event; younger ones stay', () => {
    const dir = path.join(prdtHome, 'run', 'dispatches')
    fs.mkdirSync(dir, { recursive: true })
    const write = (aid: string, body: Record<string, unknown>) =>
      fs.writeFileSync(markerPath(prdtHome, aid), JSON.stringify({ agent_id: aid, persona: 'developer', dispatch_id: null, ticket_id: 'T-1', tool_use_id: null, project_root: root, ...body }))
    write('old-stopped', { since: isoAgo(30 * 3600_000), stopped_at: isoAgo(25 * 3600_000) })
    write('old-crashed', { since: isoAgo(25 * 3600_000) }) // never saw SubagentStop
    write('young-stopped', { since: isoAgo(5 * 3600_000), stopped_at: isoAgo(1 * 3600_000) })
    write('young-live', { since: isoAgo(5 * 3600_000) }) // past STALE_HOURS for display, not past retention
    fs.writeFileSync(path.join(dir, 'garbage.json'), '{not json')

    expectSilent(subagentStart({ agentId: 'agent-trigger' }))

    expect(markerExists(prdtHome, 'old-stopped')).toBe(false)
    expect(markerExists(prdtHome, 'old-crashed')).toBe(false)
    expect(markerExists(prdtHome, 'young-stopped')).toBe(true)
    expect(markerExists(prdtHome, 'young-live')).toBe(true)
    expect(fs.existsSync(path.join(dir, 'garbage.json'))).toBe(true) // unparseable: left alone, not this hook's to judge
    expect(markerExists(prdtHome, 'agent-trigger')).toBe(true)
  })
})

describe('T-682 — the marker is best-effort: a failing write/stamp never breaks the dispatch', () => {
  test('a failing marker WRITE at SubagentStart is silent (exit 0, no output)', () => {
    // `run` pre-exists as a plain FILE: os.makedirs(".../run/dispatches") raises inside
    // the marker try/except, caught silently — the same best-effort contract every other
    // write in this hook already follows.
    fs.mkdirSync(prdtHome, { recursive: true })
    fs.writeFileSync(path.join(prdtHome, 'run'), 'not a directory')
    expectSilent(subagentStart({ agentId: 'agent-write-fail' }))

    // and PostToolUse:Agent under the same breakage still records sessions.json as before
    const res = postToolUseAgent({ agentId: 'agent-write-fail', ctx: { slug: 's', goal: 'g', dispatch_id: 'd-T682-wf' }, status: 'async_launched' })
    expect(res.status).toBe(0)
    expect(res.stderr).toBe('')
    expect(sessions(root).developer).toMatchObject({ agent_id: 'agent-write-fail' })
  })

  test('a failing marker STAMP at SubagentStop never breaks completion (turns.jsonl still written)', () => {
    const agentId = 'agent-stamp-fail'
    expectSilent(subagentStart({ agentId }))
    // Replace the marker file with a DIRECTORY of the same name: reading/replacing it
    // raises inside marker_stop's try/except.
    const mp = markerPath(prdtHome, agentId)
    fs.rmSync(mp, { force: true })
    fs.mkdirSync(mp, { recursive: true })

    const transcript = path.join(root, 'agent-transcript.jsonl')
    fs.writeFileSync(transcript, '')
    expectSilent(subagentStop({ agentId, transcriptPath: transcript }))
    expect(lastTurn(root)).toMatchObject({ scope: 'subagent', persona: 'developer', session_id: agentId })
    expect(fs.statSync(mp).isDirectory()).toBe(true) // left as-is, never force-removed
  })
})
