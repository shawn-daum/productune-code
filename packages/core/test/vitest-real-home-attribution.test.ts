/**
 * vitest-real-home-attribution.test.ts — T-1134.
 *
 * The T-450 tripwire fails a run on ANY drift of the real home. The one exception:
 * a drift path a writer OUTSIDE the run reported first in the machine's external-
 * write log (`prdt` → prdt_safe_fs.note_home_write → `~/.prdt/run/external-writes.jsonl`).
 * Those paths become a notice. A writer inside the run — the run id inherited, or
 * the run's root pid among its ancestors — earns nothing, even through `prdt`.
 *
 * Each case drives a fixture run against a decoy real home:
 *   ROOT (node child) arms the tripwire, waits for a go-file, runs its "inside"
 *   writers as its own children, then verifies. THIS test process plays the other
 *   session: it is ROOT's parent, never its descendant, and its writers carry no
 *   run id — exactly another Claude session's `prdt` beside a `vitest run`.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'

const TESTS_DIR = path.resolve(__dirname, '../../gui/tests')
const TRIPWIRE = path.join(TESTS_DIR, 'real-home-tripwire.cjs')
const SCRIPTS = path.resolve(__dirname, '../scripts')
const PRDT_CLI = path.join(SCRIPTS, 'prdt')

let decoy: string
let sandbox: string
let project: string
let scratch: string

const prdtHome = () => path.join(decoy, '.prdt')
const ledger = () => path.join(decoy, '.prdt', 'wiki', 'feedback.md')
const QUOTE = '감성 말투가 또 나왔다'

interface Writer {
  cmd: string
  args: string[]
  cwd?: string
  /** env names removed before the spawn (a test scrubbing its run id). */
  unset?: string[]
}

/** A writer that reports through prdt's own primitive, then appends. */
function reportedAppend(target: string, text: string): Writer {
  return {
    cmd: 'python3',
    args: [
      '-c',
      'import sys; sys.path.insert(0, sys.argv[1]); import prdt_safe_fs as f\n' +
        'f.note_home_write(sys.argv[2]); import os; os.makedirs(os.path.dirname(sys.argv[2]), exist_ok=True)\n' +
        'open(sys.argv[2], "a").write(sys.argv[3])',
      SCRIPTS,
      target,
      text,
    ],
  }
}

/** The real CLI: `prdt feedback record` writes `<PRDT_HOME>/wiki/feedback.md`. */
function feedbackRecord(): Writer {
  return {
    cmd: 'python3',
    args: [PRDT_CLI, 'feedback', 'record', 'po', 'voice-figurative', '--ticket', 'T-001', '--quote', QUOTE],
    cwd: project,
  }
}

function writerEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...base,
    PRODUCTUNE_REAL_HOME: decoy,
    PRDT_HOME: prdtHome(),
    HOME: sandbox,
    PRDT_LANG: 'en',
    PRDT_META_BACKUP: '0',
    TZ: 'UTC',
  }
}

/** Another session: a process that is not part of the fixture run. */
function outside(w: Writer) {
  const env = writerEnv(process.env)
  delete env.PRODUCTUNE_TRIPWIRE_RUN
  delete env.NODE_OPTIONS
  const r = spawnSync(w.cmd, w.args, { cwd: w.cwd ?? scratch, env, encoding: 'utf-8' })
  expect(r.status, r.stdout + r.stderr).toBe(0)
}

const ROOT = `
const fs = require('fs'), cp = require('child_process')
const t = require(${JSON.stringify(TRIPWIRE)})
const [go, insideJson] = process.argv.slice(1)
const armed = t.armTripwire('fixture')
process.stdout.write('RUN=' + armed.runId + '\\n')
const sleep = new Int32Array(new SharedArrayBuffer(4))
while (!fs.existsSync(go)) Atomics.wait(sleep, 0, 0, 20)
for (const w of JSON.parse(insideJson)) {
  const env = { ...process.env }
  for (const k of w.unset || []) delete env[k]
  const r = cp.spawnSync(w.cmd, w.args, { cwd: w.cwd, env, encoding: 'utf-8' })
  if (r.status !== 0) process.stdout.write('INSIDE-FAILED ' + w.cmd + ' ' + r.status + ' ' + r.stderr + '\\n')
}
const v = t.verifyTripwire()
process.stdout.write('JSON=' + JSON.stringify({ ok: v.ok, report: v.report, notice: v.notice || '' }) + '\\n')
`

/**
 * One fixture run: arm, let `during()` act as the other session, then run the
 * inside writers and verify.
 */
async function fixtureRun(inside: Writer[], during: () => void = () => {}) {
  const go = path.join(scratch, `go-${Math.random().toString(36).slice(2)}`)
  const env = writerEnv(process.env)
  delete env.PRODUCTUNE_TRIPWIRE_RUN // the fixture run arms its own
  delete env.NODE_OPTIONS
  const child = spawn(process.execPath, ['-e', ROOT, go, JSON.stringify(inside)], { env, cwd: scratch })
  let out = ''
  let err = ''
  child.stderr.on('data', (d) => (err += d))
  const closed = new Promise<number | null>((resolve) => child.on('close', resolve))
  await new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (d) => {
      out += d
      if (out.includes('RUN=')) resolve()
    })
    child.on('close', () => reject(new Error(`root exited before arming:\n${out}\n${err}`)))
  })
  try {
    during()
  } finally {
    fs.writeFileSync(go, '')
  }
  await closed
  expect(out, err).not.toContain('INSIDE-FAILED')
  const m = /JSON=(.*)$/m.exec(out)
  expect(m, out + err).toBeTruthy()
  return JSON.parse(m![1]) as { ok: boolean; report: string; notice: string }
}

beforeEach(() => {
  const tmp = (p: string) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)))
  decoy = tmp('prdt-attrib-decoy-')
  sandbox = tmp('prdt-attrib-sandbox-')
  project = tmp('prdt-attrib-project-')
  scratch = tmp('prdt-attrib-scratch-')
  fs.mkdirSync(path.join(decoy, '.prdt', 'wiki'), { recursive: true })
  fs.writeFileSync(ledger(), '')
  fs.writeFileSync(path.join(decoy, '.prdt', 'wiki', 'feedback.md.lock'), '')
  fs.mkdirSync(path.join(project, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(project, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0' }))
  fs.writeFileSync(path.join(project, '.prdt', 'config.json'), JSON.stringify({ slug: 'attrib-fixture' }))
  fs.mkdirSync(path.join(project, 'docs', 'wiki'), { recursive: true })
  const td = path.join(project, 'docs', 'tickets', 'v1.0')
  fs.mkdirSync(td, { recursive: true })
  fs.writeFileSync(
    path.join(td, 'T-001.md'),
    `---\nid: T-001\nslug: fixture\ntype: impl\nstatus: open\nassignee: po\ncreated: 2026-10-20\n---\n\n## Request\n\n사용자: "${QUOTE}"\n`,
  )
})
afterEach(() => {
  for (const d of [decoy, sandbox, project, scratch]) fs.rmSync(d, { recursive: true, force: true })
})

describe('real-home tripwire: reported external writes are a notice, everything else fails (T-1134)', () => {
  test('another session running `prdt feedback record` mid-run: notice naming the ledger, run passes', async () => {
    const v = await fixtureRun([], () => outside(feedbackRecord()))
    expect(fs.readFileSync(ledger(), 'utf-8')).toContain(QUOTE)
    expect(v.report).toBe('')
    expect(v.ok).toBe(true)
    expect(v.notice).toContain(ledger())
  })

  test('the CLI reports its write with pid, start time and a complete parent chain', () => {
    outside(feedbackRecord())
    const lines = fs
      .readFileSync(path.join(prdtHome(), 'run', 'external-writes.jsonl'), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
    const e = lines.find((x) => x.path === ledger())
    expect(e).toBeTruthy()
    expect(e.pid).toBeGreaterThan(1)
    expect(typeof e.start).toBe('string')
    expect(e.complete).toBe(true)
    expect(e.ancestors).toContain(process.pid)
    expect(e.run).toBeUndefined()
  })

  test('an unreported external write still fails the run (the T-450 default)', async () => {
    const v = await fixtureRun([], () => fs.appendFileSync(ledger(), 'no report, longer line\n'))
    expect(v.ok).toBe(false)
    expect(v.report).toContain(ledger())
  })

  test('a test calling `prdt` against the real home fails — run id inherited', async () => {
    const v = await fixtureRun([feedbackRecord()])
    expect(fs.readFileSync(ledger(), 'utf-8')).toContain(QUOTE)
    expect(v.ok).toBe(false)
    expect(v.report).toContain(ledger())
  })

  test('a test calling `prdt` with its run id scrubbed still fails — the run root is its ancestor', async () => {
    const v = await fixtureRun([{ ...feedbackRecord(), unset: ['PRODUCTUNE_TRIPWIRE_RUN'] }])
    expect(fs.readFileSync(ledger(), 'utf-8')).toContain(QUOTE)
    expect(v.ok).toBe(false)
    expect(v.report).toContain(ledger())
  })

  test('test write routes fail: node direct, shell child, worker_thread, chdir-relative, $PRODUCTUNE_REAL_HOME, symlink, python env', async () => {
    const p = (n: string) => path.join(decoy, '.prdt', n)
    const node = (code: string): Writer => ({ cmd: process.execPath, args: ['-e', code] })
    const link = path.join(scratch, 'link-to-prdt')
    fs.symlinkSync(path.join(decoy, '.prdt'), link)
    const v = await fixtureRun([
      { cmd: 'sh', args: ['-c', 'echo x > "$PRODUCTUNE_REAL_HOME/.prdt/envvar.txt"'] },
      { cmd: 'sh', args: ['-c', `echo x > "${path.join(link, 'symlink.txt')}"`] },
      {
        cmd: 'python3',
        args: ['-c', 'import os; open(os.path.join(os.environ["PRDT_HOME"], "python.txt"), "w").write("x")'],
      },
      node(`require('fs').writeFileSync(${JSON.stringify(p('direct.txt'))}, 'x')`),
      { cmd: 'sh', args: ['-c', `echo x > "${p('shell.txt')}"`] },
      node(
        `const { Worker } = require('worker_threads');` +
          `new Worker("require('fs').writeFileSync(${JSON.stringify(JSON.stringify(p('worker.txt'))).slice(1, -1)}, 'x')", { eval: true })`,
      ),
      node(`process.chdir(${JSON.stringify(path.join(decoy, '.prdt'))}); require('fs').writeFileSync('relative.txt', 'x')`),
    ])
    expect(v.ok).toBe(false)
    for (const n of ['direct.txt', 'shell.txt', 'worker.txt', 'relative.txt', 'envvar.txt', 'symlink.txt', 'python.txt'])
      expect(v.report).toContain(p(n))
  })

  test('a test child naming the home root in argv does not turn a reported external write into a failure', async () => {
    const v = await fixtureRun([{ cmd: 'ls', args: ['-la', decoy, path.join(decoy, '.prdt')] }], () =>
      outside(feedbackRecord()),
    )
    expect(v.ok).toBe(true)
    expect(v.notice).toContain(ledger())
  })

  test('mixed: the reported external path is noticed, the test write beside it fails', async () => {
    const mine = path.join(decoy, '.prdt', 'wiki', 'mine.md')
    const v = await fixtureRun([{ cmd: 'sh', args: ['-c', `echo x > "${mine}"`] }], () => outside(feedbackRecord()))
    expect(v.ok).toBe(false)
    expect(v.report).toContain(mine)
    expect(v.notice).toContain(ledger())
    expect(v.notice).not.toContain(mine)
  })

  test('a report carrying a tripwire run id earns nothing, whatever its parent chain', async () => {
    const log = path.join(prdtHome(), 'run', 'external-writes.jsonl')
    const v = await fixtureRun([], () => {
      outside(reportedAppend(ledger(), 'reported, then marked as a test run writer\n'))
      fs.writeFileSync(log, fs.readFileSync(log, 'utf-8').replace(/"writer"/g, '"run": "some-run", "writer"'))
    })
    expect(v.ok).toBe(false)
    expect(v.report).toContain(ledger())
  })

  test('a report stamped before the run does not cover a write during it', async () => {
    outside(reportedAppend(ledger(), 'reported before the run\n'))
    const log = path.join(prdtHome(), 'run', 'external-writes.jsonl')
    const old = fs.readFileSync(log, 'utf-8').replace(/"ts": \d+/g, `"ts": ${Date.now() - 60_000}`)
    fs.writeFileSync(log, old)
    const v = await fixtureRun([], () => fs.appendFileSync(ledger(), 'unreported, during the run\n'))
    expect(v.ok).toBe(false)
    expect(v.report).toContain(ledger())
  })

  test('a reported write that creates its directories is noticed whole', async () => {
    const target = path.join(decoy, '.prdt', 'overrides', 'playbooks', 'implement.md')
    const v = await fixtureRun([], () => outside(reportedAppend(target, 'line\n')))
    expect(v.report).toBe('')
    expect(v.ok).toBe(true)
    expect(v.notice).toContain(target)
  })
})
