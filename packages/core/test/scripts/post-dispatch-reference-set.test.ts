/**
 * post-dispatch-reference-set.test.ts — T-584 regression.
 *
 * Two properties of a dispatch that turns.jsonl never recorded (PO key sweep
 * 2026-09-04; T-545 worker 2026-09-14): what the worker CONSULTED (its
 * reference set) and which PLAYBOOK(s) it ran. Both are derived at
 * SubagentStop from surfaces the hook already has in hand — the
 * `agent_transcript_path` it sums usage from, and the event's
 * `last_assistant_message` (the return envelope, the same field
 * prdt-return-check.sh gates on) — as ADDITIVE keys on the scope=subagent line.
 *
 * The standing lesson this pins: "read nothing" and "we could not see" are
 * different facts, and both differ from "written before this existed".
 *   - populated: Read/Grep paths → `refs.observed`; read-shaped Bash segments
 *     (cat/sed/head…) → `refs.bash_observed` (heuristic); hook-injected
 *     discipline + CLAUDE.md → `refs.injected`; a sub-dispatch, an mcp call,
 *     a python heredoc → COUNTED under `refs.unobservable`, never dropped.
 *   - unobservable: no transcript at the recording point → `refs.source` null,
 *     `playbooks_run` null + `playbooks_source: "no_envelope"`; the usage record
 *     itself is still written (the cost archive never pays for this).
 *   - empty vs missing: a worker that ran no playbook returns `[]` and is
 *     recorded as `[]`; a return that omitted the key is `null` +
 *     `"envelope_without_key"`; a pre-change record has no key at all.
 *   - bounded record: lists cap at 200 entries with the dropped count in
 *     `refs.truncated` (file growth is T-400's rotation, not this record's).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-post-dispatch.sh')

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function makeProject(): string {
  const root = tmp('prdt-t584-proj-')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.9', current_task: null }),
  )
  return root
}

const USAGE = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 200, cache_creation_input_tokens: 100 }

/** One assistant line carrying tool_use blocks (the shape derive_refs reads). */
function assistantTools(blocks: Array<{ name: string; input: Record<string, unknown> }>): string {
  return JSON.stringify({
    type: 'assistant',
    message: {
      model: 'claude-opus-5',
      usage: USAGE,
      content: blocks.map((b, i) => ({ type: 'tool_use', id: `toolu_${i}`, name: b.name, input: b.input })),
    },
  })
}

/** The final assistant text block — where the envelope lives in a transcript. */
function assistantText(text: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: { model: 'claude-opus-5', usage: USAGE, content: [{ type: 'text', text }] },
  })
}

/** Harness attachment records: hook-injected discipline and CLAUDE.md files. */
function attachmentHookContext(content: string): string {
  return JSON.stringify({ type: 'attachment', attachment: { type: 'hook_additional_context', content, hookEvent: 'SubagentStart' } })
}
function attachmentInstructions(paths: string[]): string {
  return JSON.stringify({ type: 'attachment', attachment: { type: 'instructions', files: paths.map((p) => ({ path: p, type: 'User' })) } })
}

interface Refs {
  source: string | null
  observed?: string[]
  bash_observed?: string[]
  injected?: string[]
  unobservable?: { bash_opaque: number; agent: number; web: number; mcp: number; skill: number }
  truncated?: number
  error?: boolean
}
interface TurnLine {
  model: string | null
  usage: { input: number; output: number; cache: number } | null
  refs?: Refs
  playbooks_run?: string[] | null
  playbooks_source?: string
}

function lastTurn(root: string): TurnLine {
  const p = path.join(root, '.prdt', 'turns.jsonl')
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n')
  return JSON.parse(lines[lines.length - 1])
}

function runSubagentStop(opts: { cwd: string; agentId: string; transcriptPath: string; lastAssistantMessage?: string }): void {
  const ev: Record<string, unknown> = {
    hook_event_name: 'SubagentStop',
    agent_type: 'prdt-developer',
    agent_id: opts.agentId,
    cwd: opts.cwd,
    agent_transcript_path: opts.transcriptPath,
  }
  if (opts.lastAssistantMessage !== undefined) ev.last_assistant_message = opts.lastAssistantMessage
  const res = spawnSync('bash', [HOOK], { input: JSON.stringify(ev), encoding: 'utf8', timeout: 10000 })
  expect(res.status).toBe(0)
  expect(res.stdout).toBe('') // SubagentStop prints NOTHING (a printed context resumes the worker)
}

const ENVELOPE_TWO = JSON.stringify({
  persona: 'developer', task: 't', summary: 's', confidence: 0.9,
  playbooks_run: [{ name: 'implement', why: 'default' }, { name: 'code-review', why: 'risky' }],
})

describe('T-584 — reference set + playbooks_run are recorded per dispatch', () => {
  test('populated: Read/Grep paths, Bash reads, injected files, and counted unobservables', () => {
    const root = makeProject()
    const t = path.join(root, 'transcript.jsonl')
    fs.writeFileSync(t, [
      attachmentHookContext('[prdt discipline — part 1/5]\n----- BEGIN doctrine (/Users/u/.prdt/doctrine.md) -----\n…\n----- END doctrine -----\n----- BEGIN contracts (/Users/u/.prdt/discipline/contracts.md) · piece 1/4 -----'),
      attachmentInstructions(['/Users/u/.claude/CLAUDE.md']),
      assistantTools([
        { name: 'Read', input: { file_path: '/proj/docs/tickets/v1.9/T-584.md' } },
        { name: 'Grep', input: { pattern: 'turns.jsonl', path: '/proj/code/packages/core/src' } },
        { name: 'Bash', input: { command: 'cd /proj; cat docs/prd/PRD.md; echo "==="; sed -n 1,40p code/hook.sh | head -5; grep -rn "cost_basis" code/packages/core/scripts/prdt' } },
        { name: 'Bash', input: { command: "python3 - <<'EOF'\nimport json\nfor raw in open('/proj/.prdt/turns.jsonl'):\n    pass\nEOF\necho done" } },
        { name: 'Agent', input: { subagent_type: 'Explore', prompt: 'find x' } },
        { name: 'mcp__claude-in-chrome__navigate', input: { url: 'http://x' } },
        { name: 'Edit', input: { file_path: '/proj/code/hook.sh', old_string: 'a', new_string: 'b' } },
      ]),
      assistantText(ENVELOPE_TWO),
    ].join('\n') + '\n')
    runSubagentStop({ cwd: root, agentId: 'a-t584-populated', transcriptPath: t })
    const line = lastTurn(root)
    // The cost record itself is untouched by the new keys.
    expect(line.model).toBe('claude-opus-5')
    expect(line.usage).toEqual({ input: 2000, output: 1000, cache: 600 }) // 2 assistant lines × fixture usage — attachments carry none
    const refs = line.refs as Refs
    expect(refs.source).toBe('agent_transcript')
    expect(refs.observed).toEqual(['/proj/code/packages/core/src', '/proj/docs/tickets/v1.9/T-584.md'])
    // Heuristic Bash reads: cat/sed/head targets in; sed's script `1,40p` and grep's pattern out.
    expect(refs.bash_observed).toEqual(['code/hook.sh', 'code/packages/core/scripts/prdt', 'docs/prd/PRD.md'])
    expect(refs.injected).toEqual(['/Users/u/.claude/CLAUDE.md', '/Users/u/.prdt/discipline/contracts.md', '/Users/u/.prdt/doctrine.md'])
    // The python heredoc is ONE opaque consult (its body is folded, not split into lines);
    // `cd`/`echo` are neutral, not opaque. The sub-dispatch and the mcp call are counted, not dropped.
    expect(refs.unobservable).toEqual({ bash_opaque: 1, agent: 1, web: 0, mcp: 1, skill: 0 })
    expect(refs.truncated).toBeUndefined()
    // Playbooks: several stay several (grill-carries-smoke shape), names only — `why` never lands.
    expect(line.playbooks_run).toEqual(['implement', 'code-review'])
    expect(line.playbooks_source).toBe('transcript')
    expect(JSON.stringify(line)).not.toContain('"why"')
  })

  test("the event's last_assistant_message (the return itself) wins over the transcript's last text", () => {
    const root = makeProject()
    const t = path.join(root, 'transcript.jsonl')
    fs.writeFileSync(t, assistantText(ENVELOPE_TWO) + '\n')
    const ret = '```json\n' + JSON.stringify({ persona: 'developer', task: 't', summary: 's', confidence: 0.5, playbooks_run: [{ name: 'bugfix', why: 'repro' }] }) + '\n```'
    runSubagentStop({ cwd: root, agentId: 'a-t584-lam', transcriptPath: t, lastAssistantMessage: ret })
    const line = lastTurn(root)
    expect(line.playbooks_run).toEqual(['bugfix'])
    expect(line.playbooks_source).toBe('last_assistant_message')
  })

  test('unobservable: no transcript at the recording point → source null, playbooks not captured, record still written', () => {
    const root = makeProject()
    runSubagentStop({ cwd: root, agentId: 'a-t584-unobs', transcriptPath: path.join(root, 'does-not-exist.jsonl') })
    const line = lastTurn(root)
    expect(line.usage).toBeNull() // unchanged pre-T-584 behaviour for a missing transcript
    expect(line.refs).toEqual({ source: null })
    expect(line.playbooks_run).toBeNull()
    expect(line.playbooks_source).toBe('no_envelope')
  })

  test('"read nothing" is an empty set with a source — distinct from unobservable and from history', () => {
    const root = makeProject()
    // A record written BEFORE this change, in the exact key set the PO's 2026-09-04 sweep found.
    fs.writeFileSync(path.join(root, '.prdt', 'turns.jsonl'), JSON.stringify({
      ts: '2026-07-03T06:48:48Z', scope: 'subagent', persona: 'qa', session_id: 'a247377c8d4cfe765', model: null,
      cost_usd: null, cost_source: null, cost_basis: 'subagent_total', usage: { input: 2, output: 1151, cache: 42167 },
      version: 'v1.1', task_slug: 'gui-audit-reverify', ticket_id: 'T-283',
    }) + '\n')
    const t = path.join(root, 'transcript.jsonl')
    // A worker that made no tool call and returned a legitimately empty playbooks_run.
    fs.writeFileSync(t, assistantText(JSON.stringify({ persona: 'developer', task: 't', summary: 's', confidence: 1, playbooks_run: [] })) + '\n')
    runSubagentStop({ cwd: root, agentId: 'a-t584-empty', transcriptPath: t })
    const line = lastTurn(root)
    expect(line.refs).toEqual({
      source: 'agent_transcript', observed: [], bash_observed: [], injected: [],
      unobservable: { bash_opaque: 0, agent: 0, web: 0, mcp: 0, skill: 0 },
    })
    expect(line.playbooks_run).toEqual([])
    expect(line.playbooks_source).toBe('transcript')
    // The pre-change record is left as written — no key, not an empty set: history is not backfilled.
    const lines = fs.readFileSync(path.join(root, '.prdt', 'turns.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const legacy = JSON.parse(lines[0])
    expect('refs' in legacy).toBe(false)
    expect('playbooks_run' in legacy).toBe(false)
    expect('playbooks_source' in legacy).toBe(false)
  })

  test('sync (PostToolUse) recording path: refs unobservable, playbooks read from the response TEXT, not the response dict', () => {
    const root = makeProject()
    const ev = {
      hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'prdt-developer' },
      agent_id: 'a-t584-sync', cwd: root,
      // The sync Agent response: a content array of text blocks + usage (no model — the T-543 F3 shape).
      tool_response: { content: [{ type: 'text', text: 'prose before the return' }, { type: 'text', text: ENVELOPE_TWO }], usage: USAGE },
    }
    const res = spawnSync('bash', [HOOK], { input: JSON.stringify(ev), encoding: 'utf8', timeout: 10000 })
    expect(res.status).toBe(0)
    const line = lastTurn(root)
    expect(line.usage).toEqual({ input: 1000, output: 500, cache: 300 })
    expect(line.refs).toEqual({ source: null }) // no transcript at this point → we could not see, not "read nothing"
    expect(line.playbooks_run).toEqual(['implement', 'code-review'])
    expect(line.playbooks_source).toBe('tool_response')
  })

  test('a return that omitted playbooks_run is "envelope_without_key", not an empty list', () => {
    const root = makeProject()
    const t = path.join(root, 'transcript.jsonl')
    fs.writeFileSync(t, assistantText(JSON.stringify({ persona: 'developer', task: 't', summary: 's', confidence: 1 })) + '\n')
    runSubagentStop({ cwd: root, agentId: 'a-t584-nokey', transcriptPath: t })
    const line = lastTurn(root)
    expect(line.playbooks_run).toBeNull()
    expect(line.playbooks_source).toBe('envelope_without_key')
  })

  test('a session-limit placeholder as the last text is "no_envelope"', () => {
    const root = makeProject()
    const t = path.join(root, 'transcript.jsonl')
    fs.writeFileSync(t, assistantText("You've hit your session limit · resets 1pm (Asia/Seoul)") + '\n')
    runSubagentStop({ cwd: root, agentId: 'a-t584-limit', transcriptPath: t })
    const line = lastTurn(root)
    expect(line.playbooks_run).toBeNull()
    expect(line.playbooks_source).toBe('no_envelope')
  })

  test('one record is bounded: lists cap at 200 with the dropped count named', () => {
    const root = makeProject()
    const t = path.join(root, 'transcript.jsonl')
    const blocks = Array.from({ length: 250 }, (_, i) => ({ name: 'Read', input: { file_path: `/proj/f${String(i).padStart(3, '0')}.ts` } }))
    fs.writeFileSync(t, assistantTools(blocks) + '\n' + assistantText(ENVELOPE_TWO) + '\n')
    runSubagentStop({ cwd: root, agentId: 'a-t584-cap', transcriptPath: t })
    const refs = lastTurn(root).refs as Refs
    expect(refs.observed).toHaveLength(200)
    expect(refs.truncated).toBe(50)
  })
})
