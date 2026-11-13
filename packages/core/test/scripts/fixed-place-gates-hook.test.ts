/**
 * fixed-place-gates-hook.test.ts — T-1497: Build entry and deploy need that version's closed
 * fixed-place decision ticket, enforced by prdt-worktree-guard.sh (po-state stage write, push main ·
 * tag push) with `prdt tickets check-place` as the one matcher. Sandbox project + HOME per test.
 *
 * Deny wording is a placeholder (a designer replaces it); these tests pin the TRIGGERS and the facts.
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, test } from 'vitest'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-worktree-guard.sh')
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'prdt')
const PY = spawnSync('python3', ['--version']).status === 0
const T = 60_000

let sb: string, root: string, home: string, state: string

function put(rel: string, body: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}
const setState = (st: Record<string, unknown>) => fs.writeFileSync(state, JSON.stringify({ schema_version: 1, current_task: null, ...st }, null, 1))
function mk(st: Record<string, unknown> = { stage: 'define', version: 'v1.2' }, config: Record<string, unknown> = { slug: 'p' }) {
  sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wg-1497-')))
  root = path.join(sb, 'proj'); home = path.join(sb, 'home')
  fs.mkdirSync(path.join(home, '.prdt', 'run'), { recursive: true })
  state = path.join(root, '.prdt', 'po-state.json')
  put('.prdt/config.json', JSON.stringify(config))
  put('docs/_shared/wiki/log.md', '# Log\n')
  put('docs/p/prd/PRD.md', '# PRD\n')
  put('.git/HEAD', 'ref: refs/heads/dev\n')
  setState(st)
}
function decision(version: string, place: string, over: { status?: string; quote?: boolean; pointer?: string | null; product?: string; id?: string } = {}) {
  const id = over.id ?? `T-${Math.floor(Math.random() * 90000) + 10000}`
  put(`docs/${over.product ?? 'p'}/tickets/${version}/${id}.md`, ['---', `id: ${id}`, 'slug: d', 'type: decision', `status: ${over.status ?? 'done'}`,
    'assignee: user', `place: ${place}`, 'created: 2026-11-10', '---', '', '## outcome', '', over.quote === false ? 'nothing' : '사용자 「좋아요」',
    over.pointer ?? '', ''].join('\n'))
}
const releases = (version: string) => put('docs/RELEASES.md', `# Releases\n\n## ${version} — x (2026-11-10)\n\n1. 요약\n`)

function run(tool: string, input: Record<string, unknown>, who: 'main' | 'prdt-developer' = 'main', env: Record<string, string> = {}): string {
  const ev: Record<string, unknown> = { session_id: 's', transcript_path: path.join(sb, 's.jsonl'), cwd: root, hook_event_name: 'PreToolUse',
    tool_name: tool, tool_input: input, tool_use_id: 't' }
  if (who === 'main') ev.agent_type = 'prdt-po'
  else { ev.agent_type = who; ev.agent_id = 'agent-x' }
  const e = { ...process.env, HOME: home, PRDT_BIN: CLI, PRDT_LANG: 'en', ...env }
  delete e.PRDT_HOME
  const r = spawnSync('bash', [HOOK], { input: JSON.stringify(ev), encoding: 'utf8', env: e })
  expect(r.status).toBe(0)
  return r.stdout
}
function reason(out: string): string {
  expect(out, 'expected a deny').not.toBe('')
  const j = JSON.parse(out)
  expect(j.hookSpecificOutput.permissionDecision).toBe('deny')
  return j.hookSpecificOutput.permissionDecisionReason as string
}
const stageJson = (st: Record<string, unknown>) => JSON.stringify({ schema_version: 1, current_task: null, ...st })
const writeState = (st: Record<string, unknown>, who: 'main' | 'prdt-developer' = 'main', env: Record<string, string> = {}) =>
  run('Write', { file_path: state, content: stageJson(st) }, who, env)

describe.skipIf(!PY)('T-1497 Build entry gate — po-state stage → build', () => {
  beforeEach(() => mk())

  test('non-patch version, no decision ticket → denied naming version and what is missing; nothing written by the hook', () => {
    const why = reason(writeState({ stage: 'build', version: 'v1.2' }))
    expect(why).toContain('[prdt build-entry guard]')
    expect(why).toBe('[prdt build-entry guard] denied po-state write: stage → `build` for v1.2 needs, in docs/p/tickets/v1.2, a `type: decision` ticket with `place: build-entry`, `status: done`, user quote in `outcome`; none there. Next: put Build entry to the user on that ticket, reply verbatim → `outcome`, close, re-run.')
  }, T)

  test('a major-only version (v2) is gated like v<N>.<m>', () => {
    mk({ stage: 'define', version: 'v2' })
    expect(reason(writeState({ stage: 'build', version: 'v2' }))).toContain('for v2 needs')
  }, T)

  test('open ticket → not closed; closed without a user quote → no quote; wrong place / other version do not count', () => {
    decision('v1.2', 'build-entry', { status: 'open', id: 'T-1' })
    expect(reason(writeState({ stage: 'build', version: 'v1.2' }))).toContain('; T-1 still open. Next:')
    mk()
    decision('v1.2', 'build-entry', { quote: false, id: 'T-2' })
    expect(reason(writeState({ stage: 'build', version: 'v1.2' }))).toContain('; T-2 `outcome` holds no user quote. Next:')
    mk()
    decision('v1.2', 'deploy'); decision('v1.3', 'build-entry')
    expect(reason(writeState({ stage: 'build', version: 'v1.2' }))).toContain('; none there. Next:')
  }, T)

  test('a closed build-entry decision with a user quote lets Write, Edit and MultiEdit through', () => {
    decision('v1.2', 'build-entry')
    expect(writeState({ stage: 'build', version: 'v1.2' })).toBe('')
    const edit = { file_path: state, old_string: '"stage": "define"', new_string: '"stage": "build"' }
    expect(run('Edit', edit)).toBe('')
    expect(run('MultiEdit', { file_path: state, edits: [edit] })).toBe('')
  }, T)

  test('Edit and MultiEdit are judged on the file AFTER the replacement', () => {
    const edit = { file_path: state, old_string: '"stage": "define"', new_string: '"stage": "build"' }
    expect(reason(run('Edit', edit))).toContain('stage → `build` for v1.2 needs')
    expect(reason(run('MultiEdit', { file_path: state, edits: [{ old_string: '"v1.2"', new_string: '"v1.3"' }, { old_string: '"define"', new_string: '"build"' }] })))
      .toContain('for v1.3')
    // an edit that does not move the stage is silent, and one that cannot apply is the tool's own failure
    expect(run('Edit', { file_path: state, old_string: '"current_task": null', new_string: '"current_task": {"ticket_id": "T-1"}' })).toBe('')
    expect(run('Edit', { file_path: state, old_string: 'no such text', new_string: '"build"' })).toBe('')
  }, T)

  test('a patch version (v<N>.<m>.<p>) is not gated', () => {
    mk({ stage: 'idle', version: 'v1.2.1' })
    expect(writeState({ stage: 'build', version: 'v1.2.1' })).toBe('')
  }, T)

  test('only an ENTRY is gated: stage and version unchanged in build, other stages, other files', () => {
    mk({ stage: 'build', version: 'v1.2' })
    expect(writeState({ stage: 'build', version: 'v1.2', current_task: { ticket_id: 'T-1' } })).toBe('')
    expect(writeState({ stage: 'ship', version: 'v1.2' })).toBe('')
    expect(writeState({ stage: 'idle', version: 'v1.2' })).toBe('')
    expect(run('Write', { file_path: path.join(root, 'docs', 'p', 'prd', 'PRD.md'), content: '"stage": "build"' })).toBe('')
    // a version change while in build is a new entry
    expect(reason(writeState({ stage: 'build', version: 'v1.3' }))).toContain('for v1.3')
  }, T)

  test('an added product entering build is checked in its own tickets dir; the first product stays as it was', () => {
    mk({ stage: 'build', version: 'v1.2', products: { arc: { stage: 'define', version: 'v3' } } }, { slug: 'p', products: [{ name: 'arc' }] })
    put('docs/arc/prd/PRD.md', '# PRD\n')
    const next = { stage: 'build', version: 'v1.2', products: { arc: { stage: 'build', version: 'v3' } } }
    expect(reason(writeState(next))).toContain('stage → `build` for arc/v3 needs, in docs/arc/tickets/v3,')
    decision('v3', 'build-entry', { product: 'arc' })
    expect(writeState(next)).toBe('')
  }, T)

  test('an added product with no docs/<p>/ folder yet is told its real search dir docs/<p>/tickets/<v>', () => {
    mk({ stage: 'build', version: 'v1.2', products: { zed: { stage: 'define', version: 'v3' } } }, { slug: 'p' })
    const why = reason(writeState({ stage: 'build', version: 'v1.2', products: { zed: { stage: 'build', version: 'v3' } } }))
    expect(why).toContain('for zed/v3 needs, in docs/zed/tickets/v3,')
    expect(why).not.toContain('_shared')
  }, T)

  test('a worker is held to it too and told to return blocked', () => {
    const why = reason(writeState({ stage: 'build', version: 'v1.2' }, 'prdt-developer'))
    expect(why).toContain('Next: return `blocked` naming this write; the PO asks Build entry.')
  }, T)

  test('fails OPEN when the prdt CLI is unusable (explicit PRDT_BIN missing)', () => {
    expect(writeState({ stage: 'build', version: 'v1.2' }, 'main', { PRDT_BIN: '/nonexistent/prdt' })).toBe('')
  }, T)

  test('a relative file_path is resolved against the event cwd', () => {
    expect(reason(run('Write', { file_path: '.prdt/po-state.json', content: stageJson({ stage: 'build', version: 'v1.2' }) }))).toContain('for v1.2')
  }, T)
})

describe.skipIf(!PY)('T-1497 deploy decision gate — push main · tag push at stage ship', () => {
  const bash = (command: string, who: 'main' | 'prdt-developer' = 'main') => run('Bash', { command }, who)
  beforeEach(() => mk({ stage: 'ship', version: 'v1.2' }))

  test('no deploy decision → push main, tag push, vercel prod, gh pr merge denied with version and missing fact', () => {
    for (const c of ['git push origin main', 'git push origin v1.2', 'git push --tags', 'vercel --prod', 'gh pr merge 3 --merge']) {
      const why = reason(bash(c))
      expect(why, c).toContain('[prdt deploy guard]')
      expect(why, c).toContain('v1.2 needs, in docs/p/tickets/v1.2, a `type: decision` ticket with `place: deploy`, `status: done`, user quote in `outcome`, body citing `RELEASES.md` `## v1.2`; none there. Next: put deploy of v1.2 + its release notes to the user on that ticket, reply verbatim → `outcome`, close, re-run.')
    }
  }, T)

  test('closed decision with quote, pointing to RELEASES.md#<version>, plus the section → allowed', () => {
    decision('v1.2', 'deploy', { pointer: 'Notes: code/docs/RELEASES.md#v1.2' }); releases('v1.2')
    for (const c of ['git push origin main', 'git push origin v1.2', 'vercel --prod']) expect(bash(c), c).toBe('')
  }, T)

  test('missing pieces: not closed · no quote · no pointer · pointer to another version · no section', () => {
    decision('v1.2', 'deploy', { status: 'open', id: 'T-1', pointer: 'RELEASES.md#v1.2' }); releases('v1.2')
    expect(reason(bash('git push origin main'))).toContain('; T-1 still open. Next:')
    mk({ stage: 'ship', version: 'v1.2' }); releases('v1.2')
    decision('v1.2', 'deploy', { quote: false, id: 'T-2', pointer: 'RELEASES.md#v1.2' })
    expect(reason(bash('git push origin main'))).toContain('; T-2 `outcome` holds no user quote. Next:')
    mk({ stage: 'ship', version: 'v1.2' }); releases('v1.2')
    decision('v1.2', 'deploy', { id: 'T-3' })
    expect(reason(bash('git push origin main'))).toContain('; T-3 body cites no `RELEASES.md` `## v1.2`. Next:')
    mk({ stage: 'ship', version: 'v1.2' }); releases('v1.2')
    decision('v1.2', 'deploy', { id: 'T-4', pointer: 'RELEASES.md#v1.20' })
    expect(reason(bash('git push origin main'))).toContain('; T-4 body cites no `RELEASES.md` `## v1.2`. Next:')
    mk({ stage: 'ship', version: 'v1.2' })
    decision('v1.2', 'deploy', { id: 'T-5', pointer: 'RELEASES.md#v1.2' })
    expect(reason(bash('git push origin main'))).toContain('; T-5 cites `RELEASES.md` `## v1.2`, but docs/RELEASES.md has no `## v1.2`. Next:')
  }, T)

  test('a patch version is gated on deploy', () => {
    mk({ stage: 'ship', version: 'v1.2.1' })
    expect(reason(bash('git push origin main'))).toContain('v1.2.1 needs, in docs/p/tickets/v1.2.1,')
  }, T)

  test('silent: dry runs, non-main pushes, a local merge into main (promotion), prose, stages idle and retro', () => {
    for (const c of ['git push --dry-run origin main', 'git push origin dev', 'echo "git push origin main"', 'git -C . merge --abort']) expect(bash(c), c).toBe('')
    fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    expect(bash('git merge dev')).toBe('')
    for (const stage of ['idle', 'retro']) { setState({ stage, version: 'v1.2' }); expect(bash('git push origin main'), stage).toBe('') }
  }, T)

  test('the stage guard still comes first at define/build; an N/A-skip line then hands over to the decision gate', () => {
    setState({ stage: 'build', version: 'v1.2' })
    expect(reason(bash('git push origin main'))).toContain('a deploy runs only at stage=ship')
    fs.appendFileSync(path.join(root, 'docs', '_shared', 'wiki', 'log.md'), '- readiness v1.2 N/A-skip (patch)\n')
    expect(reason(bash('git push origin main'))).toContain('v1.2 needs, in docs/p/tickets/v1.2,')
    decision('v1.2', 'deploy', { pointer: 'RELEASES.md#v1.2' }); releases('v1.2')
    expect(bash('git push origin main')).toBe('')
  }, T)

  test('an added product at ship is checked under <product>/<version>; the current task picks the product', () => {
    mk({ stage: 'idle', version: 'v1.2', current_task: { ticket_id: 'T-9', slug: 's', assignee: 'developer', product: 'arc' }, products: { arc: { stage: 'ship', version: 'v3' } } },
      { slug: 'p', products: [{ name: 'arc' }] })
    expect(reason(bash('git push origin main'))).toContain('arc/v3 needs, in docs/arc/tickets/v3,')
    decision('v3', 'deploy', { product: 'arc', pointer: 'RELEASES.md#v3' }); releases('v3')
    expect(bash('git push origin main')).toBe('')
  }, T)

  test('T-1528: an added product with its own code.dir is checked against ITS RELEASES.md (the NTF Archive shape)', () => {
    const st = { stage: 'idle', version: 'v1.2', current_task: { ticket_id: 'T-9', slug: 's', assignee: 'developer', product: 'arc' }, products: { arc: { stage: 'ship', version: 'v1.6' } } }
    const cfg = { slug: 'p', code: { dir: 'code' }, products: [{ name: 'arc', code: { dir: 'arc' } }] }
    mk(st, cfg)
    decision('v1.6', 'deploy', { product: 'arc', id: 'T-8', pointer: 'Notes: arc/docs/RELEASES.md#v1.6' })
    put('arc/docs/RELEASES.md', '# Releases\n\n## v1.6 — x (2026-11-13)\n\n1. 요약\n')
    for (const c of ['git push origin v1.6', 'gh pr merge 3 --merge', 'git push origin main']) expect(bash(c), c).toBe('')
    // the section only in the FIRST product's repo does not count for arc — and the message names the file it read
    mk(st, cfg)
    decision('v1.6', 'deploy', { product: 'arc', id: 'T-8', pointer: 'Notes: arc/docs/RELEASES.md#v1.6' })
    put('code/docs/RELEASES.md', '# Releases\n\n## v1.6 — x (2026-11-13)\n\n1. 요약\n')
    expect(reason(bash('git push origin v1.6'))).toContain('arc/v1.6 needs, in docs/arc/tickets/v1.6, a `type: decision` ticket with `place: deploy`, `status: done`, user quote in `outcome`, body citing `RELEASES.md` `## v1.6`; T-8 cites `RELEASES.md` `## v1.6`, but arc/docs/RELEASES.md has no `## v1.6`. Next:')
  }, T)

  test('T-1528: the first product still reads the project code.dir RELEASES.md', () => {
    mk({ stage: 'ship', version: 'v1.2' }, { slug: 'p', code: { dir: 'code' }, products: [{ name: 'arc', code: { dir: 'arc' } }] })
    decision('v1.2', 'deploy', { id: 'T-6', pointer: 'RELEASES.md#v1.2' })
    put('arc/docs/RELEASES.md', '# Releases\n\n## v1.2 — x\n')
    expect(reason(bash('git push origin main'))).toContain('; T-6 cites `RELEASES.md` `## v1.2`, but code/docs/RELEASES.md has no `## v1.2`. Next:')
    put('code/docs/RELEASES.md', '# Releases\n\n## v1.2 — x\n')
    expect(bash('git push origin main')).toBe('')
  }, T)

  test('a worker is told to return blocked; an unusable CLI fails open', () => {
    expect(reason(bash('git push origin main', 'prdt-developer'))).toContain('Next: return `blocked` naming this deploy; the PO asks the deploy decision.')
    expect(run('Bash', { command: 'git push origin main' }, 'main', { PRDT_BIN: '/nonexistent/prdt' })).toBe('')
  }, T)
})
