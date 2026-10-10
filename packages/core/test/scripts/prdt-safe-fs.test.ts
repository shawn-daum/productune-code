/**
 * prdt-safe-fs.test.ts — T-906 (T-848 slice S3).
 *
 * `scripts/prdt_safe_fs.py` is the ONE symlink-safe directory walk + writer set
 * shared by the statusline, prdt-auto-open.sh's regen worker and the
 * post-dispatch / return-check appends. Every case plants a link (symlink, or a
 * hard link where the write would go through the inode) at one path component
 * and asserts the victim is byte-identical with its mtime, and that a file
 * which already exists keeps its mode. The statusline / worker integrations are
 * pinned in statusline-running-waiting.test.ts and viewer-regen.test.ts.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const SCRIPTS = path.join(CORE_ROOT, 'scripts')
const HOOKS = path.join(SCRIPTS, 'hooks')
const POST_DISPATCH = path.join(HOOKS, 'prdt-post-dispatch.sh')
const RETURN_CHECK = path.join(HOOKS, 'prdt-return-check.sh')

function hasPython(): boolean {
  return spawnSync('python3', ['--version']).status === 0
}
const READY = hasPython()

const tmp = (p: string) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), p)))

/** Runs `body` (python) with `sfs` imported and `root` = argv[1]; returns the exit code + stderr. */
function py(body: string, root: string, umask = 0o022) {
  const code = `import os, sys\nos.umask(${umask})\nsys.path.append(${JSON.stringify(SCRIPTS)})\nimport prdt_safe_fs as sfs\nroot = sys.argv[1]\n${body}`
  const r = spawnSync('python3', ['-I', '-c', code, root], { encoding: 'utf8', timeout: subprocessTimeout('hook') })
  return { status: r.status, stderr: r.stderr, stdout: r.stdout }
}

const stamp = (f: string) => ({ bytes: fs.readFileSync(f, 'utf8'), mtimeMs: fs.statSync(f).mtimeMs })
function victimFile(dir: string, name = 'victim.txt') {
  const f = path.join(dir, name)
  fs.writeFileSync(f, 'victim\n')
  const old = Date.now() / 1000 - 3600
  fs.utimesSync(f, old, old)
  return f
}
const mode = (f: string) => fs.statSync(f).mode & 0o777

describe.skipIf(!READY)('prdt_safe_fs — a link at any component is refused', () => {
  const parts = ['.prdt', 'scratch', 'viewer']
  for (let i = 0; i < parts.length; i++) {
    test(`open_dir refuses a symlink at component ${parts[i]}, victim dir untouched`, () => {
      const root = tmp('prdt-t906-root-')
      const outside = tmp('prdt-t906-out-')
      const v = victimFile(outside)
      fs.mkdirSync(path.join(outside, ...parts.slice(i + 1)), { recursive: true })
      const holder = path.join(root, ...parts.slice(0, i))
      fs.mkdirSync(holder, { recursive: true })
      fs.symlinkSync(outside, path.join(holder, parts[i]))
      const before = stamp(v)
      const r = py(`
try:
    sfs.open_dir(root, ${JSON.stringify(parts)}, create=True)
    sys.exit(0)
except OSError:
    sys.exit(7)
`, root)
      expect(r.status).toBe(7)
      expect(stamp(v)).toEqual(before)
      expect(fs.readdirSync(outside).sort()).toEqual([parts[i + 1] ?? 'victim.txt', 'victim.txt'].filter((x, k, a) => a.indexOf(x) === k).sort())
    })
  }

  test('write_inplace / open_lock refuse a symlink and a hard link at the leaf', () => {
    const root = tmp('prdt-t906-root-')
    const outside = tmp('prdt-t906-out-')
    const v = victimFile(outside)
    fs.symlinkSync(v, path.join(root, 'sym'))
    fs.linkSync(v, path.join(root, 'hard'))
    const before = stamp(v)
    for (const name of ['sym', 'hard']) {
      const r = py(`
dfd = sfs.open_dir(root, ())
res = []
for fn in (lambda: sfs.write_inplace(dfd, ${JSON.stringify(name)}, "x"), lambda: sfs.open_lock(dfd, ${JSON.stringify(name)})):
    try:
        fn(); res.append("ok")
    except OSError:
        res.append("refused")
print(",".join(res))
`, root)
      expect(r.stdout.trim()).toBe('refused,refused')
    }
    expect(stamp(v)).toEqual(before)
  })

  test('write_atomic over a symlink replaces the link entry, never its target', () => {
    const root = tmp('prdt-t906-root-')
    const outside = tmp('prdt-t906-out-')
    const v = victimFile(outside)
    fs.symlinkSync(v, path.join(root, 'stub.html'))
    const before = stamp(v)
    expect(py(`sfs.write_atomic(sfs.open_dir(root, ()), "stub.html", "new")`, root).status).toBe(0)
    expect(fs.lstatSync(path.join(root, 'stub.html')).isSymbolicLink()).toBe(false)
    expect(fs.readFileSync(path.join(root, 'stub.html'), 'utf8')).toBe('new')
    expect(stamp(v)).toEqual(before)
  })

  for (const where of ['dotprdt', 'mid', 'leaf', 'hard'] as const) {
    test(`append_line refuses a ${where} link, victim byte-identical`, () => {
      const root = tmp('prdt-t906-root-')
      const outside = tmp('prdt-t906-out-')
      const v = victimFile(outside)
      if (where === 'dotprdt') fs.symlinkSync(outside, path.join(root, '.prdt'))
      else {
        fs.mkdirSync(path.join(root, '.prdt'))
        if (where === 'mid') fs.symlinkSync(outside, path.join(root, '.prdt', 'sub'))
        else if (where === 'leaf') fs.symlinkSync(v, path.join(root, '.prdt', 'log.jsonl'))
        else fs.linkSync(v, path.join(root, '.prdt', 'log.jsonl'))
      }
      const rel = where === 'mid' ? ['.prdt', 'sub', 'victim.txt'] : where === 'dotprdt' ? ['.prdt', 'victim.txt'] : ['.prdt', 'log.jsonl']
      const before = stamp(v)
      const r = py(`
try:
    sfs.append_line(root, ${JSON.stringify(rel)}, "row\\n")
    sys.exit(0)
except OSError:
    sys.exit(7)
`, root)
      expect(r.status).toBe(7)
      expect(stamp(v)).toEqual(before)
    })
  }
})

describe.skipIf(!READY)('prdt_safe_fs — modes', () => {
  test('a new file gets default_mode whatever the umask; an existing file keeps its mode (all writers)', () => {
    const root = tmp('prdt-t906-root-')
    const r = py(`
dfd = sfs.open_dir(root, ())
sfs.write_atomic(dfd, "a.html", "1")
sfs.write_inplace(dfd, "flag", "1")
os.close(sfs.open_lock(dfd, "lock"))
sfs.append_line(root, ["log"], "r\\n")
`, root, 0o077)
    expect(r.status).toBe(0)
    expect(mode(path.join(root, 'a.html'))).toBe(0o644)
    expect(mode(path.join(root, 'flag'))).toBe(0o644)
    expect(mode(path.join(root, 'lock'))).toBe(0o644)
    expect(mode(path.join(root, 'log'))).toBe(0o600)
    for (const m of [0o600, 0o444, 0o664]) {
      for (const f of ['a.html', 'flag', 'lock', 'log']) fs.chmodSync(path.join(root, f), m)
      const r2 = py(`
dfd = sfs.open_dir(root, ())
sfs.write_atomic(dfd, "a.html", "2")
try:
    sfs.write_inplace(dfd, "flag", "2")
except PermissionError:
    pass
os.close(sfs.open_lock(dfd, "lock")) if ${m} != 0o444 else None
try:
    sfs.append_line(root, ["log"], "r\\n")
except PermissionError:
    pass
`, root, 0o077)
      expect(r2.status).toBe(0)
      for (const f of ['a.html', 'flag', 'lock', 'log']) expect(mode(path.join(root, f)), `${f} @ ${m.toString(8)}`).toBe(m)
    }
    expect(fs.readFileSync(path.join(root, 'a.html'), 'utf8')).toBe('2')
  })
})

describe.skipIf(!READY)('hook appends under .prdt — every component, not just the leaf (T-906 classification)', () => {
  /** project/.prdt is a symlink to <victimDir>, which holds the po-state marker the hooks walk up for. */
  function linkedDotPrdt() {
    const project = tmp('prdt-t906-proj-')
    const victimDir = tmp('prdt-t906-vdir-')
    fs.writeFileSync(path.join(victimDir, 'po-state.json'),
      JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.9', current_task: null }))
    fs.symlinkSync(victimDir, path.join(project, '.prdt'))
    return { project, victimDir }
  }
  // Every spawned hook gets a sandbox HOME / PRDT_HOME — never the real ~/.prdt.
  const run = (hook: string, cwd: string, event: object) => {
    const home = tmp('prdt-t906-home-')
    return spawnSync('bash', [hook], {
      input: JSON.stringify(event), encoding: 'utf8', cwd, timeout: subprocessTimeout('hook'),
      env: { ...process.env, HOME: home, PRDT_HOME: path.join(home, '.prdt') },
    })
  }
  /** parent transcript + <session>/subagents/agent-<id>.jsonl, so return-check sees a dispatched worker. */
  const workerTranscript = (project: string, agentId: string) => {
    const tp = path.join(project, 'session.jsonl')
    fs.writeFileSync(tp, '{}\n')
    fs.mkdirSync(path.join(project, 'session', 'subagents'), { recursive: true })
    fs.writeFileSync(path.join(project, 'session', 'subagents', `agent-${agentId}.jsonl`), '{}\n')
    return tp
  }

  test('post-dispatch: a symlinked .prdt gets no turns.jsonl line', () => {
    const { project, victimDir } = linkedDotPrdt()
    const tr = path.join(project, 'transcript.jsonl')
    fs.writeFileSync(tr, JSON.stringify({ message: { model: 'claude-sonnet-5', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) + '\n')
    const r = run(POST_DISPATCH, project, { hook_event_name: 'SubagentStop', agent_type: 'prdt-developer', agent_id: 'agent-t906-a', cwd: project, agent_transcript_path: tr })
    expect(r.status).toBe(0)
    expect(fs.existsSync(path.join(victimDir, 'turns.jsonl'))).toBe(false)
  })

  test('return-check: a symlinked .prdt gets no .return-gate.jsonl line', () => {
    const { project, victimDir } = linkedDotPrdt()
    const r = run(RETURN_CHECK, project, {
      hook_event_name: 'SubagentStop', agent_type: 'prdt-developer', agent_id: 'agent-t906-b', cwd: project,
      transcript_path: workerTranscript(project, 'agent-t906-b'), stop_hook_active: false, last_assistant_message: JSON.stringify({ persona: 'developer', task: 'x', confidence: 0.5 }),
    })
    expect(r.status).toBe(0)
    expect(fs.existsSync(path.join(victimDir, '.return-gate.jsonl'))).toBe(false)
  })

  test('control: a real .prdt gets its .return-gate.jsonl line (the absence tests above reach the write)', () => {
    const project = tmp('prdt-t906-proj-')
    fs.mkdirSync(path.join(project, '.prdt'))
    fs.writeFileSync(path.join(project, '.prdt', 'po-state.json'),
      JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.9', current_task: null }))
    const r = run(RETURN_CHECK, project, {
      hook_event_name: 'SubagentStop', agent_type: 'prdt-developer', agent_id: 'agent-t906-b', cwd: project,
      transcript_path: workerTranscript(project, 'agent-t906-b'), stop_hook_active: false,
      last_assistant_message: JSON.stringify({ persona: 'developer', task: 'x', confidence: 0.5 }),
    })
    expect(r.status).toBe(0)
    expect(fs.readFileSync(path.join(project, '.prdt', '.return-gate.jsonl'), 'utf8').length).toBeGreaterThan(0)
  })

  test('post-dispatch: a refused append does not abort the rest of the event (sessions.json still written elsewhere is not required; exit 0 and no traceback)', () => {
    const { project } = linkedDotPrdt()
    const tr = path.join(project, 'transcript.jsonl')
    fs.writeFileSync(tr, JSON.stringify({ message: { model: 'claude-sonnet-5', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) + '\n')
    const r = run(POST_DISPATCH, project, { hook_event_name: 'SubagentStop', agent_type: 'prdt-developer', agent_id: 'agent-t906-d', cwd: project, agent_transcript_path: tr })
    expect(r.status).toBe(0)
    expect(r.stderr).not.toContain('Traceback')
  })

  test('control: a real .prdt still gets its turns.jsonl line, mode 0600', () => {
    const project = tmp('prdt-t906-proj-')
    fs.mkdirSync(path.join(project, '.prdt'))
    fs.writeFileSync(path.join(project, '.prdt', 'po-state.json'),
      JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.9', current_task: null }))
    const tr = path.join(project, 'transcript.jsonl')
    fs.writeFileSync(tr, JSON.stringify({ message: { model: 'claude-sonnet-5', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) + '\n')
    const r = run(POST_DISPATCH, project, { hook_event_name: 'SubagentStop', agent_type: 'prdt-developer', agent_id: 'agent-t906-c', cwd: project, agent_transcript_path: tr })
    expect(r.status).toBe(0)
    const turns = path.join(project, '.prdt', 'turns.jsonl')
    expect(fs.readFileSync(turns, 'utf8')).toContain('agent-t906-c')
    expect(mode(turns)).toBe(0o600)
  })
})
