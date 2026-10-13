/**
 * prdt-layout-migrate.test.ts — T-1103: `prdt layout migrate` · `--apply` · `check`.
 *
 * Design: docs/artifacts/v1.14/product-first-docs-layout.html (④ names, the 9 apply
 * steps, failure rollback, ③ closed PRD files byte-identical). Output strings are the
 * approved screen set (define-screen-set.html, layout-cli: preview · applied · already ·
 * refused · rolled back · partial). Black-box over the REAL CLI on temp projects built by
 * `prdt init`; the PARTIAL case drives the script as a module (a rollback that itself
 * fails cannot be staged from outside).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'
import { spawnSync } from 'child_process'
import { test, expect, describe, beforeAll, afterAll } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'
import { metaAutosaveTick, DEFAULT_META_EXCLUDE } from '../../src'
import { metaBackupTick } from '../../src/git-workflow/meta-backup'
import { networkAlias } from '../helpers/network-remote'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const STATUSLINE = path.join(CORE_ROOT, 'scripts', 'statusline-prdt.sh')

let tmp: string
let home: string
let seq = 0
const env = () => ({ ...process.env, HOME: home, PRDT_HOME: path.join(home, '.prdt'), PRDT_LANG: 'en', NO_COLOR: '1' })

function prdt(cwd: string, args: string[]) {
  const r = spawnSync('python3', [PRDT_CLI, ...args], {
    cwd, encoding: 'utf8', env: env(), timeout: subprocessTimeout('cli'),
  })
  return { out: r.stdout, err: r.stderr, code: r.status }
}
function git(root: string, args: string[]): string {
  return spawnSync('git', ['--git-dir', path.join(root, '.prdt', 'meta.git'), '--work-tree', root, ...args],
    { encoding: 'utf8' }).stdout
}
function write(p: string, text: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}
function sha(p: string) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') }
function walk(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? [path.relative(base, p) + '/', ...walk(p, base)] : [path.relative(base, p)]
  }).sort()
}
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rel of walk(path.join(root, 'docs'))) {
    const p = path.join(root, 'docs', rel)
    out[rel] = rel.endsWith('/') ? '' : sha(p)
  }
  return out
}
function ticket(p: string, id: string) {
  write(p, `---\nid: ${id}\nslug: fx-${id.toLowerCase()}\ntype: impl\nstatus: open\nassignee: developer\ncreated: 2026-10-12\n---\n\n## problem\n\nx\n`)
}

/** A committed unmigrated project (As-Is docs, one product `proj`). */
function legacy(): string {
  const root = path.join(tmp, `p${++seq}`)
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  expect(prdt(root, ['init', '--json', '--slug', 'proj', '--yes']).code).toBe(0)
  const d = (rel: string) => path.join(root, 'docs', rel)
  write(d('prd/PRD.md'), '# PRD\n\n## v0.1\n\n#### item-a\n')
  write(d('prd/versions/v0.0.md'), '## v0.0\n\nsee [spec](../features/viewer.md) · [mock](../artifacts/v0.1/mock.html)\n')
  write(d('features/viewer.md'), '# viewer\n')
  write(d('artifacts/v0.1/mock.html'), '<html><title>mock</title></html>\n')
  write(d('design.md'), '# design\n')
  write(d('DEPLOY.md'), '# deploy\n')
  write(d('wiki/fact--alpha.md'), '---\ntitle: alpha\ntype: fact\nstatus: live\n---\n\nalpha\n')
  write(d('wiki/retro--v0.1.md'), '---\ntitle: retro\ntype: retro\nstatus: live\n---\n\nretro\n')
  write(d('po/habit.md'), '# po\n')
  write(d('archive/a.md'), '# a\n')
  write(d('MIGRATION.md'), '# m\n')
  write(d('prdt-v1-a.md'), 'x\n')
  write(d('prdt-v1-b.md'), 'x\n')
  ticket(d('tickets/v0.1/T-001.md'), 'T-001')
  ticket(d('tickets/v0.0/T-002.md'), 'T-002')
  ticket(d('tickets/backlog/T-003.md'), 'T-003')
  prdt(root, ['artifacts', 'sync'])
  git(root, ['add', '-A', '-f', '--', 'docs', '.prdt/config.json'])
  git(root, ['commit', '-qm', 'seed'])
  return root
}

// The approved half-moved sentence (T-1117 · P1 / A3 / R8) and the `다음:` line, with the --undo way out.
const PARTIAL_LINE = (n: number) => `docs 폴더 일부만 새 구조예요. 문서 ${n}개가 아직 예전 구조예요`
const PARTIAL_NEXT_BASE = '다음: PO 에게 알리세요. 이 상태에서는 다시 옮기기가 거부되고, prdt doctor 가 같은 오류를 보여요.'
const PARTIAL_NEXT = `${PARTIAL_NEXT_BASE} prdt layout migrate --undo 로 되돌릴 수 있어요.`

const LOADER = `
import importlib.machinery, importlib.util, sys, os, argparse
from pathlib import Path
l = importlib.machinery.SourceFileLoader("m", sys.argv[1]); s = importlib.util.spec_from_loader("m", l)
m = importlib.util.module_from_spec(s); l.exec_module(m)
os.chdir(sys.argv[2])
`
function pyRun(root: string, body: string) {
  const r = spawnSync('python3', ['-c', LOADER + body, PRDT_CLI, root], {
    encoding: 'utf8', env: env(), timeout: subprocessTimeout('cli'),
  })
  return { out: r.stdout, err: r.stderr, code: r.status }
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1103-'))
  home = path.join(tmp, 'home')
  fs.mkdirSync(home)
}, 60_000)
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('layout check', () => {
  test('old → exit 1 · new → exit 0 · json', () => {
    const root = legacy()
    const old = prdt(root, ['layout', 'check'])
    expect(old.code).toBe(1)
    expect(old.out).toBe('docs 폴더가 예전 구조예요. 문서 20개를 새 구조로 옮길 수 있어요.\n\n다음: prdt layout migrate 로 옮길 목록을 확인하세요.\n')
    expect(JSON.parse(prdt(root, ['layout', 'check', '--json']).out)).toMatchObject({ state: 'old', product: 'proj', docs: 20 })
    expect(prdt(root, ['layout', 'migrate', '--apply']).code).toBe(0)
    const now = prdt(root, ['layout', 'check'])
    expect(now.code).toBe(0)
    expect(now.out).toBe('docs 폴더가 이미 새 구조예요 (docs/_shared · docs/proj).\n')
  }, 120_000)
})

describe('preview writes nothing', () => {
  test('prints the approved table; the tree and meta git are untouched', () => {
    const root = legacy()
    const before = snapshot(root)
    const head = git(root, ['rev-parse', 'HEAD'])
    const r = prdt(root, ['layout', 'migrate'])
    expect(r.code).toBe(0)
    expect(r.out).toBe([
      'proj: docs 폴더가 예전 구조예요. 문서 20개를 새 구조로 옮길 목록이에요. 아직 아무것도 옮기지 않았어요.',
      '',
      '옮길 곳              파일   내용',
      'docs/proj/              9   prd/ 2 · tickets/ 3 · artifacts/ 2 · wiki/retro--v*.md 1 · DEPLOY.md',
      'docs/_shared/          11   design.md · features/ 1 · wiki/ 4 · po/ 1',
      '                            archive/ 1 · MIGRATION.md · prdt-v1-*.md 2',
      '그대로                 —    .prdt/ · code/',
      '',
      '함께 바뀌는 것',
      '  .prdt/config.json         meta.allowlist 15줄을 옮긴 경로로 다시 써요',
      '  artifacts/manifest.json   bucket 경로를 다시 써요',
      '  닫힌 PRD 1개              바이트 그대로 두고 shasum 으로 비교해요',
      '  코드 저장소                건드리지 않아요',
      '',
      '다음: 목록이 맞으면 prdt layout migrate --apply 로 옮기세요.',
      '',
    ].join('\n'))
    expect(snapshot(root)).toEqual(before)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
    expect(git(root, ['status', '--short', '--', 'docs'])).toBe('')
  }, 120_000)
})

describe('--apply', () => {
  test('moves per the design, closed PRDs byte-identical, one meta commit, config rewritten', () => {
    const root = legacy()
    const closed = ['v0.0.md']
    const before = Object.fromEntries(closed.map((f) => [f, sha(path.join(root, 'docs/prd/versions', f))]))
    const commits = git(root, ['rev-list', '--count', 'HEAD']).trim()
    const r = prdt(root, ['layout', 'migrate', '--apply'])
    expect(r.code).toBe(0)
    expect(r.out).toBe([
      '1/9 선행 검사를 통과했어요',
      '2/9 옮길 문서 20개의 목록을 만들었어요',
      '3/9 닫힌 PRD 1개의 shasum 을 적었어요',
      '4/9 문서 20개를 옮겼어요 (git mv, 이력 유지)',
      '5/9 .prdt/config.json 의 meta.allowlist 15줄을 다시 썼어요',
      '6/9 산출물 목록 · 인덱스 · 위키 index.md 를 다시 만들었어요',
      '7/9 닫힌 PRD 1개의 shasum 이 모두 같아요',
      '8/9 meta 커밋 1개를 만들었어요: chore: product-first docs layout (prdt layout migrate)',
      '9/9 prdt doctor 경로 경고 0개',
      '',
      'docs 폴더가 새 구조가 됐어요. 문서 20개를 docs/_shared · docs/proj 로 옮겼어요.',
      '',
      '다음: 평소대로 작업하세요.',
      '',
    ].join('\n'))
    for (const f of closed) expect(sha(path.join(root, 'docs/proj/prd/versions', f))).toBe(before[f])
    for (const rel of ['proj/prd/PRD.md', 'proj/tickets/v0.1/T-001.md', 'proj/tickets/backlog/T-003.md',
      'proj/artifacts/v0.1/mock.html', 'proj/artifacts/manifest.json', 'proj/DEPLOY.md', 'proj/wiki/retro--v0.1.md',
      '_shared/design.md', '_shared/features/viewer.md', '_shared/wiki/fact--alpha.md', '_shared/po/habit.md',
      '_shared/archive/a.md', '_shared/MIGRATION.md', '_shared/prdt-v1-a.md']) {
      expect(fs.existsSync(path.join(root, 'docs', rel)), rel).toBe(true)
    }
    for (const old of ['prd', 'tickets', 'artifacts', 'wiki', 'features', 'po', 'archive', 'design.md', 'DEPLOY.md']) {
      expect(fs.existsSync(path.join(root, 'docs', old)), `docs/${old} gone`).toBe(false)
    }
    // one commit, history follows the files (renames), the tree is clean
    expect(Number(git(root, ['rev-list', '--count', 'HEAD']).trim())).toBe(Number(commits) + 1)
    expect(git(root, ['log', '-1', '--format=%s']).trim()).toBe('chore: product-first docs layout (prdt layout migrate)')
    expect(git(root, ['show', '--stat', '-M', '--format=', 'HEAD'])).toContain('docs/{ => proj}/prd/PRD.md')
    expect(git(root, ['status', '--short', '--', 'docs', '.prdt/config.json'])).toBe('')
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8'))
    expect(cfg.meta.allowlist).toEqual(expect.arrayContaining(
      ['docs/proj/prd', 'docs/proj/tickets', 'docs/proj/artifacts', 'docs/_shared/design.md', 'docs/_shared/wiki', 'docs/proj/wiki']))
    expect(cfg.meta.allowlist).not.toContain('docs/prd')
    // after: new layout; a second run says so and does nothing
    expect(prdt(root, ['layout', 'check']).code).toBe(0)
    const again = prdt(root, ['layout', 'migrate'])
    expect(again.out).toBe('docs 폴더가 이미 새 구조예요 (docs/_shared · docs/proj). 옮길 문서가 없어서 아무것도 하지 않았어요.\n')
    expect(prdt(root, ['layout', 'migrate', '--apply']).out).toBe(again.out)
    expect(git(root, ['rev-list', '--count', 'HEAD']).trim()).toBe(String(Number(commits) + 1))
  }, 180_000)

  test('a single-product project keeps statusline, tickets and index output byte-identical', () => {
    const root = legacy()
    const sl = () => spawnSync('bash', [STATUSLINE], {
      input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8', env: env(),
    }).stdout
    const tickets = () => prdt(root, ['tickets']).out
    const a = { sl: sl(), tk: tickets() }
    expect(a.sl.length).toBeGreaterThan(10)   // the line is not empty
    expect(prdt(root, ['layout', 'migrate', '--apply']).code).toBe(0)
    expect(sl()).toBe(a.sl)
    expect(tickets()).toBe(a.tk)
  }, 180_000)
})

describe('refused — nothing is written', () => {
  test('uncommitted change in meta git', () => {
    const root = legacy()
    write(path.join(root, 'docs/tickets/v0.1/T-009.md'), 'x\n')
    write(path.join(root, 'docs/design.md'), '# design edited\n')
    const before = snapshot(root)
    const r = prdt(root, ['layout', 'migrate', '--apply'])
    expect(r.code).toBe(1)
    expect(r.out).toBe([
      '옮기지 않았어요: 커밋하지 않은 변경 2개가 meta git 에 있어요. docs 폴더는 예전 구조 그대로예요.',
      '  docs/design.md',
      '  docs/tickets/v0.1/T-009.md',
      '',
      '다음: 변경 2개를 커밋한 뒤 다시 실행하세요.',
      '',
    ].join('\n'))
    expect(snapshot(root)).toEqual(before)
  }, 120_000)

  test('a live dispatch marker, and a docs/<product>/ name clash', () => {
    const root = legacy()
    const runDir = path.join(home, '.prdt', 'run', 'dispatches')
    write(path.join(runDir, 'm1.json'), JSON.stringify({
      agent_id: 'a1', persona: 'developer', ticket_id: 'T-1', dispatch_id: 'd-1',
      project_root: fs.realpathSync(root), since: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    }))
    const r = prdt(root, ['layout', 'migrate', '--apply'])
    expect(r.code).toBe(1)
    expect(r.out).toContain('옮기지 않았어요: 이 프로젝트에서 진행 중인 dispatch 1개가 있어요. docs 폴더는 예전 구조 그대로예요.')
    expect(r.out).toContain('다음: prdt dispatch ls 로 확인하고, 끝난 뒤 다시 실행하세요.')
    fs.rmSync(runDir, { recursive: true, force: true })
    write(path.join(root, 'docs/proj/note.md'), 'x\n')   // untracked, outside the allowlist: not dirty
    const c = prdt(root, ['layout', 'migrate', '--apply'])
    expect(c.code).toBe(1)
    expect(c.out).toContain('옮기지 않았어요: 새 구조가 쓸 docs/proj/ 폴더가 이미 있어요. docs 폴더는 예전 구조 그대로예요.')
    expect(c.out).toContain('다음: 그 폴더의 이름을 바꾸거나 다른 곳으로 옮긴 뒤 다시 실행하세요.')
    expect(fs.existsSync(path.join(root, 'docs/prd/PRD.md'))).toBe(true)
  }, 120_000)
})

describe('failure rolls back (rolled back)', () => {
  // T-1105: the in-progress marker is written under `.prdt/` before the first rename, so an
  // unwritable `.prdt/` now stops the run at step 4 with nothing moved (it used to fail at the
  // config rewrite, step 5, after the move). Same approved F4 lines; the cause is in the parentheses.
  test.skipIf(process.getuid?.() === 0)('.prdt not writable (no marker, no config) → nothing moved, meta history untouched', () => {
    const root = legacy()
    const before = snapshot(root)
    const head = git(root, ['rev-parse', 'HEAD'])
    const cfg = fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8')
    fs.chmodSync(path.join(root, '.prdt'), 0o555)
    let r
    try { r = prdt(root, ['layout', 'migrate', '--apply']) } finally { fs.chmodSync(path.join(root, '.prdt'), 0o755) }
    expect(r.code).toBe(1)
    expect(r.out).toBe([
      '1/9 선행 검사를 통과했어요',
      '2/9 옮길 문서 20개의 목록을 만들었어요',
      '3/9 닫힌 PRD 1개의 shasum 을 적었어요',
      '4/9 옮기기 실패: 문서 20개를 옮길 수 없어요 (Permission denied)',
      '',
      'docs 폴더는 예전 구조 그대로예요.',
      '',
      '다음: 괄호 안 원인을 고친 뒤 다시 실행하세요.',
      '',
    ].join('\n'))
    expect(snapshot(root)).toEqual(before)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
    expect(git(root, ['status', '--short', '--', 'docs'])).toBe('')
    expect(fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8')).toBe(cfg)
    expect(fs.existsSync(path.join(root, '.prdt/layout-apply.inprogress'))).toBe(false)
    expect(prdt(root, ['layout', 'check']).code).toBe(1)   // still the old layout, retry allowed
  }, 180_000)

  test('config cannot be written (marker already stands) → every move undone, marker gone, meta history untouched', () => {
    const root = legacy()
    const before = snapshot(root)
    const head = git(root, ['rev-parse', 'HEAD'])
    const cfg = fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8')
    const r = pyRun(root, `
real = m.state_write
def fake(root, path, text, *a, **k):
    if str(path).endswith("config.json"):
        raise PermissionError(13, "Permission denied", str(path))
    return real(root, path, text, *a, **k)
m.state_write = fake
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    expect(r.code).toBe(1)
    expect(r.out).toBe([
      '1/9 선행 검사를 통과했어요',
      '2/9 옮길 문서 20개의 목록을 만들었어요',
      '3/9 닫힌 PRD 1개의 shasum 을 적었어요',
      '4/9 문서 20개를 옮겼어요 (git mv, 이력 유지)',
      '5/9 옮기기 실패: .prdt/config.json 을 쓸 수 없어요 (Permission denied)',
      '',
      '되돌렸어요: 옮긴 문서 20개를 원래 자리로 돌렸어요. docs 폴더는 예전 구조 그대로예요.',
      '',
      '다음: .prdt/config.json 의 쓰기 권한을 고친 뒤 다시 실행하세요.',
      '',
    ].join('\n'))
    // the rollback's index rebuild may regenerate the derived wiki/index.md (with a writable .prdt); it is not a document
    const { 'wiki/index.md': _a, ...afterDocs } = snapshot(root)
    const { 'wiki/index.md': _b, ...beforeDocs } = before
    expect(afterDocs).toEqual(beforeDocs)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
    expect(git(root, ['status', '--short', '--', 'docs', ':!docs/wiki/index.md'])).toBe('')
    expect(fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8')).toBe(cfg)
    expect(fs.existsSync(path.join(root, '.prdt/layout-apply.inprogress'))).toBe(false)
    expect(prdt(root, ['layout', 'check']).code).toBe(1)
  }, 180_000)

  test('a failure after the meta commit (step 8) drops the commit too', () => {
    const root = legacy()
    const before = snapshot(root)
    const head = git(root, ['rev-parse', 'HEAD'])
    const r = pyRun(root, `
real = m._lay_git
def fake(root, args, stdin=None):
    res = real(root, args, stdin)
    if args[:1] == ["commit"]:
        import subprocess
        return subprocess.CompletedProcess(args, 1, "", "forced after commit")
    return res
m._lay_git = fake
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    // the forged failure leaves the real commit in place only if rollback forgot it
    expect(r.code).toBe(1)
    expect(r.out).toContain('8/9 옮기기 실패: meta 커밋 1개를 만들 수 없어요 (forced after commit)')
    expect(r.out).toContain('다음: 괄호 안 git 오류를 고친 뒤 다시 실행하세요.')
    expect(snapshot(root)).toEqual(before)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
  }, 180_000)
})

describe('PARTIAL — the rollback itself fails', () => {
  test('reports what is left, then refuses to run again; doctor and check name it', () => {
    const root = legacy()
    const r = pyRun(root, `
real = m._lay_rename
def fake(src, dst):
    if str(src).endswith("docs/proj/tickets"):
        raise PermissionError(13, "Permission denied", str(src))
    real(src, dst)
m._lay_rename = fake
def sw(root, path, text, **k):
    if Path(path).name == "config.json":
        raise PermissionError(13, "Permission denied", str(path))
    return real_sw(root, path, text, **k)
real_sw = m.state_write
m.state_write = sw
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    expect(r.code).toBe(2)
    expect(r.out).toBe([
      '1/9 선행 검사를 통과했어요',
      '2/9 옮길 문서 20개의 목록을 만들었어요',
      '3/9 닫힌 PRD 1개의 shasum 을 적었어요',
      '4/9 문서 20개를 옮겼어요 (git mv, 이력 유지)',
      '5/9 옮기기 실패: .prdt/config.json 을 쓸 수 없어요 (Permission denied)',
      '',
      '되돌리기 실패: 문서 20개 중 3개를 원래 자리로 돌리지 못했어요 (Permission denied)',
      '  docs/proj/tickets/backlog/T-003.md',
      '  docs/proj/tickets/v0.0/T-002.md',
      '  docs/proj/tickets/v0.1/T-001.md',
      '',
      'PARTIAL docs 폴더 일부만 새 구조예요. 문서 3개는 새 자리(docs/proj/)에 남았고, 나머지 17개는 예전 자리로 돌아왔어요.',
      '',
      PARTIAL_NEXT,
      '',
    ].join('\n'))
    // the leftover is what `check` and doctor see
    const chk = prdt(root, ['layout', 'check'])
    expect(chk.code).toBe(2)
    expect(chk.out).toBe(`✗ ${PARTIAL_LINE(17)}\n\n${PARTIAL_NEXT}\n`)
    expect(prdt(root, ['doctor']).out).toContain(`✗ ${PARTIAL_LINE(17)}\n`)
    const again = prdt(root, ['layout', 'migrate', '--apply'])
    expect(again.code).toBe(1)
    expect(again.out).toBe(`옮기지 않았어요: ${PARTIAL_LINE(17)}.\n\n${PARTIAL_NEXT}\n`)
  }, 180_000)
})

describe('QA grill fixes (T-1103)', () => {
  test('an unexpected exception mid --apply rolls back like any failure', () => {
    const root = legacy()
    const before = snapshot(root)
    const head = git(root, ['rev-parse', 'HEAD'])
    const cfg = fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8')
    const r = pyRun(root, `
def boom(*a, **k): raise ValueError("forged")
m.build_artifact_manifest = boom
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    expect(r.code).toBe(1)
    expect(r.out).toContain('6/9 옮기기 실패: 예상하지 못한 오류예요 (forged)')
    expect(r.out).toContain('되돌렸어요')
    expect(snapshot(root)).toEqual(before)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
    expect(git(root, ['status', '--short', '--', 'docs'])).toBe('')
    expect(fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8')).toBe(cfg)
    expect(prdt(root, ['layout', 'check']).code).toBe(1)
  }, 180_000)

  test('KeyboardInterrupt mid --apply rolls back', () => {
    const root = legacy()
    const before = snapshot(root)
    const r = pyRun(root, `
real = m.rebuild_index
calls = []
def boom(*a, **k):
    if not calls:
        calls.append(1); raise KeyboardInterrupt()
    return real(*a, **k)
m.rebuild_index = boom
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    expect(r.code).toBe(1)
    expect(r.out).toContain('옮기기 실패: 중단됐어요')
    expect(snapshot(root)).toEqual(before)
  }, 180_000)

  test('rollback restores a tracked .DS_Store (index and bytes) and an untracked one', () => {
    const root = legacy()
    write(path.join(root, 'docs/wiki/.DS_Store'), 'junk')
    git(root, ['add', '-f', 'docs/wiki/.DS_Store'])
    git(root, ['commit', '-qm', 'ds'])
    const before = snapshot(root)
    const head = git(root, ['rev-parse', 'HEAD'])
    const r = pyRun(root, `
def boom(*a, **k): raise ValueError("forged")
m.build_artifact_manifest = boom
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    expect(r.code).toBe(1)
    expect(snapshot(root)).toEqual(before)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
    expect(git(root, ['status', '--short', '--', 'docs'])).toBe('')
  }, 180_000)

  test('a killed --apply (staged renames, no commit) reads as partial in check, doctor and migrate', () => {
    const root = legacy()
    pyRun(root, `
m.rebuild_index = lambda *a, **k: os._exit(137)
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    expect(fs.existsSync(path.join(root, 'docs/_shared'))).toBe(true)
    const chk = prdt(root, ['layout', 'check'])
    expect(chk.code).toBe(2)
    expect(chk.out).toMatch(/^✗ docs 폴더 일부만 새 구조예요/)
    expect(prdt(root, ['doctor']).out).toMatch(/^✗ docs 폴더 일부만 새 구조예요/m)
    const again = prdt(root, ['layout', 'migrate', '--apply'])
    expect(again.code).toBe(1)
    expect(again.out).toContain('옮기지 않았어요: docs 폴더 일부만 새 구조예요')
  }, 180_000)

  test('a committed .DS_Store left in docs/wiki goes with the old folder', () => {
    const root = legacy()
    write(path.join(root, 'docs/wiki/.DS_Store'), 'junk')
    git(root, ['add', '-f', 'docs/wiki/.DS_Store'])
    git(root, ['commit', '-qm', 'ds'])
    const r = prdt(root, ['layout', 'migrate', '--apply'])
    expect(r.code).toBe(0)
    expect(fs.existsSync(path.join(root, 'docs/wiki'))).toBe(false)
    expect(prdt(root, ['layout', 'check']).code).toBe(0)
    expect(git(root, ['status', '--short', '--', 'docs'])).toBe('')
  }, 180_000)

  test('doctor discipline-path citations follow the move (As-Is docs/… → To-Be)', () => {
    const root = legacy()
    write(path.join(root, 'docs/design.md'), '# design\n\nsee `docs/po/habit.md` and `docs/po/bookshelf/x.md`\n')
    write(path.join(root, 'docs/po/bookshelf/x.md'), '# x\n')
    git(root, ['add', '-A', '-f', 'docs']); git(root, ['commit', '-qm', 'cite'])
    expect(prdt(root, ['doctor']).out).not.toContain('discipline-path:')
    const r = prdt(root, ['layout', 'migrate', '--apply'])
    expect(r.out).toContain('9/9 prdt doctor 경로 경고 0개')
    expect(prdt(root, ['doctor']).out).not.toContain('discipline-path:')
  }, 180_000)

  test('doctor prints the same layout line as check in a killed state (old path, never docs/<product>/)', () => {
    const root = legacy()
    pyRun(root, `
m.rebuild_index = lambda *a, **k: os._exit(137)
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    const line = prdt(root, ['layout', 'check']).out.split('\n')[0].replace(/^✗ /, '')
    const doc = prdt(root, ['doctor']).out
    expect(doc).toContain('✗ ' + line)
    expect(line).not.toContain('docs/proj/')
  }, 180_000)
})

describe('layout migrate --undo', () => {
  test('restores a killed --apply (tree, HEAD, config bytes), then check says old', () => {
    const root = legacy()
    write(path.join(root, 'docs/wiki/.DS_Store'), 'junk')
    git(root, ['add', '-f', 'docs/wiki/.DS_Store'])
    git(root, ['commit', '-qm', 'ds'])
    const before = snapshot(root)
    const head = git(root, ['rev-parse', 'HEAD'])
    const cfg = fs.readFileSync(path.join(root, '.prdt/config.json'))
    pyRun(root, `
m.rebuild_index = lambda *a, **k: os._exit(137)
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    expect(prdt(root, ['layout', 'check']).code).toBe(2)
    const r = prdt(root, ['layout', 'migrate', '--undo'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('되돌렸어요')
    expect(snapshot(root)).toEqual(before)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
    expect(fs.readFileSync(path.join(root, '.prdt/config.json')).equals(cfg)).toBe(true)
    expect(git(root, ['status', '--short', '--', 'docs', '.prdt/config.json'])).toBe('')
    expect(prdt(root, ['layout', 'check']).code).toBe(1)
    expect(prdt(root, ['layout', 'migrate', '--apply']).code).toBe(0)
  }, 240_000)

  test('refuses on an old project and on a finished new project', () => {
    const root = legacy()
    const before = snapshot(root)
    const old = prdt(root, ['layout', 'migrate', '--undo'])
    expect(old.code).toBe(1)
    expect(old.out).toContain('되돌리지 않았어요')
    expect(snapshot(root)).toEqual(before)
    expect(prdt(root, ['layout', 'migrate', '--apply']).code).toBe(0)
    const after = snapshot(root)
    const head = git(root, ['rev-parse', 'HEAD'])
    const done = prdt(root, ['layout', 'migrate', '--undo'])
    expect(done.code).toBe(1)
    expect(done.out).toContain('되돌리지 않았어요')
    expect(snapshot(root)).toEqual(after)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
  }, 240_000)
})

// ── T-1117: the approved copy for every string outside the screen set ─────────────────────
const REFUSED = (why: string, next: string, tail = ' docs 폴더는 예전 구조 그대로예요.') =>
  `옮기지 않았어요: ${why}.${tail}\n\n다음: ${next}\n`

describe('T-1117 copy — check / none / refusals', () => {
  test('A4 · A5: no old structure to find', () => {
    const root = legacy()
    fs.rmSync(path.join(root, 'docs/prd'), { recursive: true })
    fs.rmSync(path.join(root, 'docs/tickets'), { recursive: true })
    git(root, ['add', '-A', '-f', '--', 'docs'])
    git(root, ['commit', '-qm', 'drop'])
    const c = prdt(root, ['layout', 'check'])
    expect(c.code).toBe(0)
    expect(c.out).toBe('docs 폴더에서 예전 구조를 찾지 못했어요.\n\n다음: 옮길 문서가 있다면 PO 에게 알리세요.\n')
    const m = prdt(root, ['layout', 'migrate'])
    expect(m.code).toBe(0)
    expect(m.out).toBe('docs 폴더에서 예전 구조를 찾지 못해서 아무것도 옮기지 않았어요.\n\n다음: 옮길 문서가 있다면 PO 에게 알리세요.\n')
  }, 120_000)

  test('R1: several products (the PO wording: 제품 여럿), also in the preview', () => {
    const root = legacy()
    const cfgPath = path.join(root, '.prdt/config.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    cfg.lines = [{ name: 'mobile' }]
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
    const expected = REFUSED('이 프로젝트는 제품 여럿을 써서 아직 옮길 수 없어요', 'PO 에게 알리세요. 옮기기를 지원할 때까지 예전 구조로 써도 돼요.')
    for (const args of [['layout', 'migrate'], ['layout', 'migrate', '--apply']]) {
      const r = prdt(root, args)
      expect(r.code).toBe(1)
      expect(r.out).toBe(expected)
    }
    expect(expected).not.toContain('릴리스 줄')
  }, 120_000)

  test('R2: docs is a link', () => {
    const root = legacy()
    fs.renameSync(path.join(root, 'docs'), path.join(root, 'docs-real'))
    fs.symlinkSync('docs-real', path.join(root, 'docs'))
    const r = prdt(root, ['layout', 'migrate', '--apply'])
    expect(r.code).toBe(1)
    expect(r.out).toBe(REFUSED('docs 가 실제 폴더가 아니라 링크예요', 'docs 링크를 실제 폴더로 바꾼 뒤 다시 실행하세요.', ' docs 안의 문서는 예전 구조 그대로예요.'))
  }, 120_000)

  test('R3 · R4 · R5: meta git missing / unusable / unreadable', () => {
    const root = legacy()
    const gd = path.join(root, '.prdt', 'meta.git')
    const read = pyRun(root, `
real = m._lay_git
def fake(root, args, stdin=None):
    if args[:1] == ["status"]:
        import subprocess
        return subprocess.CompletedProcess(args, 128, "", "fatal: bad index file sha1 signature\\nmore")
    return real(root, args, stdin)
m._lay_git = fake
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    expect(read.code).toBe(1)
    expect(read.out).toBe(REFUSED('meta git 의 변경 목록을 읽을 수 없어요 (fatal: bad index file sha1 signature)', '괄호 안 git 오류를 고친 뒤 다시 실행하세요.'))
    fs.renameSync(path.join(gd, 'config'), path.join(tmp, `cfg-${seq}`))
    fs.symlinkSync(path.join(tmp, `cfg-${seq}`), path.join(gd, 'config'))
    const unusable = prdt(root, ['layout', 'migrate', '--apply'])
    expect(unusable.code).toBe(1)
    expect(unusable.out).toBe(REFUSED('meta git 을 쓸 수 없어요 (.prdt/meta.git/config is a symbolic link)', 'prdt doctor 가 알려 주는 대로 meta git 을 고친 뒤 다시 실행하세요.'))
    fs.rmSync(gd, { recursive: true, force: true })
    const missing = prdt(root, ['layout', 'migrate', '--apply'])
    expect(missing.code).toBe(1)
    expect(missing.out).toBe(REFUSED('meta git 이 없어요', 'PO 에게 meta git 만들기를 요청한 뒤 다시 실행하세요.'))
  }, 120_000)
})

describe('T-1117 copy — apply failures', () => {
  const FAIL_NEXT = '\n다음: 괄호 안 원인을 고친 뒤 다시 실행하세요.\n'
  const apply = (root: string, patch: string) => pyRun(root, `${patch}
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)

  test('F3: an unreadable closed PRD names the file; nothing moved', () => {
    const root = legacy()
    const before = snapshot(root)
    const r = apply(root, `
real = m._lay_hash
def fake(root, rels):
    return real(root, [rels[0] + ".nope"])
m._lay_hash = fake`)
    expect(r.code).toBe(1)
    expect(r.out).toContain('3/9 옮기기 실패: 닫힌 PRD docs/prd/versions/v0.0.md.nope 를 읽을 수 없어요 (No such file or directory)\n\ndocs 폴더는 예전 구조 그대로예요.\n' + FAIL_NEXT)
    const after = snapshot(root)   // (the derived wiki/index.md is regenerated by any rollback)
    delete after['wiki/index.md']; delete before['wiki/index.md']
    expect(after).toEqual(before)
  }, 120_000)

  test('F4: a move fails (count, cause pointer); the moved part is put back', () => {
    const root = legacy()
    const before = snapshot(root)
    const r = apply(root, `
real = m._lay_rename
calls = []
def fake(src, dst):
    calls.append(1)
    if len(calls) == 2:
        raise OSError(17, "File exists", str(dst))
    real(src, dst)
m._lay_rename = fake`)
    expect(r.code).toBe(1)
    expect(r.out).toContain('4/9 옮기기 실패: 문서 20개를 옮길 수 없어요 (File exists)\n')
    expect(r.out).toContain('되돌렸어요: 옮긴 문서')
    expect(r.out.endsWith(FAIL_NEXT)).toBe(true)
    // (the derived wiki/index.md is regenerated by a step-4 rollback; every document is back)
    const after = snapshot(root)
    delete after['wiki/index.md']; delete before['wiki/index.md']
    expect(after).toEqual(before)
  }, 120_000)

  test('F6 · F6a · F6b: derived files cannot be rebuilt', () => {
    const root = legacy()
    write(path.join(root, 'docs/artifacts/v0.1/manifest.json'), '{}\n')
    git(root, ['add', '-A', '-f', '--', 'docs']); git(root, ['commit', '-qm', 'bucket manifest'])
    const a = prdt(root, ['layout', 'migrate', '--apply'])
    expect(a.code).toBe(1)
    expect(a.out).toContain('6/9 옮기기 실패: 산출물 목록 · 인덱스 · 위키 index.md 를 다시 만들 수 없어요 (artifacts 폴더에 버킷별 manifest 가 남아 있어요)\n')
    expect(a.out.endsWith('\n다음: prdt artifacts migrate 를 먼저 실행한 뒤 다시 실행하세요.\n')).toBe(true)
    fs.rmSync(path.join(root, 'docs/artifacts/v0.1/manifest.json'))
    write(path.join(root, 'docs/artifacts/manifest.json'), 'not json\n')
    git(root, ['add', '-A', '-f', '--', 'docs']); git(root, ['commit', '-qm', 'bad manifest'])
    const b = prdt(root, ['layout', 'migrate', '--apply'])
    expect(b.code).toBe(1)
    expect(b.out).toMatch(/6\/9 옮기기 실패: 산출물 목록 · 인덱스 · 위키 index\.md 를 다시 만들 수 없어요 \(artifacts manifest 를 읽을 수 없어요: .+\)\n/)
    expect(b.out.endsWith(FAIL_NEXT)).toBe(true)
    // the F6 generic cause pointer
    const c = apply(legacy(), `
def boom(*a, **k): raise OSError(28, "No space left on device")
m.rebuild_index = boom`)
    expect(c.out).toContain('(No space left on device)\n')
    expect(c.out.endsWith(FAIL_NEXT)).toBe(true)
  }, 240_000)

  test('F7a · F7b: closed PRD unreadable / changed after the move', () => {
    const readFail = apply(legacy(), `
real = m._lay_hash
calls = []
def fake(root, rels):
    calls.append(1)
    return real(root, [rels[0] + ".nope"]) if len(calls) == 2 else real(root, rels)
m._lay_hash = fake`)
    expect(readFail.code).toBe(1)
    expect(readFail.out).toContain('7/9 옮기기 실패: 닫힌 PRD docs/proj/prd/versions/v0.0.md.nope 를 읽을 수 없어요 (No such file or directory)\n')
    expect(readFail.out).toContain('되돌렸어요')
    expect(readFail.out.endsWith(FAIL_NEXT)).toBe(true)
    const changed = apply(legacy(), `
real = m._lay_hash
calls = []
def fake(root, rels):
    calls.append(1)
    out = real(root, rels)
    return {k: "0" * 64 for k in out} if len(calls) == 2 else out
m._lay_hash = fake`)
    expect(changed.code).toBe(1)
    expect(changed.out).toContain('7/9 옮기기 실패: 닫힌 PRD 1개의 shasum 이 옮기기 전과 달라요 (docs/prd/versions/v0.0.md)\n')
    expect(changed.out).toContain('되돌렸어요')
    expect(changed.out.endsWith('\n다음: PO 에게 알리세요. 닫힌 PRD 는 그대로 돌려놨고, 도구를 고친 뒤 다시 옮길 수 있어요.\n')).toBe(true)
  }, 240_000)

  test('H1 · H2 · H3 help text is Korean and carries no ticket number', () => {
    const flat = (s: string) => s.replace(/\s+/g, ' ')
    const h = flat(prdt(tmp, ['layout', '--help']).out)
    expect(h).toContain('migrate: 목록을 확인한 뒤 실제로 옮겨요 (이 옵션이 없으면 아무것도 쓰지 않아요)')
    expect(h).toContain('check: machine mode')
    const all = flat(prdt(tmp, ['--help']).out)
    expect(all).toContain('docs 폴더 구조: migrate: 예전 구조에서 새 구조로 옮길 목록을 보여요 (아무것도 쓰지 않아요)')
    expect(all).not.toContain('docs layout (T-1103)')
  }, 60_000)
})

describe('T-1103 round 4 — SIGKILL after the first rename, --undo copy, hot-path cost', () => {
  const killAfterFirstRename = (root: string) => pyRun(root, `
real = m._lay_rename
def fake(src, dst):
    real(src, dst)
    os._exit(137)
m._lay_rename = fake
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)

  test('killed right after the first rename: partial in check, doctor and migrate; --undo restores it', () => {
    const root = legacy()
    const before = snapshot(root)
    const head = git(root, ['rev-parse', 'HEAD'])
    const cfg = fs.readFileSync(path.join(root, '.prdt/config.json'))
    expect(killAfterFirstRename(root).code).toBe(137)
    // the shape: docs/<product>/ exists, docs/_shared not yet, the old path deleted but uncommitted
    expect(fs.existsSync(path.join(root, 'docs/proj/DEPLOY.md'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'docs/_shared'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'docs/DEPLOY.md'))).toBe(false)
    expect(git(root, ['status', '--short', '--', 'docs'])).toContain('DEPLOY.md')
    const line = PARTIAL_LINE(19)
    const chk = prdt(root, ['layout', 'check'])
    expect(chk.code).toBe(2)
    expect(chk.out).toBe(`✗ ${line}\n\n${PARTIAL_NEXT}\n`)
    expect(prdt(root, ['doctor']).out).toContain(`✗ ${line}\n`)
    const again = prdt(root, ['layout', 'migrate', '--apply'])
    expect(again.code).toBe(1)
    expect(again.out).toBe(`옮기지 않았어요: ${line}.\n\n${PARTIAL_NEXT}\n`)
    const undo = prdt(root, ['layout', 'migrate', '--undo'])
    expect(undo.code).toBe(0)
    expect(undo.out).toBe('되돌렸어요: 옮기다 만 문서 1개를 원래 자리로 돌렸어요. docs 폴더는 예전 구조 그대로예요.\n\n다음: 다시 옮기려면 prdt layout migrate --apply 를 실행하세요.\n')
    expect(snapshot(root)).toEqual(before)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
    expect(fs.readFileSync(path.join(root, '.prdt/config.json')).equals(cfg)).toBe(true)
    expect(git(root, ['status', '--short', '--', 'docs', '.prdt/config.json'])).toBe('')
    expect(prdt(root, ['layout', 'check']).code).toBe(1)
    expect(prdt(root, ['layout', 'migrate', '--apply']).code).toBe(0)
  }, 300_000)

  test('a docs/<product>/ folder with no deleted old path stays "old" (the name-clash refusal still applies)', () => {
    const root = legacy()
    write(path.join(root, 'docs/proj/note.md'), 'x\n')
    expect(prdt(root, ['layout', 'check']).code).toBe(1)
  }, 120_000)

  test('a PARTIAL left by a rollback that failed is recoverable with --undo', () => {
    const root = legacy()
    const before = snapshot(root)
    const head = git(root, ['rev-parse', 'HEAD'])
    const r = pyRun(root, `
real = m._lay_rename
def fake(src, dst):
    if str(src).endswith("docs/proj/tickets"):
        raise PermissionError(13, "Permission denied", str(src))
    real(src, dst)
m._lay_rename = fake
def boom(*a, **k): raise ValueError("forged")
m.build_artifact_manifest = boom
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    expect(r.code).toBe(2)
    expect(r.out).toContain(PARTIAL_NEXT)
    expect(prdt(root, ['layout', 'check']).code).toBe(2)
    const undo = prdt(root, ['layout', 'migrate', '--undo'])
    expect(undo.code).toBe(0)
    expect(snapshot(root)).toEqual(before)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
    expect(prdt(root, ['layout', 'check']).code).toBe(1)
  }, 300_000)

  test('--undo refusals: same voice, a 다음: action each', () => {
    const root = legacy()
    expect(prdt(root, ['layout', 'migrate', '--undo']).out).toBe(
      '되돌리지 않았어요: docs 폴더가 예전 구조라 되돌릴 것이 없어요.\n\n다음: 옮기려면 prdt layout migrate 로 옮길 목록을 확인하세요.\n')
    fs.mkdirSync(path.join(root, 'docs/_shared'))   // half-moved by shape, nothing deleted: no trace to undo
    expect(prdt(root, ['layout', 'migrate', '--undo']).out).toBe(
      '되돌리지 않았어요: 옮기다 멈춘 문서를 찾지 못했어요. docs 폴더는 그대로예요.\n\n다음: prdt layout check 로 상태를 확인하고, 일부만 새 구조라고 나오면 PO 에게 알리세요.\n')
    const done = legacy()
    expect(prdt(done, ['layout', 'migrate', '--apply']).code).toBe(0)
    expect(prdt(done, ['layout', 'migrate', '--undo']).out).toBe(
      '되돌리지 않았어요: docs 폴더가 이미 새 구조로 끝나서 되돌릴 수 없어요.\n\n다음: 예전 구조로 돌아가려면 PO 에게 알리세요.\n')
    // T-1123: `--undo` cannot run here (nothing uncommitted), so `다음:` must not offer it
    const nothing = legacy()
    fs.mkdirSync(path.join(nothing, 'docs/_shared'))
    const chk = prdt(nothing, ['layout', 'check'])
    expect(chk.code).toBe(2)
    expect(chk.out).toContain(PARTIAL_NEXT_BASE)
    expect(chk.out).not.toContain('--undo')
    expect(prdt(nothing, ['layout', 'migrate', '--apply']).out).not.toContain('--undo')
  }, 240_000)

  test('a plain command in a new-layout project never asks meta git about layout (hot path stays git-free)', () => {
    const root = legacy()
    expect(prdt(root, ['layout', 'migrate', '--apply']).code).toBe(0)
    const r = pyRun(root, `
def boom(*a, **k): raise AssertionError("layout probed meta git on the hot path")
m._lay_git = boom
sys.argv = ["prdt", "tickets"]
m.main()`)
    expect(r.err).not.toContain('layout probed meta git')
    expect(r.code).toBe(0)
  }, 180_000)
})

// ── T-1105 round 3: the in-progress marker — every killed --apply is partial, undoable ──────
describe('T-1105 in-progress marker — kill windows (bare `prdt init` and seeded projects)', () => {
  const MARKER = (root: string) => path.join(root, '.prdt', 'layout-apply.inprogress')
  const PARTIAL_HEAD = /^✗ docs 폴더 일부만 새 구조예요\. 문서 \d+개가 아직 예전 구조예요/

  /** A project exactly as a bare `prdt init` leaves it: empty untracked docs/artifacts · prd · tickets, tracked wiki. */
  function bare(): string {
    const root = path.join(tmp, `b${++seq}`)
    fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
    expect(prdt(root, ['init', '--json', '--slug', 'proj', '--yes']).code).toBe(0)
    expect(git(root, ['status', '--short', '--', 'docs'])).toBe('')
    return root
  }
  const KILL_FIRST_RENAME = `
real = m._lay_rename
def fake(src, dst):
    real(src, dst)
    os._exit(137)
m._lay_rename = fake
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`
  const KILL_AT_COMMIT = `
real = m._lay_git
def fake(root, args, stdin=None):
    if args and args[0] == "commit":
        os._exit(137)
    return real(root, args, stdin)
m._lay_git = fake
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`
  const KILL_AFTER_COMMIT = `
def fake(root):
    os._exit(137)
m._lay_marker_clear = fake
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`

  /** check · json · doctor · session-start block · migrate all agree on "partial"; the marker stands. */
  function expectPartial(root: string) {
    expect(fs.existsSync(MARKER(root))).toBe(true)
    const chk = prdt(root, ['layout', 'check'])
    expect(chk.code).toBe(2)
    expect(chk.out).toMatch(PARTIAL_HEAD)
    expect(chk.out).toContain('prdt layout migrate --undo 로 되돌릴 수 있어요.')
    expect(JSON.parse(prdt(root, ['layout', 'check', '--json']).out).state).toBe('partial')
    expect(prdt(root, ['doctor']).out).toContain(chk.out.split('\n')[0])
    const blk = prdt(root, ['layout', 'check', '--session-start']).out
    expect(blk).toContain("[prdt layout: this project's docs layout is half-moved]")
    expect(blk).toContain('Do NOT propose `prdt layout migrate`')
    expect(blk).not.toContain('목록 보기')
    const again = prdt(root, ['layout', 'migrate', '--apply'])
    expect(again.code).toBe(1)
    expect(again.out).toContain('옮기지 않았어요: docs 폴더 일부만 새 구조예요')
  }
  function expectRestored(root: string, before: Record<string, string>, head: string, cfg: Buffer) {
    expect(snapshot(root)).toEqual(before)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
    expect(fs.readFileSync(path.join(root, '.prdt/config.json')).equals(cfg)).toBe(true)
    expect(git(root, ['status', '--short', '--', 'docs', '.prdt/config.json'])).toBe('')
    expect(fs.existsSync(MARKER(root))).toBe(false)
    expect(fs.existsSync(path.join(root, 'docs/_shared'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'docs/proj'))).toBe(false)
    expect(prdt(root, ['layout', 'check']).code).toBe(1)
  }
  function snap(root: string) {
    return { before: snapshot(root), head: git(root, ['rev-parse', 'HEAD']), cfg: fs.readFileSync(path.join(root, '.prdt/config.json')) }
  }
  function undoAndReapply(root: string) {
    const { before, head, cfg } = snap0.get(root)!
    const undo = prdt(root, ['layout', 'migrate', '--undo'])
    expect(undo.code).toBe(0)
    expect(undo.out).toMatch(/^(되돌렸어요: 옮기다 만 문서 [1-9]\d*개를 원래 자리로|docs 폴더는 예전 구조 그대로예요\.)/)   // nothing but empty folders moved → the plain line, never "0개"
    expect(undo.out).not.toContain('문서 0개')
    expectRestored(root, before, head, cfg)
    expect(prdt(root, ['layout', 'migrate', '--apply']).code).toBe(0)
    expect(fs.existsSync(MARKER(root))).toBe(false)
    expect(prdt(root, ['layout', 'check']).code).toBe(0)
    expect(git(root, ['status', '--short', '--', 'docs', '.prdt/config.json'])).toBe('')
  }
  const snap0 = new Map<string, ReturnType<typeof snap>>()
  const prepared = (make: () => string) => { const r = make(); snap0.set(r, snap(r)); return r }

  test('a finished --apply leaves no marker (bare and seeded)', () => {
    for (const make of [bare, legacy]) {
      const root = make()
      expect(prdt(root, ['layout', 'migrate', '--apply']).code).toBe(0)
      expect(fs.existsSync(MARKER(root))).toBe(false)
      expect(prdt(root, ['layout', 'check']).code).toBe(0)
    }
  }, 300_000)

  test('the marker stands before the first rename and is written symlink-safe (a planted link is refused, its target untouched)', () => {
    const root = prepared(bare)
    const r = pyRun(root, `
real = m._lay_rename
def fake(src, dst):
    print("MARKER", os.path.isfile(".prdt/layout-apply.inprogress"), m.layout_state(Path(".")))
    return real(src, dst)
m._lay_rename = fake
try:
    m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))
except SystemExit:
    pass`)
    expect(r.out).toContain('MARKER True partial')
    expect(fs.existsSync(MARKER(root))).toBe(false)     // and gone again after the commit
    // a link planted at the marker path: the layout reads partial, --apply refuses, the target is never written
    const bait = path.join(tmp, `bait${++seq}`)
    fs.writeFileSync(bait, 'keep')
    const other = prepared(bare)
    fs.symlinkSync(bait, MARKER(other))
    expect(prdt(other, ['layout', 'migrate', '--apply']).code).toBe(1)
    expect(fs.readFileSync(bait, 'utf8')).toBe('keep')
    expect(snapshot(other)).toEqual(snap0.get(other)!.before)
    const undo = prdt(other, ['layout', 'migrate', '--undo'])
    expect(undo.code).toBe(1)     // T-1125: a link is a non-regular marker — unreadable, so --undo refuses and changes nothing
    expect(fs.lstatSync(MARKER(other))?.isSymbolicLink()).toBe(true)
    expect(fs.readFileSync(bait, 'utf8')).toBe('keep')
  }, 300_000)

  test('shape (b): killed after the first rename of the EMPTY untracked docs/artifacts/ of a bare init → partial, --undo, re-apply', () => {
    const root = prepared(bare)
    expect(pyRun(root, KILL_FIRST_RENAME).code).toBe(137)
    // the shape the disk alone cannot explain: an empty folder moved, nothing tracked deleted, no docs/_shared
    expect(fs.existsSync(path.join(root, 'docs/proj/artifacts'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'docs/artifacts'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'docs/_shared'))).toBe(false)
    expect(git(root, ['status', '--short', '--', 'docs'])).toBe('')
    expectPartial(root)
    undoAndReapply(root)
  }, 300_000)

  test('T-1105: the marker is in BOTH meta exclude defaults and never tracked in the meta repo', () => {
    expect(DEFAULT_META_EXCLUDE).toContain('layout-apply.inprogress')
    const m = /META_EXCLUDE_DEFAULT\s*=\s*\[([^\]]*)\]/.exec(fs.readFileSync(PRDT_CLI, 'utf-8'))
    expect(m![1].split(',').map((x) => x.trim().replace(/^["']|["']$/g, ''))).toContain('layout-apply.inprogress')
    expect(fs.readFileSync(path.join(bare(), '.prdt', 'meta.git', 'info', 'exclude'), 'utf8')).toContain('layout-apply.inprogress')
  }, 300_000)

  test('T-1105: a meta autosave tick after a kill never commits the marker; check stays partial; --undo restores byte-identical', async () => {
    for (const [make, kill] of [[bare, KILL_FIRST_RENAME], [legacy, KILL_FIRST_RENAME], [bare, KILL_AT_COMMIT]] as const) {
      const root = prepared(make)
      expect(pyRun(root, kill).code).toBe(137)
      expect(fs.existsSync(MARKER(root))).toBe(true)
      const headBefore = git(root, ['rev-parse', 'HEAD'])
      const tick = await metaAutosaveTick(root)
      expect(git(root, ['ls-files']).split('\n')).not.toContain('.prdt/layout-apply.inprogress')
      expect(git(root, ['log', '--all', '--name-only', '--format=']).split('\n')).not.toContain('.prdt/layout-apply.inprogress')
      expect(fs.existsSync(MARKER(root))).toBe(true)
      expectPartial(root)
      if (tick.committed) throw new Error(`[${make === bare ? 'bare' : 'legacy'}/${kill === KILL_FIRST_RENAME ? 'first-rename' : 'at-commit'}] ${git(root, ['show', '--stat', '--format=%s', 'HEAD'])} autosave tick committed the half-move (HEAD ${headBefore} -> ${git(root, ['rev-parse', 'HEAD'])})`)
      undoAndReapply(root)
    }
  }, 300_000)

  test('shape (b) on a seeded project: the first rename kill reads partial and undoes', () => {
    const root = prepared(legacy)
    expect(pyRun(root, KILL_FIRST_RENAME).code).toBe(137)
    expectPartial(root)
    undoAndReapply(root)
  }, 300_000)

  test('shape (a): killed at the meta commit (all moved, renames staged) → partial, --undo, re-apply — bare', () => {
    const root = prepared(bare)
    expect(pyRun(root, KILL_AT_COMMIT).code).toBe(137)
    expect(fs.existsSync(path.join(root, 'docs/_shared'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'docs/proj'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'docs/tickets'))).toBe(false)
    expect(git(root, ['diff', '--cached', '--name-only'])).toContain('docs/_shared/wiki/')
    expectPartial(root)
    undoAndReapply(root)
  }, 300_000)

  test('shape (a): killed at the meta commit — seeded', () => {
    const root = prepared(legacy)
    expect(pyRun(root, KILL_AT_COMMIT).code).toBe(137)
    expect(fs.existsSync(path.join(root, 'docs/_shared'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'docs/proj'))).toBe(true)
    expectPartial(root)
    undoAndReapply(root)
  }, 300_000)

  test('shape (a) with the marker as the only evidence: nothing tracked, nothing old on disk → partial, no git for the block', () => {
    const root = prepared(legacy)
    expect(pyRun(root, KILL_AT_COMMIT).code).toBe(137)
    const r = pyRun(root, `
def boom(*a, **k): raise AssertionError("session-start block asked meta git")
m._lay_git = boom
print(m.layout_session_start_block(Path(".")))`)
    expect(r.err).not.toContain('asked meta git')
    expect(r.out).toContain("half-moved")
    expect(r.out).toMatch(/문서 \d+개가 아직 예전 구조예요/)
  }, 300_000)

  // ── T-1125: --undo never resets or rewrites a meta commit (QA grill r4 F1–F4) ──
  const KILL_AT_CONFIG = `
real = m.state_write
def fake(root, path, text, *a, **k):
    if str(path).endswith("config.json"):
        os._exit(137)
    return real(root, path, text, *a, **k)
m.state_write = fake
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`
  const gitId = ['-c', 'user.name=t', '-c', 'user.email=t@t']
  const mk = (name: string) => (name === 'bare' ? bare : legacy)
  const FIXTURES = ['bare', 'seeded'] as const
  /** `--undo` refused: exit 1, the given refusal, and NOTHING changed (tree · HEAD · config · index). */
  function expectUndoRefused(root: string, line: string) {
    const treeBefore = snapshot(root)
    const headBefore = git(root, ['rev-parse', 'HEAD'])
    const cfgBefore = fs.readFileSync(path.join(root, '.prdt/config.json'))
    const statusBefore = git(root, ['status', '--short', '--', 'docs', '.prdt/config.json'])
    const undo = prdt(root, ['layout', 'migrate', '--undo'])
    expect(undo.code).toBe(1)
    expect(undo.out).toContain(line)
    expect(undo.out).not.toContain('되돌렸어요')
    expect(snapshot(root)).toEqual(treeBefore)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(headBefore)
    expect(fs.readFileSync(path.join(root, '.prdt/config.json')).equals(cfgBefore)).toBe(true)
    expect(git(root, ['status', '--short', '--', 'docs', '.prdt/config.json'])).toBe(statusBefore)
  }
  const FINISHED = 'docs 폴더가 이미 새 구조로 끝나서 되돌릴 수 없어요.'

  test('F1: killed after the meta commit, the backup tick pushes it, then --undo: the commit is never reset, the layout reads finished, the backup keeps fast-forwarding', async () => {
    for (const name of FIXTURES) {
      const root = prepared(mk(name))
      expect(pyRun(root, KILL_AFTER_COMMIT).code).toBe(137)
      const layoutCommit = git(root, ['rev-parse', 'HEAD']).trim()
      expect(git(root, ['log', '-1', '--format=%s'])).toContain('product-first docs layout')
      expect(fs.existsSync(MARKER(root))).toBe(true)
      // the real backup tick (marker standing) pushes the layout commit to a bare remote
      const bareRemote = fs.mkdtempSync(path.join(tmp, `bk${++seq}-`))
      spawnSync('git', ['init', '--bare', '-q', bareRemote])
      const prevHome = process.env.HOME
      process.env.HOME = home
      try {
        git(root, ['remote', 'add', 'backup', networkAlias(bareRemote, home)])
        const tick = await metaBackupTick(root, { now: new Date('2026-10-13T02:00:00Z') })
        expect(tick.pushed, `${name}: ${JSON.stringify(tick)}`).toBe(true)
        const pushed = spawnSync('git', ['-C', bareRemote, 'for-each-ref', '--format=%(objectname)', 'refs/heads'], { encoding: 'utf8' }).stdout
        expect(pushed.split('\n')).toContain(layoutCommit)
        const treeAfterKill = snapshot(root)
        const cfgAfterKill = fs.readFileSync(path.join(root, '.prdt/config.json'))
        expectUndoRefused(root, FINISHED)
        expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(layoutCommit)
        expect(snapshot(root)).toEqual(treeAfterKill)
        expect(fs.readFileSync(path.join(root, '.prdt/config.json')).equals(cfgAfterKill)).toBe(true)
        expect(fs.existsSync(MARKER(root))).toBe(false)         // settled: the missed unlink
        expect(fs.existsSync(path.join(root, 'docs/_shared'))).toBe(true)
        expect(prdt(root, ['layout', 'check']).code).toBe(0)
        // the backup never sees a rewritten history: the next commit fast-forwards
        write(path.join(root, 'docs/proj/after.md'), '# after\n')
        git(root, ['add', '-f', 'docs/proj/after.md'])
        git(root, [...gitId, 'commit', '-qm', 'docs: after'])
        const tick2 = await metaBackupTick(root, { now: new Date('2026-10-14T02:00:00Z') })
        expect(tick2.pushed, `${name}: ${JSON.stringify(tick2)}`).toBe(true)
      } finally {
        process.env.HOME = prevHome
      }
    }
  }, 300_000)

  test('F1/F2: the marker over the layout commit settles to "new" for check, --apply and --undo alike (never moves docs back)', () => {
    for (const name of FIXTURES) {
      const root = prepared(mk(name))
      expect(pyRun(root, KILL_AFTER_COMMIT).code).toBe(137)
      const j = JSON.parse(prdt(root, ['layout', 'check', '--json']).out)
      expect(j).toMatchObject({ state: 'new', docs: 0 })
      expect(fs.existsSync(MARKER(root))).toBe(false)
      const done = prdt(root, ['layout', 'check'])
      expect(done.code).toBe(0)
      expect(done.out).toBe('docs 폴더가 이미 새 구조예요 (docs/_shared · docs/proj).\n')

      const again = prepared(mk(name))
      expect(pyRun(again, KILL_AFTER_COMMIT).code).toBe(137)
      const apply = prdt(again, ['layout', 'migrate', '--apply'])
      expect(apply.code).toBe(0)
      expect(apply.out).toBe('docs 폴더가 이미 새 구조예요 (docs/_shared · docs/proj). 옮길 문서가 없어서 아무것도 하지 않았어요.\n')
      expect(fs.existsSync(MARKER(again))).toBe(false)
    }
  }, 300_000)

  test('F2: killed after the commit AND another commit on top: --undo refuses, nothing moves back, config keeps the new layout', () => {
    for (const name of FIXTURES) {
      const root = prepared(mk(name))
      expect(pyRun(root, KILL_AFTER_COMMIT).code).toBe(137)
      write(path.join(root, 'docs/proj/extra.md'), '# extra\n')
      git(root, ['add', '-f', 'docs/proj/extra.md'])
      git(root, [...gitId, 'commit', '-qm', 'docs: extra'])
      const top = git(root, ['rev-parse', 'HEAD']).trim()
      const cfg = fs.readFileSync(path.join(root, '.prdt/config.json'))
      expectUndoRefused(root, FINISHED)
      expect(git(root, ['rev-parse', 'HEAD']).trim()).toBe(top)
      expect(fs.readFileSync(path.join(root, '.prdt/config.json')).equals(cfg)).toBe(true)
      expect(fs.existsSync(path.join(root, 'docs/proj/extra.md'))).toBe(true)
      expect(fs.existsSync(path.join(root, 'docs/tickets'))).toBe(false)
      expect(fs.existsSync(MARKER(root))).toBe(false)
      expect(prdt(root, ['layout', 'check']).code).toBe(0)
    }
  }, 300_000)

  test('guard declined (a foreign HEAD over a half-move, never the layout commit): --undo refuses and changes nothing — no fall-through', () => {
    for (const name of FIXTURES) {
      const root = prepared(mk(name))
      expect(pyRun(root, KILL_FIRST_RENAME).code).toBe(137)
      git(root, [...gitId, 'commit', '-q', '--allow-empty', '-m', 'chore: foreign']) // HEAD moves, the marker still names the old one
      expect(fs.existsSync(MARKER(root))).toBe(true)
      const chk = prdt(root, ['layout', 'check'])
      expect(chk.code).toBe(2)
      expect(chk.out).not.toContain('--undo')                  // the hint only where --undo can run
      expectUndoRefused(root, '옮기다 멈춘 문서를 찾지 못했어요. docs 폴더는 그대로예요.')
      expect(fs.existsSync(MARKER(root))).toBe(true)
    }
  }, 300_000)

  test('F3: a config edit after the kill survives --undo; the docs still come back; an untouched config is restored byte-identical', () => {
    for (const name of FIXTURES) {
      for (const kill of [KILL_AT_COMMIT, KILL_AT_CONFIG]) {
        const root = prepared(mk(name))
        expect(pyRun(root, kill).code).toBe(137)
        const rec = JSON.parse(fs.readFileSync(MARKER(root), 'utf8'))
        expect(typeof rec.config).toBe('string')                // recorded BEFORE the config write
        const cfgPath = path.join(root, '.prdt/config.json')
        if (kill === KILL_AT_COMMIT) expect(sha(cfgPath)).toBe(rec.config)
        else expect(sha(cfgPath)).not.toBe(rec.config)           // killed before the write: config is as found
        const { before } = snap0.get(root)!
        if (kill === KILL_AT_COMMIT) {
          const edited = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
          edited.userNote = 'edited after the kill'
          fs.writeFileSync(cfgPath, JSON.stringify(edited, null, 2) + '\n')
          const editedBytes = fs.readFileSync(cfgPath)
          const undo = prdt(root, ['layout', 'migrate', '--undo'])
          expect(undo.code).toBe(0)
          expect(fs.readFileSync(cfgPath).equals(editedBytes)).toBe(true)   // the user's edit survives
          expect(snapshot(root)).toEqual(before)                           // docs are back
          expect(fs.existsSync(MARKER(root))).toBe(false)
        } else {
          undoAndReapply(root)                                              // config never changed: nothing to restore, reapply works
        }
      }
    }
  }, 300_000)

  test('F4: partial-line count and check --json agree with the disk; a settled commit reads 0, not the marker count', () => {
    const num = (out: string) => Number(/문서 (\d+)개가 아직 예전 구조예요/.exec(out)![1])
    for (const name of FIXTURES) {
      for (const kill of [KILL_FIRST_RENAME, KILL_AT_COMMIT]) {
        const root = prepared(mk(name))
        expect(pyRun(root, kill).code).toBe(137)
        const chk = prdt(root, ['layout', 'check'])
        const json = JSON.parse(prdt(root, ['layout', 'check', '--json']).out)
        expect(json.state).toBe('partial')
        expect(num(chk.out)).toBe(json.docs)
        const old = ['tickets', 'prd', 'artifacts', 'wiki', 'features', 'po', 'archive']
          .reduce((n, d) => n + walk(path.join(root, 'docs', d)).filter((f) => !f.endsWith('/')).length, 0)
        if (kill === KILL_FIRST_RENAME) expect(json.docs).toBeGreaterThanOrEqual(1)
        else expect(old).toBe(0)
      }
    }
    // the marker's own count is never the number shown: the move is committed, the disk holds nothing old
    const root = prepared(legacy)
    expect(pyRun(root, KILL_AFTER_COMMIT).code).toBe(137)
    const recCount = JSON.parse(fs.readFileSync(MARKER(root), 'utf8')).count
    expect(recCount).toBeGreaterThan(0)
    const blk = prdt(root, ['layout', 'check', '--session-start']).out
    expect(blk).toContain('문서 0개가 아직 예전 구조예요')
    expect(blk).not.toContain(`문서 ${recCount}개`)
    expect(JSON.parse(prdt(root, ['layout', 'check', '--json']).out)).toMatchObject({ state: 'new', docs: 0 })
    expect(prdt(root, ['layout', 'check', '--session-start']).out).toBe('')
  }, 300_000)

  test('--undo never runs a meta reset of a commit (the source has no commit-moving git call in the undo path)', () => {
    const src = fs.readFileSync(PRDT_CLI, 'utf8')
    expect(src).not.toContain('_lay_undo_own_commit')
    const undoBody = src.slice(src.indexOf('def layout_undo('), src.indexOf('def cmd_layout('))
    expect(undoBody).not.toMatch(/"reset",\s*"-q",\s*"--(mixed|hard|soft)"/)
    expect(undoBody).not.toMatch(/\["(commit|update-ref|branch|rebase)"/)
  })

  test('an unreadable marker ({} · garbage · empty · oversize · a directory · no head): --undo refuses and changes nothing — half-moved and W9 (layout commit exists)', () => {
    const REFUSAL = '옮기다 멈춘 문서를 찾지 못했어요. docs 폴더는 그대로예요.'
    const shapes: Array<(m: string) => void> = [
      (m) => fs.writeFileSync(m, '{}\n'),
      (m) => fs.writeFileSync(m, '{garbage'),
      (m) => fs.writeFileSync(m, ''),
      (m) => fs.writeFileSync(m, JSON.stringify({ head: 'a'.repeat(40), pad: 'x'.repeat(5000) })),
      (m) => { fs.rmSync(m); fs.mkdirSync(m) },
      (m) => fs.writeFileSync(m, JSON.stringify({ count: 3, pid: 1 }) + '\n'),
    ]
    for (const kill of [KILL_FIRST_RENAME, KILL_AFTER_COMMIT]) {   // the second is W9: the layout commit exists
      for (const corrupt of shapes) {
        const root = prepared(bare)
        expect(pyRun(root, kill).code).toBe(137)
        expect(fs.existsSync(MARKER(root))).toBe(true)
        corrupt(MARKER(root))
        expect(prdt(root, ['layout', 'check']).code).toBe(2)   // check/doctor still read partial
        expectUndoRefused(root, REFUSAL)
        expect(fs.existsSync(MARKER(root))).toBe(true)
      }
    }
  }, 300_000)

  test('rollback never resets a foreign commit made mid-apply (forced step-7 failure)', () => {
    const root = prepared(legacy)
    const r = pyRun(root, `
real = m._lay_hash
calls = [0]
def fake(root, rels):
    calls[0] += 1
    if calls[0] == 2:
        m._lay_git(root, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "chore: foreign"])
        raise OSError(5, "forced", "x")
    return real(root, rels)
m._lay_hash = fake
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    expect(r.code).toBe(1)
    expect(git(root, ['log', '-1', '--format=%s']).trim()).toBe('chore: foreign')
    expect(fs.existsSync(MARKER(root))).toBe(false)
    expect(snapshot(root)).toEqual(snap0.get(root)!.before)
  }, 300_000)

  test('a failed --apply that rolls back removes the marker; a rollback that cannot finish keeps it, and --undo clears it', () => {
    const root = prepared(legacy)
    const ok = pyRun(root, `
def boom(*a, **k): raise ValueError("forged")
m.build_artifact_manifest = boom
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    expect(ok.code).toBe(1)
    expect(fs.existsSync(MARKER(root))).toBe(false)
    expect(snapshot(root)).toEqual(snap0.get(root)!.before)

    const stuck = prepared(legacy)
    const r = pyRun(stuck, `
real = m._lay_rename
def fake(src, dst):
    if str(src).endswith("docs/proj/tickets"):
        raise PermissionError(13, "Permission denied", str(src))
    real(src, dst)
m._lay_rename = fake
def boom(*a, **k): raise ValueError("forged")
m.build_artifact_manifest = boom
m.cmd_layout(argparse.Namespace(action="migrate", apply=True, json=False))`)
    expect(r.code).toBe(2)
    expect(fs.existsSync(MARKER(stuck))).toBe(true)
    const { before, head, cfg } = snap0.get(stuck)!
    expect(prdt(stuck, ['layout', 'migrate', '--undo']).code).toBe(0)
    expectRestored(stuck, before, head, cfg)
  }, 300_000)

  test('--undo with the marker and nothing moved yet (killed before the first rename): clears it, the tree is as found', () => {
    const root = prepared(bare)
    fs.writeFileSync(MARKER(root), JSON.stringify({ head: git(root, ['rev-parse', 'HEAD']).trim(), count: 3, pid: 1 }) + '\n')
    expect(prdt(root, ['layout', 'check']).code).toBe(2)
    const undo = prdt(root, ['layout', 'migrate', '--undo'])
    expect(undo.code).toBe(0)
    expect(undo.out).toBe('docs 폴더는 예전 구조 그대로예요.\n\n다음: 다시 옮기려면 prdt layout migrate --apply 를 실행하세요.\n')   // an approved line, never "0개를 원래 자리로 돌렸어요"
    const { before, head, cfg } = snap0.get(root)!
    expectRestored(root, before, head, cfg)
  }, 300_000)
})
