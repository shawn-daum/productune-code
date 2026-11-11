/**
 * effect-check.test.ts — T-1440: a ticket whose own commits changed discipline, an agent stub, a hook
 * script, a CLI `[prdt …]` line or a project override closes only with a ticket `evidence` line
 * `- replay: <case> · before k/n · after k/n` (n ≥ 3) or `- effect not shown: <reason> · user 「…」`.
 *
 * One reader (`effect_check_problems` in prdt_cli.py), every output:
 *   - the close refusal: prdt-worktree-guard.sh (PreToolUse) → `prdt tickets effect-check --gate`
 *     (E2 · E4 · E5 · E6 deny; a failure to read git / the ticket / the CLI never denies, it says so);
 *   - `prdt tickets fmt <id> --check` and `prdt doctor` (same finding lines);
 *   - the PostToolUse notices E3 · E1 (prdt-prior-tickets.sh → `tickets prior --hook`), once per session.
 *
 * Spec: docs/productune/artifacts/v1.16.4/effect-check-duty-draft.md §2 group 5 · §3 (deny wording verbatim).
 * One sandbox project (code repo + meta repo) built once for the file; every subprocess gets a sandbox
 * HOME and an explicit cwd.
 */

import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { copyPrdtCli } from '../helpers/copy-prdt'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE = path.resolve(__dirname, '..', '..')
const CLI = path.join(CORE, 'scripts', 'prdt')
const GUARD = path.join(CORE, 'scripts', 'hooks', 'prdt-worktree-guard.sh')
const PRIOR_SRC = path.join(CORE, 'scripts', 'hooks', 'prdt-prior-tickets.sh')
const PY = spawnSync('python3', ['--version']).status === 0
const T = 60_000

let sb: string, root: string, code: string, home: string, prdtHome: string, priorHook: string, fakeBin: string
const hash: Record<string, string> = {}

const GIT_ENV = () => ({ ...process.env, HOME: home, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_CONFIG_NOSYSTEM: '1' })
function git(args: string[], cwd = code): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', env: GIT_ENV(), timeout: subprocessTimeout('quick') }).trim()
}
const metaGit = (args: string[]) => git(['--git-dir', path.join(root, '.prdt', 'meta.git'), '--work-tree', root, ...args], root)

function put(rel: string, body: string, base = code): void {
  const p = path.join(base, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}
/** One commit in the code repo; its short hash is kept under `key`. */
function commit(key: string, subject: string, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) put(rel, body)
  git(['add', '-A'])
  git(['commit', '-q', '-m', subject])
  hash[key] = git(['log', '-1', '--format=%h'])
}

const PROBLEM = '첫 응답이 질문을 다시 묻는다 (r3 사례)'
interface Tk { status?: string; created?: string; closed?: string | null; type?: string; evidence?: string; problem?: string; extra?: string }
function text(id: string, o: Tk = {}): string {
  const fm = [`id: ${id}`, 'slug: s', `type: ${o.type ?? 'design'}`, `status: ${o.status ?? 'open'}`, 'assignee: po',
    `created: ${o.created ?? '2026-11-06'}`]
  if (o.closed) fm.push(`closed: ${o.closed}`)
  return ['---', ...fm, '---', '', '## problem', '', o.problem ?? PROBLEM, '', '## acceptance', '', '- a', '',
    '## evidence', '', o.evidence ?? '', '', '## outcome', '', o.extra ?? '끝', '', '## log', '', '- x', ''].join('\n')
}
const tpath = (id: string) => path.join(root, 'docs', 'tickets', 'v1.0', `${id}.md`)
function ticket(id: string, o: Tk = {}): string {
  fs.writeFileSync(tpath(id), text(id, o))
  return tpath(id)
}

beforeAll(() => {
  sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'effect-1440-')))
  root = path.join(sb, 'proj'); code = path.join(root, 'code'); home = path.join(sb, 'home'); prdtHome = path.join(home, '.prdt')
  for (const d of [code, path.join(root, 'docs', 'tickets', 'v1.0'), path.join(prdtHome, 'bin'), path.join(prdtHome, 'hooks')])
    fs.mkdirSync(d, { recursive: true })
  put('.prdt/po-state.json', '{}\n', root)
  put('.prdt/config.json', '{"slug":"p","code":{"dir":"code"}}\n', root)
  put('.prdt/overrides/po.md', '# PO overrides\n', root)
  // the hook copy the PostToolUse notices run through (the installed layout: hooks/ beside bin/prdt)
  copyPrdtCli(CLI, path.join(prdtHome, 'bin', 'prdt'))
  fs.copyFileSync(path.join(CORE, 'scripts', 'prdt-messages.json'), path.join(prdtHome, 'bin', 'prdt-messages.json'))
  priorHook = path.join(prdtHome, 'hooks', 'prdt-prior-tickets.sh')
  fs.copyFileSync(PRIOR_SRC, priorHook)
  fs.chmodSync(priorHook, 0o755)

  git(['init', '-q', '-b', 'dev'])
  commit('base', 'chore: base', { 'src/app.ts': 'export {}\n', 'packages/core/scripts/prdt_cli.py': 'X = "[prdt old tag] a"\n' })
  commit('T-20', 'feat: discipline line (T-20)', { 'packages/core/discipline/contracts.md': '# c\n- rule\n' })
  commit('T-21', 'fix: hook wording (T-21, T-22 follow-up)', { 'packages/core/scripts/hooks/prdt-x.sh': 'echo "[prdt x] y"\n' })
  commit('T-23', 'refactor: hook rename (T-23)', { 'packages/core/scripts/hooks/prdt-x.sh': 'echo "[prdt x] y" # r\n' })
  commit('T-25', 'docs: align T-24 wording with the annex (T-25)', { 'packages/core/discipline/contracts/a.md': '# a\n' })
  // a file move: the same `[prdt …]` line removed and added → no new hook text
  commit('T-26', 'chore: move tag (T-26)', { 'packages/core/scripts/prdt_cli.py': '# moved\nX = "[prdt old tag] a"\n' })
  commit('T-27', 'feat: new tag (T-27)', { 'packages/core/scripts/prdt_cli.py': '# moved\nX = "[prdt old tag] a"\nY = "[prdt new tag] b"\n' })
  commit('T-28', 'feat: app (T-28)', { 'src/app.ts': 'export const a = 1\n' })
  commit('T-29', 'feat: agent stub (T-29)', { 'packages/core/agents/prdt-po.md': '# po\n' })

  // the meta repo: an override committed under T-30's close autosave
  git(['init', '-q', '--bare', path.join(root, '.prdt', 'meta.git')], root)
  metaGit(['add', '.prdt/overrides/po.md', '.prdt/config.json'])
  metaGit(['commit', '-q', '-m', 'meta: base'])
  put('.prdt/overrides/po.md', '# PO overrides\n- a line\n', root)
  metaGit(['add', '.prdt/overrides/po.md'])
  metaGit(['commit', '-q', '-m', 'T-30 [status-change: open→done]'])
  hash['T-30'] = metaGit(['log', '-1', '--format=%h'])

  fakeBin = path.join(sb, 'fakebin')
  fs.mkdirSync(fakeBin)
}, T)

afterAll(() => {
  try { fs.chmodSync(tpath('T-60'), 0o644) } catch { /* not made */ }
  fs.rmSync(sb, { recursive: true, force: true })
})

// ── runners ──────────────────────────────────────────────────────────────────

type Who = 'main' | 'prdt-developer'
function guard(tool: string, input: Record<string, unknown>, who: Who = 'main', env: Record<string, string> = {}): string {
  const ev: Record<string, unknown> = { session_id: 's', transcript_path: path.join(sb, 's.jsonl'), cwd: root,
    hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 't' }
  if (who === 'main') ev.agent_type = 'prdt-po'
  else { ev.agent_type = who; ev.agent_id = 'agent-x' }
  // the gate's "today" is injected, never the wall clock (default: the day before the landing date)
  const e: NodeJS.ProcessEnv = { ...process.env, HOME: home, PRDT_BIN: CLI, PRDT_EFFECT_TODAY: '2026-11-10', ...env }
  delete e.PRDT_HOME
  const r = spawnSync('bash', [GUARD], { cwd: root, input: JSON.stringify(ev), encoding: 'utf8', env: e, timeout: subprocessTimeout('cli') * 2 })
  expect(r.status).toBe(0)
  return r.stdout
}
function denyOf(out: string): string {
  expect(out, 'expected a deny').not.toBe('')
  const j = JSON.parse(out)
  expect(j.hookSpecificOutput.permissionDecision).toBe('deny')
  return j.hookSpecificOutput.permissionDecisionReason as string
}
function contextOf(out: string): string {
  expect(out, 'expected additionalContext').not.toBe('')
  const j = JSON.parse(out)
  expect(j.hookSpecificOutput.permissionDecision).toBeUndefined()
  return j.hookSpecificOutput.additionalContext as string
}
/** The close as the PO writes it: the whole file with `status: done`. */
const close = (id: string, o: Tk = {}, who: Who = 'main', env: Record<string, string> = {}) => {
  if (!fs.existsSync(tpath(id))) ticket(id, { ...o, status: 'open' })
  return guard('Write', { file_path: tpath(id), content: text(id, { ...o, status: 'done', closed: '2026-11-12' }) }, who, env)
}
const E2_TAIL = 'and `evidence` has no `- replay: <case from problem> · before k/n · after k/n` (n≥3, live, no stub) or ' +
  '`- effect not shown: <reason> · user 「<reply>」` line. Next: copy the worker\'s replay line into `evidence`, else dispatch ' +
  'the replay, else put the result to the user and write the not-shown line with their reply; then close again.'

function cli(args: string[], env: Record<string, string> = {}): { out: string; code: number } {
  const r = spawnSync('python3', [CLI, ...args], { cwd: root, encoding: 'utf-8',
    env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, PRDT_META_BACKUP: '0', ...env },
    timeout: subprocessTimeout(args[0] === 'doctor' ? 'doctor' : 'cli') })
  return { out: (r.stdout ?? '') + (r.stderr ?? ''), code: r.status ?? -1 }
}
function prior(file: string, input: Record<string, unknown>, session = 'sess-1'): string {
  const r = spawnSync('bash', [priorHook], { cwd: root, encoding: 'utf-8',
    input: JSON.stringify({ hook_event_name: 'PostToolUse', session_id: session, cwd: root, agent_type: 'prdt-po',
      tool_name: 'Edit', tool_input: { file_path: file, ...input }, tool_response: {} }),
    env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, CI: '1' }, timeout: subprocessTimeout('hook') * 2 })
  expect(r.status).toBe(0)
  return r.stdout ?? ''
}
const closeEdit = { old_string: 'status: open', new_string: 'status: done' }
function fake(name: string, script: string): Record<string, string> {
  const d = path.join(fakeBin, name)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, 'git'), `#!/bin/sh\n${script}\n`)
  fs.chmodSync(path.join(d, 'git'), 0o755)
  return { PATH: `${d}:${process.env.PATH}` }
}

// ── the close refusal ────────────────────────────────────────────────────────

describe.skipIf(!PY)('T-1440 close refusal — prdt-worktree-guard.sh', () => {
  test('E2: an in-scope close with no line is denied with the draft wording, naming class and commit', () => {
    expect(denyOf(close('T-20'))).toBe(`[prdt effect check] close of T-20 refused: it edits discipline (${hash['T-20']}) ${E2_TAIL}`)
    expect(denyOf(close('T-29'))).toContain(`it edits agent stub (${hash['T-29']})`)
    expect(denyOf(close('T-27'))).toContain(`it edits hook text (${hash['T-27']})`)
    // both ids in the trailing `(…)` group are each its own work
    expect(denyOf(close('T-21'))).toContain(`it edits hook (${hash['T-21']})`)
    expect(denyOf(close('T-22'))).toContain(`it edits hook (${hash['T-21']})`)
  }, T)

  test('E4 · E5 · E6 are denied with their draft text and next act', () => {
    expect(denyOf(close('T-20', { evidence: `- replay: ${PROBLEM} · before 2/2 · after 0/2` })))
      .toBe(`[prdt effect check] close of T-20 refused: replay \`${PROBLEM}\` has n < 3 per arm. Next: re-run to n ≥ 3, or write the not-shown line with the user's reply; then close again.`)
    expect(denyOf(close('T-20', { evidence: `- replay: ${PROBLEM} · before 3/3 · after 3/3` })))
      .toBe(`[prdt effect check] close of T-20 refused: replay \`${PROBLEM}\` shows no effect (before 3, after 3) and has no \`· user 「<reply>」\`. Next: put the result to the user and append their reply; then close again.`)
    expect(denyOf(close('T-20', { evidence: `- replay: ${PROBLEM} · before 0/3 · after 0/3` }))).toContain('shows no effect (before 0, after 0)')
    expect(denyOf(close('T-20', { evidence: '- effect not shown: no replay harness for this hook' })))
      .toBe('[prdt effect check] close of T-20 refused: `effect not shown` has no `· user 「<reply>」`. Next: ask the user and append their reply; then close again.')
  }, T)

  test('a valid line closes: replay with an effect · no effect with the user reply · not shown with the user reply', () => {
    expect(close('T-20', { evidence: `- replay: ${PROBLEM} · before 3/3 · after 0/3` })).toBe('')
    expect(close('T-20', { evidence: `- replay: ${PROBLEM} · before 3/3 · after 3/3 · user 「그래도 넣자」` })).toBe('')
    expect(close('T-20', { evidence: '- effect not shown: no harness · user *"ok, adopt"*' })).toBe('')
    expect(close('T-20', { evidence: '- effect not shown: no harness · user “ok”' })).toBe('')
    // `근거` is the evidence alias
    const t = text('T-20', { status: 'done', evidence: `- replay: ${PROBLEM} · before 4/4 · after 0/4` }).replace('## evidence', '## 근거')
    expect(guard('Write', { file_path: tpath('T-20'), content: t })).toBe('')
  }, T)

  test('E3 alone (case not copied from problem) never refuses', () => {
    expect(close('T-20', { evidence: '- replay: 다른 사례 · before 3/3 · after 0/3' })).toBe('')
  }, T)

  test('Edit and MultiEdit are judged on the file AFTER the write: line + done in one Edit closes', () => {
    ticket('T-20', { status: 'open', created: '2026-11-12' })   // a status-only Edit writes no `closed:` → judged by `created`
    expect(denyOf(guard('Edit', { file_path: tpath('T-20'), ...closeEdit }))).toContain('close of T-20 refused: it edits discipline')
    const both = { file_path: tpath('T-20'), old_string: 'status: open\n', new_string: 'status: done\n' }
    const withLine = { old_string: '## evidence\n', new_string: `## evidence\n\n- replay: ${PROBLEM} · before 3/3 · after 0/3\n` }
    expect(guard('MultiEdit', { file_path: tpath('T-20'), edits: [both, withLine] })).toBe('')
    expect(denyOf(guard('MultiEdit', { file_path: tpath('T-20'), edits: [both] }))).toContain('close of T-20 refused')
    // one Edit whose replacement spans the status line and the evidence line
    fs.writeFileSync(tpath('T-20'), text('T-20', { created: '2026-11-12' }))
    const body = fs.readFileSync(tpath('T-20'), 'utf8')
    const from = body.slice(body.indexOf('status: open'), body.indexOf('## evidence') + '## evidence\n'.length)
    const to = from.replace('status: open', 'status: done').replace('## evidence\n', `## evidence\n\n- replay: ${PROBLEM} · before 3/3 · after 1/3\n`)
    expect(guard('Edit', { file_path: tpath('T-20'), old_string: from, new_string: to })).toBe('')
  }, T)

  test('not a close → not judged: already done, still open, an edit that cannot apply', () => {
    ticket('T-20', { status: 'done', closed: '2026-11-12' })
    expect(guard('Edit', { file_path: tpath('T-20'), old_string: '끝', new_string: '끝. status: done 그대로' })).toBe('')
    ticket('T-20', { status: 'open' })
    expect(guard('Edit', { file_path: tpath('T-20'), old_string: '- a', new_string: '- a (status: done 은 나중에)' })).toBe('')
    expect(guard('Edit', { file_path: tpath('T-20'), old_string: 'no such text', new_string: 'status: done' })).toBe('')
  }, T)

  test('out of scope is never touched: src only · refactor only · id mid-subject · moved tag · no commit', () => {
    for (const id of ['T-28', 'T-23', 'T-24', 'T-26', 'T-99']) expect(close(id), id).toBe('')
    // T-25 is the trailing-group id of the commit that mentions T-24 mid-subject
    expect(denyOf(close('T-25'))).toContain(`it edits discipline (${hash['T-25']})`)
  }, T)

  test('a ticket created before the frame landing date (2026-09-24) is skipped', () => {
    fs.rmSync(tpath('T-21'), { force: true })
    expect(close('T-21', { created: '2026-09-23' })).toBe('')
    expect(denyOf(close('T-21', { created: '2026-09-24' }))).toContain('close of T-21 refused')
  }, T)

  test('a worker gets the blocked tail instead of the PO act', () => {
    expect(denyOf(close('T-20', {}, 'prdt-developer')))
      .toBe(`[prdt effect check] close of T-20 refused: it edits discipline (${hash['T-20']}) and \`evidence\` has no \`- replay: <case from problem> · before k/n · after k/n\` (n≥3, live, no stub) or \`- effect not shown: <reason> · user 「<reply>」\` line. Next: return \`blocked\` naming this close.`)
  }, T)

  test('overrides: a meta COMMIT naming the ticket refuses; an uncommitted override change never does', () => {
    expect(denyOf(close('T-30'))).toContain(`it edits override (${hash['T-30']})`)
    put('.prdt/overrides/po.md', '# PO overrides\n- a line\n- uncommitted\n', root)
    try {
      // another ticket's uncommitted override edit, this ticket merely mentions overrides → closes
      expect(close('T-31', { problem: 'PO 오버라이드 한 줄이 안 먹힌다', evidence: 'override 문구 확인' })).toBe('')
      expect(close('T-32', { problem: '관계없는 티켓' })).toBe('')
      // committed in-scope work still refuses while the uncommitted change is there
      expect(denyOf(close('T-30'))).toContain('it edits override')
    } finally {
      put('.prdt/overrides/po.md', '# PO overrides\n- a line\n', root)
    }
  }, T)

  test('row 2 → E1: the uncommitted override change is a notice at the close, whoever made it', () => {
    const f = ticket('T-33', { status: 'done', closed: '2026-11-12', problem: '오버라이드를 다룬다' })
    put('.prdt/overrides/po.md', '# PO overrides\n- a line\n- uncommitted\n', root)
    try {
      expect(JSON.parse(prior(f, closeEdit, 'sess-ov')).hookSpecificOutput.additionalContext).toBe(
        '[prdt effect check] T-33 closed while the meta repo has uncommitted override changes and no commit names T-33: ' +
        'if they are its work, reopen, commit with (T-33), close again.')
    } finally {
      put('.prdt/overrides/po.md', '# PO overrides\n- a line\n', root)
    }
  }, T)

  test('fail direction: git error · git timeout · unreadable ticket · broken CLI → no refusal, a not-checked line', () => {
    const err = contextOf(close('T-20', {}, 'main', fake('err', 'exit 1')))
    expect(err).toMatch(/^\[prdt effect check\] close of T-20 not checked \(code repo: git exit 1; meta repo: [^)]+\); it goes through\./)
    const slow = contextOf(close('T-20', {}, 'main', fake('slow', 'exec sleep 30')))
    expect(slow).toContain('close of T-20 not checked (code repo: git timed out after 5 s')
    fs.writeFileSync(path.join(fakeBin, 'nojson'), '#!/bin/sh\necho oops\n'); fs.chmodSync(path.join(fakeBin, 'nojson'), 0o755)
    expect(contextOf(close('T-20', {}, 'main', { PRDT_BIN: path.join(fakeBin, 'nojson') })))
      .toBe('[prdt effect check] close of T-20 not checked (the check did not run); it goes through. Check it after: `prdt tickets fmt T-20 --check`.')
    // no CLI at all → silent (like the T-1497 gates)
    expect(close('T-20', {}, 'main', { PRDT_BIN: path.join(fakeBin, 'absent') })).toBe('')
    if (process.getuid && process.getuid() !== 0) {
      ticket('T-60', { status: 'open' })
      fs.chmodSync(tpath('T-60'), 0o000)
      try {
        expect(contextOf(guard('Write', { file_path: tpath('T-60'), content: text('T-60', { status: 'done' }) })))
          .toContain('close of T-60 not checked (the ticket file is unreadable)')
      } finally { fs.chmodSync(tpath('T-60'), 0o644) }
    }
  }, T)

  test('the gate runs in the non-Bash branch: its helpers are defined above `if tool != "Bash":`', () => {
    // A helper defined below that line is never reached — the branch exits first and the NameError fails open
    // silently; the deny tests above would then see ''. Pin the placement too.
    const src = fs.readFileSync(GUARD, 'utf8')
    const branch = src.indexOf('\nif tool != "Bash":')
    for (const def of ['def effect_close_gate(', 'def _fm_status(', 'def effect_not_checked(', 'def prdt_cli_bin(', 'def _apply_edits('])
      expect(src.indexOf(def), def).toBeGreaterThan(0), expect(src.indexOf(def), def).toBeLessThan(branch)
    expect(src.slice(branch)).toMatch(/if tool in \("Write", "Edit", "MultiEdit"\):\n\s+build_entry_gate\(target\)[^\n]*\n\s+effect_close_gate\(target\)/)
    expect(denyOf(guard('Write', { file_path: tpath('T-20'), content: text('T-20', { status: 'done', closed: '2026-11-12' }) }))).toContain('[prdt effect check] close of T-20 refused:')
  }, T)

  test('fork-0 pre-filter: a main-session write reaches python when its TARGET is a ticket file, whatever the text', () => {
    const marker = path.join(sb, 'py-ran')
    const d = path.join(fakeBin, 'py')
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'python3'), `#!/bin/sh\ntouch '${marker}'\nexit 0\n`)
    fs.chmodSync(path.join(d, 'python3'), 0o755)
    const env = { PATH: `${d}:${process.env.PATH}` }
    const ran = (tool: string, input: Record<string, unknown>) => {
      fs.rmSync(marker, { force: true })
      guard(tool, input, 'main', env)
      return fs.existsSync(marker)
    }
    // not a ticket file → no python, even with `status: done` and `/tickets/` in the text
    expect(ran('Write', { file_path: path.join(root, 'docs', 'note.md'), content: 'status: done' })).toBe(false)
    expect(ran('Write', { file_path: path.join(root, 'docs', 'note.md'), content: 'docs/tickets/v1.0/T-20.md status: done' })).toBe(false)
    expect(ran('Write', { file_path: path.join(root, 'src', 'a.ts'), content: 'x' })).toBe(false)
    // a ticket file → python, spelled however
    expect(ran('Write', { file_path: tpath('T-20'), content: text('T-20', { status: 'open' }) })).toBe(true)
    expect(ran('Write', { file_path: tpath('T-20'), content: text('T-20', { status: 'done' }) })).toBe(true)
    expect(ran('Edit', { file_path: tpath('T-20'), old_string: 'open\nassignee', new_string: 'done\nassignee' })).toBe(true)
  }, T)

  test('row 1: a close is judged however `status: done` is spelled', () => {
    const spell = (v: string) => text('T-20', { status: 'done', closed: '2026-11-12' }).replace('status: done', v)
    for (const v of ['status: "done"', "status: 'done'", 'status:done', 'status:  done', 'status:\tdone'])
      expect(denyOf(guard('Write', { file_path: tpath('T-20'), content: spell(v) })), v).toContain('close of T-20 refused')
    // the word change alone, no `status:` key in the payload
    ticket('T-20', { status: 'open', created: '2026-11-12' })
    expect(denyOf(guard('Edit', { file_path: tpath('T-20'), old_string: 'open\nassignee', new_string: 'done\nassignee' })))
      .toContain('close of T-20 refused')
    expect(denyOf(guard('MultiEdit', { file_path: tpath('T-20'), edits: [{ old_string: 'open\nassignee', new_string: '"done"\nassignee' }] })))
      .toContain('close of T-20 refused')
    // the same spellings with a valid line close; an already-`done` quoted ticket is not a close
    const line = `- replay: ${PROBLEM} · before 3/3 · after 0/3`
    expect(guard('Write', { file_path: tpath('T-20'), content: text('T-20', { status: 'done', closed: '2026-11-12', evidence: line }).replace('status: done', 'status: "done"') })).toBe('')
    fs.writeFileSync(tpath('T-20'), spell('status: "done"'))
    expect(guard('Edit', { file_path: tpath('T-20'), old_string: '끝', new_string: '끝.' })).toBe('')
    // not a close: `open` spelled oddly, `done` only in the body
    ticket('T-20', { status: 'open' })
    expect(guard('Write', { file_path: tpath('T-20'), content: text('T-20', { status: 'open' }).replace('status: open', 'status:"open"') })).toBe('')
  }, T)

  test('the gate sees the moment: a close written on/after the landing date is judged whatever `closed:` says or lacks', () => {
    const TODAY = { PRDT_EFFECT_TODAY: '2026-11-12' }
    const statusOnly = { file_path: tpath('T-20'), ...closeEdit }
    ticket('T-20', { status: 'open', created: '2026-11-06' })   // no `closed:` key, created before the landing date
    expect(denyOf(guard('Edit', statusOnly, 'main', TODAY))).toContain('close of T-20 refused: it edits discipline')
    // the injected clock decides: the day before the landing date the stored-date rule applies (skipped)
    expect(guard('Edit', statusOnly, 'main', { PRDT_EFFECT_TODAY: '2026-11-10' })).toBe('')
    // a valid line closes
    const withLine = { old_string: '## evidence\n', new_string: `## evidence\n\n- replay: ${PROBLEM} · before 3/3 · after 0/3\n` }
    expect(guard('MultiEdit', { file_path: tpath('T-20'), edits: [{ old_string: 'status: open', new_string: 'status: done' }, withLine] }, 'main', TODAY)).toBe('')
    // an earlier `closed:` date written on the landing date: the write is the close
    expect(denyOf(guard('Write', { file_path: tpath('T-20'), content: text('T-20', { status: 'done', created: '2026-11-06', closed: '2026-11-01' }) }, 'main', TODAY)))
      .toContain('close of T-20 refused')
    expect(guard('Write', { file_path: tpath('T-20'), content: text('T-20', { status: 'done', created: '2026-11-06', closed: '2026-11-01' }) }, 'main', { PRDT_EFFECT_TODAY: '2026-11-10' })).toBe('')
    // the frame cutoff still skips
    ticket('T-20', { status: 'open', created: '2026-09-23' })
    expect(guard('Edit', { file_path: tpath('T-20'), ...closeEdit }, 'main', TODAY)).toBe('')
  }, T)

  test('row 4: k > n in a replay line refuses (same class as n < 3)', () => {
    const d = denyOf(close('T-20', { evidence: `- replay: ${PROBLEM} · before 9/3 · after 0/3` }))
    expect(d).toContain(`replay \`${PROBLEM}\` has k > n (before 9/3 · after 0/3)`)
    expect(d).toMatch(/Next: re-run to n ≥ 3/)
    expect(denyOf(close('T-20', { evidence: `- replay: ${PROBLEM} · before 3/3 · after 4/3` }))).toContain('has k > n')
    expect(cli(['tickets', 'fmt', 'T-20', '--check']).out).not.toContain('k > n')   // T-20 on disk is still `open`
    fs.writeFileSync(tpath('T-20'), text('T-20', { status: 'done', closed: '2026-11-12', evidence: `- replay: ${PROBLEM} · before 9/3 · after 0/3` }))
    expect(cli(['tickets', 'fmt', 'T-20', '--check']).out).toContain('has k > n (before 9/3 · after 0/3)')
  }, T)

  test('row 5: nested hook scripts and hook .py count; `(T-001a)` is not T-001', () => {
    commit('T-70', 'fix: nested hook (T-70)', { 'packages/core/scripts/hooks/lib/helper.sh': 'echo "[prdt h] y"\n' })
    commit('T-71', 'fix: hook python (T-71)', { 'packages/core/scripts/hooks/prdt-z.py': 'x = 1\n' })
    commit('T-72', 'fix: deep hook data (T-72)', { 'packages/core/scripts/hooks/lib/deep/data.json': '{}\n' })
    commit('T-001a', 'feat: lettered id (T-001a)', { 'packages/core/discipline/contracts/b.md': '# b\n' })
    expect(denyOf(close('T-70'))).toContain(`it edits hook (${hash['T-70']})`)
    expect(denyOf(close('T-71'))).toContain(`it edits hook (${hash['T-71']})`)
    expect(denyOf(close('T-72'))).toContain(`it edits hook (${hash['T-72']})`)
    expect(close('T-001')).toBe('')
    expect(close('T-00')).toBe('')
  }, T)

  test('non-ticket writes: stdout byte-identical to dev\'s guard (and empty)', () => {
    let devSrc = ''
    try { devSrc = execFileSync('git', ['-C', CORE, 'show', 'dev:packages/core/scripts/hooks/prdt-worktree-guard.sh'], { encoding: 'utf-8' }) } catch { /* no dev ref here */ }
    const devGuard = path.join(sb, 'dev-guard.sh')
    if (devSrc) fs.writeFileSync(devGuard, devSrc)
    const run = (script: string, tool: string, input: Record<string, unknown>, who: Who) => {
      const ev: Record<string, unknown> = { session_id: 's', cwd: root, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input,
        agent_type: who === 'main' ? 'prdt-po' : who, ...(who === 'main' ? {} : { agent_id: 'agent-x' }) }
      const e: NodeJS.ProcessEnv = { ...process.env, HOME: home, PRDT_BIN: CLI }
      delete e.PRDT_HOME
      return spawnSync('bash', [script], { cwd: root, input: JSON.stringify(ev), encoding: 'utf8', env: e, timeout: subprocessTimeout('cli') * 2 }).stdout
    }
    const payloads: Array<[string, Record<string, unknown>]> = [
      ['Write', { file_path: path.join(root, 'docs', 'note.md'), content: 'status: done' }],
      ['Write', { file_path: path.join(root, 'docs', 'note.md'), content: 'docs/tickets/v1.0/T-20.md status: "done"' }],
      ['Write', { file_path: path.join(root, 'docs', 'tickets', 'README.txt'), content: 'status: done' }],
      ['Write', { file_path: path.join(code, 'src', 'a.ts'), content: 'export {}' }],
      ['Edit', { file_path: path.join(code, 'src', 'app.ts'), old_string: 'export {}', new_string: 'export const z = 1' }],
      ['MultiEdit', { file_path: path.join(code, 'src', 'app.ts'), edits: [{ old_string: 'export {}', new_string: 'export {} // x' }] }],
      ['Write', { file_path: path.join(root, 'docs', 'wiki', 'w.md'), content: 'w' }],
      ['Write', { file_path: path.join(sb, 'outside.txt'), content: 'o' }],
      ['Bash', { command: 'ls -la' }],
      ['Bash', { command: 'git status' }],
    ]
    for (const who of ['main', 'prdt-developer'] as Who[])
      for (const [tool, input] of payloads) {
        const mine = run(GUARD, tool, input, who)
        if (devSrc) expect(mine, `${who} ${tool} ${JSON.stringify(input)}`).toBe(run(devGuard, tool, input, who))
        expect(mine, `${who} ${tool}`).not.toContain('effect check')
      }
  }, T * 2)
})

// ── fmt --check and doctor: one reader ─────────────────────────────────────────

describe.skipIf(!PY)('T-1440 tickets fmt --check · doctor', () => {
  test('the same finding lines; skipped before the landing date, when open, out of scope', () => {
    ticket('T-20', { status: 'done', closed: '2026-11-12' })
    ticket('T-21', { status: 'done', closed: '2026-11-13', evidence: `- replay: 다른 사례 · before 3/3 · after 0/3` })
    ticket('T-22', { status: 'done', closed: '2026-11-10' })           // closed before the landing date
    ticket('T-25', { status: 'open' })
    ticket('T-28', { status: 'done', closed: '2026-11-12' })           // out of scope
    ticket('T-29', { status: 'done', created: '2026-11-12' })          // no `closed:` → created on/after landing → checked
    ticket('T-27', { status: 'done', created: '2026-11-06' })          // no `closed:`, created before landing → skipped
    ticket('T-30', { status: 'done', closed: 'soon' })                 // malformed `closed:` → checked (T-715)
    for (const id of ['T-23', 'T-24', 'T-26', 'T-31', 'T-32', 'T-60', 'T-99']) fs.rmSync(tpath(id), { force: true })

    const e2 = (id: string, cls: string) => `effect check — it edits ${cls} (${hash[id]}) and \`evidence\` has no \`- replay: <case from problem> · before k/n · after k/n\` (n≥3, live, no stub) or \`- effect not shown: <reason> · user 「<reply>」\` line`
    const f20 = cli(['tickets', 'fmt', 'T-20', '--check'])
    expect(f20.code).toBe(1)
    expect(f20.out).toContain(`T-20: ${e2('T-20', 'discipline')}`)
    const f21 = cli(['tickets', 'fmt', 'T-21', '--check'])
    expect(f21.out).toContain('T-21: effect check — replay case `다른 사례` is not a string from problem')
    for (const id of ['T-22', 'T-25', 'T-28', 'T-27']) expect(cli(['tickets', 'fmt', id, '--check']).out, id).toBe(`${id}: ok\n`)
    expect(cli(['tickets', 'fmt', 'T-29', '--check']).out).toContain(`T-29: ${e2('T-29', 'agent stub')}`)
    expect(cli(['tickets', 'fmt', 'T-30', '--check']).out).toContain(`T-30: ${e2('T-30', 'override')}`)

    const doc = cli(['doctor']).out
    const lines = doc.split('\n').filter((l) => l.includes('effect check: '))
    const shown = lines.map((l) => l.slice(l.indexOf('effect check: ')))
    expect(shown).toEqual([
      `effect check: T-20 (docs/tickets/v1.0/T-20.md): ${e2('T-20', 'discipline')}`,
      'effect check: T-21 (docs/tickets/v1.0/T-21.md): effect check — replay case `다른 사례` is not a string from problem',
      `effect check: T-29 (docs/tickets/v1.0/T-29.md): ${e2('T-29', 'agent stub')}`,
      `effect check: T-30 (docs/tickets/v1.0/T-30.md): ${e2('T-30', 'override')}`,
    ])
  }, T)

  test('git unreadable → a `not run` line, never counted as a violation', () => {
    ticket('T-28', { status: 'done', closed: '2026-11-12' })
    const r = cli(['tickets', 'fmt', 'T-28', '--check'], fake('err2', 'exit 1'))
    expect(r.out).toContain('T-28: effect check not run — code repo: git exit 1')
    expect(r.out).toContain('T-28: ok')
    expect(r.code).toBe(0)
  }, T)

  test('row 3: the close gate, fmt --check and doctor judge the same tickets by the one landing date', () => {
    const src = fs.readFileSync(path.join(CORE, 'scripts', 'prdt_cli.py'), 'utf8')
    const D = /^EFFECT_CHECK_LANDING_DATE = "(\d{4}-\d{2}-\d{2})"/m.exec(src)![1]
    const shift = (n: number) => new Date(Date.parse(`${D}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
    // five in-scope ids, each a way to sit on one side of the date
    const cases: Array<[string, Tk, boolean]> = [
      ['T-20', { closed: shift(-1) }, false],                       // closed the day before
      ['T-21', { closed: D }, true],                                // the day of
      ['T-22', { closed: shift(1) }, true],                         // the day after
      ['T-25', { created: shift(-1) }, false],                      // no `closed:`, created before
      ['T-27', { created: D }, true],                               // no `closed:`, created on the date
    ]
    const hit = (o: string, id: string) => o.includes(`effect check — it edits`) && o.includes(id)
    const gate: Record<string, boolean> = {}, fmt: Record<string, boolean> = {}
    for (const [id, o, want] of cases) {
      fs.writeFileSync(tpath(id), text(id, { ...o, status: 'open', created: o.created ?? '2026-10-01' }))
      gate[id] = guard('Write', { file_path: tpath(id), content: text(id, { ...o, status: 'done', created: o.created ?? '2026-10-01' }) }, 'main', { PRDT_EFFECT_TODAY: shift(-1) }).includes('close of ' + id + ' refused')
      fs.writeFileSync(tpath(id), text(id, { ...o, status: 'done', created: o.created ?? '2026-10-01' }))
      fmt[id] = hit(cli(['tickets', 'fmt', id, '--check']).out, id)
      expect(gate[id], `gate ${id}`).toBe(want)
      expect(fmt[id], `fmt ${id}`).toBe(want)
    }
    const doc = cli(['doctor']).out.split('\n').filter((l) => l.includes('effect check: '))
    for (const [id, , want] of cases) expect(doc.some((l) => l.includes(`effect check: ${id} `)), `doctor ${id}`).toBe(want)
    for (const [id] of cases) fs.rmSync(tpath(id), { force: true })
  }, T * 2)

  test('a close outside the gate (content written directly, closed: install day) is named by fmt --check and doctor', () => {
    ticket('T-20', { status: 'done', closed: '2026-11-11' })   // as a Bash python edit leaves it: no hook saw it
    expect(cli(['tickets', 'fmt', 'T-20', '--check']).out).toContain('T-20: effect check — it edits discipline')
    expect(cli(['doctor']).out).toContain('effect check: T-20 (docs/tickets/v1.0/T-20.md)')
  }, T * 2)

  test('contracts/tickets.md names the landing date the CLI uses', () => {
    const src = fs.readFileSync(path.join(CORE, 'scripts', 'prdt_cli.py'), 'utf8')
    const date = /^EFFECT_CHECK_LANDING_DATE = "(\d{4}-\d{2}-\d{2})"/m.exec(src)?.[1]
    expect(date).toBeTruthy()
    expect(fs.readFileSync(path.join(CORE, 'discipline', 'contracts', 'tickets.md'), 'utf8'))
      .toContain(`the effect check skips one closed before ${date}.`)
  })
})

// ── PostToolUse notices: E3 · E1 ───────────────────────────────────────────────

describe.skipIf(!PY)('T-1440 notices after the close — prdt-prior-tickets.sh', () => {
  test('E3 prints once per ticket per session; a non-close write prints nothing', () => {
    const f = ticket('T-21', { status: 'done', closed: '2026-11-12', evidence: '- replay: 다른 사례 · before 3/3 · after 0/3' })
    const want = '[prdt effect check] T-21: replay case `다른 사례` is not a string from problem; copy it from there.'
    expect(JSON.parse(prior(f, closeEdit)).hookSpecificOutput.additionalContext).toBe(want)
    expect(prior(f, closeEdit)).toBe('')
    expect(JSON.parse(prior(f, closeEdit, 'sess-2')).hookSpecificOutput.additionalContext).toBe(want)
    expect(prior(f, { old_string: '끝', new_string: '끝.' }, 'sess-3')).toBe('')
  }, T)

  test('E3 notice for a quoted-done close and a bare word-change Edit', () => {
    const f = ticket('T-21', { status: 'done', closed: '2026-11-12', evidence: '- replay: 다른 사례 · before 3/3 · after 0/3' })
    const want = '[prdt effect check] T-21: replay case `다른 사례` is not a string from problem; copy it from there.'
    expect(JSON.parse(prior(f, { old_string: 'status: open', new_string: 'status: "done"' }, 'sess-q1')).hookSpecificOutput.additionalContext).toBe(want)
    expect(JSON.parse(prior(f, { old_string: 'status: open', new_string: 'status:done' }, 'sess-q2')).hookSpecificOutput.additionalContext).toBe(want)
    expect(JSON.parse(prior(f, { old_string: 'open\nassignee', new_string: '"done"\nassignee' }, 'sess-q3')).hookSpecificOutput.additionalContext).toBe(want)
  }, T)

  test('E1: closed with no commit naming it while the code repo has uncommitted scope changes', () => {
    const f = ticket('T-40', { status: 'done', closed: '2026-11-12' })
    expect(prior(f, closeEdit, 'sess-4')).toBe('')
    put('packages/core/discipline/contracts.md', '# c\n- rule\n- uncommitted\n')
    put('packages/core/scripts/hooks/prdt-new.sh', 'echo "[prdt new] z"\n')
    try {
      expect(JSON.parse(prior(f, closeEdit, 'sess-5')).hookSpecificOutput.additionalContext).toBe(
        '[prdt effect check] T-40 closed while the code repo has uncommitted discipline · hook changes and no commit names T-40: ' +
        'if they are its work, reopen, commit with (T-40), close again.')
      expect(prior(f, closeEdit, 'sess-5')).toBe('')
    } finally {
      git(['checkout', '--', 'packages/core/discipline/contracts.md'])
      fs.rmSync(path.join(code, 'packages/core/scripts/hooks/prdt-new.sh'))
    }
  }, T)

  test('with prior-ticket rows: one additionalContext, lines joined by a line break', () => {
    const f = ticket('T-22', { type: 'impl', status: 'done', closed: '2026-11-12',
      problem: `${PROBLEM}: \`prdt-x.sh\` 문구`, evidence: '- replay: 다른 사례 · before 3/3 · after 0/3' })
    const ctx = JSON.parse(prior(f, closeEdit, 'sess-6')).hookSpecificOutput.additionalContext as string
    const [first, second] = ctx.split('\n')
    expect(first).toMatch(/^\[prdt fix history\] prior tickets on /)
    expect(second).toBe('[prdt effect check] T-22: replay case `다른 사례` is not a string from problem; copy it from there.')
  }, T)
})
