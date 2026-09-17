/**
 * atomic-write-symlink-guard.test.ts — T-647.
 *
 * `atomic_write` in prdt-post-dispatch.sh and prdt-return-check.sh opened
 * `path + ".tmp"` with a plain `open(..., "w")`, which follows a symlink and
 * truncates whatever it points at; `os.replace` then consumed the symlink
 * with no trace. `.prdt/` is project-local and arrives with a clone, and git
 * carries symlinks — so a cloned repo could plant `.prdt/sessions.json.tmp`
 * (or `.prdt/turns.jsonl` / `.prdt/.return-gate.jsonl` for the append sites)
 * as a symlink aimed at any file this uid can write, and the first dispatch
 * that fires `PostToolUse(Agent)` or `SubagentStop` would fill it.
 *
 * Each scenario below runs the SAME event twice against the SAME planted
 * symlink: once against the pre-fix hook (fetched from `git show HEAD`, this
 * repo's own last commit — the fix below is uncommitted working-tree state),
 * proving the outside target really is clobbered by today's code, then again
 * against the working-tree (fixed) hook, proving it is not.
 *
 * Fixture-only, per the ticket's boundary: everything lives under a per-test
 * mkdtemp directory, never `~/.claude` or `~/.prdt`.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeAll } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const REPO_ROOT = path.resolve(CORE_ROOT, '..', '..')
const POST_DISPATCH_FIXED = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-post-dispatch.sh')
const RETURN_CHECK_FIXED = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-return-check.sh')

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

/** A project dir carrying the `.prdt/po-state.json` marker both hooks up-walk for. */
function makeProject(): string {
  const root = tmp('prdt-t647-proj-')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(
    path.join(root, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.9', current_task: null }),
  )
  return root
}

/** The pre-fix hook body, fetched from this repo's own last commit (the fix
 *  made by this ticket is still uncommitted working-tree state), written to a
 *  private temp copy so running it never mutates the file under test. */
function preFixHook(relPath: string, dir: string): string {
  const body = execFileSync('git', ['show', `HEAD:${relPath}`], { cwd: REPO_ROOT, encoding: 'utf8' })
  const p = path.join(dir, path.basename(relPath))
  fs.writeFileSync(p, body)
  return p
}

const SENTINEL = 'do-not-touch: outside-user-file\n'

function readVictim(p: string): string {
  return fs.readFileSync(p, 'utf8')
}

/** Plants `<dir>/<name>` as a symlink to `victim`, replacing whatever (if
 *  anything) is there from a previous run in this same fixture dir. */
function plantSymlink(linkPath: string, victim: string): void {
  try {
    fs.unlinkSync(linkPath)
  } catch {
    /* did not exist — fine */
  }
  fs.symlinkSync(victim, linkPath)
}

function run(hook: string, cwd: string, event: Record<string, unknown>): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync('bash', [hook], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    cwd,
    timeout: 10_000,
  })
  return { status: res.status, stdout: res.stdout, stderr: res.stderr }
}

describe('atomic_write / append symlink guard (T-647)', () => {
  let preFixDir: string

  beforeAll(() => {
    preFixDir = tmp('prdt-t647-prefix-')
  })

  describe('prdt-post-dispatch.sh — atomic_write via .prdt/sessions.json.tmp', () => {
    function dispatchEvent(cwd: string): Record<string, unknown> {
      return {
        hook_event_name: 'PostToolUse',
        tool_name: 'Agent',
        tool_input: { subagent_type: 'prdt-developer' },
        agent_id: 'agent-t647-a',
        cwd,
        tool_response: { agentId: 'agent-t647-a' },
      }
    }

    test('today\'s code (HEAD) clobbers the outside file the symlink points at', () => {
      const hook = preFixHook('packages/core/scripts/hooks/prdt-post-dispatch.sh', preFixDir)
      const project = makeProject()
      const victim = path.join(project, 'victim-sessions.txt')
      fs.writeFileSync(victim, SENTINEL)
      plantSymlink(path.join(project, '.prdt', 'sessions.json.tmp'), victim)

      const res = run(hook, project, dispatchEvent(project))
      expect(res.status).toBe(0)

      // The reproduction: the JSON payload replaced the sentinel content.
      expect(readVictim(victim)).not.toBe(SENTINEL)
      expect(readVictim(victim)).toContain('"agent_id"') // sessions.json payload shape leaked through
    })

    test('the fixed hook leaves the outside file untouched', () => {
      const project = makeProject()
      const victim = path.join(project, 'victim-sessions.txt')
      fs.writeFileSync(victim, SENTINEL)
      plantSymlink(path.join(project, '.prdt', 'sessions.json.tmp'), victim)

      const res = run(POST_DISPATCH_FIXED, project, dispatchEvent(project))
      expect(res.status).toBe(0)
      expect(res.stderr).toBe('')

      expect(readVictim(victim)).toBe(SENTINEL)
      // Real functionality survives: sessions.json itself gets written normally.
      const sessPath = path.join(project, '.prdt', 'sessions.json')
      expect(fs.existsSync(sessPath)).toBe(true)
      expect(fs.lstatSync(sessPath).isSymbolicLink()).toBe(false)
      const sess = JSON.parse(fs.readFileSync(sessPath, 'utf8'))
      expect(sess.developer.agent_id).toBe('agent-t647-a')
    })
  })

  describe('prdt-post-dispatch.sh — append via .prdt/turns.jsonl', () => {
    function transcript(dir: string): string {
      const p = path.join(dir, 'transcript.jsonl')
      fs.writeFileSync(
        p,
        JSON.stringify({
          message: {
            model: 'claude-sonnet-5',
            usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
        }) + '\n',
      )
      return p
    }

    function stopEvent(cwd: string, transcriptPath: string): Record<string, unknown> {
      return {
        hook_event_name: 'SubagentStop',
        agent_type: 'prdt-developer',
        agent_id: 'agent-t647-b',
        cwd,
        agent_transcript_path: transcriptPath,
      }
    }

    test('today\'s code (HEAD) appends the record onto the outside file the symlink points at', () => {
      const hook = preFixHook('packages/core/scripts/hooks/prdt-post-dispatch.sh', preFixDir)
      const project = makeProject()
      const victim = path.join(project, 'victim-turns.txt')
      fs.writeFileSync(victim, SENTINEL)
      plantSymlink(path.join(project, '.prdt', 'turns.jsonl'), victim)

      const res = run(hook, project, stopEvent(project, transcript(project)))
      expect(res.status).toBe(0)

      const after = readVictim(victim)
      expect(after.startsWith(SENTINEL)).toBe(true)
      expect(after.length).toBeGreaterThan(SENTINEL.length) // the turns.jsonl line landed on the outside file
    })

    test('the fixed hook never writes through the symlink', () => {
      const project = makeProject()
      const victim = path.join(project, 'victim-turns.txt')
      fs.writeFileSync(victim, SENTINEL)
      plantSymlink(path.join(project, '.prdt', 'turns.jsonl'), victim)

      const res = run(POST_DISPATCH_FIXED, project, stopEvent(project, transcript(project)))
      expect(res.status).toBe(0)
      // O_NOFOLLOW refuses to open through the symlink at all (ELOOP) rather
      // than silently writing through it — that failure is allowed to surface
      // on stderr (the bash wrapper's trailing `exit 0` still absorbs it into
      // a clean hook exit); the load-bearing assertion is the file itself.
      expect(readVictim(victim)).toBe(SENTINEL)
    })
  })

  describe('prdt-return-check.sh — atomic_write (.return-gate-pending.json.tmp) + append (.return-gate.jsonl)', () => {
    // A malformed return (missing `summary`) on the FIRST firing drives both
    // call sites in one event: remember_block() → atomic_write, log_gate() → append.
    function blockEvent(cwd: string): Record<string, unknown> {
      return {
        hook_event_name: 'SubagentStop',
        agent_type: 'prdt-developer',
        agent_id: 'agent-t647-c',
        cwd,
        stop_hook_active: false,
        last_assistant_message: JSON.stringify({ persona: 'developer', task: 'x', confidence: 0.5 }),
      }
    }

    test('today\'s code (HEAD) clobbers both outside files', () => {
      const hook = preFixHook('packages/core/scripts/hooks/prdt-return-check.sh', preFixDir)
      const project = makeProject()
      const victimTmp = path.join(project, 'victim-pending.txt')
      const victimAppend = path.join(project, 'victim-gate.txt')
      fs.writeFileSync(victimTmp, SENTINEL)
      fs.writeFileSync(victimAppend, SENTINEL)
      plantSymlink(path.join(project, '.prdt', '.return-gate-pending.json.tmp'), victimTmp)
      plantSymlink(path.join(project, '.prdt', '.return-gate.jsonl'), victimAppend)

      const res = run(hook, project, blockEvent(project))
      expect(res.status).toBe(0)

      expect(readVictim(victimTmp)).not.toBe(SENTINEL)
      const afterAppend = readVictim(victimAppend)
      expect(afterAppend.startsWith(SENTINEL)).toBe(true)
      expect(afterAppend.length).toBeGreaterThan(SENTINEL.length)
    })

    test('the fixed hook leaves both outside files untouched', () => {
      const project = makeProject()
      const victimTmp = path.join(project, 'victim-pending.txt')
      const victimAppend = path.join(project, 'victim-gate.txt')
      fs.writeFileSync(victimTmp, SENTINEL)
      fs.writeFileSync(victimAppend, SENTINEL)
      plantSymlink(path.join(project, '.prdt', '.return-gate-pending.json.tmp'), victimTmp)
      plantSymlink(path.join(project, '.prdt', '.return-gate.jsonl'), victimAppend)

      const res = run(RETURN_CHECK_FIXED, project, blockEvent(project))
      expect(res.status).toBe(0)

      expect(readVictim(victimTmp)).toBe(SENTINEL)
      expect(readVictim(victimAppend)).toBe(SENTINEL)
    })
  })
})
