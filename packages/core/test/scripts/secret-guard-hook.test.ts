/**
 * prdt-secret-guard.sh — T-677 slices S2a + S2a-fix + S2b.
 *
 * WHY this exists: a repeated real incident — a worker `cat`/`head`/`sed`s a
 * `.env*` (or `*.pem`/`*.key`/`credentials.json`/`*.p12`) file to check
 * whether a key is set, and the value lands on the screen and in the session
 * transcript. T-677 S1 landed a value-free probe (`prdt env check <file>
 * [KEY]`, packages/core/scripts/prdt `cmd_env`); this hook is the
 * enforcement half — deny the print, name the probe.
 *
 * S2a covered: the full Read matrix (DENY + ALLOW) · the Bash "simple
 * printer" DENY rows achievable WITHOUT grep/sed flag exemption, glob-token
 * targets, or `source`-then-echo detection · the anchored-basename
 * false-positive-prevention ALLOW rows named in the T-677 dispatch
 * (`prdt.env` / `.envrc` / `.env.example`) · silence/fail-open rows · the
 * latency budget.
 *
 * QA grill S2a fix round (2026-09-24, T-677 Outcome §S2a fix) added: heredoc
 * bodies (`<<WORD`/`<<-WORD`, quoted or not) are stripped before judgment,
 * not read as printer arguments (H1) · that stripping is line-compare, never
 * per-character, so a large hit-path heredoc stays linear (H2) · a segment
 * led by a shell reserved word / grouping token still judges the command it
 * introduces (M1) · a path token with quotes anywhere in it (not only
 * wrapping the whole token) is still basename-matched (M3).
 *
 * S2b (this slice) covered: `grep -q/-l/-c/--quiet/--silent/--files-with-
 * matches/--files-without-match/--count` flag exemption · the pattern/script-
 * position argument of grep/sed/awk excluded from judgment unless `-e`/`-f`/
 * `--regexp=` is present · `sed -i`/`--in-place` exemption (writing) ·
 * glob-token literals (`.env*`) judged as targets · `source`/`.`-then-echo
 * chain detection · the `prdt env check` self-exemption · splitting on a
 * literal newline / `$(...)` / backticks · the remaining T-677 §4 ALLOW/DENY
 * rows. Plus the QA grill S2a items the PO moved here: M2 (wrapper commands
 * beyond `sudo`/`command`/`time`/`nice` skip their OWN flags/values instead
 * of derailing the command-word scan) · M4 (quoting/escape/brace forms —
 * found ALREADY correct via the S2a-fix M3 fix + `is_target`'s permissive
 * case-glob, locked here with regression tests; ALSO found one genuine,
 * accepted-not-fixed gap while probing this — see "accepted limitation"
 * below) · M5 (case-insensitive basename match, this machine's default APFS)
 * · L1 (`&` with no preceding space no longer glues onto the target word).
 *
 * The `sed -i` in-place-edit row moved from the S2a "printer DENY"
 * matrix to the S2b "flag exemption" ALLOW matrix below — S2a had NO `-i`
 * exemption at all yet (T-684's answer, "no -i denies", was satisfied as a
 * strict superset), S2b adds the exemption per the T-677 §7 item 3 scope, so
 * the SAME command now allows. Not a regression: the acceptance for this
 * exact shape changed slice to slice, by design.
 *
 * S2b-fix (QA grill S2b, T-677 Outcome §S2b fix) covered: `grep --color=never`
 * (and any other unrecognized long option) no longer exempt by the letter "c"
 * — only a genuine short-option cluster is letter-matched, never `--…` ·
 * `grep -L` joins the exempt letters · `egrep`/`fgrep`/`rg` now share grep's
 * judgment (previously unjudged entirely) · `sed -Ei`/`-ri` (letter-in-
 * cluster, not just exact `-i`) allowed · `bash|sh|zsh -c STRING` and
 * `eval STRING` judged · `read`/`mapfile`/`readarray`/`done` with `< target`
 * and bash's `$(<target)` fast-read form denied · `timeout -s KILL`/
 * `stdbuf -o L` (separate-token flag values) consumed instead of derailing
 * the wrapper scan · `watch`/`script` join the wrapper set · a backslash
 * directly followed by a literal newline (a real shell line continuation) is
 * dropped entirely rather than leaving a stray newline byte in front of the
 * next word's basename · `strip_quotes`/`split_bash`/`tokenize`/
 * `extract_substitutions` rewritten to run-slicing (no more per-character
 * string accumulation) · `is_target` no longer forks `tr` (uses `shopt -s
 * nocasematch` like the pre-filter), so a many-argument command no longer
 * pays one fork per argument.
 *
 * S2b-perf (T-677 Outcome §S2b perf) covered: the run-slicing rewrite was NOT
 * enough — bash 3.2 re-measures the whole string on every `${s:i:1}`, so any
 * per-character loop is O(n^2) with zero accumulation (measured 21.3s/21.5s
 * on the 60KB `node -e`/`git commit -m` rows, 1.31s on 1000 args, AFTER the
 * run-slicing fix). The whole judgment now runs in ONE perl process per hit
 * (the same functions, ported statement for statement; bash keeps the fork-0
 * pre-filter, the jq extraction, the fixed deny text and the output shape).
 * Every verdict row in this file is unchanged — that is the lock on "the
 * judgment's meaning did not move". Fail-open gains one more silent branch:
 * perl missing from PATH and from /usr/bin/perl → exit 0.
 *
 * script-fix (QA regrill, 2026-09-24, T-677 "script wrapper bypass") covered:
 * `script` was previously folded into the generic wrapper-flag-skip loop
 * (S2b-fix's "watch/script join the wrappers"), which is wrong for script(1)
 * — its own flags are followed by POSITIONAL arguments, not another
 * flag/value pair. The BSD form `script [-aeFkpqr] [-t time] [file [command
 * ...]]` silently ALLOWED both `script /dev/null cat .env.local` and
 * `script -q /dev/null cat .env.local` (the scan landed on the log FILE
 * token as "the command" and never reached the real one); the GNU
 * (util-linux) `-c COMMAND` form silently ALLOWED `script -c 'cat
 * .env.local' /dev/null` too (its value was thrown away as an ordinary flag
 * value instead of being queued for judgment like `bash -c` already is). PO
 * reproduced both before this fix. `script` now gets its own branch: `-c`'s
 * value is queued into the same judgment pipeline as `bash -c`/`eval`; a
 * FILE positional followed by a real command re-enters the ordinary
 * command-word scan on that command; `script`/`script FILE` alone (no
 * command at all) judges nothing.
 *
 * TRUST: the deny text is FIXED, never rendered from the payload — every
 * `deny()` assertion below also asserts the reason contains none of the
 * fixture's own target paths.
 */

import path from 'path'
import { spawnSync } from 'child_process'
import { test, expect, describe } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'
import { createRequire } from 'node:module'

const cjs = createRequire(import.meta.url)
const timeouts = cjs('../../../../scripts/vitest-timeouts.cjs') as {
  scale(): { value: number }
  autoScale(load1?: number, cpus?: number): number
}

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-secret-guard.sh')

interface ReadEvent { toolName?: string; filePath?: string }
interface BashEvent { toolName?: string; command?: string }

function readEvent(filePath: string): Record<string, unknown> {
  return {
    session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    transcript_path: '/tmp/prdt-t677/transcript.jsonl',
    cwd: '/tmp/prdt-t677',
    prompt_id: '11111111-2222-3333-4444-555555555555',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    tool_input: { file_path: filePath },
    tool_use_id: 'toolu_01aaaaaaaaaaaaaaaaaaaaaa',
  }
}

function bashEvent(command: string): Record<string, unknown> {
  return {
    session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    transcript_path: '/tmp/prdt-t677/transcript.jsonl',
    cwd: '/tmp/prdt-t677',
    prompt_id: '11111111-2222-3333-4444-555555555555',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command },
    tool_use_id: 'toolu_01aaaaaaaaaaaaaaaaaaaaaa',
  }
}

/** stdout, with stderr asserted empty and status asserted 0 — a hook that can
 *  block work must never leak a byte of noise, including from a failed
 *  redirect, and it must never itself abort. */
function run(payload: unknown): string {
  const res = spawnSync('bash', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: subprocessTimeout('hook'),
  })
  expect(res.stderr).toBe('')
  expect(res.status).toBe(0)
  return res.stdout
}

function decision(payload: unknown): { deny?: string } {
  const out = run(payload)
  if (out === '') return {}
  const h = JSON.parse(out).hookSpecificOutput
  expect(h.hookEventName).toBe('PreToolUse')
  expect(h.permissionDecision).toBe('deny')
  return { deny: h.permissionDecisionReason as string }
}

// The hook's own DENY_MSG, byte-for-byte — TRUST means this string is FIXED,
// never templated from the payload, so every deny (whatever fixture produced
// it) must read back exactly this and nothing else. A substring check against
// "does the reason avoid echoing this row's own path" would false-positive on
// rows like `.env` / `credentials.json` — the fixed text itself names those
// classes generically — so full equality is the precise TRUST assertion, not
// a workaround for it.
const FIXED_DENY_MSG =
  '[prdt secret guard] Denied: this call would print the contents of a credential file ' +
  '(.env / .env.* / *.pem / *.key / credentials.json / *.p12) onto the screen and into the ' +
  'session record (T-677). Check a key without seeing it: `prdt env check <file> [KEY]` — ' +
  'presence and length only. Load it for a command: `set -a; . <file>; set +a; <cmd>`. ' +
  'Writing, ls/stat/test -f, grep -q/-l/-c are never denied.'

function expectDeny(payload: unknown, sourceText: string) {
  const d = decision(payload)
  expect(d.deny, `expected a deny for: ${sourceText}`).toBeTruthy()
  expect(d.deny).toBe(FIXED_DENY_MSG)
}

function expectAllow(payload: unknown, sourceText: string) {
  const out = run(payload)
  expect(out, `expected silence (allow) for: ${sourceText}`).toBe('')
}

// ── Read: every DENY row ──────────────────────────────────────────────────────

describe('Read — DENY', () => {
  const rows: string[] = [
    '.env',
    '.env.local',
    '.env.prod',
    '/abs/project/.vercel/.env.production.local',
    '.wt/t380/.env.local',
    'server.pem',
    'id_rsa.key',
    'credentials.json',
    'cert.p12',
  ]
  for (const filePath of rows) {
    test(`Read ${filePath}`, () => {
      expectDeny(readEvent(filePath), filePath)
    })
  }
})

// ── Read: every ALLOW row ─────────────────────────────────────────────────────

describe('Read — ALLOW', () => {
  const rows: string[] = [
    '.env.example',
    '.env.local.example', // T-684: broadened .example exception, not just .env.example
    '~/.prdt/prdt.env',
    '.envrc',
    'src/config.ts',
  ]
  for (const filePath of rows) {
    test(`Read ${filePath}`, () => {
      expectAllow(readEvent(filePath), filePath)
    })
  }
})

// ── Bash: "simple printer" DENY rows (no grep/sed flag exemption, no glob,
// no source-then-echo — those are covered in their own S2b blocks below) ────

describe('Bash — printer DENY (S2a)', () => {
  const rows: string[] = [
    'cat .env.local',
    "cat .env.local 2>/dev/null | sed 's/=.*/=<redacted>/'",
    'head -5 .env',
    'tail -n 3 .env.prod',
    "sed -n '10,12p' .env.local | cut -c1-80", // the incident shape, verbatim
    "sed 's/=.*/=<set>/' .env.local",
    'grep TOKEN .env.local',
    "grep -oE '^[A-Z_]+=' .env.local",
    'grep -v "KEY\\|SECRET" .env.local',
    "awk -F= '{print $1}' .env.local",
    'less .env',
    'more x.pem',
    'bat credentials.json',
    'nl .env',
    'cat < .env.local',
    'cat "./.env.local"',
    'cat ./".env.local"', // M3: quote opens partway through the token, not at char 0
    'cat some/".env.local"', // M3: same shape, quote starts mid-path further in
    'cat ~/x/credentials.json',
    'ls; cat .env.local', // second simple command in the segment
    'cd code && cat .env.local',
  ]
  for (const command of rows) {
    test(`Bash ${command}`, () => {
      expectDeny(bashEvent(command), command)
    })
  }
})

// ── Bash: a segment starting with a `<`/`>` redirect is judged on its
// resolved command word + input target, not on the redirect token itself
// (T-716). Ship-entry code review PO repro: `< .env.local cat` allowed while
// `cat < .env.local` denied on the same tree — the command-word scan used to
// stop dead on the leading `<` (`basename("<")` matches no printer) and never
// reached `cat` at all. ────────────────────────────────────────────────────

describe('Bash — leading redirect resolves to its real command word (T-716)', () => {
  const denyRows: string[] = [
    '< .env.local cat', // the PO's exact repro
    '<.env.local cat', // same repro, no space — tokenize emits identical tokens either way
    '< .env.local sort', // a leading redirect into one of the newly-added printers
    '> /dev/null cat .env.local', // leading OUTPUT redirect must not derail command-word resolution either
    'sudo < .env.local cat', // a wrapper interleaved with a leading redirect
  ]
  for (const command of denyRows) {
    test(`Bash ${command}`, () => {
      expectDeny(bashEvent(command), command)
    })
  }

  const allowRows: string[] = [
    '< .env.local wc -l', // wc is neither a printer nor a pattern command
    '< ~/.prdt/prdt.env cat', // anchored-basename near-miss, same as the trailing form
    '< .env.example cat', // .example exception applies the same way
  ]
  for (const command of allowRows) {
    test(`Bash ${command}`, () => {
      expectAllow(bashEvent(command), command)
    })
  }
})

// ── Bash: printer-set additions (T-716, PO decision) — sort/tac/tee/od/xxd/
// hexdump/strings/cut/paste/column join the S2a printer set; none carry a
// flag/position exemption of their own, so a target argument anywhere denies
// exactly like `cat` already does. ──────────────────────────────────────────

describe('Bash — printer DENY, T-716 printer-set additions', () => {
  const rows: string[] = [
    'sort .env.local',
    'tac .env.prod',
    'tee .env.local',
    'od .env',
    'xxd server.pem',
    'hexdump credentials.json',
    'strings .env.local',
    'cut -d= -f1 .env.local',
    'paste .env.local',
    'column .env.local',
  ]
  for (const command of rows) {
    test(`Bash ${command}`, () => {
      expectDeny(bashEvent(command), command)
    })
  }

  // Same names, non-target argument — no new false denies on ordinary use.
  const allowRows: string[] = ['sort src/config.ts', 'cut -d, -f1 data.csv']
  for (const command of allowRows) {
    test(`Bash ${command}`, () => {
      expectAllow(bashEvent(command), command)
    })
  }
})

// ── Bash: anchored-basename ALLOW rows named in the T-677 dispatch
// (prdt.env / .envrc / .env.example) plus the redirect-destination exclusion
// this slice's design explicitly covers ───────────────────────────────────────

describe('Bash — ALLOW (prdt.env / .envrc / .env.example near-misses)', () => {
  const rows: string[] = [
    'cat ~/.prdt/prdt.env',
    "sed -n 's/^PRDT_REPO=//p' ~/.prdt/prdt.env", // sed w/o -i, but not a target file
    'cat environment.env', // anchored basename: not `.env`, not `.env.`-prefixed
    'cat .env.example',
    'sed -n 1,60p .env.example', // printer + excepted basename
    'ls -la .env.local',
    'cat .gitignore > .env.local', // redirect destination excluded from judgment
    'cat > .env.local <<EOF', // same — destination right after `>`
  ]
  for (const command of rows) {
    test(`Bash ${command}`, () => {
      expectAllow(bashEvent(command), command)
    })
  }
})

// ── Bash: heredoc bodies are never judged as arguments (H1 fix, S2a fix) ─────
// The PO's own repro: `cat > README.md <<'EOF'` with `.env.local` in the body
// used to DENY (the body's own words landed in the printer's argument scan).
// One row per heredoc-tag shape — bare / single-quoted / double-quoted /
// `<<-` with a tab-indented body+terminator — each carrying a body line that
// names one of the three credential-shaped strings the acceptance calls out.

describe('Bash — ALLOW (heredoc body never judged, H1 fix)', () => {
  const rows: string[] = [
    `cat > README.md <<'EOF'\n.env.local\nEOF`, // the PO's exact repro
    `cat > README.md <<EOF\n./credentials.json\nEOF`, // bare tag
    `cat > README.md <<"EOF"\ncerts/server.pem\nEOF`, // double-quoted tag
    `cat > README.md <<-EOF\n\t.env.local\n\tEOF`, // <<- : tab-indented body + terminator
    `cat > README.md <<-'EOF'\n\t./credentials.json\n\tEOF`, // <<- and quoted tag together
  ]
  for (const command of rows) {
    test(`Bash ${JSON.stringify(command)}`, () => {
      expectAllow(bashEvent(command), command)
    })
  }
})

// ── Bash: a segment led by a reserved word / grouping token still judges the
// command it introduces (M1 fix, S2a fix) ────────────────────────────────────

describe('Bash — printer DENY behind a reserved word / grouping token (M1 fix)', () => {
  const rows: string[] = [
    'if [ -f .env.local ]; then cat .env.local; fi', // then — PO reproduced (was ALLOW)
    'if cat .env.local; then :; fi', // if itself introducing the command
    'if false; then :; else cat .env.local; fi', // else
    'if false; then :; elif true; then cat .env.local; fi', // elif
    'while :; do cat .env.local; done', // while + do
    'until false; do cat .env.local; done', // until + do
    'if ! cat .env.local; then :; fi', // !
    '{ cat .env.local; }', // { grouping
    'foo() { cat .env.local; }', // function body
  ]
  for (const command of rows) {
    test(`Bash ${command}`, () => {
      expectDeny(bashEvent(command), command)
    })
  }
})

// ── Bash (S2b): grep/sed flag exemption — a match-only / write-in-place flag
// makes the WHOLE call allowed, before any argument is even looked at as a
// possible target ─────────────────────────────────────────────────────────────

describe('Bash — grep/sed flag exemption (S2b)', () => {
  const rows: string[] = [
    'grep -q TOKEN .env.local',
    'grep -l TOKEN .env*', // -l AND a glob-token target — the flag wins outright
    "grep -c '^X=.\\+' .env.local",
    'grep --count X .env',
    "sed -i '' 's/^A=.*/A=2/' .env.local", // moved here from S2a — see file header
    "sed --in-place 's/^A=.*/A=2/' .env.local",
  ]
  for (const command of rows) {
    test(`Bash ${command}`, () => {
      expectAllow(bashEvent(command), command)
    })
  }
})

// ── Bash (S2b): grep/sed/awk are NOT exempt on flags with no q/l/c/-i letter
// — `-o`/`-v`/`-n`/`-E`/`-i`(grep, not sed's `-i`)/`-r` still print the rest
// of a matched/unmatched line, per the ticket's own explicit call-out ───────

describe('Bash — grep flags that are NOT exemptions (S2a matrix, still deny)', () => {
  const rows: string[] = [
    "grep -oE '^[A-Z_]+=' .env.local",
    'grep -v "KEY\\|SECRET" .env.local',
  ]
  for (const command of rows) {
    test(`Bash ${command} (already covered above; kept explicit here too)`, () => {
      expectDeny(bashEvent(command), command)
    })
  }
})

// ── Bash (S2b): pattern/script-position argument exclusion — the first
// non-flag argument of grep/sed/awk is assumed to be the inline pattern/
// script, not a file, UNLESS -e/-f/--regexp= says otherwise ─────────────────

describe('Bash — grep/sed/awk pattern-position argument exclusion (S2b)', () => {
  test('grep ".env.local" .gitignore — the pattern LOOKS like a target but is candidate #1', () => {
    expectAllow(bashEvent('grep ".env.local" .gitignore'), 'grep ".env.local" .gitignore')
  })
  test('grep -rn "\\.env" docs — escaped pattern, real arg (docs) is not a target', () => {
    expectAllow(bashEvent('grep -rn "\\.env" docs'), 'grep -rn "\\.env" docs')
  })
  test('grep -e \'.env.local\' README.md — -e disables the skip (accepted over-denial, header note)', () => {
    // -e means the pattern is supplied via the flag, not assumed from
    // position #1 — so position #1 is judged too. This slice does not ALSO
    // exclude -e's own attached value from judgment (documented accepted
    // limitation in the hook's own header), so this denies on the pattern
    // text itself, not on README.md. Over-denial, the same safe direction
    // used throughout this hook — locked here so a future change notices.
    expectDeny(bashEvent("grep -e '.env.local' README.md"), "grep -e '.env.local' README.md")
  })
})

// ── Bash (S2b): glob-token literals are judged as targets — the shell will
// expand them before a real invocation ever runs, this hook only ever sees
// the unexpanded string ───────────────────────────────────────────────────────

describe('Bash — glob-token literal targets (S2b)', () => {
  test('cat .env* denies (the one shape needing its own is_target arm)', () => {
    expectDeny(bashEvent('cat .env*'), 'cat .env*')
  })
  test('cat .env.* / cat *.pem / cat *.key already self-match the existing patterns (regression lock)', () => {
    expectDeny(bashEvent('cat .env.*'), 'cat .env.*')
    expectDeny(bashEvent('cat *.pem'), 'cat *.pem')
    expectDeny(bashEvent('cat *.key'), 'cat *.key')
  })
  test('cat .envrc / cat environment.env still allow — glob handling must not widen the anchor', () => {
    expectAllow(bashEvent('cat .envrc'), 'cat .envrc')
    expectAllow(bashEvent('cat environment.env'), 'cat environment.env')
  })
})

// ── Bash (S2b, M2 grill): wrapper commands skip THEIR OWN flags/values
// before resuming the command-word scan — previously only sudo/command/time/
// nice were skipped, and only as a single bare token, so a following flag
// (`-n 5`, `-u me`) derailed the scan and silently missed the real command ──

describe('Bash — wrapper commands seen through, incl. their own flags (M2 fix)', () => {
  const rows: string[] = [
    'nice -n 5 cat .env.local',
    'sudo -u me cat .env.local',
    'command -p cat .env.local',
    'time -p cat .env.local',
    'env cat .env.local',
    'exec cat .env.local',
    'nohup cat .env.local',
    'timeout 5 cat .env.local',
    'stdbuf -oL cat .env.local',
  ]
  for (const command of rows) {
    test(`Bash ${command}`, () => {
      expectDeny(bashEvent(command), command)
    })
  }
})

// ── Bash (S2b, M5 grill): case-insensitive basename match — this machine's
// default filesystem (APFS) is case-insensitive, so `.ENV.LOCAL` reads the
// same bytes as `.env.local` ─────────────────────────────────────────────────

describe('Bash — case-insensitive basename match (M5 fix)', () => {
  const rows: string[] = ['cat .ENV.LOCAL', 'cat .Env.Local']
  for (const command of rows) {
    test(`Bash ${command}`, () => {
      expectDeny(bashEvent(command), command)
    })
  }
})

// ── Bash (S2b, L1 grill): a bare `&` with no preceding space no longer glues
// onto the target word during tokenizing ─────────────────────────────────────

describe('Bash — bare & without a space (L1 fix)', () => {
  test('cat .env& denies (used to tokenize as one word `.env&`, matching nothing)', () => {
    expectDeny(bashEvent('cat .env&'), 'cat .env&')
  })
  test('cat .env.local& still denies (already worked pre-fix via permissive glob, regression lock)', () => {
    expectDeny(bashEvent('cat .env.local&'), 'cat .env.local&')
  })
})

// ── Bash (S2b, M4 grill): statically resolvable quoting/escape/brace forms —
// found to already be handled correctly by the S2a-fix M3 fix (quotes
// anywhere in the token) plus is_target's permissive case-glob; locked here
// with regression tests rather than re-implemented ──────────────────────────

describe('Bash — quoting/escape/brace forms already resolved statically (M4)', () => {
  test('cat .env.loc""al — adjacent empty quotes mid-word', () => {
    expectDeny(bashEvent('cat .env.loc""al'), 'cat .env.loc""al')
  })
  test('cat .env\\.local — backslash-escaped literal dot outside quotes', () => {
    expectDeny(bashEvent('cat .env\\.local'), 'cat .env\\.local')
  })
  test(`cat .env.'lo'"ca"'l' — alternating single/double quote fragments`, () => {
    expectDeny(bashEvent(`cat .env.'lo'"ca"'l'`), `cat .env.'lo'"ca"'l'`)
  })
  test('cat .env.{local,prod} — brace form, never expanded, judged as one literal string', () => {
    expectDeny(bashEvent('cat .env.{local,prod}'), 'cat .env.{local,prod}')
  })

  test('ACCEPTED LIMITATION (found while building M4, see hook header): a quote spliced ' +
    'MID-SUBSTRING (inside "env" itself) breaks the pre-filter before jq/is_target ever run', () => {
    // `cat .en"v".loc"al"` is a real, valid `.env.local` once unquoted (and
    // `strip_quotes`/`tokenize` WOULD resolve it correctly, same as the rows
    // above) — but the harness serializes the command into JSON, so the raw
    // bytes this hook's fork-0 pre-filter scans contain `.en\"v\"` : the `\"`
    // escape sequence lands INSIDE the substring "env" and breaks its
    // contiguity. This is deliberately NOT fixed (would require unescaping
    // the whole payload before trusting any pre-filter miss, i.e. paying the
    // jq fork on every call, not just hits) — surfaced as `unresolved` for
    // the PO rather than silently left as a passing "allow" test with no
    // explanation. If this ever starts denying, that's a WELCOME change (the
    // gap closed), not a broken test — the assertion below is a snapshot of
    // the current accepted limit, not a requirement to keep failing this way.
    expectAllow(bashEvent('cat .en"v".loc"al"'), 'cat .en"v".loc"al"')
  })
})

// ── Bash (S2b-fix, QA grill S2b HIGH): grep long options are never letter-
// matched — only a genuine short-option cluster is, and `-L` joins that set ──

describe('Bash — grep long-option exemption bug fixed (S2b-fix HIGH)', () => {
  test('grep --color=never TOKEN .env.local denies (PO repro: was ALLOW, "c" in "color" letter-matched)', () => {
    expectDeny(bashEvent('grep --color=never TOKEN .env.local'), 'grep --color=never TOKEN .env.local')
  })
  test('grep --line-number TOKEN .env.local denies (another unrecognized long option, "l" and "n" in it)', () => {
    expectDeny(bashEvent('grep --line-number TOKEN .env.local'), 'grep --line-number TOKEN .env.local')
  })
  test('grep -L TOKEN .env.local allows (S2b-fix LOW: grep -L over-deny)', () => {
    expectAllow(bashEvent('grep -L TOKEN .env.local'), 'grep -L TOKEN .env.local')
  })
})

// ── Bash (S2b-fix, QA grill S2b MEDIUM): egrep/fgrep/rg share grep's flag +
// pattern-position judgment — previously unjudged entirely ──────────────────

describe('Bash — egrep/fgrep/rg are printers (S2b-fix MEDIUM)', () => {
  test('egrep TOKEN .env.local denies', () => {
    expectDeny(bashEvent('egrep TOKEN .env.local'), 'egrep TOKEN .env.local')
  })
  test('fgrep TOKEN .env.local denies', () => {
    expectDeny(bashEvent('fgrep TOKEN .env.local'), 'fgrep TOKEN .env.local')
  })
  test('rg TOKEN .env.local denies', () => {
    expectDeny(bashEvent('rg TOKEN .env.local'), 'rg TOKEN .env.local')
  })
  test('rg -l TOKEN .env.local allows (flag exemption applies the same way)', () => {
    expectAllow(bashEvent('rg -l TOKEN .env.local'), 'rg -l TOKEN .env.local')
  })
  test('egrep ".env.local" .gitignore allows (pattern-position exclusion applies the same way)', () => {
    expectAllow(bashEvent('egrep ".env.local" .gitignore'), 'egrep ".env.local" .gitignore')
  })
})

// ── Bash (S2b-fix, QA grill S2b LOW): sed -Ei/-ri (letter-in-cluster, not
// only the exact -i token) allowed ───────────────────────────────────────────

describe('Bash — sed -Ei/-ri in-place allowed (S2b-fix LOW)', () => {
  test(`sed -Ei 's/A=.*/A=2/' .env.local allows`, () => {
    expectAllow(bashEvent(`sed -Ei 's/A=.*/A=2/' .env.local`), `sed -Ei 's/A=.*/A=2/' .env.local`)
  })
  test(`sed -ri 's/A=.*/A=2/' .env.local allows`, () => {
    expectAllow(bashEvent(`sed -ri 's/A=.*/A=2/' .env.local`), `sed -ri 's/A=.*/A=2/' .env.local`)
  })
  test(`sed -E 's/A=.*/A=2/' .env.local still denies (no i in the cluster — printing, not writing)`, () => {
    expectDeny(bashEvent(`sed -E 's/A=.*/A=2/' .env.local`), `sed -E 's/A=.*/A=2/' .env.local`)
  })
})

// ── Bash (S2b-fix, QA grill S2b MEDIUM): bash|sh|zsh -c STRING and
// eval STRING re-parse their argument as a brand-new command — judged now ──

describe('Bash — bash|sh|zsh -c STRING and eval STRING judged (S2b-fix MEDIUM)', () => {
  const rows: string[] = [
    "bash -c 'cat .env.local'",
    'sh -c "cat .env.local"',
    "zsh -c 'cat .env.local'",
    "eval 'cat .env.local'", // no $(...) at all — previously fell straight through
  ]
  for (const command of rows) {
    test(`Bash ${command}`, () => {
      expectDeny(bashEvent(command), command)
    })
  }
  test('bash -c "ls -la" allows (no target in the sub-shell string)', () => {
    expectAllow(bashEvent('bash -c "ls -la"'), 'bash -c "ls -la"')
  })
})

// ── Bash (S2b-fix, QA grill S2b MEDIUM): read/mapfile/readarray/done with
// `< target`, and bash's `$(<target)` fast-read form ─────────────────────────

describe('Bash — read/mapfile/done < target and $(<target) (S2b-fix MEDIUM)', () => {
  const denyRows: string[] = [
    'read line < .env.local',
    'while read line; do :; done < .env.local',
    'mapfile arr < .env.local',
    'readarray arr < .env.local',
    'echo "$(<.env.local)"',
  ]
  for (const command of denyRows) {
    test(`Bash ${JSON.stringify(command)}`, () => {
      expectDeny(bashEvent(command), command)
    })
  }
  test('read line < src/index.ts allows (not a target)', () => {
    expectAllow(bashEvent('read line < src/index.ts'), 'read line < src/index.ts')
  })
})

// ── Bash (S2b-fix, QA grill S2b LOW): value-taking wrapper flags consumed,
// watch/script join the wrapper set ──────────────────────────────────────────

describe('Bash — wrapper value-taking flags + watch/script (S2b-fix LOW)', () => {
  const rows: string[] = [
    'timeout -s KILL 5 cat .env.local', // -s takes a value; used to derail onto "5" as the duration
    'timeout --signal=KILL 5 cat .env.local',
    'stdbuf -o L cat .env.local', // separate-token flag value (combined -oL already worked)
    'watch cat .env.local',
    'watch -n 5 cat .env.local',
  ]
  for (const command of rows) {
    test(`Bash ${command}`, () => {
      expectDeny(bashEvent(command), command)
    })
  }
})

// ── Bash (QA regrill, T-677 "script wrapper bypass" fix, 2026-09-24):
// script(1) is NOT shaped like the other wrappers this hook skips through —
// its own flags are followed by POSITIONAL arguments (an optional log FILE,
// then an optional COMMAND to actually run), not another flag/value pair.
// Before this fix `script` was treated like every other wrapper (own
// flags/values only), so the BSD `[file [command ...]]` form silently
// ALLOWED (the scan landed on the log FILE token as "the command" and never
// reached the real command after it) and the GNU `-c COMMAND` form silently
// ALLOWED too (the `-c` value was skipped as an ordinary flag value, never
// queued for judgment the way `bash -c` already is). PO reproduced both on
// the tree before this fix. ─────────────────────────────────────────────────

describe('Bash — script(1) wrapper bypass (script wrapper bypass fix)', () => {
  describe('DENY', () => {
    const rows: string[] = [
      'script /dev/null cat .env.local', // BSD form, no flags: file then command
      'script -q /dev/null cat .env.local', // BSD form with its own flag
      "script -c 'cat .env.local' /dev/null", // GNU form: -c re-parses its value as a command
    ]
    for (const command of rows) {
      test(`Bash ${command}`, () => {
        expectDeny(bashEvent(command), command)
      })
    }
  })
  describe('ALLOW', () => {
    const rows: string[] = [
      'script -q /dev/null npm test', // real command, not a target — must not over-deny
      'script out.log', // file only, no command at all — an interactive session
    ]
    for (const command of rows) {
      test(`Bash ${command}`, () => {
        expectAllow(bashEvent(command), command)
      })
    }
  })
})

// ── Bash (S2b-fix, QA grill S2b LOW): a backslash immediately followed by a
// literal newline (real shell line continuation) is dropped entirely ───────

describe('Bash — backslash-newline before the filename (S2b-fix LOW)', () => {
  test('cat \\<newline>.env.local denies (continuation must not leave a stray byte in front of the basename)', () => {
    expectDeny(bashEvent('cat \\\n.env.local'), 'cat \\<newline>.env.local')
  })
})

// ── silence / fail-open (S2b-fix, QA grill S2b LOW): a missing `tr` (or any
// tool) fails open silently — is_target no longer calls `tr` at all (uses
// `shopt -s nocasematch` instead), so this now holds trivially: the guard
// still correctly DENIES with `tr` absent from PATH, not merely "silently" ──

describe('silence / fail-open — tr absent from PATH (S2b-fix LOW)', () => {
  test('a case-insensitive target still denies with tr missing from PATH (is_target no longer forks tr)', () => {
    // Isolate a PATH with `jq` (needed for field extraction) and `bash` but
    // NOT `tr` (which lives in /usr/bin alongside jq on this machine) — copy
    // just jq's directory contents' jq binary is enough since we only need
    // the ONE binary reachable, not the WHOLE /usr/bin directory.
    const jqDir = require('child_process').execSync('dirname "$(command -v jq)"', { encoding: 'utf8' }).trim()
    const scratch = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'prdt-no-tr-'))
    require('fs').symlinkSync(require('path').join(jqDir, 'jq'), require('path').join(scratch, 'jq'))
    const res = spawnSync('bash', [HOOK], {
      input: JSON.stringify(bashEvent('cat .ENV.LOCAL')), // case-fold path in is_target
      encoding: 'utf8',
      env: { PATH: `${scratch}:/bin` }, // /bin has bash; neither dir has tr
    })
    expect(res.stderr).toBe('')
    expect(res.status).toBe(0)
    expect(res.stdout).not.toBe('')
    const h = JSON.parse(res.stdout).hookSpecificOutput
    expect(h.permissionDecision).toBe('deny')
  })
})

// ── Bash (S2b): source/`.`-then-echo chain — sourcing a target is itself
// ALLOWED (the loader idiom the deny message itself suggests), but a LATER
// simple command in the same overall Bash call that dumps shell variables
// wholesale reaches the same value one step removed ─────────────────────────

describe('Bash — source/.-then-echo chain (S2b)', () => {
  describe('DENY', () => {
    const rows: string[] = [
      'source .env.local && echo "$CONFLUENCE_API_TOKEN"',
      'set -a; . ./.env.local; set +a; env',
      '. .env; printenv',
      'source .env.local\necho $K', // newline-separated, no `;` at all
    ]
    for (const command of rows) {
      test(`Bash ${JSON.stringify(command)}`, () => {
        expectDeny(bashEvent(command), command)
      })
    }
  })

  describe('ALLOW (the accepted loader idioms, T-677 Outcome §5 — 63/63 real calls sampled)', () => {
    const rows: string[] = [
      'set -a && . ./.env.local && set +a && npx vitest run x',
      'source .env.local; set +a; npm run test:pg | tail -5',
      'source .env.local; curl -s "$URL" -H "apikey: $KEY"', // accepted gap, §6 — curl echoes header, not this hook's job
      'source .env.local; set +a; echo "=== games ==="; curl -s x',
    ]
    for (const command of rows) {
      test(`Bash ${command}`, () => {
        expectAllow(bashEvent(command), command)
      })
    }
  })

  describe('the other risky-introspection shapes the design covers (export/declare/set/compgen/typeset)', () => {
    test('export (bare, no args) denies after sourcing', () => {
      expectDeny(bashEvent('source .env.local; export'), 'source .env.local; export')
    })
    test('export -p denies after sourcing', () => {
      expectDeny(bashEvent('source .env.local; export -p'), 'source .env.local; export -p')
    })
    test('export FOO=bar allows (an assignment, not a dump)', () => {
      expectAllow(bashEvent('source .env.local; export FOO=bar'), 'source .env.local; export FOO=bar')
    })
    test('declare (bare) denies after sourcing', () => {
      expectDeny(bashEvent('source .env.local; declare'), 'source .env.local; declare')
    })
    test('declare -p denies after sourcing', () => {
      expectDeny(bashEvent('source .env.local; declare -p'), 'source .env.local; declare -p')
    })
    test('declare FOO=bar allows (an assignment, not a dump)', () => {
      expectAllow(bashEvent('source .env.local; declare FOO=bar'), 'source .env.local; declare FOO=bar')
    })
    test('set (bare) denies after sourcing', () => {
      expectDeny(bashEvent('source .env.local; set'), 'source .env.local; set')
    })
    test('compgen -v denies after sourcing', () => {
      expectDeny(bashEvent('source .env.local; compgen -v'), 'source .env.local; compgen -v')
    })
    test('typeset denies after sourcing', () => {
      expectDeny(bashEvent('source .env.local; typeset'), 'source .env.local; typeset')
    })
  })
})

// ── Bash (S2b): $(...) / backtick command substitution is extracted and
// judged independently — the accepted false-positive row named verbatim in
// T-677 Outcome §5 ───────────────────────────────────────────────────────────

describe('Bash — $(...) extraction (S2b, accepted false-positive pinned)', () => {
  test(`eval "$(grep '^KC_S3_' .env.local)" denies — grep has no exemption flag here`, () => {
    expectDeny(
      bashEvent(`eval "$(grep '^KC_S3_' .env.local)"`),
      `eval "$(grep '^KC_S3_' .env.local)"`,
    )
  })
})

// ── Bash (S2b): the `prdt env check` probe's own arguments are never judged ──

describe('Bash — prdt env check probe self-exemption (S2b)', () => {
  const rows: string[] = [
    'prdt env check .env.local KEY',
    '~/.prdt/bin/prdt env check code/.env.local',
  ]
  for (const command of rows) {
    test(`Bash ${command}`, () => {
      expectAllow(bashEvent(command), command)
    })
  }
})

// ── Bash (S2b): the remaining T-677 §4 ALLOW rows not already covered above ──

describe('Bash — ALLOW, remaining §4 rows (S2b)', () => {
  const rows: string[] = [
    'stat .env',
    'test -f .env.local && echo yes',
    '[ -f .env.local ]',
    'git check-ignore -v .env.local',
    'git ls-files --error-unmatch .env.prod',
    'cp .env.example .env.local',
    'cp .env.local .env.local.bak',
    'rm .env.local',
    'wc -l .env.local',
    'echo "K=v" >> .env.local',
    `cat > .env.local <<'EOF'\nA=1\nEOF`,
    `printf 'A=1\n' > .env`,
    'node --env-file=.env.local s.mjs',
    'cat package.json',
  ]
  for (const command of rows) {
    test(`Bash ${JSON.stringify(command)}`, () => {
      expectAllow(bashEvent(command), command)
    })
  }
})

// ── silence / fail-open ───────────────────────────────────────────────────────

describe('silence / fail-open', () => {
  test('empty stdin', () => {
    const res = spawnSync('bash', [HOOK], { input: '', encoding: 'utf8' })
    expect(res.stdout).toBe('')
    expect(res.stderr).toBe('')
    expect(res.status).toBe(0)
  })

  test('malformed JSON that still contains a target substring', () => {
    // Deliberately broken (unterminated object) so it still passes the raw
    // substring pre-filter and reaches the jq stage, proving THAT stage fails
    // open rather than the pre-filter trivially saving it.
    const res = spawnSync('bash', [HOOK], {
      input: '{"hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":".env.local"',
      encoding: 'utf8',
    })
    expect(res.stdout).toBe('')
    expect(res.stderr).toBe('')
    expect(res.status).toBe(0)
  })

  for (const toolName of ['Edit', 'Write', 'Grep']) {
    test(`tool_name ${toolName} (outside the Read|Bash matcher, silent on a direct call)`, () => {
      expectAllow({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: { file_path: '.env.local' } }, toolName)
    })
  }

  test('tool_input missing entirely', () => {
    const res = spawnSync('bash', [HOOK], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read' }),
      encoding: 'utf8',
    })
    expect(res.stdout).toBe('')
    expect(res.stderr).toBe('')
    expect(res.status).toBe(0)
  })

  test('jq absent from PATH', () => {
    const res = spawnSync('bash', [HOOK], {
      input: JSON.stringify(bashEvent('cat .env.local')),
      encoding: 'utf8',
      env: { PATH: '/bin' }, // /bin/bash exists on every box this runs on; jq does not live there
    })
    expect(res.stdout).toBe('')
    expect(res.stderr).toBe('')
    expect(res.status).toBe(0)
  })
})

// ── no cwd gate (T-684 answer) — the hook never reads `cwd` at all ───────────

describe('no prdt-project / cwd gate (T-684)', () => {
  test('a target file is denied even with no `.prdt/po-state.json` anywhere near cwd', () => {
    const payload = readEvent('.env.local')
    ;(payload as { cwd: string }).cwd = '/tmp/definitely-not-a-prdt-project-' + Date.now()
    expectDeny(payload, '.env.local')
  })
})

// ── latency budget ────────────────────────────────────────────────────────────

describe('latency', () => {
  test('a miss (no target substring anywhere in the payload) costs no fork — median stays under the T-677 budget', () => {
    const payload = readEvent('src/index.ts')
    const samples: number[] = []
    for (let i = 0; i < 200; i++) {
      const t0 = process.hrtime.bigint()
      run(payload)
      samples.push(Number(process.hrtime.bigint() - t0) / 1e6)
    }
    samples.sort((a, b) => a - b)
    const median = samples[Math.floor(samples.length / 2)]
    // Measured (this machine, 2026-09-24, spawnSync round trip incl. node +
    // bash startup, idle box): median 5.83ms, p90 7.87ms. The T-677 Outcome
    // §2 raw bash+read figure (no node/spawn overhead) was 5.6ms. Scaled by
    // the SAME load-derived factor every other timeout in this suite uses
    // (scripts/vitest-timeouts.cjs `scale()`) — an unscaled 8ms flaked under
    // full-suite parallel load (measured 13.8ms median at scale ~2.6-3.7,
    // same run, unrelated tests hogging CPU) though the hook's own cost did
    // not change; every OTHER subprocess budget in this repo scales the same
    // way for the same reason. S2b added `shopt -s/-u nocasematch` around the
    // pre-filter (M5 fix) — a builtin, no fork, measured no change to this
    // budget.
    //
    // S3 (T-677 Outcome §S2b, ③): `scale()` is resolved ONCE at run start and
    // pinned into the env for every worker (`vitest-timeouts.cjs` `pin()`) —
    // it is a snapshot, not a live reading. Under a full-suite run this loop's
    // 200 real spawns take real wall time, and a CPU spike from an unrelated
    // parallel worker can land AFTER that snapshot — measured: 39ms against a
    // 15.2ms budget (scale 1.9 at run start) in a full-suite run, while the
    // SAME file run alone moments later, at a HIGHER measured load (scale
    // 2.7), passed clean at 134/134 — the hook's own cost never changed, only
    // which scale the stale snapshot happened to catch. So this budget alone
    // re-derives the scale from the CURRENT 1-minute load average right where
    // it is used — the exact formula (`autoScale`) every other budget in this
    // repo is built from, just resampled instead of read from the pinned
    // snapshot — and takes whichever of the two readings is larger, so a
    // genuinely quieter run-start scale can never mask a live spike, and a
    // real regression (this hook doing meaningfully more work per call, not
    // just noisier CPU sharing) still has to clear 8ms times a real,
    // currently-observed scale to pass.
    const liveScale = Math.max(timeouts.scale().value, timeouts.autoScale())
    expect(median).toBeLessThan(8 * liveScale)
  })
})

// ── H2 fix: judgment stays linear on a large hit-path heredoc ───────────────
// The grill measured 7.8s on a 60KB hit-path heredoc containing `process.env`
// (`.env` inside that word passes the pre-filter, so this is a jq-forking
// HIT, not a miss) — the tokenizer's per-character `cur+="$c"` string
// building is O(n^2) in bash. The fix (H1) strips a heredoc body by
// whole-LINE compare before it ever reaches that tokenizer, so size stops
// mattering here. Both bodies are built from many short lines, never one
// giant line, so a regression in the line-count direction would show up too.
// S2b's `extract_substitutions` also does per-character `out+="$c"` — but it
// runs on `HEREDOC_STRIPPED`, never the raw command, so it inherits this same
// "small skeleton" guarantee rather than reintroducing an O(n^2) risk; this
// suite re-runs unchanged as the regression check for that.

function heredocCommand(targetBytes: number): string {
  const lines: string[] = []
  let total = 0
  let i = 0
  while (total < targetBytes) {
    const line = `const v${i} = process.env.SOME_VAR_${i}; // padding padding padding`
    lines.push(line)
    total += line.length + 1
    i++
  }
  return `cat > generated.js <<'EOF'\n${lines.join('\n')}\nEOF`
}

function medianMs(payload: unknown, samples: number): number {
  const times: number[] = []
  for (let i = 0; i < samples; i++) {
    const t0 = process.hrtime.bigint()
    run(payload)
    times.push(Number(process.hrtime.bigint() - t0) / 1e6)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]
}

describe('latency — hit-path heredoc stays linear (H2 fix)', () => {
  test('20KB heredoc body containing process.env finishes within the scaled budget', () => {
    const command = heredocCommand(20_000)
    const median = medianMs(bashEvent(command), 7)
    // Base budget from the S2a-fix acceptance: ≤100ms for 20KB, scaled the
    // same way as every other subprocess budget in this suite. Measured (this
    // machine, 2026-09-24, spawnSync round trip incl. node + bash startup,
    // idle box): ~15-30ms.
    expect(median).toBeLessThan(100 * timeouts.scale().value)
  })

  test('60KB heredoc body containing process.env finishes within the scaled budget', () => {
    const command = heredocCommand(60_000)
    const median = medianMs(bashEvent(command), 5)
    // Proportional to the 20KB budget (linear judgment) rather than the
    // O(n^2) blowup the grill measured (7.8s at this exact size pre-fix) — 3x
    // the 20KB base is still a small fraction of that failure, with margin.
    expect(median).toBeLessThan(300 * timeouts.scale().value)
  })
})

// ── S2b-fix (QA grill S2b HIGH): judgment stays linear on EVERY hit path, not
// only a heredoc body — the grill measured 21.7s on a 60KB single-line
// `node -e`/`git commit -m` argument mentioning a target substring (no
// heredoc involved at all): `strip_heredocs` doesn't shrink a one-line
// command, so the character-walking stages saw the ENTIRE line. Also covers
// the OTHER measured cause named in the dispatch: a 1000-argument command
// used to fork `tr` once per argument (via `is_target`'s old `to_lower`
// helper) — fork count must not grow with argument count either.
//
// S2b-perf: the S2b-fix run-slicing rewrite left these three rows RED
// (17.0s / 17.0s / 7.5s in the suite; 21.3s / 21.5s / 1.31s as raw hook wall
// time) because bash 3.2's `${s:i:1}` is itself O(n) — the judgment now runs
// in one perl process per hit (see the hook's SHAPE header). Measured after
// (this machine, 2026-09-24, raw hook wall time, load ~26 on 14 cpus): 0.09s /
// 0.09s / 0.06s. Budgets below are UNCHANGED (300/300/500ms base); the scale
// is re-derived live, same as the miss-path row above, so a CPU spike from an
// unrelated worker landing after the run-start snapshot cannot flake them —
// the margin is in the scale reading, never in the base. ───────────────────

function longSingleLine(targetBytes: number, filler: string): string {
  let out = ''
  while (out.length < targetBytes) out += filler
  return out
}

/** The miss-path row's live scale reading (see its comment): the larger of the
 *  pinned run-start snapshot and a fresh 1-minute-load derivation. */
function liveScale(): number {
  return Math.max(timeouts.scale().value, timeouts.autoScale())
}

describe('latency — every hit path stays linear, not only heredocs (S2b-fix HIGH)', () => {
  test('60KB single-line `node -e` argument mentioning process.env finishes within the scaled budget', () => {
    const body = longSingleLine(60_000, 'const x = process.env.SOME_VAR; // padding padding padding ')
    const command = `node -e "${body.replace(/"/g, '\\"')}"`
    const median = medianMs(bashEvent(command), 5)
    // node is not a printer/pattern command, so this is a jq-forking HIT
    // (`.env` inside "process.env" passes the pre-filter) that never denies —
    // pure judgment-pipeline cost. Same order of budget as the 60KB heredoc
    // case above (that one is linear too; this proves the OTHER, non-heredoc
    // hit paths are as well) — was 21.7s pre-fix at this exact size/shape.
    expect(median).toBeLessThan(300 * liveScale())
  })

  test('60KB single-line `git commit -m` body mentioning .env finishes within the scaled budget', () => {
    const body = longSingleLine(60_000, 'touched .env handling in this commit, see notes below. ')
    const command = `git commit -m "${body.replace(/"/g, '\\"')}"`
    const median = medianMs(bashEvent(command), 5)
    expect(median).toBeLessThan(300 * liveScale())
  })

  test('1000 file arguments finish within a scaled budget (fork count must not grow per argument)', () => {
    const args: string[] = []
    for (let i = 0; i < 1000; i++) args.push(`file${i}.txt`) // none are targets — scans all 1000
    const command = `cat ${args.join(' ')} .env.local` // target LAST so all 1000 non-targets are scanned first
    const median = medianMs(bashEvent(command), 5)
    // is_target used to fork `tr` once per argument (via to_lower) — 1000
    // forks alone dwarfs everything else in this hook. Now a fixed fork count
    // (jq once, perl once) whatever the argument count, so this budget is
    // generous headroom, not a tight measurement of the fix.
    expect(median).toBeLessThan(500 * liveScale())
  })
})
