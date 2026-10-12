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
    expect(old.out).toBe('docs 폴더가 예전 구조예요. 문서 20개가 제품 폴더 없이 docs/ 바로 아래에 있어요.\n')
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
      '1/9 선행 검사 4개를 통과했어요',
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
    expect(r.out).toContain('옮기지 않았어요: 진행 중인 dispatch 1개가 있어요. docs 폴더는 예전 구조 그대로예요.')
    expect(r.out).toContain('다음: dispatch 가 끝난 뒤 다시 실행하세요.')
    fs.rmSync(runDir, { recursive: true, force: true })
    write(path.join(root, 'docs/proj/note.md'), 'x\n')   // untracked, outside the allowlist: not dirty
    const c = prdt(root, ['layout', 'migrate', '--apply'])
    expect(c.code).toBe(1)
    expect(c.out).toContain('옮기지 않았어요: docs/proj/ 가 이미 있어요. docs 폴더는 예전 구조 그대로예요.')
    expect(fs.existsSync(path.join(root, 'docs/prd/PRD.md'))).toBe(true)
  }, 120_000)
})

describe('failure rolls back (rolled back)', () => {
  test.skipIf(process.getuid?.() === 0)('config cannot be written → every move undone, meta history untouched', () => {
    const root = legacy()
    const before = snapshot(root)
    const head = git(root, ['rev-parse', 'HEAD'])
    const cfg = fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8')
    fs.chmodSync(path.join(root, '.prdt'), 0o555)
    let r
    try { r = prdt(root, ['layout', 'migrate', '--apply']) } finally { fs.chmodSync(path.join(root, '.prdt'), 0o755) }
    expect(r.code).toBe(1)
    expect(r.out).toBe([
      '1/9 선행 검사 4개를 통과했어요',
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
    expect(snapshot(root)).toEqual(before)
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(head)
    expect(git(root, ['status', '--short', '--', 'docs'])).toBe('')
    expect(fs.readFileSync(path.join(root, '.prdt/config.json'), 'utf8')).toBe(cfg)
    expect(prdt(root, ['layout', 'check']).code).toBe(1)   // still the old layout, retry allowed
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
    expect(r.out).toContain('8/9 옮기기 실패: meta 커밋을 만들 수 없어요 (forced after commit)')
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
      '1/9 선행 검사 4개를 통과했어요',
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
      '다음: PO 에게 알리세요. 이 상태에서는 다시 옮기기가 거부되고, prdt doctor 가 같은 오류를 보여요.',
      '',
    ].join('\n'))
    // the leftover is what `check` and doctor see
    const chk = prdt(root, ['layout', 'check'])
    expect(chk.code).toBe(2)
    expect(chk.out).toMatch(/^✗ docs 폴더 일부만 새 구조예요: docs\/_shared\/ 는 새 구조, docs\/\w+\/ 는 예전 구조 \(남은 문서 17개\)\n$/)
    expect(prdt(root, ['doctor']).out).toMatch(/^✗ docs 폴더 일부만 새 구조예요: docs\/_shared\/ 는 새 구조, docs\/\w+\/ 는 예전 구조 \(남은 문서 17개\)$/m)
    const again = prdt(root, ['layout', 'migrate', '--apply'])
    expect(again.code).toBe(1)
    expect(again.out).toContain('옮기지 않았어요: docs 폴더 일부만 새 구조예요')
    expect(again.out).toContain('다음: PO 에게 알리세요.')
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
    const line = prdt(root, ['layout', 'check']).out.trim().replace(/^✗ /, '')
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
