/**
 * track-worktree-resolver-parity.test.ts — T-1112.
 *
 * `<project>/tracks/T-NNN` (a linked git worktree) is a project boundary: no
 * resolver may walk out of it into the enclosing real project's `.prdt/`. The
 * projectRoot walk lives in the CLI (find_project_root), four hooks (session-start,
 * project-overrides-inject, user-prompt, post-dispatch) and the statusline; this
 * file reads each one's OBSERVED outcome from a cwd inside the worktree (which
 * project's override / stage / sessions.json / slug came out) and requires every
 * one to answer "REALPROJ is not mine". A control copy of each script with the
 * boundary neutralized (the "tracks" literal renamed) shows the same cwd DID reach
 * REALPROJ before the fix. Remaining python twins (auto-open, inbox-inject,
 * return-check, question-check) are checked for the identical block.
 * Everything runs on temp fixtures, nothing touches a real project.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const HOOKS = path.join(CORE_ROOT, 'scripts', 'hooks')
const SESSION = path.join(HOOKS, 'prdt-session-start.sh')
const OVERRIDES = path.join(HOOKS, 'prdt-project-overrides-inject.sh')
const USER_PROMPT = path.join(HOOKS, 'prdt-user-prompt.sh')
const POST_DISPATCH = path.join(HOOKS, 'prdt-post-dispatch.sh')
const STATUSLINE = path.join(CORE_ROOT, 'scripts', 'statusline-prdt.sh')
const OTHER_TWINS = ['prdt-auto-open.sh', 'prdt-inbox-inject.sh',
  'prdt-return-check.sh', 'prdt-question-check.sh'].map((n) => path.join(HOOKS, n))

const hasBin = (bin: string) => { try { execFileSync('command', ['-v', bin], { stdio: 'ignore', shell: '/bin/bash' }); return true } catch { return false } }
const READY = hasBin('jq') && hasBin('python3')

/** Control: the same script with the T-1112 boundary neutralized. */
function unbounded(script: string): string {
  // T-1170: `prdt` is a launcher; the code to neutralize is its body, prdt_cli.py, beside it
  const body = path.join(path.dirname(script), 'prdt_cli.py')
  const isLauncher = path.basename(script) === 'prdt' && fs.existsSync(body)
  const src = fs.readFileSync(isLauncher ? body : script, 'utf8')
  expect(src).toContain('"tracks"')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1112-prefix-'))
  const p = path.join(dir, path.basename(isLauncher ? body : script))
  const lanes = path.join(path.dirname(script), 'prdt_lanes.py')
  if (fs.existsSync(lanes)) fs.copyFileSync(lanes, path.join(dir, 'prdt_lanes.py'))
  if (isLauncher) fs.copyFileSync(script, path.join(dir, 'prdt'))
  fs.writeFileSync(p, src.replaceAll('"tracks"', '"tracks-off"').replaceAll('name == "tracks-off"', 'name == "tracks-off"'), { mode: 0o755 })
  return isLauncher ? path.join(dir, 'prdt') : p
}

interface Fx { proj: string; wt: string; deep: string; wtOwn: string; home: string }
function makeFx(): Fx {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1112-')))
  const seed = (root: string, id: string, version: string, stage: string) => {
    fs.mkdirSync(path.join(root, '.prdt', 'overrides'), { recursive: true })
    fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({
      schema_version: 1, stage, version, current_task: { ticket_id: 'T-1', slug: 's', assignee: 'developer' } }))
    fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: id }))
    fs.writeFileSync(path.join(root, '.prdt', 'overrides', 'developer.md'), `- ${id}-OVERRIDE-RULE\n`)
  }
  const proj = path.join(base, 'real'); seed(proj, 'REALPROJ', 'v1.6', 'build')
  const wt = path.join(proj, 'tracks', 'T-1112')
  const deep = path.join(wt, 'packages', 'core')
  fs.mkdirSync(deep, { recursive: true })
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: /nonexistent\n')
  const wtOwn = path.join(proj, 'tracks', 'T-7'); seed(wtOwn, 'OWNPROJ', 'v7.7', 'ship')
  fs.writeFileSync(path.join(wtOwn, '.git'), 'gitdir: /nonexistent\n')
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1112-home-'))
  for (const p of ['po', 'designer', 'developer', 'qa']) {
    fs.mkdirSync(path.join(home, 'discipline', p, 'playbooks'), { recursive: true })
    fs.writeFileSync(path.join(home, 'discipline', p, 'habit.md'), `# ${p}\n`)
    fs.writeFileSync(path.join(home, 'discipline', p, 'playbooks', '_index.md'), '| menu |\n')
  }
  fs.mkdirSync(path.join(home, 'overrides'), { recursive: true })
  fs.writeFileSync(path.join(home, 'doctrine.md'), '# doctrine\n')
  fs.writeFileSync(path.join(home, 'discipline', 'contracts.md'), '# contracts\n')
  return { proj, wt, deep, wtOwn, home }
}

const run = (script: string, event: unknown, env: NodeJS.ProcessEnv = {}) =>
  execFileSync('bash', [script], { input: JSON.stringify(event), encoding: 'utf8', env: { ...process.env, ...env } })
const ctxOf = (out: string) => (out.trim() ? (JSON.parse(out).hookSpecificOutput.additionalContext as string) : '')

/** Per resolver: which project it reached, read from what it did. */
function answers(f: Fx, cwd: string, prefix = false): Record<string, string> {
  const pick = (s: string) => (s.includes('OWNPROJ') || s.includes('v7.7') || s.includes('/T-7') ? 'OWNPROJ'
    : s.includes('REALPROJ') || s.includes('v1.6') || s.includes(f.proj) ? 'REALPROJ' : 'none')
  const sc = (s: string) => (prefix ? unbounded(s) : s)
  const cliSrc = prefix ? unbounded(PRDT_CLI) : PRDT_CLI
  const cli = execFileSync('python3', ['-c', `
import importlib.machinery, importlib.util
l = importlib.machinery.SourceFileLoader("m", ${JSON.stringify(cliSrc)})
s = importlib.util.spec_from_loader("m", l); m = importlib.util.module_from_spec(s); l.exec_module(m)
r = m.find_project_root(${JSON.stringify(cwd)}); print(r or "")
`], { encoding: 'utf8' }).trim()
  const ss = ctxOf(run(sc(SESSION), { hook_event_name: 'SessionStart', cwd }, { PRDT_HOME: f.home }))
  const po = ctxOf(run(sc(OVERRIDES), { agent_type: 'prdt-developer', hook_event_name: 'SubagentStart', cwd }, { PRDT_HOME: f.home }))
  const up = ctxOf(run(sc(USER_PROMPT), { hook_event_name: 'UserPromptSubmit', cwd, prompt: 'hi' }))
  for (const r of [f.proj, f.wtOwn]) fs.rmSync(path.join(r, '.prdt', 'sessions.json'), { force: true })
  run(sc(POST_DISPATCH), { hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'prdt-developer' }, cwd })
  const wrote = fs.existsSync(path.join(f.wtOwn, '.prdt', 'sessions.json')) ? 'OWNPROJ'
    : fs.existsSync(path.join(f.proj, '.prdt', 'sessions.json')) ? 'REALPROJ' : 'none'
  const sl = run(sc(STATUSLINE), { workspace: { current_dir: cwd } })
  return {
    'scripts/prdt': pick(cli), 'prdt-session-start.sh': pick(ss),
    'prdt-project-overrides-inject.sh': pick(po.match(/[A-Z]+PROJ-OVERRIDE-RULE/)?.[0] ?? ''),
    'prdt-user-prompt.sh': pick(up), 'prdt-post-dispatch.sh': wrote, 'statusline-prdt.sh': pick(sl),
  }
}

let f: Fx
beforeEach(() => { f = makeFx() })

describe.skipIf(!READY)('track worktree is a project boundary for every resolver (T-1112)', () => {
  test('from inside the worktree, no resolver reaches the enclosing project', () => {
    for (const cwd of [f.wt, f.deep]) {
      for (const [who, ans] of Object.entries(answers(f, cwd))) expect(ans, `${who} from ${cwd}`).toBe('none')
    }
  })
  test('the real project itself still resolves to itself', () => {
    for (const [who, ans] of Object.entries(answers(f, f.proj))) expect(ans, who).toBe('REALPROJ')
  })
  test('a .prdt planted in the worktree is never a project: no resolver answers it (F1)', () => {
    for (const [who, ans] of Object.entries(answers(f, path.join(f.wtOwn, 'sub')))) expect(ans, who).toBe('none')
  })
  test('a planted overrides file in the worktree is never injected as PROJECT overrides (F1)', () => {
    for (const cwd of [f.wtOwn, path.join(f.wtOwn, 'sub')]) {
      const out = ctxOf(run(OVERRIDES, { agent_type: 'prdt-developer', hook_event_name: 'SubagentStart', cwd }, { PRDT_HOME: f.home }))
      expect(out).not.toContain('OWNPROJ-OVERRIDE-RULE')
      expect(out).not.toContain('REALPROJ-OVERRIDE-RULE')
    }
  })
  test('control: with the boundary neutralized every resolver reaches REALPROJ from the worktree', () => {
    for (const [who, ans] of Object.entries(answers(f, f.deep, true))) expect(ans, `${who} unpatched`).toBe('REALPROJ')
  })
  test('the other python twins carry the same boundary block', () => {
    for (const s of OTHER_TWINS) {
      const src = fs.readFileSync(s, 'utf8')
      expect(src, path.basename(s)).toContain('T-1112')
      expect(src, path.basename(s)).toMatch(/basename\([^)]*dirname\(d\)\) == "tracks"|"tracks" \]/)
    }
  })
})
