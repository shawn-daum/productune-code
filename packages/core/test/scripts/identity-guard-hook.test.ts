/**
 * prdt-identity-guard.sh — T-976.
 *
 * WHY: naro-proto workers put the user's email into outbound User-Agent
 * headers twice (T-289: 154 research requests, T-342: 14 Wikimedia Commons
 * lookups) — the harness hands every agent the user's email, APIs ask for a
 * contact in the User-Agent, and a worker "helpfully" fills it in. This hook
 * denies the outbound call (or the script that would make it) before it runs.
 *
 * d-T976-fix (QA security pass on dff99a1f): identity and outbound shape
 * must sit in the SAME pipeline unit; bare `user.email`/`emailAddress` count
 * only inside `$(…)`; markers do not count in prose docs (.md …); curl/wget
 * attached and piped files, non-local git, gh body flags, nc/telnet and
 * URL-decoded WebFetch/WebSearch forms are followed; the Claude account is
 * parsed with jq (nested keys cannot hide the address; a corrupt file falls
 * back to git identity).
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
  fs.writeFileSync(path.join(proj, 'payload.json'), JSON.stringify({ contact: EMAIL }))
  fs.writeFileSync(path.join(proj, 'clean.json'), JSON.stringify({ q: 'cats' }))
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

describe.skipIf(!HAS_JQ)('d-T976-fix — compound normal commands ALLOW (same-unit rule)', () => {
  test('echo of the address next to a URL — echo sends nothing (rule: a bare URL is not outbound)', () => {
    expectAllow(bash(`echo 'contact ${EMAIL} or see https://x.test'`))
  })
  test('two greps, one for the address and one for URLs', () => {
    expectAllow(bash(`grep -n '${EMAIL}' README.md; grep -n 'https://' README.md`))
  })
  test('grep the address, then gh pr view a URL', () => {
    expectAllow(bash(`grep -c '${EMAIL}' CHANGELOG.md; gh pr view https://github.com/example/r/pull/1`))
  })
  test('grep for the bare word user.email, then echo a URL', () => {
    expectAllow(bash('grep -rn "user.email" packages/ | head; echo https://x'))
  })
  test('jq reading the oauthAccount key, then an unrelated curl', () => {
    expectAllow(bash('jq -e .oauthAccount fixture.json && curl -s https://api.test'))
  })
  test('bare emailAddress word inside the curl unit is still only text', () => {
    expectAllow(bash('curl -s https://api.test/schema | grep emailAddress'))
  })
})

describe.skipIf(!HAS_JQ)('d-T976-fix — prose docs vs code files (extension rule)', () => {
  const doc = `# tool\n\nMaintainer: ${NAME} <${EMAIL}>\n\n\`\`\`sh\ncurl -fsSL https://x.test/install.sh | sh\n\`\`\`\n`
  test('Write README.md with maintainer line + curl install snippet → ALLOW', () => {
    expectAllow(event('Write', { file_path: path.join(proj, 'README.md'), content: doc }))
  })
  test('Edit docs/guide.mdx with the same → ALLOW', () => {
    expectAllow(event('Edit', { file_path: path.join(proj, 'docs', 'guide.mdx'), old_string: 'a', new_string: doc }))
  })
  test('Write install.sh with the same text → DENY (code file)', () => {
    expectDeny(event('Write', { file_path: path.join(proj, 'install.sh'), content: doc }))
  })
  test('a heredoc into README.md (local writer, prose target) → ALLOW', () => {
    expectAllow(bash(`cat > README.md <<'EOF'\n${doc}EOF`))
  })
})

describe.skipIf(!HAS_JQ)('d-T976-fix — residuals closed: curl attached / piped files', () => {
  const rows: [string, string][] = [
    ['-d@file', 'curl -d@payload.json https://x.test/'],
    ['--data=@file', 'curl --data=@payload.json https://x.test/'],
    ['-F k=@file', 'curl -F doc=@payload.json https://x.test/'],
    ['-Fk=@file;type', 'curl -Fdoc=@payload.json;type=application/json https://x.test/'],
    ['-T file', 'curl -T payload.json https://x.test/up'],
    ['--upload-file=file', 'curl --upload-file=payload.json https://x.test/up'],
    ['cat file | curl -d @-', 'cat payload.json | curl -d @- https://x.test/'],
    ['curl -d @- < file', 'curl -d @- https://x.test/ < payload.json'],
    ['curl --data-binary $(cat file)', 'curl --data-binary "$(cat payload.json)" https://x.test/'],
    ['wget --post-file', 'wget --post-file=payload.json https://x.test/'],
    ['echo address | curl -d @-', `echo ${EMAIL} | curl -d @- https://x.test/`],
  ]
  for (const [label, cmd] of rows) test(`DENY ${label}`, () => { expectDeny(bash(cmd)) })
  test('the same shapes with a file that has no identity → ALLOW', () => {
    expectAllow(bash('cat clean.json | curl -d @- https://x.test/'))
    expectAllow(bash('curl -d@clean.json https://x.test/'))
  })
})

describe.skipIf(!HAS_JQ)('d-T976-fix — residuals closed: git remote, gh, nc/telnet, vars', () => {
  test('git -c http.extraHeader carrying the address → DENY', () => {
    expectDeny(bash(`git -c http.extraHeader="From: ${EMAIL}" fetch origin`))
  })
  test('git clone with the address in the remote URL → DENY', () => {
    expectDeny(bash(`git clone https://${EMAIL.replace('@', '%40')}:x@git.example.test/r.git`))
  })
  test('git push to a URL whose path carries the name → DENY', () => {
    expectDeny(bash(`git push "https://git.example.test/${NAME}/r.git" main`))
  })
  test('local git subcommands stay exempt', () => {
    expectAllow(bash(`git -C ${proj} commit --author "${NAME} <${EMAIL}>" -m "x" && git tag -a v1 -m "${EMAIL}"`))
  })
  test('gh api with the address in a field → DENY', () => {
    expectDeny(bash(`gh api repos/o/r/issues -f body="contact ${EMAIL}"`))
  })
  test('gh issue create --body with the address → DENY', () => {
    expectDeny(bash(`gh issue create --title "bug" --body "reported by ${EMAIL}"`))
  })
  test('gh pr view (no body flag) → ALLOW even with the address around', () => {
    expectAllow(bash(`gh pr view 12 --json author | grep -c ${EMAIL}`))
  })
  test('printf | nc → DENY', () => {
    expectDeny(bash(`printf 'MAIL FROM:<${EMAIL}>\r\n' | nc smtp.example.test 25`))
  })
  test('telnet with a heredoc body → DENY', () => {
    expectDeny(bash(`telnet smtp.example.test 25 <<EOF\nMAIL FROM:<${EMAIL}>\nEOF`))
  })
  test('E=$(git config user.email); curl -A "$E" → DENY', () => {
    expectDeny(bash('E=$(git config user.email); curl -A "bot ($E)" https://x.test/'))
  })
  test('export of a literal address then curl -A "${UA}" → DENY', () => {
    expectDeny(bash(`export UA="bot (${EMAIL})" && curl -A "\${UA}" https://x.test/`))
  })
  test('a variable with no identity → ALLOW', () => {
    expectAllow(bash('UA="naro-proto/1.0"; curl -A "$UA" https://x.test/'))
  })
})

describe.skipIf(!HAS_JQ)('d-T976-fix — WebFetch / WebSearch decoded forms', () => {
  test('WebSearch name with +', () => { expectDeny(event('WebSearch', { query: 'Fixture+Person+contact' })) })
  test('WebFetch name with %20', () => { expectDeny(event('WebFetch', { url: 'https://s.test/?q=Fixture%20Person', prompt: 'x' })) })
  test('WebFetch email double-encoded', () => { expectDeny(event('WebFetch', { url: `https://s.test/?m=${EMAIL.replace('@', '%2540')}`, prompt: 'x' })) })
  test('WebFetch email with %2E dots', () => { expectDeny(event('WebFetch', { url: `https://s.test/?m=${EMAIL.replace(/\./g, '%2E')}`, prompt: 'x' })) })
})

describe.skipIf(!HAS_JQ)('d-T976-fix — identity read via a real JSON parser', () => {
  test('a nested object before emailAddress cannot hide it', () => {
    const h = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'id-guard-nested-')))
    fs.writeFileSync(path.join(h, '.claude.json'), JSON.stringify({
      oauthAccount: { ccOnboardingFlags: { a: { b: 1 } }, accountUuid: 'u', emailAddress: EMAIL },
    }))
    expectDeny(bash(`curl -A "bot (${EMAIL})" https://x.test/`), h)
  })
  test('a corrupt .claude.json falls back to the git identity, silently', () => {
    const h = sandbox({ gitEmail: EMAIL })
    fs.writeFileSync(path.join(h, '.claude.json'), '{"oauthAccount": {"emailAddress": "' + OTHER + '", ')
    expectDeny(bash(`curl -A "bot (${EMAIL})" https://x.test/`), h)
    expectAllow(bash(`curl -A "bot (${OTHER})" https://x.test/`), h)
  })
  test('a corrupt .claude.json and no git identity → silent allow, nothing on stderr', () => {
    const h = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'id-guard-corrupt-')))
    fs.writeFileSync(path.join(h, '.claude.json'), '{not json')
    expectAllow(bash(`curl -A "bot (${EMAIL})" https://x.test/`), h)
  })
})

