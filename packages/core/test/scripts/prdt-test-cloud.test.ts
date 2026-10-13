// T-1126 `prdt test cloud`: the parts that carry logic — the carve-out (2)
// pre-run check (workflow triggers, GitHub counts, deploy configs), the
// post-read check, the doctor line, the mac-only split, the result condenser,
// and the runner's one push (parentless, one file, exact ref, no overwrite).
// The pty-driven session creation is glue, proven by the real run (ticket log).
import { describe, test, expect, beforeAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const REPO_ROOT = path.resolve(CORE_ROOT, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const RUNNER = path.join(CORE_ROOT, 'scripts', 'prdt-cloud-test.sh')
const CONDENSE = path.join(CORE_ROOT, 'scripts', 'prdt-cloud-condense.mjs')
const SETUP = path.join(REPO_ROOT, '.claude', 'cloud-setup.sh')

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid',
  GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid',
  GIT_CONFIG_NOSYSTEM: '1',
}
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf-8' }).trim()
const tmp = (p: string) => fs.mkdtempSync(path.join(os.tmpdir(), `prdt-t1126-${p}-`))

function py(code: string, cwd: string, env: Record<string, string> = {}): any {
  const script = `
import importlib.util, importlib.machinery, json, sys
loader = importlib.machinery.SourceFileLoader("prdt_mod", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
${code}
`
  const out = execFileSync('python3', ['-c', script], { cwd, env: { ...GIT_ENV, ...env }, encoding: 'utf-8' })
  return JSON.parse(out.trim().split('\n').pop() as string)
}

const PASSING: Array<[string, string]> = [
  ['the repo\'s own workflow', fs.readFileSync(path.join(REPO_ROOT, '.github', 'workflows', 'fresh-install-smoke.yml'), 'utf-8')],
  ['named branches', 'on:\n  push:\n    branches: [main, "release/**"]\njobs: {}\n'],
  ['ignore ci/**', 'on:\n  push:\n    branches-ignore: ["ci/**"]\njobs: {}\n'],
  ['no push at all', 'on: [pull_request, workflow_dispatch]\njobs: {}\n'],
]
const FAILING: Array<[string, string, string]> = [
  ['push with no filter', 'on: push\njobs: {}\n', 'no branch filter'],
  ['push list form', 'on: [push]\njobs: {}\n', 'no branch filter'],
  ['push null', 'on:\n  push:\njobs: {}\n', 'no branch filter'],
  ['tags-only push', 'on:\n  push:\n    tags: ["v*"]\njobs: {}\n', 'no branch filter'],
  ['wildcard branches', 'on:\n  push:\n    branches: ["**"]\njobs: {}\n', 'can match ci/**'],
  ['c-prefixed wildcard', 'on:\n  push:\n    branches: ["c*"]\njobs: {}\n', 'can match ci/**'],
  ['one ticket\'s ci refs', 'on:\n  push:\n    branches: ["ci/T-9/*"]\njobs: {}\n', 'can match ci/**'],
  ['ignore misses ci', 'on:\n  push:\n    branches-ignore: ["wip/**"]\njobs: {}\n', 'does not exclude ci/**'],
  ['ignore too narrow', 'on:\n  push:\n    branches-ignore: ["ci/*"]\njobs: {}\n', 'does not exclude ci/**'],
  ['create trigger', 'on: [create]\njobs: {}\n', 'names `create`'],
  ['delete trigger', 'on:\n  delete:\n  pull_request:\njobs: {}\n', 'names `delete`'],
  ['no on key', 'jobs: {}\n', 'unreadable shape'],
  ['broken yaml', 'on: [push\n', 'unreadable YAML'],
]

describe('pre-run check — workflow triggers (contracts/git.md carve-out (2))', () => {
  // one module load for the whole table: prdt is ~19k lines and each load costs seconds under load
  let v: Record<string, string[]>
  beforeAll(() => {
    const cases = Object.fromEntries([...PASSING, ...FAILING].map(([n, y]) => [n, y]))
    v = py(`cases = json.loads(${JSON.stringify(JSON.stringify(cases))})
print(json.dumps({k: m.cloud_workflow_violations(y, "w.yml") for k, y in cases.items()}))`, os.tmpdir())
  })
  test.each(PASSING.map(([n]) => [n]))('%s passes', (n) => {
    expect(v[n]).toEqual([])
  })
  test.each(FAILING)('%s fails', (n, _yaml, needle) => {
    expect(v[n].length).toBeGreaterThan(0)
    expect(v[n].join('\n')).toContain(needle)
  })
})

describe('pre-run / post-read checks against a stub `gh`', () => {
  let repo: string
  let sha: string
  let bin: string
  let fixtures: string
  beforeAll(() => {
    repo = tmp('pre')
    git(repo, 'init', '-q', '-b', 'main')
    fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true })
    fs.writeFileSync(path.join(repo, '.github', 'workflows', 'ci.yml'),
      'on:\n  push:\n    branches: [main]\njobs: {}\n')
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n')
    git(repo, 'add', '.github', 'a.txt')
    git(repo, 'commit', '-qm', 'c')
    sha = git(repo, 'rev-parse', 'HEAD')
    bin = tmp('bin')
    fixtures = tmp('fx')
    // the stub serves <fixtures>/<path with / and ? → _>.json; a missing file is a 404,
    // a `fail` file makes every call fail like an unreachable GitHub.
    fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/bash
p="$4"; f="${fixtures}/$(printf %s "$p" | tr '/?=&' '____').json"
[ -e "${fixtures}/fail" ] && { echo "error connecting to api.github.com" >&2; exit 1; }
[ -f "$f" ] && { cat "$f"; exit 0; }
echo "gh: Not Found (HTTP 404)" >&2; exit 1
`, { mode: 0o755 })
  })
  const fx = (p: string, body: unknown) =>
    fs.writeFileSync(path.join(fixtures, p.replace(/[/?=&]/g, '_') + '.json'), JSON.stringify(body))
  const clean = () => {
    for (const f of fs.readdirSync(fixtures)) fs.rmSync(path.join(fixtures, f))
    fx('repos/o/r', { default_branch: 'main' })
    fx('repos/o/r/contents/.github/workflows?ref=main', [{ type: 'file', name: 'ci.yml', path: '.github/workflows/ci.yml' }])
    fx('repos/o/r/contents/.github/workflows/ci.yml?ref=main',
      { content: Buffer.from('on:\n  pull_request:\n    branches: [main]\njobs: {}\n').toString('base64') })
    fx('repos/o/r/hooks?per_page=100', [])
    fx('repos/o/r/environments', { total_count: 0, environments: [] })
    fx('repos/o/r/deployments?per_page=100', [])
  }
  const pre = () => py(`print(json.dumps(m.cloud_precheck(m.Path(${JSON.stringify(repo)}), ${JSON.stringify(sha)}, "o/r")))`,
    repo, { PATH: `${bin}:${process.env.PATH}` }) as string[]

  test('a clean repo passes every item', () => {
    clean()
    expect(pre()).toEqual([])
  })

  test('each GitHub count and an unreachable GitHub fail closed, named', () => {
    clean()
    fx('repos/o/r/hooks?per_page=100', [{ id: 1 }])
    fx('repos/o/r/environments', { total_count: 1 })
    fx('repos/o/r/deployments?per_page=100', [{ id: 2 }])
    fx('repos/o/r/contents/.github/workflows/ci.yml?ref=main',
      { content: Buffer.from('on: push\njobs: {}\n').toString('base64') })
    const v = pre().join('\n')
    expect(v).toContain('1 webhook(s)')
    expect(v).toContain('1 environment(s)')
    expect(v).toContain('1 deployment(s)')
    expect(v).toContain('main:.github/workflows/ci.yml: a `push` trigger with no branch filter')
    clean()
    fs.writeFileSync(path.join(fixtures, 'fail'), '')
    expect(pre().join('\n')).toContain('GitHub unreachable or unreadable')
  })

  test('a deploy config in the tested tree fails', () => {
    clean()
    const r2 = tmp('pre2')
    git(r2, 'init', '-q', '-b', 'main')
    fs.mkdirSync(path.join(r2, 'web', '.vercel'), { recursive: true })
    fs.writeFileSync(path.join(r2, 'web', '.vercel', 'project.json'), '{}')
    fs.writeFileSync(path.join(r2, 'netlify.toml'), '')
    git(r2, 'add', '-f', '.')
    git(r2, 'commit', '-qm', 'c')
    const v = py(`print(json.dumps(m.cloud_precheck(m.Path(${JSON.stringify(r2)}), ${JSON.stringify(git(r2, 'rev-parse', 'HEAD'))}, "o/r")))`,
      r2, { PATH: `${bin}:${process.env.PATH}` }).join('\n')
    expect(v).toContain('web/.vercel/project.json')
    expect(v).toContain('netlify.toml')
  })

  test('post-read check: zero everywhere passes; any run, check or status is named', () => {
    clean()
    const c = 'a'.repeat(40)
    fx(`repos/o/r/commits/${c}/check-runs`, { total_count: 0 })
    fx(`repos/o/r/commits/${c}/statuses`, [])
    fx(`repos/o/r/deployments?sha=${c}`, [])
    fx(`repos/o/r/actions/runs?head_sha=${c}`, { total_count: 0 })
    const post = () => py(`print(json.dumps(m.cloud_postcheck("o/r", ${JSON.stringify(c)})))`,
      repo, { PATH: `${bin}:${process.env.PATH}` })
    expect(post()[1]).toEqual([])
    fx(`repos/o/r/actions/runs?head_sha=${c}`, { total_count: 1 })
    fx(`repos/o/r/commits/${c}/statuses`, [{ state: 'pending' }])
    expect(post()[1].join('\n')).toContain('1 workflow runs')
    expect(post()[1]).toHaveLength(2)
  })

  test('doctor names a carve-out-off record and an undeleted ref', () => {
    const st = path.join(repo, '.git', 'prdt-cloud')
    fs.mkdirSync(path.join(st, 'runs'), { recursive: true })
    fs.writeFileSync(path.join(st, 'carve-out-off.json'), JSON.stringify({ ts: 'T', reason: 'GitHub reports 1 workflow runs' }))
    fs.writeFileSync(path.join(st, 'runs', 'r1.json'), JSON.stringify({ ref: 'refs/heads/ci/T-1/s', state: 'read' }))
    fs.writeFileSync(path.join(st, 'runs', 'r2.json'), JSON.stringify({ ref: 'refs/heads/ci/T-1/t', state: 'deleted' }))
    const w = py(`print(json.dumps(m.cloud_test_doctor_warnings(m.Path(${JSON.stringify(repo)}))))`, repo) as string[]
    expect(w).toHaveLength(2)
    expect(w[0]).toContain('carve-out (2) is off')
    expect(w[1]).toContain('refs/heads/ci/T-1/s')
    fs.rmSync(st, { recursive: true })
  })
})

describe('mac-only split is derived from the tested commit', () => {
  test('a file that drives plutil runs on the Mac, the rest in the cloud; --files narrows', () => {
    const repo = tmp('split')
    git(repo, 'init', '-q', '-b', 'main')
    const d = path.join(repo, 'packages', 'core', 'test', 'scripts')
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'a.test.ts'), "execFileSync('plutil', ['-lint'])\n")
    fs.writeFileSync(path.join(d, 'b.test.ts'), 'test("x", () => {})\n')
    fs.writeFileSync(path.join(d, 'helper.ts'), 'plutil\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'c')
    const sha = git(repo, 'rev-parse', 'HEAD')
    expect(py(`print(json.dumps(m.cloud_test_files(m.Path(${JSON.stringify(repo)}), ${JSON.stringify(sha)})))`, repo))
      .toEqual([['test/scripts/b.test.ts'], ['test/scripts/a.test.ts']])
    expect(py(`print(json.dumps(m.cloud_test_files(m.Path(${JSON.stringify(repo)}), ${JSON.stringify(sha)}, ["packages/core/test/scripts/b.test.ts"])))`, repo))
      .toEqual([['test/scripts/b.test.ts'], []])
  })
})

const VITEST_FIXTURE = {
  numTotalTests: 4, numPassedTests: 2, numFailedTests: 1, numPendingTests: 1, numTodoTests: 0,
  testResults: [
    { name: '/w/tree/packages/core/test/a.test.ts', status: 'failed', message: '',
      assertionResults: [
        { fullName: 'a works', status: 'passed', failureMessages: [] },
        { fullName: 'a fails', status: 'failed', failureMessages: ['\u001b[31mAssertionError\u001b[39m: expected 1 to be 2'] },
      ] },
    { name: '/w/tree/packages/core/test/b.test.ts', status: 'failed', message: 'Cannot find module x', assertionResults: [] },
    { name: '/w/tree/packages/core/test/c.test.ts', status: 'passed', message: '',
      assertionResults: [{ fullName: 'c', status: 'passed', failureMessages: [] }] },
  ],
}

describe('result condenser', () => {
  test('counts + failing file/name/message, ANSI stripped, load failures kept', () => {
    const d = tmp('cond')
    fs.writeFileSync(path.join(d, 'v.json'), JSON.stringify(VITEST_FIXTURE))
    const out = JSON.parse(execFileSync('node', [CONDENSE, path.join(d, 'v.json'), '/w/tree/packages/core/', 'ticket=T-1', 'empty='],
      { cwd: d, encoding: 'utf-8' }))
    expect(out).toMatchObject({ status: 'ok', ticket: 'T-1', total: 4, passed: 2, failed: 1, skipped: 1, files: 3, failed_files: 2 })
    expect(out).not.toHaveProperty('empty')
    expect(out.failures).toEqual([
      { file: 'test/a.test.ts', name: 'a fails', message: 'AssertionError: expected 1 to be 2' },
      { file: 'test/b.test.ts', name: '(file)', message: 'Cannot find module x' },
    ])
    const missing = JSON.parse(execFileSync('node', [CONDENSE, path.join(d, 'nope.json'), ''], { cwd: d, encoding: 'utf-8' }))
    expect(missing.status).toBe('error')
  })
})

describe('runner push — one parentless result.json commit to ci/<T-NNN>/<session> only', () => {
  let work: string
  let origin: string
  let session: string
  let sha: string
  let runnerSha: string
  const run = (sess: string, extra: string[] = []) => spawnSync('bash',
    [path.join(session, 'packages/core/scripts/prdt-cloud-test.sh'), '--ticket', 'T-1126', '--sha', sha,
      '--session', sess, '--runner-sha', runnerSha, ...extra],
    { cwd: session, env: { ...GIT_ENV, PRDT_CLOUD_VITEST_JSON: path.join(work, 'v.json'), CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_x' }, encoding: 'utf-8' })
  const refs = () => git(origin, 'for-each-ref', '--format=%(refname)')

  beforeAll(() => {
    work = tmp('run')
    fs.writeFileSync(path.join(work, 'v.json'), JSON.stringify(VITEST_FIXTURE))
    origin = path.join(work, 'origin.git')
    git(work, 'init', '-q', '--bare', '-b', 'main', origin)
    session = path.join(work, 'session')
    git(work, 'clone', '-q', origin, session)
    for (const [src, rel] of [[RUNNER, 'packages/core/scripts/prdt-cloud-test.sh'],
      [CONDENSE, 'packages/core/scripts/prdt-cloud-condense.mjs'], [SETUP, '.claude/cloud-setup.sh']]) {
      fs.mkdirSync(path.dirname(path.join(session, rel)), { recursive: true })
      fs.copyFileSync(src, path.join(session, rel))
    }
    fs.writeFileSync(path.join(session, 'code.txt'), 'tested code\n')
    git(session, 'add', '.')
    git(session, 'commit', '-qm', 'tested')
    git(session, 'push', '-q', 'origin', 'HEAD:refs/heads/main')
    sha = git(session, 'rev-parse', 'HEAD')
    runnerSha = sha
  })

  test('pushes exactly one ref whose commit has no parent and one file', () => {
    const r = run('cse_01AbC.x-y')
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('PRDT_CLOUD_RESULT pushed refs/heads/ci/T-1126/cse_01AbC.x-y status=ok')
    expect(refs().split('\n').sort()).toEqual(['refs/heads/ci/T-1126/cse_01AbC.x-y', 'refs/heads/main'])
    const c = git(origin, 'rev-parse', 'refs/heads/ci/T-1126/cse_01AbC.x-y')
    expect(git(origin, 'cat-file', '-p', c)).not.toMatch(/^parent /m)
    expect(git(origin, 'ls-tree', '--name-only', c)).toBe('result.json')
    const res = JSON.parse(git(origin, 'show', `${c}:result.json`))
    expect(res).toMatchObject({ status: 'ok', ticket: 'T-1126', sha, session: 'cse_01AbC.x-y', session_env: 'cse_x', failed: 1 })
    expect(git(origin, 'tag', '-l')).toBe('')
  })

  test('an existing ref is never overwritten, and the run does not retry elsewhere', () => {
    const before = git(origin, 'rev-parse', 'refs/heads/ci/T-1126/cse_01AbC.x-y')
    const r = run('cse_01AbC.x-y')
    expect(r.status).not.toBe(0)
    expect(r.stdout).toContain('push-failed')
    expect(git(origin, 'rev-parse', 'refs/heads/ci/T-1126/cse_01AbC.x-y')).toBe(before)
    expect(refs().split('\n')).toHaveLength(2)
  })

  test.each([['a b'], ['x..y'], ['a/b'], ['x.lock'], ['a@{b']])('session %j pushes nothing', (bad) => {
    const before = refs()
    const r = run(bad)
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('nothing pushed')
    expect(refs()).toBe(before)
  })

  test('a tested commit missing in the session repo still reports, as an error result', () => {
    const before = refs()
    const r = spawnSync('bash', [path.join(session, 'packages/core/scripts/prdt-cloud-test.sh'), '--ticket', 'T-1126',
      '--sha', 'f'.repeat(40), '--session', 'cse_missing', '--runner-sha', runnerSha],
      { cwd: session, env: GIT_ENV, encoding: 'utf-8' })
    expect(r.status, r.stderr).toBe(0)
    const res = JSON.parse(git(origin, 'show', 'refs/heads/ci/T-1126/cse_missing:result.json'))
    expect(res).toMatchObject({ status: 'error' })
    expect(res.reason).toContain('missing in the session repository')
    expect(refs().split('\n')).toHaveLength(before.split('\n').length + 1)
  })
})
