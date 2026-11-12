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

  test('a test write of the same shape with no session transcript record still fails', async () => {
    const page = path.join(decoy, '.prdt', 'wiki', 'runbook--x.md')
    const v = await fixtureRun([{ cmd: 'sh', args: ['-c', `echo x > "${page}.tmp" && mv "${page}.tmp" "${page}"`] }])
    expect(v.ok).toBe(false)
    expect(v.report).toContain(page)
  })

  test('a reported write that creates its directories is noticed whole', async () => {
    const target = path.join(decoy, '.prdt', 'overrides', 'playbooks', 'implement.md')
    const v = await fixtureRun([], () => outside(reportedAppend(target, 'line\n')))
    expect(v.report).toBe('')
    expect(v.ok).toBe(true)
    expect(v.notice).toContain(target)
  })
})

/**
 * T-1522: another session's AGENT tool write (Claude Edit / Write) — no `prdt`, no
 * self-report. The harness writes the file (rename-replace, or a new file) and then
 * records a tool result naming it in that session's transcript under the REAL
 * home's `~/.claude/projects/`. That record is the attribution.
 */
describe('real-home tripwire: another session\'s agent tool write is a notice (T-1522)', () => {
  const wiki = (n: string) => path.join(decoy, '.prdt', 'wiki', n)
  const transcript = () => path.join(decoy, '.claude', 'projects', '-Users-x-dev-other-project', 'sess-1.jsonl')

  type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

  /** One whole-file hunk, jsdiff shape (texts end in '\n'). */
  function wholeFileHunk(before: string, after: string): Hunk[] {
    const ls = (t: string) => (t === '' ? [] : t.replace(/\n$/, '').split('\n'))
    const o = ls(before)
    const n = ls(after)
    return [{ oldStart: 1, oldLines: o.length, newStart: 1, newLines: n.length, lines: [...o.map((l) => '-' + l), ...n.map((l) => '+' + l)] }]
  }

  /** The harness's own transcript line for a finished Write/Edit (shape read from live transcripts). */
  function recordToolResult(
    filePath: string,
    result: Record<string, unknown>,
    at = Date.now(),
  ) {
    const line = {
      type: 'user',
      timestamp: new Date(at).toISOString(),
      sessionId: 'sess-1',
      cwd: '/Users/x/dev/other-project',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }] },
      toolUseResult: { filePath, ...result },
    }
    fs.mkdirSync(path.dirname(transcript()), { recursive: true })
    fs.appendFileSync(transcript(), JSON.stringify(line) + '\n')
  }

  /**
   * Claude's write: temp file beside the target, then rename over it, then the
   * transcript record. `edit` records originalFile + structuredPatch (Edit's shape);
   * `create` / `update` record the whole `content` (Write's shape). `nullOriginal`
   * is the Edit record the harness writes with `originalFile: null`.
   */
  function agentWrite(target: string, text: string, kind: 'create' | 'update' | 'edit', opts: { nullOriginal?: boolean } = {}) {
    const original = fs.existsSync(target) ? fs.readFileSync(target, 'utf-8') : null
    const tmp = `${target}.tmp.${process.pid}.${Date.now()}`
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, target)
    if (kind === 'edit')
      recordToolResult(target, {
        oldString: original ?? '',
        newString: text,
        originalFile: opts.nullOriginal ? null : original,
        structuredPatch: wholeFileHunk(original ?? '', text),
        userModified: false,
        replaceAll: false,
      })
    else recordToolResult(target, { type: kind, content: text, structuredPatch: [], originalFile: original, userModified: false })
  }

  beforeEach(() => {
    fs.writeFileSync(wiki('runbook--existing.md'), 'old body\n')
  })

  test('rename-replace of an existing page and a new page mid-run: notice, run passes', async () => {
    const v = await fixtureRun([], () => {
      agentWrite(wiki('runbook--existing.md'), 'new, longer body\n', 'edit')
      agentWrite(wiki('runbook--new.md'), 'a new page\n', 'create')
    })
    expect(v.report).toBe('')
    expect(v.ok).toBe(true)
    expect(v.notice).toContain(wiki('runbook--existing.md'))
    expect(v.notice).toContain(wiki('runbook--new.md'))
  })

  test('mixed: the agent-written page is noticed, a test write beside it fails', async () => {
    const mine = wiki('mine.md')
    const v = await fixtureRun([{ cmd: 'sh', args: ['-c', `echo x > "${mine}"`] }], () =>
      agentWrite(wiki('runbook--new.md'), 'a new page\n', 'create'),
    )
    expect(v.ok).toBe(false)
    expect(v.report).toContain(mine)
    expect(v.report.split('T-450 notice')[0]).not.toContain(wiki('runbook--new.md'))
    expect(v.notice).toContain(wiki('runbook--new.md'))
  })

  test('a transcript record stamped before the run does not cover a write during it', async () => {
    recordToolResult(wiki('runbook--existing.md'), { type: 'update', content: 'old body\n', structuredPatch: [], originalFile: 'old body\n' }, Date.now() - 60_000)
    const v = await fixtureRun([], () => fs.appendFileSync(wiki('runbook--existing.md'), 'unrecorded, during the run\n'))
    expect(v.ok).toBe(false)
    expect(v.report).toContain(wiki('runbook--existing.md'))
  })

  test('a transcript line that is not a write tool result (a Read naming the path) earns nothing', async () => {
    const v = await fixtureRun([], () => {
      fs.appendFileSync(wiki('runbook--existing.md'), 'unrecorded, during the run\n')
      fs.mkdirSync(path.dirname(transcript()), { recursive: true })
      fs.appendFileSync(
        transcript(),
        JSON.stringify({
          type: 'user',
          timestamp: new Date().toISOString(),
          toolUseResult: { type: 'text', filePath: wiki('runbook--existing.md'), file: { filePath: wiki('runbook--existing.md') } },
        }) + '\n',
      )
    })
    expect(v.ok).toBe(false)
    expect(v.report).toContain(wiki('runbook--existing.md'))
  })

  test('a transcript outside the real home (a test-run session under its sandbox HOME) earns nothing', async () => {
    const page = wiki('runbook--existing.md')
    const sandboxTranscript = path.join(sandbox, '.claude', 'projects', 'p', 's.jsonl')
    const v = await fixtureRun([
      {
        cmd: 'sh',
        args: [
          '-c',
          `echo changed >> "${page}" && mkdir -p "${path.dirname(sandboxTranscript)}" && ` +
            `printf '%s\\n' '${JSON.stringify({ type: 'user', timestamp: new Date(Date.now() + 1000).toISOString(), toolUseResult: { filePath: page, structuredPatch: [] } })}' >> "${sandboxTranscript}"`,
        ],
      },
    ])
    expect(v.ok).toBe(false)
    expect(v.report).toContain(page)
  })

  // ── QA grill on d8daf5ca: a path match must not excuse what else happened to it ──

  test('a test appending to a page an outside agent just wrote (Edit and Write) fails', async () => {
    const edited = wiki('runbook--existing.md')
    const created = wiki('runbook--new.md')
    const v = await fixtureRun(
      [{ cmd: 'sh', args: ['-c', `echo test-append >> "${edited}" && echo test-append >> "${created}"`] }],
      () => {
        agentWrite(edited, 'new, longer body\n', 'edit')
        agentWrite(created, 'a new page\n', 'create')
      },
    )
    expect(v.ok).toBe(false)
    const failed = v.report.split('T-450 notice')[0]
    expect(failed).toContain(edited)
    expect(failed).toContain(created)
  })

  test('a test deleting a page an outside agent just wrote fails', async () => {
    const edited = wiki('runbook--existing.md')
    const created = wiki('runbook--new.md')
    const v = await fixtureRun([{ cmd: 'rm', args: [edited, created] }], () => {
      agentWrite(edited, 'new, longer body\n', 'edit')
      agentWrite(created, 'a new page\n', 'create')
    })
    expect(v.ok).toBe(false)
    expect(v.report.split('T-450 notice')[0]).toContain(edited)
  })

  test('a same-length rewrite by a test after an agent edit fails (content, not size)', async () => {
    const edited = wiki('runbook--existing.md')
    const v = await fixtureRun(
      [{ cmd: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(edited)}, 'NEW, LONGER BODY\\n')`] }],
      () => agentWrite(edited, 'new, longer body\n', 'edit'),
    )
    expect(v.ok).toBe(false)
    expect(v.report).toContain(edited)
  })

  /** Edit with originalFile=null: the record names only oldString → newString (the live shape). */
  function nullOriginalEdit(target: string, oldString: string, newString: string, writeTo?: string) {
    const original = fs.readFileSync(target, 'utf-8')
    fs.writeFileSync(target, writeTo ?? original.replace(oldString, newString))
    recordToolResult(target, {
      oldString,
      newString,
      originalFile: null,
      structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-' + oldString, '+' + newString] }],
      userModified: false,
      replaceAll: false,
      contentNotInModelContext: true,
    })
  }

  test('an Edit record with no originalFile and nothing earlier to derive from: file holds newString, not oldString → notice', async () => {
    const page = wiki('runbook--existing.md')
    fs.writeFileSync(page, 'intro\nold body\noutro\n')
    const v = await fixtureRun([], () => nullOriginalEdit(page, 'old body', 'new, longer body'))
    expect(v.report).toBe('')
    expect(v.ok).toBe(true)
    expect(v.notice).toContain(page)
  })

  test('an Edit record with no originalFile whose newString is not in the file fails', async () => {
    const page = wiki('runbook--existing.md')
    const v = await fixtureRun([], () => nullOriginalEdit(page, 'old body', 'new, longer body', 'something else entirely\n'))
    expect(v.ok).toBe(false)
    expect(v.report).toContain(page)
  })

  test('an Edit record with no originalFile whose oldString is still in the file fails', async () => {
    const page = wiki('runbook--existing.md')
    const v = await fixtureRun([], () => nullOriginalEdit(page, 'old body', 'new body', 'old body\nnew body\n'))
    expect(v.ok).toBe(false)
    expect(v.report).toContain(page)
  })

  test('a test deleting a page covered by an Edit record with no originalFile fails', async () => {
    const page = wiki('runbook--existing.md')
    const v = await fixtureRun([{ cmd: 'rm', args: [page] }], () => nullOriginalEdit(page, 'old body', 'new, longer body'))
    expect(v.ok).toBe(false)
    expect(v.report).toContain(page)
  })

  test('an Edit record with no originalFile after an in-window Write of the same page derives from it: notice', async () => {
    const page = wiki('runbook--new.md')
    const v = await fixtureRun([], () => {
      agentWrite(page, 'line one\nline two\n', 'create')
      agentWrite(page, 'line one\nline 2, edited\n', 'edit', { nullOriginal: true })
    })
    expect(v.report).toBe('')
    expect(v.ok).toBe(true)
    expect(v.notice).toContain(page)
  })

  test('an Edit with context lines (the live shape) is applied hunk by hunk: notice', async () => {
    const page = wiki('runbook--existing.md')
    fs.writeFileSync(page, 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n')
    const v = await fixtureRun([], () => {
      const original = fs.readFileSync(page, 'utf-8')
      fs.writeFileSync(page, 'l1\nl2\nl3\nL4 edited\nextra\nl5\nl6\nl7\nl8\n')
      recordToolResult(page, {
        oldString: 'l4',
        newString: 'L4 edited\nextra',
        originalFile: original,
        structuredPatch: [{ oldStart: 1, oldLines: 7, newStart: 1, newLines: 8, lines: [' l1', ' l2', ' l3', '-l4', '+L4 edited', '+extra', ' l5', ' l6', ' l7'] }],
        userModified: false,
        replaceAll: false,
      })
    })
    expect(v.report).toBe('')
    expect(v.ok).toBe(true)
  })

  test('an Edit record whose patch does not apply to its originalFile derives nothing: fails', async () => {
    const page = wiki('runbook--existing.md')
    const v = await fixtureRun([], () => {
      fs.writeFileSync(page, 'new, longer body\n')
      recordToolResult(page, {
        oldString: 'x',
        newString: 'y',
        originalFile: 'old body\n',
        structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-not the original', '+new, longer body'] }],
        userModified: false,
        replaceAll: false,
      })
    })
    expect(v.ok).toBe(false)
    expect(v.report).toContain(page)
  })


  // ── QA qa2 P10 · P11 (dev4): the weak check no longer excuses emptying or a whole rewrite ──

  test('an Edit record with no originalFile and an empty newString covers nothing: an emptied page fails', async () => {
    const page = wiki('runbook--existing.md')
    const v = await fixtureRun([], () => nullOriginalEdit(page, 'old body\n', '', ''))
    expect(v.ok).toBe(false)
    expect(v.report).toContain(page)
  })

  test('an Edit record with no originalFile, page now holding only newString (old text longer, gone): fails', async () => {
    const page = wiki('runbook--existing.md')
    fs.writeFileSync(page, 'intro\nold body that was much longer\noutro\n')
    const v = await fixtureRun([], () => nullOriginalEdit(page, 'old body that was much longer', 'new', 'new\n'))
    expect(v.ok).toBe(false)
    expect(v.report).toContain(page)
  })

  test('the same whole rewrite with no baseline size to check (replaceAll record) still fails', async () => {
    const page = wiki('runbook--existing.md')
    fs.writeFileSync(page, 'intro\nold body that was much longer\noutro\n')
    const v = await fixtureRun([], () => {
      fs.writeFileSync(page, 'new\n')
      recordToolResult(page, {
        oldString: 'old body that was much longer',
        newString: 'new',
        originalFile: null,
        structuredPatch: [],
        userModified: false,
        replaceAll: true,
      })
    })
    expect(v.ok).toBe(false)
    expect(v.report).toContain(page)
  })

  test('a test appending to a page an outside Edit with no originalFile changed fails (size check)', async () => {
    const page = wiki('runbook--existing.md')
    fs.writeFileSync(page, 'intro\nold body\noutro\n')
    const v = await fixtureRun([{ cmd: 'sh', args: ['-c', `echo test-append >> "${page}"`] }], () =>
      nullOriginalEdit(page, 'old body', 'new, longer body'),
    )
    expect(v.ok).toBe(false)
    expect(v.report.split('T-450 notice')[0]).toContain(page)
  })

})


/**
 * T-1522 dev4 (user decision B): another session's SHELL write. Nothing records
 * the written path except the command text in that session's Bash `tool_use` line.
 * Shape copied from session aac6c0dc (2026-11-11 06:14Z), which rewrote wiki pages
 * and removed one from a single python heredoc.
 */
describe('real-home tripwire: a path another session\'s Bash command named is a notice (T-1522 dev4)', () => {
  const wiki = (n: string) => path.join(decoy, '.prdt', 'wiki', n)
  const transcript = (root = decoy) => path.join(root, '.claude', 'projects', '-Users-x-dev-other-project', 'sess-2.jsonl')
  let seq = 0

  /** The harness's transcript lines for one Bash call: tool_use when issued, tool_result when it returns. */
  function recordBash(command: string, opts: { issuedAt?: number; returnedAt?: number | null; root?: string } = {}) {
    const id = `toolu_bash_${++seq}`
    const file = transcript(opts.root)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const issuedAt = opts.issuedAt ?? Date.now()
    fs.appendFileSync(
      file,
      JSON.stringify({
        type: 'assistant',
        timestamp: new Date(issuedAt).toISOString(),
        sessionId: 'sess-2',
        message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command, description: 'x' } }] },
      }) + '\n',
    )
    if (opts.returnedAt === null) return
    fs.appendFileSync(
      file,
      JSON.stringify({
        type: 'user',
        timestamp: new Date(opts.returnedAt ?? issuedAt).toISOString(),
        sessionId: 'sess-2',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
      }) + '\n',
    )
  }

  const HEREDOC =
    "cd /Users/x/dev/other-project; python3 - <<'EOF'\nimport os\nW=os.path.expanduser('~/.prdt/wiki/')\n" +
    "s=open(W+'runbook--existing.md').read()\nopen(W+'runbook--existing.md','w').write(s+'merged\\n')\n" +
    "os.remove(W+'fact--gone.md')\nEOF\ngrep -rn gone ~/.prdt/wiki | cut -c1-90"

  beforeEach(() => {
    fs.writeFileSync(wiki('runbook--existing.md'), 'old body\n')
    fs.writeFileSync(wiki('fact--gone.md'), 'to be merged away\n')
  })

  test('a python heredoc rewriting one page and removing another: both noticed as shell writes, run passes', async () => {
    const v = await fixtureRun([], () => {
      fs.appendFileSync(wiki('runbook--existing.md'), 'merged\n')
      fs.rmSync(wiki('fact--gone.md'))
      recordBash(HEREDOC)
    })
    expect(v.report).toBe('')
    expect(v.ok).toBe(true)
    expect(v.notice).toContain(wiki('runbook--existing.md'))
    expect(v.notice).toContain(wiki('fact--gone.md'))
    expect(v.notice).toContain('shell write')
  })

  test('absolute, $HOME and ${HOME} forms each name their path', async () => {
    const pages = ['a.md', 'b.md', 'c.md'].map(wiki)
    const v = await fixtureRun([], () => {
      for (const p of pages) fs.writeFileSync(p, 'new\n')
      recordBash(`echo new > "${pages[0]}"; echo new > "$HOME/.prdt/wiki/b.md"; echo new > \${HOME}/.prdt/wiki/c.md`)
    })
    expect(v.report).toBe('')
    expect(v.ok).toBe(true)
    for (const p of pages) expect(v.notice).toContain(p)
  })

  test('a command issued before the run that returned inside it counts; one that returned before it does not', async () => {
    const early = wiki('early.md')
    const v = await fixtureRun([], () => {
      fs.writeFileSync(wiki('long.md'), 'x\n')
      recordBash(`sleep 60; echo x > ~/.prdt/wiki/long.md`, { issuedAt: Date.now() - 60_000, returnedAt: Date.now() })
      fs.writeFileSync(early, 'x\n')
      recordBash(`echo x > ~/.prdt/wiki/early.md`, { issuedAt: Date.now() - 60_000, returnedAt: Date.now() - 59_000 })
    })
    expect(v.ok).toBe(false)
    expect(v.report.split('T-450 notice')[0]).toContain(early)
    expect(v.notice).toContain(wiki('long.md'))
  })

  test('a directory named alone (ls / grep -rn of ~/.prdt) does not cover a test write under it', async () => {
    const mine = wiki('mine.md')
    const v = await fixtureRun([{ cmd: 'sh', args: ['-c', `echo x > "${mine}"`] }], () =>
      recordBash('ls ~/.prdt/wiki; grep -rn foo ~/.prdt | head; cat ~/.prdt/wiki/*.md'),
    )
    expect(v.ok).toBe(false)
    expect(v.report).toContain(mine)
  })

  test('a test write no outside record names fails beside a covered shell write', async () => {
    const mine = wiki('mine.md')
    const v = await fixtureRun([{ cmd: 'sh', args: ['-c', `echo x > "${mine}"`] }], () => {
      fs.appendFileSync(wiki('runbook--existing.md'), 'merged\n')
      fs.rmSync(wiki('fact--gone.md'))
      recordBash(HEREDOC)
    })
    expect(v.ok).toBe(false)
    const failed = v.report.split('T-450 notice')[0]
    expect(failed).toContain(mine)
    expect(failed).not.toContain(wiki('runbook--existing.md'))
    expect(v.notice).toContain(wiki('runbook--existing.md'))
  })

  test('a Bash record in a transcript under the sandbox HOME (a test-run session) earns nothing', async () => {
    const page = wiki('runbook--existing.md')
    const sandboxTranscript = transcript(sandbox)
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: new Date(Date.now() + 1000).toISOString(),
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: `echo changed >> ${page}` } }] },
    })
    const v = await fixtureRun([
      {
        cmd: 'sh',
        args: ['-c', `echo changed >> "${page}" && mkdir -p "${path.dirname(sandboxTranscript)}" && printf '%s\\n' '${line}' >> "${sandboxTranscript}"`],
      },
    ])
    expect(v.ok).toBe(false)
    expect(v.report).toContain(page)
  })

  // QA qa3 F1: the rest token found inside another tree's path (this repo mirrors
  // wiki/, hooks/, discipline/) or a URL, beside a directory-only mention.
  test.each([
    ['index.md', 'ls ~/.prdt/wiki; cat docs/_shared/wiki/index.md'],
    ['index.md', 'grep -rn foo ~/.prdt docs/_shared/wiki/index.md | head'],
    ['x.md', 'ls ~/.prdt/wiki && open https://h/x.md'],
    ['../hooks/h.sh', 'diff -r ~/.prdt packages/core/hooks/h.sh'],
  ])('a directory mention plus %s inside another path (%s) covers nothing', async (name, command) => {
    const page = wiki(name)
    fs.mkdirSync(path.dirname(page), { recursive: true })
    fs.writeFileSync(page, 'body\n')
    const v = await fixtureRun([], () => {
      fs.appendFileSync(page, 'test damage\n')
      recordBash(command)
    })
    expect(v.ok).toBe(false)
    expect(v.report.split('T-450 notice')[0]).toContain(path.normalize(page))
  })

  test('a variable assigned the directory on one line, then "$W/<name>" on the next, names that page', async () => {
    const pages = ['a.md', 'b.md'].map(wiki)
    const v = await fixtureRun([], () => {
      for (const p of pages) fs.appendFileSync(p, 'x\n')
      recordBash('W=~/.prdt/wiki\ncat "$W/a.md" >> "${W}/b.md"')
    })
    expect(v.report).toBe('')
    expect(v.ok).toBe(true)
    for (const p of pages) expect(v.notice).toContain(p)
  })

  test('"$V/<name>" for a variable not assigned the named directory covers nothing', async () => {
    const page = wiki('a.md')
    const v = await fixtureRun([], () => {
      fs.appendFileSync(page, 'x\n')
      recordBash('ls ~/.prdt/wiki; V=/tmp/other; echo x >> "$V/a.md"; echo y >> "$HOME/a.md"')
    })
    expect(v.ok).toBe(false)
    expect(v.report.split('T-450 notice')[0]).toContain(page)
  })

  test('a Bash or Write record stamped after the verify time (a future stamp) covers nothing', async () => {
    const shellPage = wiki('runbook--existing.md')
    const toolPage = wiki('fact--gone.md')
    const future = Date.now() + 86_400_000
    const v = await fixtureRun([], () => {
      fs.appendFileSync(shellPage, 'x\n')
      recordBash(`echo x >> ~/.prdt/wiki/runbook--existing.md`, { issuedAt: future })
      fs.writeFileSync(toolPage, 'written\n')
      const line = {
        type: 'user',
        timestamp: new Date(future).toISOString(),
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] },
        toolUseResult: { filePath: toolPage, type: 'update', content: 'written\n', structuredPatch: [], originalFile: 'to be merged away\n' },
      }
      fs.appendFileSync(transcript(), JSON.stringify(line) + '\n')
    })
    expect(v.ok).toBe(false)
    const failed = v.report.split('T-450 notice')[0]
    expect(failed).toContain(shellPage)
    expect(failed).toContain(toolPage)
  })

  test('a mention escaping ~/.prdt with `..`, or a bare name with no ~/.prdt mention, covers nothing', async () => {
    const page = wiki('runbook--existing.md')
    const v = await fixtureRun([], () => {
      fs.appendFileSync(page, 'x\n')
      recordBash(`cd ~/.prdt/../elsewhere && echo x >> .prdt/wiki/runbook--existing.md; sed -i '' s/a/b/ runbook--existing.md`)
    })
    expect(v.ok).toBe(false)
    expect(v.report).toContain(page)
  })
})

/**
 * T-1522 grill: Claude Code reads $CLAUDE_CONFIG_DIR before $HOME/.claude. The
 * vitest home sandbox clears it, so a `claude` spawned by a test writes its
 * transcript under the sandbox HOME, never into the real `~/.claude/projects`.
 */
describe('vitest home sandbox clears CLAUDE_CONFIG_DIR (T-1522)', () => {
  test('an inherited CLAUDE_CONFIG_DIR is unset once the sandbox setup file has run', () => {
    const SANDBOX_TS = path.resolve(__dirname, '../../../scripts/vitest-home-sandbox.ts')
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: sandbox, CLAUDE_CONFIG_DIR: path.join(decoy, '.claude') }
    delete env.NODE_OPTIONS
    const r = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', '--import', SANDBOX_TS, '-e', 'process.stdout.write(String(process.env.CLAUDE_CONFIG_DIR) + " " + process.env.HOME)'],
      { env, cwd: scratch, encoding: 'utf-8' },
    )
    expect(r.status, r.stderr).toBe(0)
    const [cfg, home] = r.stdout.split(' ')
    expect(cfg).toBe('undefined')
    expect(home).not.toBe(sandbox) // HOME was repointed by the same file — proves it ran
  })
})
