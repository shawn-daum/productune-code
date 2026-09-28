/**
 * prdt-worktree-guard.sh — T-779.
 *
 * WHY: 2026-09-28 (T-601) a developer dispatched with `[ctx].worktree` =
 * tracks/T-601 edited the SHARED code checkout (code/…) while QA grilled it.
 * This hook denies a developer/qa worker whose own dispatch carried a
 * worktree any write under the shared checkout; its worktree, the scratchpad
 * and the meta tree stay writable, and a worker dispatched without a worktree
 * behaves as before.
 *
 * Every run uses a sandbox project + sandbox PRDT_HOME (never ~/.prdt).
 */

import { spawnSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, test } from 'vitest'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-worktree-guard.sh')
const PY = spawnSync('python3', ['--version']).status === 0

let sb: string, root: string, code: string, wt: string, prdtHome: string, scratch: string, parentTranscript: string
const SID = 'sess-1'

function mk(legacy = false): void {
  sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-guard-')))
  root = path.join(sb, 'proj')
  code = legacy ? root : path.join(root, 'code')
  wt = path.join(root, 'tracks', 'T-9')
  prdtHome = path.join(sb, 'prdt')
  scratch = path.join(sb, 'scratchpad')
  for (const d of [path.join(root, '.prdt'), code, path.join(code, 'src'), wt, prdtHome, scratch, path.join(root, 'docs', 'tickets')])
    fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), '{}')
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify(legacy ? { slug: 'p' } : { slug: 'p', code: { dir: 'code' } }))
  fs.mkdirSync(path.join(sb, 'projects'), { recursive: true })
  parentTranscript = path.join(sb, 'projects', `${SID}.jsonl`)
  fs.writeFileSync(parentTranscript, '')
}

function ctxPrompt(ctx: Record<string, unknown>): string {
  return `[ctx] ${JSON.stringify(ctx)}\n\nWHAT: do the thing.`
}

/** The worker transcript the harness writes: first record = the worker's own prompt. */
function workerTranscript(aid: string, ctx: Record<string, unknown> | null): void {
  const dir = path.join(sb, 'projects', SID, 'subagents')
  fs.mkdirSync(dir, { recursive: true })
  const content = ctx ? ctxPrompt(ctx) : 'no ctx here'
  fs.writeFileSync(path.join(dir, `agent-${aid}.jsonl`),
    JSON.stringify({ type: 'user', agentId: aid, message: { role: 'user', content } }) + '\n')
}

function marker(aid: string, checkout: string | null, pairing: 'confirmed' | 'unconfirmed'): void {
  const dir = path.join(prdtHome, 'run', 'dispatches')
  fs.mkdirSync(dir, { recursive: true })
  const h = crypto.createHash('sha256').update(aid).digest('hex')
  fs.writeFileSync(path.join(dir, `${h}.json`), JSON.stringify({
    agent_id: aid, persona: 'developer', checkout, pairing, project_root: root,
    transcript: path.join(sb, 'projects', SID, 'subagents', `agent-${aid}.jsonl`),
  }))
}

interface Ev { aid?: string | null; atype?: string | null; tool: string; input: Record<string, unknown>; cwd?: string }
function run(e: Ev): string {
  const ev: Record<string, unknown> = { session_id: SID, transcript_path: parentTranscript, cwd: e.cwd ?? root }
  if (e.aid !== null) ev.agent_id = e.aid ?? 'agent-w'
  if (e.atype !== null) ev.agent_type = e.atype ?? 'prdt-developer'
  Object.assign(ev, { hook_event_name: 'PreToolUse', tool_name: e.tool, tool_input: e.input, tool_use_id: 'toolu_1' })
  const r = spawnSync('bash', [HOOK], { input: JSON.stringify(ev), encoding: 'utf8', env: { ...process.env, PRDT_HOME: prdtHome } })
  expect(r.status).toBe(0)
  return r.stdout
}
function denied(out: string): string {
  const j = JSON.parse(out)
  expect(j.hookSpecificOutput.permissionDecision).toBe('deny')
  return j.hookSpecificOutput.permissionDecisionReason as string
}
const bash = (command: string, cwd?: string) => run({ tool: 'Bash', input: { command }, cwd })

describe.skipIf(!PY)('T-779 — a worktree-dispatched worker cannot write the shared checkout', () => {
  beforeEach(() => {
    mk()
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: wt })
  })

  test('Edit/Write/MultiEdit/NotebookEdit under code/ are denied, naming the worktree and the same file inside it', () => {
    const why = denied(run({ tool: 'Edit', input: { file_path: path.join(code, 'src', 'a.ts'), old_string: 'a', new_string: 'b' } }))
    expect(why).toContain(wt)
    expect(why).toContain(path.join(wt, 'src', 'a.ts'))
    denied(run({ tool: 'Write', input: { file_path: path.join(code, 'new.ts'), content: 'x' } }))
    denied(run({ tool: 'MultiEdit', input: { file_path: path.join(code, 'src', 'a.ts'), edits: [] } }))
    denied(run({ tool: 'NotebookEdit', input: { notebook_path: path.join(code, 'n.ipynb'), new_source: '' } }))
  })

  test('the incident shape: a relative `code/…` path from the session-root cwd is denied', () => {
    denied(run({ tool: 'Write', input: { file_path: 'code/packages/core/scripts/prdt', content: 'x' }, cwd: root }))
  })

  test('its worktree, the scratchpad and the meta tree are unaffected', () => {
    expect(run({ tool: 'Write', input: { file_path: path.join(wt, 'src', 'a.ts'), content: 'x' } })).toBe('')
    expect(run({ tool: 'Edit', input: { file_path: 'tracks/T-9/src/a.ts' }, cwd: root })).toBe('')
    expect(run({ tool: 'Write', input: { file_path: path.join(scratch, 'probe.json'), content: 'x' } })).toBe('')
    expect(run({ tool: 'Edit', input: { file_path: path.join(root, 'docs', 'tickets', 'T-9.md') } })).toBe('')
  })

  test('Bash writes it recognises under code/ are denied', () => {
    for (const c of [
      'echo hi > code/src/a.ts',
      'printf x >> code/src/a.ts',
      'cd code && sed -i "" s/a/b/ src/a.ts',
      `sed -i.bak -e s/a/b/ ${code}/src/a.ts`,
      "perl -pi -e 's/a/b/' code/src/a.ts",
      'cat x | tee -a code/log.txt',
      'cp /tmp/x code/src/a.ts',
      `mv ${wt}/a.ts ${code}/src/`,
      'rm -rf code/src',
      'mkdir -p code/newdir',
      'touch code/src/b.ts',
      'git -C code commit -m wip',
      'cd code; git add packages/core/scripts/prdt',
      'cat <<EOF > code/src/gen.ts\nexport {}\nEOF',
    ]) {
      expect(denied(bash(c)), c).toContain(wt)
    }
  })

  test('Bash reads, fd redirects and writes outside code/ stay silent', () => {
    for (const c of [
      'cat code/src/a.ts',
      'grep -rn foo code/packages',
      'git -C code log --oneline -5',
      'git -C code status',
      'git -C code stash list',
      'echo oops >&2',
      'ls code 2>&1',
      'cp code/src/a.ts tracks/T-9/src/a.ts',
      `cd ${wt} && git add -p && git commit -m x`,
      `echo x > ${scratch}/out.txt`,
      'cat <<EOF > tracks/T-9/gen.ts\nsee code/src/a.ts > here\nEOF',
      'pnpm vitest run 2>/dev/null',
    ]) {
      expect(bash(c), c).toBe('')
    }
  })

  test('T-783 — QA grill: shapes previously missed are now denied', () => {
    for (const c of [
      `mv code/src/a.ts ${wt}/a.ts`,
      'if [ -f code/src/a.ts ]; then rm code/src/a.ts; fi',
      'for f in a b; do rm code/src/$f; done',
      'while read -r x; do touch code/src/$x; done < list.txt',
      'bash -c "rm -rf code/src"',
      "sh -c 'touch code/newdir/x'",
      'xargs -I{} rm code/src/{} < /dev/null',
      "find code/src -name '*.bak' -delete",
      'pushd code && touch x.ts && popd',
      'dd if=/dev/zero of=code/src/a.ts bs=1 count=1',
      'curl -o code/src/a.ts https://example.test/f',
      'curl --output=code/src/a.ts https://example.test/f',
      'git --work-tree=code commit -m wip',
      '$PWD/prdt-nonexistent-marker ; touch $PWD/code/src/a.ts',
      'touch code/a#weird.ts',
      "echo 'not-a-heredoc a<<b' ; rm -rf code/src",
    ]) {
      expect(denied(bash(c, root)), c).toContain(wt)
    }
  })

  test('T-783 — a case-variant path of the shared checkout is denied on this (case-insensitive) filesystem', () => {
    if (process.platform !== 'darwin') return
    const variant = path.join(path.dirname(code), path.basename(code).toUpperCase(), 'src', 'a.ts')
    expect(denied(run({ tool: 'Write', input: { file_path: variant, content: 'x' } })), variant).toContain(wt)
  })

  test('T-783 — the false denies QA found stay silent', () => {
    for (const c of [
      '(cd code) ; touch rel.txt',
      '[[ "a" > "b" ]]',
      'perl -mdiagnostics -e "print 1"',
    ]) {
      expect(bash(c, root), c).toBe('')
    }
  })
})

describe.skipIf(!PY)('T-779 — who the guard applies to', () => {
  beforeEach(() => mk())
  const codeWrite = () => ({ tool: 'Write', input: { file_path: path.join(code, 'x.ts'), content: 'x' } })

  test('a worker dispatched without [ctx].worktree behaves as today (silent)', () => {
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1' })
    expect(run(codeWrite())).toBe('')
    expect(bash('echo x > code/x.ts')).toBe('')
  })

  test('a worker whose worktree is spelled "code" (the shared checkout) is silent', () => {
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: 'code' })
    expect(run(codeWrite())).toBe('')
  })

  test('a relative worktree is taken from the project root', () => {
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: 'tracks/T-9' })
    expect(denied(run(codeWrite()))).toContain(wt)
  })

  test('qa is guarded too; the main session, a designer, a forged nested agent_type are not', () => {
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: wt })
    denied(run({ ...codeWrite(), atype: 'prdt-qa' }))
    expect(run({ ...codeWrite(), atype: 'prdt-designer' })).toBe('')
    expect(run({ ...codeWrite(), aid: null, atype: null })).toBe('')
    expect(run({ tool: 'Write', aid: null, atype: null,
      input: { file_path: path.join(code, 'x.ts'), content: '"agent_type":"prdt-developer"', agent_type: 'prdt-developer' } })).toBe('')
  })

  test('T-780 window — no worker transcript yet: a CONFIRMED marker decides, an UNCONFIRMED one never denies', () => {
    marker('agent-w', wt, 'unconfirmed')
    expect(run(codeWrite())).toBe('')
    marker('agent-w', wt, 'confirmed')
    expect(denied(run(codeWrite()))).toContain(wt)
    marker('agent-w', 'code', 'confirmed')
    expect(run(codeWrite())).toBe('')
  })

  test('T-780 swap — the worker\'s own prompt outranks a marker holding a sibling\'s [ctx]', () => {
    marker('agent-w', wt, 'unconfirmed')        // sibling's worktree, FIFO-swapped
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-2' })  // this worker has none
    expect(run(codeWrite())).toBe('')
    marker('agent-v', 'code', 'unconfirmed')
    workerTranscript('agent-v', { slug: 's', dispatch_id: 'd-3', worktree: wt })
    denied(run({ ...codeWrite(), aid: 'agent-v' }))
  })

  test('fails open on garbage input and outside a prdt project', () => {
    expect(spawnSync('bash', [HOOK], { input: 'not json "agent_type":"prdt-qa"', encoding: 'utf8' }).stdout).toBe('')
    expect(spawnSync('bash', [HOOK], { input: '', encoding: 'utf8' }).stdout).toBe('')
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: '/nowhere/tracks/T-9' })
    fs.rmSync(path.join(root, '.prdt', 'po-state.json'))
    expect(run(codeWrite())).toBe('')
  })
})

describe.skipIf(!PY)('T-779 — legacy layout (code root == meta root)', () => {
  beforeEach(() => {
    mk(true)
    workerTranscript('agent-w', { slug: 's', dispatch_id: 'd-1', worktree: wt })
  })

  test('code files at the root are denied; docs/, .prdt/, tracks/ and the worktree are not', () => {
    denied(run({ tool: 'Write', input: { file_path: path.join(root, 'src', 'a.ts'), content: 'x' } }))
    expect(run({ tool: 'Edit', input: { file_path: path.join(root, 'docs', 'tickets', 'T-9.md') } })).toBe('')
    expect(run({ tool: 'Write', input: { file_path: path.join(wt, 'src', 'a.ts'), content: 'x' } })).toBe('')
  })
})
