/**
 * T-1471 — prior tickets at ticket-write time. After the PO writes or edits a
 * `type: impl|decision` ticket, prdt-prior-tickets.sh (PostToolUse
 * Write|Edit|MultiEdit) lists the other tickets that touched the same file,
 * hook or feature the ticket names: ticket bodies that name the same anchor,
 * tickets whose id is in a commit subject that changed the anchor file, and
 * tickets that cite such a commit's hash. Every subprocess runs with a sandbox
 * HOME + PRDT_HOME and an explicit cwd.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeAll, afterAll } from 'vitest'
import { copyPrdtCli } from '../helpers/copy-prdt'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const HOOK_SRC = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-prior-tickets.sh')

let sandbox: string
let home: string
let prdtHome: string
let hook: string
let project: string
let code: string
let fixHash: string

function git(args: string[]): string {
  return execFileSync('git', ['-C', code, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, HOME: home, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid',
      GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_CONFIG_NOSYSTEM: '1' },
  }).trim()
}

function ticket(id: string, fm: Record<string, string>, body: string): string {
  const p = path.join(project, 'docs', 'tickets', 'v1.0', `${id}.md`)
  const head = Object.entries({ id, ...fm }).map(([k, v]) => `${k}: ${v}`).join('\n')
  fs.writeFileSync(p, `---\n${head}\n---\n\n${body}\n`, 'utf-8')
  return p
}

beforeAll(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1471-')))
  home = path.join(sandbox, 'home')
  prdtHome = path.join(home, '.prdt')
  for (const d of ['bin', 'hooks']) fs.mkdirSync(path.join(prdtHome, d), { recursive: true })
  copyPrdtCli(PRDT_CLI, path.join(prdtHome, 'bin', 'prdt'))
  fs.copyFileSync(path.join(CORE_ROOT, 'scripts', 'prdt-messages.json'), path.join(prdtHome, 'bin', 'prdt-messages.json'))
  hook = path.join(prdtHome, 'hooks', 'prdt-prior-tickets.sh')
  fs.copyFileSync(HOOK_SRC, hook)
  fs.chmodSync(hook, 0o755)

  project = path.join(sandbox, 'proj')
  fs.mkdirSync(path.join(project, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(project, '.prdt', 'config.json'), '{"slug":"proj","code":{"dir":"code"}}\n')
  fs.writeFileSync(path.join(project, '.prdt', 'po-state.json'), '{}\n')   // the CLI's project marker
  fs.mkdirSync(path.join(project, 'docs', 'tickets', 'v1.0'), { recursive: true })

  // The code repo: one hook file whose history names two tickets.
  code = path.join(project, 'code')
  const hookFile = path.join(code, 'scripts', 'hooks', 'prdt-foo-check.sh')
  fs.mkdirSync(path.dirname(hookFile), { recursive: true })
  git(['init', '-q', '-b', 'dev'])
  fs.writeFileSync(hookFile, 'def foo_subject(lines):\n    return "[prdt foo check]"\n')
  fs.writeFileSync(path.join(code, 'other.py'), 'def unrelated_thing():\n    pass\n')
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'feat: foo check (T-2)'])
  fs.appendFileSync(hookFile, '# narrowed\n')
  git(['commit', '-q', '-am', 'fix: foo check scope (T-3)'])
  fixHash = git(['rev-parse', '--short=8', 'HEAD'])
  fs.appendFileSync(path.join(code, 'other.py'), '# x\n')
  git(['commit', '-q', '-am', 'chore: other (T-5)'])

  ticket('T-2', { slug: 'foo-check', title: 'foo check 처음', type: 'impl', status: 'done', assignee: 'developer' }, '## problem\n\n점검을 만든다.')
  ticket('T-3', { slug: 'foo-scope', type: 'impl', status: 'done', assignee: 'developer' }, '## problem\n\n범위를 좁힌다.')
  ticket('T-4', { slug: 'foo-structural', title: '서식에 기댄 고침', type: 'impl', status: 'dropped', assignee: 'developer' },
    `## problem\n\nT-3 (commit ${fixHash}) 가 범위를 좁혔지만 서식에 기댄다.`)
  ticket('T-6', { slug: 'names-file', title: '파일을 이름으로 적은 티켓', type: 'impl', status: 'open', assignee: 'developer' },
    '## problem\n\n`prdt-foo-check.sh` 의 문구.')
  ticket('T-5', { slug: 'other', title: '관계없는 티켓', type: 'impl', status: 'done', assignee: 'developer' }, '## problem\n\n`other.py` 정리.')
})

afterAll(() => { fs.rmSync(sandbox, { recursive: true, force: true }) })

function run(payload: object): { out: string; code: number } {
  const r = spawnSync('bash', [hook], {
    cwd: project, encoding: 'utf-8', input: JSON.stringify(payload),
    env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, CI: '1' },
    timeout: subprocessTimeout('hook'),
  })
  return { out: r.stdout ?? '', code: r.status ?? -1 }
}

function payload(file: string, extra: Record<string, unknown> = {}): object {
  return {
    hook_event_name: 'PostToolUse', session_id: 'sess-1', cwd: project, agent_type: 'prdt-po',
    tool_name: 'Write', tool_input: { file_path: file, content: '' }, tool_response: {}, ...extra,
  }
}

function context(out: string): string {
  return JSON.parse(out).hookSpecificOutput.additionalContext as string
}

describe('prdt-prior-tickets.sh', () => {
  test('a PO decision ticket naming a symbol lists every ticket that touched its file, once per session', () => {
    const f = ticket('T-10', { slug: 'foo-decision', type: 'decision', status: 'open', assignee: 'user' },
      '## problem\n\n`foo_subject` 가 id 위치로 주제를 정한다.')
    const r = run(payload(f))
    expect(r.code).toBe(0)
    const ctx = context(r.out)
    // git log subjects (T-2, T-3), the cited commit (T-4), the body naming the file (T-6)
    expect(ctx).toContain('- T-2 · foo check 처음 · done')
    expect(ctx).toContain('- T-3 · foo-scope · done')
    expect(ctx).toContain('- T-4 · 서식에 기댄 고침 · dropped')
    expect(ctx).toContain('- T-6 · 파일을 이름으로 적은 티켓 · open')
    expect(ctx).not.toContain('T-5')
    expect(ctx).not.toMatch(/- T-10 /)
    expect(ctx.split('\n')[0]).toContain('prdt-foo-check.sh')
    // the same ticket edited again in the same session: nothing new to show
    expect(run(payload(f, { tool_name: 'Edit', tool_input: { file_path: f, old_string: 'a', new_string: 'b' } })).out).toBe('')
    // another session sees it again
    expect(context(run(payload(f, { session_id: 'sess-2' })).out)).toContain('- T-2 ')
  })

  test('a hook tag names the file that prints it', () => {
    const f = ticket('T-11', { slug: 'tag', type: 'impl', status: 'open', assignee: 'developer' },
      '## problem\n\n`[prdt foo check]` 가 오탐한다.')
    const ctx = context(run(payload(f)).out)
    expect(ctx).toContain('- T-3 ')
    expect(ctx).not.toContain('T-5')
  })

  test('nothing is printed when no prior ticket matches', () => {
    const f = ticket('T-12', { slug: 'none', type: 'impl', status: 'open', assignee: 'developer' },
      '## problem\n\n화면 문구를 바꾼다. `missing_symbol_x` 는 어디에도 없다.')
    expect(run(payload(f)).out).toBe('')
  })

  test('a worker session prints nothing', () => {
    const f = ticket('T-13', { slug: 'worker', type: 'impl', status: 'open', assignee: 'developer' },
      '## problem\n\n`foo_subject` 를 고친다.')
    for (const agent of ['prdt-developer', 'prdt-qa', 'prdt-designer']) {
      expect(run(payload(f, { agent_type: agent })).out, agent).toBe('')
    }
    const plain = payload(f) as Record<string, unknown>
    delete plain.agent_type
    expect(run(plain).out).toBe('')
  })

  test('only impl and decision tickets are checked', () => {
    const f = ticket('T-14', { slug: 'qa', type: 'qa', status: 'open', assignee: 'qa' },
      '## problem\n\n`foo_subject` 를 본다.')
    expect(run(payload(f)).out).toBe('')
  })

  test('`prdt tickets prior <id>` prints the same rows', () => {
    const r = spawnSync('python3', [PRDT_CLI, 'tickets', 'prior', 'T-10'], {
      cwd: project, encoding: 'utf-8', env: { ...process.env, HOME: home, PRDT_HOME: prdtHome, CI: '1' },
      timeout: subprocessTimeout('cli'),
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('- T-4 · 서식에 기댄 고침 · dropped')
    expect(r.stdout).not.toContain('T-5')
  })
})
