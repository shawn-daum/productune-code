/**
 * prdt-worktree-guard.sh — T-1173 rules 3 and 5.
 *
 * Rule 5: the runtime root ($PRDT_HOME) is read-only for every session; the
 * main session (PO) keeps overrides/ and wiki/ (not wiki/feedback.md); any
 * subagent (prdt worker, general-purpose, Explore, fork) has no carve-out; a
 * `prdt …` CLI call names no target and passes. A prdt worker also never
 * writes a project wiki (docs/*\/wiki/**).
 * Rule 3: a deploy command (git push to main, merge into main, gh pr merge,
 * vercel/netlify prod) while po-state stage is define/build is denied unless
 * the wiki log carries an N/A-skip line naming the version.
 *
 * Every run uses a sandbox project + sandbox PRDT_HOME (never ~/.prdt).
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, test } from 'vitest'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-worktree-guard.sh')
const PY = spawnSync('python3', ['--version']).status === 0

let sb: string, root: string, code: string, home: string, ph: string, scratch: string, transcript: string

function mk(stage = 'build', version = 'v1.2'): void {
  sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wg-1173-')))
  root = path.join(sb, 'proj')
  code = path.join(root, 'code')
  home = path.join(sb, 'home')
  ph = path.join(home, '.prdt')
  scratch = path.join(sb, 'scratch')
  for (const d of [path.join(root, '.prdt'), path.join(code, '.git'), path.join(root, 'docs', '_shared', 'wiki'),
    path.join(root, 'docs', 'p', 'wiki'), path.join(ph, 'run'), path.join(ph, 'overrides', 'playbooks'), path.join(ph, 'wiki'), scratch])
    fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage, version, current_task: null }))
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'p', code: { dir: 'code' } }))
  fs.writeFileSync(path.join(code, '.git', 'HEAD'), 'ref: refs/heads/dev\n')
  fs.writeFileSync(path.join(root, 'docs', '_shared', 'wiki', 'log.md'), '# Log\n')
  transcript = path.join(sb, 's.jsonl')
  fs.writeFileSync(transcript, '')
}

// `main` = the real PO main-session shape (measured, QA d-v114-t1173-qa1): agent_type 'prdt-po', NO agent_id.
// `main-bare` = neither key. `typed-only` = an agent_type that is not the PO, still no agent_id: a subagent.
type Who = 'main' | 'main-bare' | 'typed-only' | 'general-purpose' | 'fork' | 'prdt-developer' | 'prdt-designer'
function run(who: Who, tool: string, input: Record<string, unknown>, cwd = root, extraEnv: Record<string, string> = {}): string {
  const ev: Record<string, unknown> = { session_id: 's', transcript_path: transcript, cwd }
  if (who === 'main') ev.agent_type = 'prdt-po'
  else if (who === 'typed-only') ev.agent_type = 'probe'
  else if (who !== 'main-bare') { ev.agent_id = 'agent-x'; ev.agent_type = who }
  Object.assign(ev, { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 't1' })
  const env = { ...process.env, HOME: home, ...extraEnv }
  delete env.PRDT_HOME
  const r = spawnSync('bash', [HOOK], { input: JSON.stringify(ev), encoding: 'utf8', env })
  expect(r.status).toBe(0)
  return r.stdout
}
const write = (who: Who, file_path: string) => run(who, 'Write', { file_path, content: 'x' })
const bash = (who: Who, command: string, cwd?: string) => run(who, 'Bash', { command }, cwd)
function reason(out: string): string {
  expect(out, 'expected a deny').not.toBe('')
  const j = JSON.parse(out)
  expect(j.hookSpecificOutput.permissionDecision).toBe('deny')
  return j.hookSpecificOutput.permissionDecisionReason as string
}

describe.skipIf(!PY)('T-1173 rule 5 — the runtime root is read-only', () => {
  beforeEach(() => mk())

  test('main session: run/, discipline, inbox.md, feedback.md are denied; overrides/ and wiki/ pages are its carve-out', () => {
    for (const f of [path.join(ph, 'run', 'x.json'), path.join(ph, 'discipline', 'contracts.md'), path.join(ph, 'inbox.md'),
      path.join(ph, 'wiki', 'feedback.md'), path.join(ph, 'register')])
      expect(reason(write('main', f)), f).toContain('T-1173 rule 5')
    expect(write('main', path.join(ph, 'overrides', 'developer.md'))).toBe('')
    expect(write('main', path.join(ph, 'overrides', 'playbooks', 'implement.md'))).toBe('')
    expect(write('main', path.join(ph, 'wiki', 'fact--x.md'))).toBe('')
  })

  test('main session Bash: redirects, rm, cp, globs and $HOME/~ spellings under the root are denied', () => {
    for (const c of ['echo x > ~/.prdt/run/a', 'rm -rf ~/.prdt/run/dispatches', 'cp /tmp/f $HOME/.prdt/discipline/x.md',
      'cd ~/.prdt && touch run/x', 'rm ~/.prdt/r*', 'sed -i "" s/a/b/ ~/.prdt/register', 'rm -rf ~/.prdt'])
      expect(reason(bash('main', c)), c).toContain('T-1173 rule 5')
  })

  test('false positives stay silent: prdt CLI calls, reads, a sandbox PRDT_HOME, the home dir itself, the scratchpad', () => {
    for (const c of ['prdt settings set register.form outline', 'prdt feedback record "x"', 'prdt inbox send "x"',
      'prdt resource up vm --dispatch d-1', '~/.prdt/bin/prdt doctor', 'cat ~/.prdt/run/x', 'ls -la ~/.prdt',
      `PRDT_HOME=${scratch}/p; echo x > "$PRDT_HOME/run/a"`, 'cp /tmp/f ~', `echo x > ${scratch}/a`,
      'echo "never write ~/.prdt/run by hand"', 'rm ~/.prdt/overrides/*.md'])
      expect(bash('main', c), c).toBe('')
  })

  test('main-session detection: no agent_id and agent_type absent or prdt-po is the PO; any other agent_type is a subagent', () => {
    const f = path.join(ph, 'overrides', 'developer.md')
    expect(write('main', f)).toBe('')
    expect(write('main-bare', f)).toBe('')
    expect(reason(write('typed-only', f))).toContain('T-1173 rule 5')
    expect(reason(bash('typed-only', 'touch ~/.prdt/wiki/x.md'))).toContain('T-1173 rule 5')
    expect(reason(write('main', path.join(ph, 'wiki', 'feedback.md')))).toContain('T-1173 rule 5')
  })

  test('a PO delete or overwrite whose glob or recursive target covers wiki/feedback.md is denied', () => {
    for (const c of ['rm -rf ~/.prdt/wiki/*', 'rm -rf ~/.prdt/wiki', 'rm -rf ~/.prdt/wiki/', 'rm ~/.prdt/wiki/f*',
      'rm ~/.prdt/wiki/*.md', 'rm -rf ~/.prdt/wiki/{fact,feedback}*', 'find ~/.prdt/wiki -delete', 'cd ~/.prdt/wiki && rm -rf *'])
      expect(reason(bash('main', c)), c).toContain('T-1173 rule 5')
    for (const c of ['rm ~/.prdt/wiki/fact--x.md', 'rm ~/.prdt/wiki/fact--*.md', 'cp /tmp/f ~/.prdt/wiki/', 'rm -rf ~/.prdt/overrides/playbooks',
      'cat ~/.prdt/wiki/*'])
      expect(bash('main', c), c).toBe('')
  })

  test('a non-prdt subagent (general-purpose, fork) and a prdt worker get no carve-out', () => {
    for (const who of ['general-purpose', 'fork', 'prdt-developer', 'prdt-designer'] as const) {
      expect(reason(write(who, path.join(ph, 'overrides', 'developer.md'))), who).toContain('T-1173 rule 5')
      expect(reason(bash(who, 'touch ~/.prdt/wiki/x.md')), who).toContain('T-1173 rule 5')
      expect(bash(who, 'prdt resource up vm --dispatch d-1'), who).toBe('')
    }
  })

  test('a prdt worker never writes a project wiki; the main session and a general-purpose subagent may', () => {
    for (const f of ['docs/_shared/wiki/inbox.md', path.join(root, 'docs', 'p', 'wiki', 'x.md'), 'docs/wiki/log.md'])
      expect(reason(write('prdt-developer', f)), f).toContain('memory_notes')
    expect(reason(bash('prdt-designer', 'echo x >> docs/_shared/wiki/inbox.md'))).toContain('memory_notes')
    expect(write('prdt-designer', 'docs/_shared/prd/PRD.md')).toBe('')
    expect(write('main', 'docs/_shared/wiki/inbox.md')).toBe('')
    expect(write('general-purpose', 'docs/_shared/wiki/inbox.md')).toBe('')
  })
})

describe.skipIf(!PY)('T-1173 rule 3 — a deploy command waits for ship entry', () => {
  beforeEach(() => mk())

  test('deploy shapes while stage=build are denied, naming ship entry', () => {
    for (const c of ['git push origin main', 'git -C code push origin dev:main', 'git push origin +HEAD:refs/heads/main',
      'git push --all origin', 'cd code && git checkout main && git merge dev', 'gh pr merge 12 --merge',
      'vercel --prod', 'npx vercel deploy --prod', 'vercel promote https://x.vercel.app', 'netlify deploy --prod',
      'bash -c "git push origin main"']) {
      const why = reason(bash('main', c))
      expect(why, c).toContain('T-1173 rule 3')
      expect(why, c).toContain('stage=build')
    }
  })

  test('a tag push ships on the deploy: --tags, v* and refs/tags/v* are deploys; --dry-run / -n are allowed', () => {
    for (const c of ['git push --tags', 'git push origin --tags', 'git push origin v1.14', 'git push origin refs/tags/v1.14',
      'git push origin tag v1.14', 'git push origin HEAD:refs/tags/v1.14', 'git -C code push origin v1.14.2'])
      expect(reason(bash('main', c)), c).toContain('T-1173 rule 3')
    for (const c of ['git push -n origin main', 'git push --dry-run origin main', 'git push --dry-run --tags', 'git push -n --tags',
      'git push origin v1.14 --dry-run', 'git push origin dev', 'git push origin validation-fix'])
      expect(bash('main', c), c).toBe('')
  })

  test('a worker is held to it too', () => {
    expect(reason(bash('prdt-developer', 'git push origin main'))).toContain('T-1173 rule 3')
  })

  test('false positives stay silent: the deploy words in prose, non-main pushes, previews, a merge off main', () => {
    for (const c of ['echo "git push origin main after ship"', 'git commit -m "merge main push deploy"',
      'grep -n "vercel --prod" README.md', 'git push origin dev', 'git -C code push', 'vercel', 'vercel deploy',
      'git -C code merge dev', 'git -C code merge --abort', 'git push origin track/T-1:track/T-1', 'prdt settings set viewer.auto-open on'])
      expect(bash('main', c), c).toBe('')
  })

  test('a bare push or merge on a checked-out main is a deploy', () => {
    fs.writeFileSync(path.join(code, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    expect(reason(bash('main', 'git push', code))).toContain('T-1173 rule 3')
    expect(reason(bash('main', 'git merge dev', code))).toContain('T-1173 rule 3')
    expect(bash('main', 'git merge --abort', code)).toBe('')
  })

  test('stage ship, an N/A-skip line naming the version, or no prdt project → silent; another version\'s skip line is not enough', () => {
    mk('ship')
    expect(bash('main', 'git push origin main')).toBe('')
    mk('define')
    expect(reason(bash('main', 'git push origin main'))).toContain('stage=define')
    mk('build', 'v1.2')
    fs.appendFileSync(path.join(root, 'docs', '_shared', 'wiki', 'log.md'), '- readiness v1.21 N/A-skip (other version)\n')
    expect(reason(bash('main', 'git push origin main'))).toContain('T-1173 rule 3')
    fs.appendFileSync(path.join(root, 'docs', '_shared', 'wiki', 'log.md'), '- 2026-10-20 readiness v1.2 N/A-skip (single patch)\n')
    expect(bash('main', 'git push origin main')).toBe('')
    expect(bash('main', 'git push origin main', scratch)).toBe('')
  })
})

describe.skipIf(!PY)('T-1173 pre-filter — push/merge/vercel/netlify words reach python for Bash events only', () => {
  beforeEach(() => mk())
  // A python3 stub that records being invoked: the hook's pre-filter decides whether it ever starts.
  function reached(who: Who, tool: string, input: Record<string, unknown>): boolean {
    const stub = path.join(sb, 'stub'); fs.mkdirSync(stub, { recursive: true })
    const mark = path.join(sb, 'mark')
    fs.writeFileSync(path.join(stub, 'python3'), `#!/bin/sh\ntouch ${mark}\ncat >/dev/null\n`, { mode: 0o755 })
    run(who, tool, input, root, { PATH: `${stub}:${process.env.PATH}` })
    return fs.existsSync(mark)
  }
  test('Write/Edit content with a deploy word stays in the pre-filter; a Bash command with one goes on', () => {
    for (const w of ['push', 'merge', 'vercel', 'netlify'])
      expect(reached('main', 'Write', { file_path: path.join(scratch, 'a.md'), content: `we ${w} it` }), `Write ${w}`).toBe(false)
    expect(reached('main', 'Edit', { file_path: path.join(scratch, 'a.md'), old_string: 'x', new_string: 'git push origin main' })).toBe(false)
    for (const w of ['git push origin dev', 'git merge dev', 'vercel deploy', 'netlify status'])
      expect(reached('main', 'Bash', { command: w }), w).toBe(true)
    expect(reached('main', 'Write', { file_path: path.join(ph, 'run', 'x'), content: 'x' })).toBe(true)
  })
})
