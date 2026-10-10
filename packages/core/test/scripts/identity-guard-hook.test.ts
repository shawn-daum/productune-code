/**
 * prdt-identity-guard.sh — T-976.
 *
 * WHY: naro-proto workers put the user's email into outbound User-Agent
 * headers twice (T-289: 154 research requests, T-342: 14 Wikimedia Commons
 * lookups) — the harness hands every agent the user's email, APIs ask for a
 * contact in the User-Agent, and a worker "helpfully" fills it in. This hook
 * denies the outbound call (or the script that would make it) before it runs.
 *
 * RULE under test (the one the hook header states in full):
 *   - WebFetch / WebSearch: identity anywhere in the URL / query → deny.
 *   - Write / Edit / MultiEdit / NotebookEdit: the new text holds the identity
 *     AND a request marker (User-Agent, curl, urlopen, requests., fetch(, …)
 *     → deny — the script is caught as it is written.
 *   - Bash: identity in the command (outside a `git …` simple command) or in a
 *     script file the command runs, AND a request marker in the command or
 *     that file → deny. `git` commands (commit author lines, config) and
 *     commands with no request marker (local-only) pass.
 *
 * Fixture identity only — never the real user's address. Every spawn gets a
 * sandbox HOME (its own .gitconfig + .claude.json) and sandbox PRDT_HOME.
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { beforeAll, describe, expect, test } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'prdt-identity-guard.sh')
const HAS_JQ = spawnSync('jq', ['--version']).status === 0

const EMAIL = 'fixture.user@example.test'
const GIT_EMAIL = 'fixture.git@example.test'
const NAME = 'Fixture Person'
const OTHER = 'someone.else@example.test'

let sb: string, home: string, prdtHome: string, proj: string

function sandbox(opts: { claudeEmail?: string; claudeName?: string; gitEmail?: string; gitName?: string }): string {
  const h = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'id-guard-home-')))
  if (opts.claudeEmail || opts.claudeName) {
    fs.writeFileSync(path.join(h, '.claude.json'), JSON.stringify({
      numStartups: 3,
      projects: { '/x': { allowedTools: [] } },
      oauthAccount: { emailAddress: opts.claudeEmail ?? '', fullName: opts.claudeName ?? '', displayName: 'Fixture' },
    }))
  }
  const lines: string[] = ['[user]']
  if (opts.gitEmail) lines.push(`\temail = ${opts.gitEmail}`)
  if (opts.gitName) lines.push(`\tname = ${opts.gitName}`)
  if (lines.length > 1) fs.writeFileSync(path.join(h, '.gitconfig'), lines.join('\n') + '\n')
  return h
}

beforeAll(() => {
  sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'id-guard-')))
  home = sandbox({ claudeEmail: EMAIL, claudeName: NAME, gitEmail: GIT_EMAIL, gitName: 'fixture' })
  prdtHome = path.join(sb, 'prdt')
  proj = path.join(sb, 'proj')
  fs.mkdirSync(prdtHome, { recursive: true })
  fs.mkdirSync(path.join(proj, 'tools'), { recursive: true })
  fs.writeFileSync(path.join(proj, 'fetch.py'),
    `import urllib.request\nUA = "naro-proto/1.0 (research; ${EMAIL})"\n` +
    `urllib.request.urlopen(urllib.request.Request("https://commons.wikimedia.org/w/api.php", headers={"User-Agent": UA}))\n`)
  fs.writeFileSync(path.join(proj, 'tools', 'ok.py'),
    'import urllib.request\nUA = "naro-proto/1.0 (+https://github.com/example/naro-proto)"\n' +
    'urllib.request.urlopen(urllib.request.Request("https://commons.wikimedia.org/w/api.php", headers={"User-Agent": UA}))\n')
  fs.writeFileSync(path.join(proj, 'local.py'), `AUTHOR = "${EMAIL}"\nprint(AUTHOR)\n`)
  fs.writeFileSync(path.join(proj, 'headers.txt'), `User-Agent: bot (${EMAIL})\n`)
  fs.writeFileSync(path.join(proj, 'run.sh'), `#!/bin/sh\ncurl -A "bot (${EMAIL})" https://example.test/\n`)
})

function event(tool: string, input: Record<string, unknown>, cwd = proj): Record<string, unknown> {
  return {
    session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    transcript_path: path.join(sb, 'transcript.jsonl'),
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_input: input,
    tool_use_id: 'toolu_01aaaaaaaaaaaaaaaaaaaaaa',
  }
}
const bash = (command: string, cwd?: string) => event('Bash', { command, description: 'x' }, cwd)

function run(payload: unknown, h = home): string {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, HOME: h, PRDT_HOME: prdtHome, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C',
  }
  const res = spawnSync('bash', [HOOK], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8', env, timeout: subprocessTimeout('hook'),
  })
  expect(res.stderr).toBe('')
  expect(res.status).toBe(0)
  return res.stdout
}

function expectDeny(payload: unknown, h = home): string {
  const out = run(payload, h)
  expect(out, 'expected a deny').not.toBe('')
  const o = JSON.parse(out).hookSpecificOutput
  expect(o.hookEventName).toBe('PreToolUse')
  expect(o.permissionDecision).toBe('deny')
  const reason = o.permissionDecisionReason as string
  // TRUST: the reason never carries the identity back into context.
  for (const v of [EMAIL, GIT_EMAIL, 'fixture.user', 'fixture.git', NAME, 'example.test'])
    expect(reason.toLowerCase()).not.toContain(v.toLowerCase())
  expect(reason).toContain('[prdt identity guard]')
  expect(reason).toContain('needs_info')
  return reason
}
const expectAllow = (payload: unknown, h = home) => expect(run(payload, h)).toBe('')

describe.skipIf(!HAS_JQ)('the naro shape — DENY', () => {
  test('curl User-Agent carrying the email', () => {
    const r = expectDeny(bash(`curl -sS -A "naro-proto/1.0 (research; ${EMAIL})" "https://commons.wikimedia.org/w/api.php?action=query"`))
    expect(r).toContain('email')
    expect(r).toContain('command')
  })
  test('python -c urllib Request with the email in User-Agent', () => {
    expectDeny(bash(`python3 -c 'import urllib.request as u; u.urlopen(u.Request("https://x.test/", headers={"User-Agent": "naro-proto/1.0 (bot; ${EMAIL})"}))'`))
  })
  test('upper-cased email still matches', () => {
    expectDeny(bash(`curl -H "User-Agent: naro-proto/1.0 (${EMAIL.toUpperCase()})" https://x.test/`))
  })
  test('URL-encoded @ still matches', () => {
    expectDeny(bash(`curl "https://x.test/?contact=${EMAIL.replace('@', '%40')}"`))
  })
  test('the git-config email (not only the Claude account one) is known', () => {
    expectDeny(bash(`curl -A "bot (${GIT_EMAIL})" https://x.test/`))
  })
  test('the full name (Claude account fullName) is known', () => {
    const r = expectDeny(bash(`curl -A "naro-proto/1.0 (${NAME})" https://x.test/`))
    expect(r).toContain('name')
  })
  test('env-var hand-off inside ONE call is still one command', () => {
    expectDeny(bash(`UA="bot (${EMAIL})"\ncurl -A "$UA" https://x.test/`))
  })
  test('reading the identity at run time and sending it', () => {
    expectDeny(bash('curl -A "naro-proto/1.0 ($(git config user.email))" https://x.test/'))
  })
  test('a heredoc that writes a request script holding the email', () => {
    expectDeny(bash(`cat > fetch2.py <<'EOF'\nimport requests\nrequests.get("https://x.test/", headers={"User-Agent": "bot (${EMAIL})"})\nEOF`))
  })
})

describe.skipIf(!HAS_JQ)('a script file holding the email — caught before it runs', () => {
  test('Write of a request script with the email in its User-Agent', () => {
    const r = expectDeny(event('Write', { file_path: path.join(proj, 'new.py'), content: fs.readFileSync(path.join(proj, 'fetch.py'), 'utf8') }))
    expect(r).toContain('file')
  })
  test('Edit adding the email next to a request call', () => {
    expectDeny(event('Edit', { file_path: path.join(proj, 'x.js'), old_string: 'a', new_string: `fetch(url, { headers: { 'User-Agent': 'naro/1.0 (${EMAIL})' } })` }))
  })
  test('MultiEdit — any edit is judged', () => {
    expectDeny(event('MultiEdit', { file_path: path.join(proj, 'x.py'), edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: `requests.get(u, headers={"User-Agent": "${EMAIL}"})` }] }))
  })
  test('python3 runs a script that holds the email (relative path, cwd)', () => {
    const r = expectDeny(bash('python3 fetch.py'))
    expect(r).toContain('script')
  })
  test('the same script by absolute path, behind env/timeout wrappers', () => {
    expectDeny(bash(`env PYTHONUNBUFFERED=1 timeout 30 python3 ${path.join(proj, 'fetch.py')}`, sb))
  })
  test('after `cd` into the script directory', () => {
    expectDeny(bash(`cd ${proj} && python3 fetch.py`, sb))
  })
  test('a directly executed shell script', () => {
    expectDeny(bash('./run.sh'))
  })
  test('curl reading its header from a file (@file)', () => {
    expectDeny(bash('curl -H @headers.txt https://x.test/'))
  })
})

describe.skipIf(!HAS_JQ)('WebFetch / WebSearch — DENY', () => {
  test('WebFetch URL carrying the email', () => {
    const r = expectDeny(event('WebFetch', { url: `https://api.example.org/v1?mailto=${EMAIL}`, prompt: 'summarize' }))
    expect(r).toContain('URL')
  })
  test('WebSearch query carrying the full name', () => {
    expectDeny(event('WebSearch', { query: `${NAME} contact` }))
  })
})

describe.skipIf(!HAS_JQ)('ALLOW — project User-Agent, git, local-only', () => {
  test('a project User-Agent with no personal contact', () => {
    expectAllow(bash('curl -A "naro-proto/1.0 (+https://github.com/example/naro-proto)" https://commons.wikimedia.org/w/api.php'))
  })
  test('running a script whose User-Agent is the project one', () => {
    expectAllow(bash('python3 tools/ok.py'))
  })
  test('git commit with an author line (and a message that mentions User-Agent)', () => {
    expectAllow(bash(`git commit --author "${NAME} <${EMAIL}>" -m "fix: User-Agent drops the contact (T-1)"`))
  })
  test('git commit -F heredoc with a Co-Authored-By line holding the email', () => {
    expectAllow(bash(`git add a.ts && git commit -F - <<'EOF'\nfix: curl User-Agent no longer carries contact\n\nCo-Authored-By: ${NAME} <${EMAIL}>\nEOF`))
  })
  test('git config user.email / log --author', () => {
    expectAllow(bash(`git config user.email ${EMAIL} && git log --author=${EMAIL} --oneline | head`))
  })
  test('local-only commands that hold the email (no request marker)', () => {
    expectAllow(bash(`echo ${EMAIL} | wc -c; grep -rn "${EMAIL}" src/`))
  })
  test('running a local script that holds the email but makes no request', () => {
    expectAllow(bash('python3 local.py'))
  })
  test('Write of a README holding the email, no request code', () => {
    expectAllow(event('Write', { file_path: path.join(proj, 'README.md'), content: `# x\nMaintainer: ${NAME} <${EMAIL}>\nSee https://example.org\n` }))
  })
  test('Write of request code without the identity', () => {
    expectAllow(event('Write', { file_path: path.join(proj, 'ok2.py'), content: 'import requests\nrequests.get("https://x.test/", headers={"User-Agent": "naro-proto/1.0"})\n' }))
  })
  test('some other address in a User-Agent', () => {
    expectAllow(bash(`curl -A "bot (${OTHER})" https://x.test/`))
  })
  test('WebFetch without the identity', () => {
    expectAllow(event('WebFetch', { url: 'https://api.example.org/v1?q=cats', prompt: 'summarize' }))
  })
  test('a single-word display name is never matched (too common)', () => {
    expectAllow(event('WebSearch', { query: 'Fixture testing in vitest' }))
  })
})

describe.skipIf(!HAS_JQ)('silence / fail-open', () => {
  test('a tool outside the guard (Read)', () => {
    expectAllow(event('Read', { file_path: path.join(proj, 'fetch.py') }))
  })
  test('no identity knowable (empty HOME) → silent', () => {
    const empty = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'id-guard-empty-')))
    expectAllow(bash(`curl -A "bot (${EMAIL})" https://x.test/`), empty)
  })
  test('identity from git config alone is enough', () => {
    const gitOnly = sandbox({ gitEmail: EMAIL })
    expectDeny(bash(`curl -A "bot (${EMAIL})" https://x.test/`), gitOnly)
  })
  test('malformed JSON / empty stdin → silent', () => {
    expect(run('{not json @ curl')).toBe('')
    expect(run('')).toBe('')
  })
  test('a cwd that does not exist still judges the command text', () => {
    expectDeny(bash(`curl -A "bot (${EMAIL})" https://x.test/`, path.join(sb, 'gone')))
  })
})
