// T-1126 `prdt test cloud`: the parts that carry logic — the carve-out (2)
// pre-run check (workflow triggers, GitHub counts, deploy configs), the
// post-read check, the leftover read-then-delete, the doctor line, the mac-only
// split, the shard split, the result condenser, the runner's phases (progress
// lines, per-phase limit → error result) and its one push (parentless, one
// file, exact ref, no overwrite).
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
  }, 180_000)
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

  test('a leftover ref is fetched and read before its by-name delete', () => {
    clean()
    const origin = tmp('lo-origin')
    git(origin, 'init', '-q', '--bare', '-b', 'main')
    git(repo, 'remote', 'add', 'origin', origin)
    const ref = 'refs/heads/ci/T-1126/session_left'
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: repo, env: GIT_ENV, encoding: 'utf-8',
      input: JSON.stringify({ status: 'error', phase: 'test', reason: 'the test run passed its 1200s limit' }) }).trim()
    const tree = execFileSync('git', ['mktree'], { cwd: repo, env: GIT_ENV, encoding: 'utf-8',
      input: `100644 blob ${blob}\tresult.json\n` }).trim()
    const c = git(repo, 'commit-tree', tree, '-m', 'r')
    git(repo, 'push', '-q', 'origin', `${c}:${ref}`)
    fx(`repos/o/r/commits/${c}/check-runs`, { total_count: 0 })
    fx(`repos/o/r/commits/${c}/statuses`, [])
    fx(`repos/o/r/deployments?sha=${c}`, [])
    fx(`repos/o/r/actions/runs?head_sha=${c}`, { total_count: 0 })
    const st = path.join(repo, '.git', 'prdt-cloud', 'runs')
    fs.mkdirSync(st, { recursive: true })
    fs.writeFileSync(path.join(st, 'old.json'), JSON.stringify({ ref, state: 'timeout' }))
    fs.writeFileSync(path.join(st, 'other.json'), JSON.stringify({ ref: 'refs/heads/ci/T-1126/never', state: 'timeout' }))
    const notes = py(`print(json.dumps(m._cloud_clean_leftovers(m.Path(${JSON.stringify(repo)}), "o/r")))`,
      repo, { PATH: `${bin}:${process.env.PATH}` }) as string[]
    expect(notes).toHaveLength(1)
    expect(notes[0]).toContain(`leftover ${ref} of run old: read (status=error, phase=test`)
    expect(notes[0]).toContain('deleted')
    expect(git(origin, 'for-each-ref', '--format=%(refname)')).toBe('')
    const rec = JSON.parse(fs.readFileSync(path.join(st, 'old.json'), 'utf-8'))
    expect(rec).toMatchObject({ state: 'deleted', commit: c, result: { status: 'error', phase: 'test' } })
    expect(JSON.parse(fs.readFileSync(path.join(st, 'other.json'), 'utf-8')).state).toBe('absent')
    fs.rmSync(path.join(repo, '.git', 'prdt-cloud'), { recursive: true })
    git(repo, 'remote', 'remove', 'origin')
  })

  test('T-1211: a record whose ref is not ci/T-NNN/<session> is never passed to push --delete — named instead', () => {
    clean()
    const origin = tmp('bad-origin')
    git(origin, 'init', '-q', '--bare', '-b', 'main')
    git(repo, 'remote', 'add', 'origin', origin)
    git(repo, 'push', '-q', 'origin', 'HEAD:refs/heads/main')
    git(repo, 'push', '-q', 'origin', 'HEAD:refs/heads/dev')
    const st = path.join(repo, '.git', 'prdt-cloud', 'runs')
    fs.mkdirSync(st, { recursive: true })
    const bad = ['refs/heads/main', 'refs/heads/dev', 'refs/heads/ci/T-1/../main', 'refs/tags/v1', '-d', 'refs/heads/ci/T-1/a b']
    bad.forEach((ref, i) => fs.writeFileSync(path.join(st, `bad${i}.json`), JSON.stringify({ ref, state: 'timeout' })))
    const notes = py(`print(json.dumps(m._cloud_clean_leftovers(m.Path(${JSON.stringify(repo)}), "o/r")))`,
      repo, { PATH: `${bin}:${process.env.PATH}` }) as string[]
    expect(notes).toHaveLength(bad.length)
    for (const ref of bad) expect(notes.join('\n')).toContain(ref)
    expect(notes.join('\n')).toContain('not a ci/T-NNN ref')
    const refs = git(origin, 'for-each-ref', '--format=%(refname)').split('\n')
    expect(refs).toContain('refs/heads/main')
    expect(refs).toContain('refs/heads/dev')
    fs.rmSync(path.join(repo, '.git', 'prdt-cloud'), { recursive: true })
    git(repo, 'remote', 'remove', 'origin')
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
  test('a file that drives the macOS plist tool runs on the Mac, the rest in the cloud; --files narrows', () => {
    const repo = tmp('split')
    git(repo, 'init', '-q', '-b', 'main')
    const d = path.join(repo, 'packages', 'core', 'test', 'scripts')
    fs.mkdirSync(d, { recursive: true })
    // the binary's name is assembled so THIS file is not itself classified mac-only
    const MAC_BIN = 'pl' + 'util'
    fs.writeFileSync(path.join(d, 'a.test.ts'), `execFileSync('${MAC_BIN}', ['-lint'])\n`)
    fs.writeFileSync(path.join(d, 'b.test.ts'), 'test("x", () => {})\n')
    fs.writeFileSync(path.join(d, 'helper.ts'), `${MAC_BIN}\n`)
    git(repo, 'add', '.')
    git(repo, 'commit', '-qm', 'c')
    const sha = git(repo, 'rev-parse', 'HEAD')
    expect(py(`print(json.dumps(m.cloud_test_files(m.Path(${JSON.stringify(repo)}), ${JSON.stringify(sha)})))`, repo))
      .toEqual([['test/scripts/b.test.ts'], ['test/scripts/a.test.ts']])
    expect(py(`print(json.dumps(m.cloud_test_files(m.Path(${JSON.stringify(repo)}), ${JSON.stringify(sha)}, ["packages/core/test/scripts/b.test.ts"])))`, repo))
      .toEqual([['test/scripts/b.test.ts'], []])
  })
})

describe('shards: near-equal expected time per cloud session', () => {
  test('timed files balance by seconds, untimed ones weigh the mean, none timed → byte size', () => {
    const v = py(`print(json.dumps([
  m.cloud_shard_files(["a", "b", "c", "d", "e"], 2, {"a": 100, "b": 60, "c": 50, "d": 10}),
  m.cloud_shard_files(["a", "b", "c"], 2, {}, {"a": 10, "b": 900, "c": 20}),
  m.cloud_shard_files(["a", "b"], 5, {}),
  m.cloud_shard_files([], 3, {}),
]))`, os.tmpdir())
    // longest first: a=100 | b=60 → e (untimed: mean 55) onto b (115) → c onto a (150) → d onto b (125)
    expect(v[0]).toEqual([['a', 'c'], ['b', 'd', 'e']])
    expect(v[1]).toEqual([['b'], ['a', 'c']])
    expect(v[2]).toEqual([['a'], ['b']])
    expect(v[3]).toEqual([])
  })
})

describe('session creation reads the id even when `claude --cloud` exits right after printing it', () => {
  // claude 2.1.299 (observed 2026-10-14): `claude --cloud <desc>` prints the
  // session URL and exits 0 at once; the pane must outlive the process.
  const hasTmux = spawnSync('sh', ['-c', 'command -v tmux']).status === 0
  const create = (body: string) => {
    const dir = tmp('create')
    const bin = path.join(dir, 'bin')
    fs.mkdirSync(bin)
    fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
    fs.mkdirSync(path.join(dir, 'run'))
    const t0 = Date.now()
    const v = py(`print(json.dumps(m._cloud_create_session(m.Path(${JSON.stringify(dir)}), m.Path(${JSON.stringify(path.join(dir, 'run'))}), "d", 20, "s1")))`,
      dir, { PATH: `${bin}:${process.env.PATH}` })
    return { v, s: (Date.now() - t0) / 1000, pane: fs.readFileSync(path.join(dir, 'run', 'create-pane-s1.txt'), 'utf-8') }
  }
  test.skipIf(!hasTmux)('exits at once after printing → id read; exits without one → returns before the deadline', () => {
    const a = create('echo "Created cloud session: d"; echo "View: https://claude.ai/code/session_01AbCdEf?from=cli&m=0"; exit 0')
    expect(a.v[0]).toBe('session_01AbCdEf')
    const b = create('echo "boom: not logged in" >&2; exit 3')
    expect(b.v[0]).toBeNull()
    expect(b.pane).toMatch(/boom: not logged in/)
    expect(b.s).toBeLessThan(15)
  }, 60_000)
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
    { name: '/w/tree/packages/core/test/c.test.ts', status: 'passed', message: '', startTime: 1000, endTime: 3460,
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
    expect(out.file_s).toEqual({ 'test/a.test.ts': null, 'test/b.test.ts': null, 'test/c.test.ts': 2.5 })
    expect(out.failures).toEqual([
      { file: 'test/a.test.ts', name: 'a fails', message: 'AssertionError: expected 1 to be 2' },
      { file: 'test/b.test.ts', name: '(file)', message: 'Cannot find module x' },
    ])
    const missing = JSON.parse(execFileSync('node', [CONDENSE, path.join(d, 'nope.json'), ''], { cwd: d, encoding: 'utf-8' }))
    expect(missing.status).toBe('error')
  })
})

describe('T-1211 condenser redaction — failure messages and meta values', () => {
  test('a token in a failure message or a log_tail value never reaches the output', () => {
    const d = tmp('cond-red')
    const fx = { numTotalTests: 1, numPassedTests: 0, numFailedTests: 1, testResults: [
      { name: '/w/a.test.ts', status: 'failed', assertionResults: [{ fullName: 'x', status: 'failed',
        failureMessages: ['clone https://u:ghp_FAKEfixture000@github.com/o/r failed\nAuthorization: token ghs_FAKEfixture222'] }] },
      { name: '/w/b.test.ts', status: 'failed', message: 'github_pat_FAKEfixture333 leaked', assertionResults: [] },
    ] }
    fs.writeFileSync(path.join(d, 'v.json'), JSON.stringify(fx))
    const raw = execFileSync('node', [CONDENSE, path.join(d, 'v.json'), '/w/', 'log_tail=https://user:ghp_FAKEfixture000@github.com x', 'reason=Bearer abcDEF123tok'],
      { cwd: d, encoding: 'utf-8' })
    for (const secret of ['ghp_FAKEfixture000', 'ghs_FAKEfixture222', 'github_pat_FAKEfixture333', 'abcDEF123tok']) expect(raw).not.toContain(secret)
    expect(raw).toContain('***@github.com')
  })
})

describe('T-1211 condenser redaction — CR / U+2028 end no line early', () => {
  test('Authorization value is redacted past \\r and U+2028', () => {
    const d = tmp('cond-cr')
    fs.writeFileSync(path.join(d, 'v.json'), JSON.stringify({ numTotalTests: 0, testResults: [] }))
    for (const sep of ['\r', '\u2028', '\u2029']) {
      const raw = execFileSync('node', [CONDENSE, path.join(d, 'v.json'), '', `log_tail=header Authorization: X${sep}later=FAKEAFTERCR`], { cwd: d, encoding: 'utf-8' })
      expect(raw).not.toContain('FAKEAFTERCR')
    }
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
    // a different result (shard), so the commit differs even within the same second
    const r = run('cse_01AbC.x-y', ['--shard', '1/2'])
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

  test('a failed push prints git\'s own stderr, the remote and the origin host — credentials redacted', () => {
    const real = git(session, 'remote', 'get-url', 'origin')
    try {
      // a credential-bearing URL that cannot be reached: git fails the push with rc 128
      git(session, 'remote', 'set-url', 'origin', 'https://x-access-token:ghs_SeCrEt123@127.0.0.1:9/o/r.git')
      git(session, 'config', 'url.https://u:glpat-SeCrEt456@127.0.0.1:9/.insteadOf', 'https://mirror.invalid/')
      const r = run('cse_push_diag')
      expect(r.status).toBe(128)
      const out = r.stdout + r.stderr
      expect(out).not.toMatch(/SeCrEt/)
      expect(r.stdout).toMatch(/^PRDT_PHASE push-diag origin_host=127\.0\.0\.1$/m)
      expect(r.stdout).toMatch(/^PRDT_PHASE push-diag remote origin\thttps:\/\/\*\*\*@127\.0\.0\.1:9\/o\/r\.git \(push\)$/m)
      expect(r.stdout).toMatch(/^PRDT_PHASE push-diag git\| fatal: .*127\.0\.0\.1/m)
      expect(r.stdout).toMatch(/^PRDT_PHASE push-diag git_config_keys=.*url\.https:\/\/\*\*\*@127\.0\.0\.1:9\/\.insteadof/m)
      const last = r.stdout.trim().split('\n').pop()!
      expect(last).toMatch(/^PRDT_CLOUD_RESULT push-failed rc=128 refs\/heads\/ci\/T-1126\/cse_push_diag status=ok origin_host=127\.0\.0\.1 git=fatal: /)
      // no origin at all (a bundle session may carry none) → named, not a bare rc
      git(session, 'remote', 'remove', 'origin')
      const n = run('cse_push_noorigin')
      expect(n.status).not.toBe(0)
      expect(n.stdout).toMatch(/^PRDT_PHASE push-diag origin_host=none$/m)
      expect(n.stdout).toMatch(/^PRDT_PHASE push-diag remote \(none\)$/m)
      expect(n.stdout.trim().split('\n').pop()).toMatch(/origin_host=none git=fatal: .*origin/)
    } finally {
      spawnSync('git', ['-C', session, 'remote', 'remove', 'origin'])
      spawnSync('git', ['-C', session, 'config', '--remove-section', 'url.https://u:glpat-SeCrEt456@127.0.0.1:9/'])
      git(session, 'remote', 'add', 'origin', real)
    }
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

describe('runner phases — progress lines, and a phase over its limit still reports', () => {
  let work: string
  let origin: string
  let session: string
  let bin: string
  let sha: string
  const FAKE_VITEST = `#!/bin/bash
out=""
for a in "$@"; do case "$a" in --outputFile.json=*) out=\${a#*=} ;; esac; done
echo " ✓ test/a.test.ts (1 test) 5ms"
if [ "\${FAKE_VITEST_MODE-}" = hang ]; then
  echo $$ > "$FAKE_VITEST_PIDS"; sleep 120 & echo $! >> "$FAKE_VITEST_PIDS"; wait
fi
printf '{"numTotalTests":1,"numPassedTests":1,"numFailedTests":0,"testResults":[{"name":"%s/test/a.test.ts","status":"passed","startTime":1000,"endTime":3500,"assertionResults":[{"fullName":"a","status":"passed","failureMessages":[]}]}]}' "$PWD" > "$out"
`
  const run = (sess: string, extra: string[] = [], env: Record<string, string> = {}) => spawnSync('bash',
    [path.join(session, 'packages/core/scripts/prdt-cloud-test.sh'), '--ticket', 'T-1126', '--sha', sha,
      '--session', sess, '--runner-sha', sha, '--shard', '2/3', '--file', 'test/a.test.ts', ...extra],
    { cwd: session, env: { ...GIT_ENV, PATH: `${bin}:${process.env.PATH}`, ...env }, encoding: 'utf-8' })
  const result = (sess: string) => JSON.parse(git(origin, 'show', `refs/heads/ci/T-1126/${sess}:result.json`))

  beforeAll(() => {
    work = tmp('phase')
    origin = path.join(work, 'origin.git')
    git(work, 'init', '-q', '--bare', '-b', 'main', origin)
    session = path.join(work, 'session')
    git(work, 'clone', '-q', origin, session)
    const put = (rel: string, body: string, mode = 0o644) => {
      fs.mkdirSync(path.dirname(path.join(session, rel)), { recursive: true })
      fs.writeFileSync(path.join(session, rel), body, { mode })
    }
    put('packages/core/scripts/prdt-cloud-test.sh', fs.readFileSync(RUNNER, 'utf-8'))
    put('packages/core/scripts/prdt-cloud-condense.mjs', fs.readFileSync(CONDENSE, 'utf-8'))
    // a stand-in setup: the real one writes the user's global git config
    // FAKE_SETUP_STDIN: a step that reads stdin (a corepack download prompt) must see EOF at once
    put('.claude/cloud-setup.sh', 'echo "setup for $1"\n[ -n "${FAKE_SETUP_HANG-}" ] && sleep 120\n'
      + '[ -n "${FAKE_SETUP_LEAK-}" ] && { echo "$FAKE_SETUP_LEAK"; exit 1; }\n'
      + 'if [ -n "${FAKE_SETUP_STDIN-}" ]; then read -r -t 4 x; rc=$?; echo "stdin_rc=$rc corepack_prompt=${COREPACK_ENABLE_DOWNLOAD_PROMPT-unset}"; [ $rc -gt 128 ] && exit 7; [ "${COREPACK_ENABLE_DOWNLOAD_PROMPT-}" = 0 ] || exit 8; fi\n'
      + 'exit 0\n')
    put('packages/core/node_modules/.bin/vitest', FAKE_VITEST, 0o755)
    put('packages/core/test/a.test.ts', 'test("a", () => {})\n')
    git(session, 'add', '-f', '.')
    git(session, 'commit', '-qm', 'tested')
    git(session, 'push', '-q', 'origin', 'HEAD:refs/heads/main')
    sha = git(session, 'rev-parse', 'HEAD')
    bin = tmp('phase-bin')
    fs.writeFileSync(path.join(bin, 'pnpm'), '#!/bin/bash\necho "pnpm $*"\n', { mode: 0o755 })
  })

  test('each phase prints start and end on stdout; the result carries phase seconds and per-file seconds', () => {
    const r = run('cse_phase_ok')
    expect(r.status, r.stderr).toBe(0)
    for (const ph of ['setup', 'install', 'test']) {
      expect(r.stdout).toMatch(new RegExp(`^PRDT_PHASE ${ph} start limit=\\d+s`, 'm'))
      expect(r.stdout).toMatch(new RegExp(`^PRDT_PHASE ${ph} end rc=0 \\d+s`, 'm'))
    }
    expect(r.stdout).toMatch(/^PRDT_PHASE runner shard=2\/3 files=1 cpus=\S+/m)
    expect(r.stdout).toMatch(/^PRDT_PHASE result status=ok phase=- total=1 passed=1 failed=0 files=1/m)
    expect(r.stdout).toContain('PRDT_CLOUD_RESULT pushed refs/heads/ci/T-1126/cse_phase_ok status=ok')
    const res = result('cse_phase_ok')
    expect(res).toMatchObject({ status: 'ok', shard: '2/3', total: 1, passed: 1, file_s: { 'test/a.test.ts': 2.5 } })
    for (const k of ['setup_s', 'install_s', 'test_s', 'total_s']) expect(res[k]).toMatch(/^\d+$/)
    expect(res).not.toHaveProperty('phase')
  })

  test('a test run over its limit is stopped as a whole group and pushes an error result naming the phase', () => {
    const pids = path.join(work, 'pids')
    const t0 = Date.now()
    const r = run('cse_phase_hang', ['--test-timeout', '3'], { FAKE_VITEST_MODE: 'hang', FAKE_VITEST_PIDS: pids })
    expect(r.status, r.stderr).toBe(0)
    expect(Date.now() - t0).toBeLessThan(60_000)
    expect(r.stdout).toMatch(/^PRDT_PHASE test end rc=124 \d+s TIMED OUT/m)
    const res = result('cse_phase_hang')
    expect(res).toMatchObject({ status: 'error', phase: 'test', test_rc: '124' })
    expect(res.reason).toContain('passed its 3s limit')
    expect(res.log_tail).toContain('test/a.test.ts (1 test)')
    for (const pid of fs.readFileSync(pids, 'utf-8').trim().split('\n').map(Number)) {
      expect(() => process.kill(pid, 0), `pid ${pid} still alive`).toThrow()
    }
  })

  test('a setup over its limit reports phase=setup and never reaches install', () => {
    const r = run('cse_setup_hang', ['--setup-timeout', '2'], { FAKE_SETUP_HANG: '1' })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).not.toContain('PRDT_PHASE install start')
    expect(result('cse_setup_hang')).toMatchObject({ status: 'error', phase: 'setup' })
    // the page shows the setup log, not only rc=124
    expect(r.stdout).toMatch(/^PRDT_PHASE setup log\| setup for prdt-test$/m)
  })

  test('T-1211: a failed setup log pushes a redacted log_tail — no token literal in the pushed result.json', () => {
    const leak = 'fatal: unable to access https://user:ghp_FAKEfixture000@github.com/o/r.git/ with Authorization: Bearer abcDEF123tok glpat-FAKEfixture111'
    const r = run('cse_leak', [], { FAKE_SETUP_LEAK: leak })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('***@github.com')
    const raw = git(origin, 'show', 'refs/heads/ci/T-1126/cse_leak:result.json')
    for (const secret of ['ghp_FAKEfixture000', 'user:ghp_', 'abcDEF123tok', 'glpat-FAKEfixture111']) expect(raw).not.toContain(secret)
    const res = JSON.parse(raw)
    expect(res).toMatchObject({ status: 'error', phase: 'setup' })
    expect(res.log_tail).toContain('***@github.com')
  })

  test('T-1211: a token straddling the 1500-byte cut is redacted before truncation', () => {
    const tok = 'ghp_FAKEtokenLONGSECRET0123456789abcdef'
    const bear = 'Bearer ' + 'B'.repeat(40)
    // each secret starts 21 bytes before the 1500-byte cut (the log ends in a newline)
    const leak = (cut: string) => 'x'.repeat(30) + ' ' + cut + ' ' + 'y'.repeat(1500 - (cut.length - 21) - 2)
    for (const [name, cut, frags] of [['a', tok, ['ET0123456789abcdef', 'SECRET0123']], ['b', bear, ['BBBBBBBB']]] as const) {
      const r = run(`cse_straddle_${name}`, [], { FAKE_SETUP_LEAK: leak(cut) })
      expect(r.status, r.stderr).toBe(0)
      const raw = git(origin, 'show', `refs/heads/ci/T-1126/cse_straddle_${name}:result.json`)
      for (const frag of frags) expect(raw).not.toContain(frag)
    }
  })

  test('a phase never waits on an inherited stdin, and corepack never prompts', () => {
    // the runner's own stdin is a pipe held open (as in the cloud agent's shell); no input arrives
    const argv = [path.join(session, 'packages/core/scripts/prdt-cloud-test.sh'), '--ticket', 'T-1126', '--sha', sha,
      '--session', 'cse_stdin', '--runner-sha', sha, '--shard', '2/3', '--file', 'test/a.test.ts', '--setup-timeout', '30']
    const r = spawnSync('bash', ['-c', `sleep 8 | bash ${argv.map((a) => `'${a}'`).join(' ')}`],
      { cwd: session, env: { ...GIT_ENV, PATH: `${bin}:${process.env.PATH}`, FAKE_SETUP_STDIN: '1' }, encoding: 'utf-8' })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toMatch(/^PRDT_PHASE setup end rc=0 [0-3]s/m)
    expect(result('cse_stdin')).toMatchObject({ status: 'ok' })
  }, 30_000)

  test.each([['0'], ['12x'], ['999999']])('phase limit %j pushes nothing', (bad) => {
    const before = git(origin, 'for-each-ref', '--format=%(refname)')
    const r = run('cse_bad_limit', ['--install-timeout', bad])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('nothing pushed')
    expect(git(origin, 'for-each-ref', '--format=%(refname)')).toBe(before)
  })
})
