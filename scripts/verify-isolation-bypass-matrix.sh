#!/usr/bin/env bash
#
# verify-isolation-bypass-matrix.sh — T-442 F-A / T-450, end-to-end proof.
#
# `tests/isolation.guard.spec.ts` proves the rules from inside the suite. This
# script proves them from OUTSIDE, the way QA broke them in round 2: it writes
# real bypass spec files into the real tests/ directory, runs the real Playwright
# suite, and checks what happened.
#
# Three independent things are verified, because T-450 established that they are
# different guarantees:
#
#   PART 1  PREVENTION — bypass fixtures are refused, the run goes red, every
#           fixture is reported failed (not skipped, not silently collected), and
#           the real home is byte-for-byte unchanged.
#   PART 2  DETECTION  — the tripwire, on the Playwright runner. A fixture that
#           mutates "the real home" with a plain `fs.writeFileSync`, which no
#           chokepoint can see, must still turn the run RED — including under
#           `--reporter=line`, which is how QA removed R1's floor entirely (S4).
#           Run against a DECOY real home, so proving it costs the machine nothing.
#   PART 3  THE OTHER RUNNER — vitest. T-450 / S2: `pnpm test` is `turbo run test`,
#           which runs `vitest run` in both packages, and Playwright is `pnpm
#           smoke`. R1's floor was a Playwright reporter, so the runner with the
#           documented history of writing this developer's real home had no floor
#           at all. Both PREVENTION and DETECTION are verified there too.
#
# ── THIS MACHINE'S RUN RULE (docs/wiki/fact--qa-cua-vm.md) ───────────────────
#
# If it opens a window it runs in the lume VM `cua`. This script therefore runs
# ONLY window-free work on the host:
#   • every bypass fixture is refused BEFORE a process is spawned, so none of them
#     can render anything;
#   • tests tagged `@window` are grep-inverted out by playwright.config.ts unless
#     PRODUCTUNE_ALLOW_WINDOWS=1, and this script refuses to run if that variable
#     is set — proving the rule rather than trusting it.
# T-450 fixed the earlier violation here: this script used to run
# `isolation.guard.spec.ts` wholesale, and two of its tests call `launchApp()`,
# so on the host it opened real Electron windows.
#
# Fixtures are removed on exit, including on failure (trap). Nothing is
# committed. Run from anywhere:  bash scripts/verify-isolation-bypass-matrix.sh

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUI="$REPO/packages/gui"
TESTS="$GUI/tests"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/t442-bypass-XXXXXX")"
PW="node $GUI/node_modules/@playwright/test/cli.js"

# ── run rule gate ────────────────────────────────────────────────────────────
if [ "${PRODUCTUNE_ALLOW_WINDOWS:-}" = "1" ]; then
  echo "REFUSING: PRODUCTUNE_ALLOW_WINDOWS=1 is set."
  echo "This script is the HOST verification and must never open a window."
  echo "Run the @window suite in the VM instead:"
  echo "  lume ssh cua 'cd ~/dev/productune-v1/packages/gui && PRODUCTUNE_ALLOW_WINDOWS=1 pnpm exec playwright test'"
  exit 2
fi

FIXTURES=(
  "$TESTS/sub/evil-subdir.spec.ts"
  "$TESTS/evil-suffix.test.ts"
  "$TESTS/evil-viahelper.spec.ts"
  "$TESTS/evil-helper.ts"
  "$TESTS/sub/deep/evil-deep.test.tsx"
  "$TESTS/evil-childproc.spec.ts"
  "$TESTS/evil-worker.spec.ts"
  "$TESTS/evil-worker-realm.cjs"
  "$TESTS/evil-case.spec.ts"
  "$TESTS/tripwire-fixture.spec.ts"
  "$TESTS/evil-escape-sentinel.ts"
)

cleanup() {
  rm -f "${FIXTURES[@]}"
  rmdir "$TESTS/sub/deep" "$TESTS/sub" 2>/dev/null
  rm -rf "$WORK" "$GUI/.t450-verify-vitest"
}
trap cleanup EXIT

# The real home's fingerprint, taken by THE TRIPWIRE ITSELF.
#
# T-450 R2. This used to be a hand-written `find -maxdepth 4` over a hand-written
# list of four directories — a SECOND derivation of "which surfaces matter" and
# "how deep to look", sitting right next to the module that owns both. It was
# already wrong in two ways QA found in the module: it had no depth beyond 4 (S12)
# and no exclusion for `~/.productune/state/autosave-snapshots`, which changes
# during any live agent session (S11) — so this script's own before/after diff
# would have reported the developer's home as mutated on a perfectly clean run.
#
# A duplicate derivation is the defect this whole ticket is about, so there is no
# longer a second one. The script asks the tripwire.
fingerprint() {
  node -e '
    const m = require(process.argv[1])
    const s = m.snapshotRealHome()
    if (s.truncated) { console.error("TRUNCATED: " + s.truncated); process.exit(1) }
    process.stdout.write(s.detail.join("\n") + "\n")
  ' "$TESTS/real-home-tripwire.cjs"
}

# ── the fixtures ─────────────────────────────────────────────────────────────
# Written exactly as a naive author would write them: the three-line launch
# everyone copies, with no `env` and no `--user-data-dir`. Each one asks the
# main process where userData landed, so an escape is visible in the log rather
# than silent.

mkdir -p "$TESTS/sub/deep"

# An escape is recorded as a FILE, never as a log line. Playwright echoes the
# failing source lines in its error context, so any sentinel STRING in a fixture
# appears in the log whether or not the fixture escaped — the previous version of
# this script grepped for one and reported a false escape on every run.
cat > "$TESTS/evil-escape-sentinel.ts" <<'EOF'
import fs from 'fs'
import path from 'path'

/** Called only when a launch really succeeded. Writes proof to disk. */
export function escaped(userData: string): void {
  const dir = process.env.T450_ESCAPE_DIR
  if (!dir) throw new Error('T450_ESCAPE_DIR not set')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `escaped-${process.pid}-${Date.now()}.txt`), userData)
}
EOF

# QA bypass #1 — subdirectory. Round 2's readdirSync was not recursive.
cat > "$TESTS/sub/evil-subdir.spec.ts" <<'EOF'
import path from 'path'
import { test } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import { escaped } from '../evil-escape-sentinel'

const MAIN = path.resolve(__dirname, '..', '..', 'dist-electron', 'main.js')

test('BYPASS subdir: boots Electron with no redirection', async () => {
  const app = await electron.launch({ args: [MAIN] })
  escaped(await app.evaluate(({ app: a }) => a.getPath('userData')))
  await app.close()
})
EOF

# QA bypass #2 — `.test.ts`. Playwright collects it; round 2 filtered `.spec.ts`.
cat > "$TESTS/evil-suffix.test.ts" <<'EOF'
import path from 'path'
import { test } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import { escaped } from './evil-escape-sentinel'

const MAIN = path.resolve(__dirname, '..', 'dist-electron', 'main.js')

test('BYPASS suffix: boots Electron with no redirection', async () => {
  const app = await electron.launch({ args: [MAIN] })
  escaped(await app.evaluate(({ app: a }) => a.getPath('userData')))
  await app.close()
})
EOF

# QA bypass #3 — the spec is clean; the banned call lives in a non-spec helper.
cat > "$TESTS/evil-helper.ts" <<'EOF'
import path from 'path'
import { _electron as electron } from '@playwright/test'

const MAIN = path.resolve(__dirname, '..', 'dist-electron', 'main.js')

export async function bootTheApp() {
  return electron.launch({ args: [MAIN] })
}
EOF
cat > "$TESTS/evil-viahelper.spec.ts" <<'EOF'
import { test } from '@playwright/test'
import { bootTheApp } from './evil-helper'
import { escaped } from './evil-escape-sentinel'

test('BYPASS via helper: the spec itself names nothing banned', async () => {
  const app = await bootTheApp()
  escaped(await app.evaluate(({ app: a }) => a.getPath('userData')))
  await app.close()
})
EOF

# Mine #1 — two levels down AND `.test.tsx`, i.e. both round-2 gaps at once.
cat > "$TESTS/sub/deep/evil-deep.test.tsx" <<'EOF'
import path from 'path'
import { test } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import { escaped } from '../../evil-escape-sentinel'

const MAIN = path.resolve(__dirname, '..', '..', '..', 'dist-electron', 'main.js')

test('BYPASS deep+tsx: boots Electron with no redirection', async () => {
  const app = await electron.launch({ args: [MAIN] })
  escaped(await app.evaluate(({ app: a }) => a.getPath('userData')))
  await app.close()
})
EOF

# Mine #2 — never touches the Playwright launcher at all. This is the T-440
# driver shape: spawn the Electron binary directly. A file scan cannot see it.
cat > "$TESTS/evil-childproc.spec.ts" <<'EOF'
import cp from 'child_process'
import path from 'path'
import { test } from '@playwright/test'

const GUI = path.resolve(__dirname, '..')
const MAIN = path.join(GUI, 'dist-electron', 'main.js')
const BIN = path.join(GUI, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')

test('BYPASS child_process: spawns the app binary around Playwright', async () => {
  const child = cp.spawn(BIN, [MAIN], { stdio: 'ignore', detached: false })
  await new Promise((r) => setTimeout(r, 4000))
  child.kill('SIGKILL')
})
EOF

# T-450 #1 — THE R3 ESCAPE. A worker_threads realm: a fresh module cache, where
# nothing patched by playwright.config.ts exists. This is the shape that produced
# a GREEN run while writing SingletonLock/SingletonSocket/SingletonCookie into
# the real userData, so it belongs in the executable matrix and not in a comment.
cat > "$TESTS/evil-worker-realm.cjs" <<'EOF'
const path = require('path')
const { parentPort } = require('worker_threads')
const GUI = path.resolve(__dirname, '..')
const MAIN = path.join(GUI, 'dist-electron', 'main.js')
const pw = require(require.resolve('@playwright/test', { paths: [GUI] }))
const escaped = (userData) => {
  const fs = require('fs')
  const dir = process.env.T450_ESCAPE_DIR
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `escaped-worker-${Date.now()}.txt`), userData)
}
;(async () => {
  try {
    const app = await pw._electron.launch({ args: [MAIN] })
    const userData = await app.evaluate(({ app: a }) => a.getPath('userData'))
    console.log('ESCAPED userData =', userData)
    await app.close()
    parentPort.postMessage('ESCAPED')
  } catch (e) {
    parentPort.postMessage('BLOCKED: ' + e.message)
  }
})()
EOF
cat > "$TESTS/evil-worker.spec.ts" <<'EOF'
import path from 'path'
import { Worker } from 'worker_threads'
import { test } from '@playwright/test'

test('BYPASS worker_threads: a new realm has its own module cache', async () => {
  const msg = await new Promise<string>((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'evil-worker-realm.cjs'))
    w.once('message', (m: string) => { void w.terminate(); resolve(m) })
    w.once('error', (e) => reject(e))
  })
  console.log('WORKER SAID:', msg)
  // Rethrow either way, so this fixture is reported as a FAILURE exactly like the
  // other bypasses. The two outcomes stay distinguishable in the log: a blocked
  // attempt carries the isolation tag, an escape prints ESCAPED userData.
  throw new Error('WORKER SAID: ' + msg)
})
EOF

# T-450 R2 #1 — S1, THE CASE VARIANT. The one new escape QA could reach on the
# HOST with no window at all, and the exact mechanism of the 2026-07-30 incident:
# macOS is case-insensitive but `realpath` does not canonicalise case, so
# `/users/<u>/...` named the real userData while comparing clean. Written as a real
# collected spec so the refusal is proven end-to-end and not only as a predicate.
cat > "$TESTS/evil-case.spec.ts" <<'EOF'
import os from 'os'
import path from 'path'
import { test } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import { escaped } from './evil-escape-sentinel'

const GUI = path.resolve(__dirname, '..')
const MAIN = path.join(GUI, 'dist-electron', 'main.js')
// The real home spelled in lower case. Same inode, different string.
const REAL = process.env.PRODUCTUNE_REAL_HOME ?? os.homedir()
const LOWER_USER_DATA = path.join(
  REAL.replace(/^\/Users\//, '/users/'),
  'Library',
  'Application Support',
  'productune',
)

test('BYPASS case: --user-data-dir at the real userData, spelled in lower case', async () => {
  const app = await electron.launch({
    args: [MAIN, `--user-data-dir=${LOWER_USER_DATA}`],
    env: { ...process.env, HOME: path.join(os.tmpdir(), 'productune-pw-sandbox', 'default-home') } as Record<
      string,
      string
    >,
  })
  escaped(await app.evaluate(({ app: a }) => a.getPath('userData')))
  await app.close()
})
EOF

# T-450 #2 — the DETECTION fixture. No launch at all: a plain file write, which
# no chokepoint can see. Points at a DECOY real home and refuses to run if that
# decoy is the developer's actual home.
> "$TESTS/tripwire-fixture.spec.ts" cat <<EOF
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

// T-450 R2 / S9: the refusal guard is the SHARED one from isolation-rules.cjs, not
// a hand-rolled \`startsWith\`. R1 hand-rolled it here and in the guard spec, and QA
// found that the same diff which fixed lexical containment in \`insideRealHome\`
// reproduced the identical defect in both copies — so a case variant or a symlink
// walked straight past the guard protecting the developer's real home.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertNotForbiddenHome } = require('$TESTS/isolation-rules.cjs')

test('TRIPWIRE: an ordinary passing test that rewrites the real home', () => {
  const decoy = process.env.PRODUCTUNE_REAL_HOME
  assertNotForbiddenHome(decoy, process.env.T450_FORBIDDEN_HOME, 'tripwire-fixture')
  fs.mkdirSync(path.join(decoy!, '.productune'), { recursive: true })
  fs.writeFileSync(path.join(decoy!, '.productune', 'settings.json'), JSON.stringify({ mutated: Date.now() }))
  fs.writeFileSync(path.join(decoy!, '.productune', 'SingletonLock'), 'x')
  expect(1 + 1).toBe(2) // the test itself is perfectly fine
})
EOF

echo "── fixtures written ──────────────────────────────────────────────────────"
for f in "${FIXTURES[@]}"; do echo "  ${f#"$TESTS/"}"; done

# ── what ROUND 2's rule would have said about these ──────────────────────────
echo
echo "── round-2 scan (readdirSync + .spec.ts + /_electron/) over the same tree ─"
node -e '
const fs = require("fs"), path = require("path");
const TESTS = process.argv[1];
const EXEMPT = new Set(["isolation.guard.spec.ts"]);
const files = fs.readdirSync(TESTS)
  .filter((f) => f.endsWith(".spec.ts") && !EXEMPT.has(f));
const offenders = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(TESTS, f), "utf-8");
  src.split("\n").forEach((line, i) => {
    if (/\b_electron\b/.test(line) || /\belectron\.launch\s*\(/.test(line)) offenders.push(f + ":" + (i + 1));
  });
}
const fixtures = ["sub/evil-subdir.spec.ts","evil-suffix.test.ts","evil-viahelper.spec.ts","evil-helper.ts","sub/deep/evil-deep.test.tsx","evil-childproc.spec.ts","evil-worker.spec.ts","evil-case.spec.ts","tripwire-fixture.spec.ts"];
const caught = new Set(offenders.map((o) => o.split(":")[0]));
for (const f of fixtures) console.log("  " + (caught.has(f) ? "CAUGHT " : "MISSED ") + f);
' "$TESTS"

# ── baseline ─────────────────────────────────────────────────────────────────
fingerprint > "$WORK/before.txt"
BEFORE_LINES=$(wc -l < "$WORK/before.txt" | tr -d ' ')
echo
echo "── real-home baseline: $BEFORE_LINES entries ─────────────────────────────"

FAIL=0

# ═════════════════════════════════════════════════════════════════════════════
# PART 1 — PREVENTION
# ═════════════════════════════════════════════════════════════════════════════
echo
echo "══ PART 1: prevention ════════════════════════════════════════════════════"
cd "$GUI" || exit 1
export T450_ESCAPE_DIR="$WORK/escapes"
$PW test evil isolation.guard > "$WORK/run.log" 2>&1
RUN_RC=$?
tail -30 "$WORK/run.log"
# Any guard-spec failure OTHER than the static scan is unexpected: the scan is
# SUPPOSED to fail here (the fixtures are real files under testDir). Surface the
# rest immediately instead of letting them hide behind the fixture failures.
UNEXPECTED=$(grep -E "^\s+tests/isolation\.guard\.spec\.ts" "$WORK/run.log" \
  | grep -v "no file under testDir launches Electron outside the harness" || true)
if [ -n "$UNEXPECTED" ]; then
  echo
  echo "  !! guard-spec tests failed that should not have:"
  echo "$UNEXPECTED" | sed 's/^/     /'
  # Print the failure bodies inline. `test-results/` is not usable for this —
  # Playwright wipes its output dir at the start of every run, and PART 2 below
  # runs the suite again, so a copy left there is gone before anyone reads it.
  echo "  ── failure detail ──────────────────────────────────────────────────────"
  sed -n '/^  [0-9]*) .*isolation\.guard/,/^  [0-9]*) \|^  [0-9]* failed/p' "$WORK/run.log" \
    | grep -v "no file under testDir launches" | head -45 | sed 's/^/     /'
fi

echo
echo "── verdicts (prevention) ─────────────────────────────────────────────────"

if [ "$RUN_RC" -eq 0 ]; then
  echo "  FAIL  the suite went GREEN with bypass specs present"
  FAIL=1
else
  echo "  ok    the suite went RED (exit $RUN_RC)"
fi

if [ -d "$T450_ESCAPE_DIR" ] && [ -n "$(ls -A "$T450_ESCAPE_DIR" 2>/dev/null)" ]; then
  echo "  FAIL  a fixture reached a real launch; escaped userData paths:"
  cat "$T450_ESCAPE_DIR"/* | sed 's/^/          /'
  FAIL=1
else
  echo "  ok    no fixture reached a real launch (no escape sentinel written)"
fi

if [ -n "$UNEXPECTED" ]; then
  echo "  FAIL  guard-spec tests failed beyond the expected static-scan failure (above)"
  FAIL=1
else
  echo "  ok    the guard spec's only failure is the static scan, which is expected here"
fi

for name in evil-subdir.spec.ts evil-suffix.test.ts evil-viahelper.spec.ts evil-deep.test.tsx evil-childproc.spec.ts evil-worker.spec.ts evil-case.spec.ts; do
  if grep -qE "✘.*$name|✘.*${name%.*}" "$WORK/run.log"; then
    echo "  ok    blocked and reported failed: $name"
  else
    echo "  FAIL  not reported as a failure: $name"
    FAIL=1
  fi
done

if grep -q "T-442 ISOLATION VIOLATION" "$WORK/run.log"; then
  echo "  ok    failures carry the isolation tag (blocked by the rules, not by chance)"
else
  echo "  FAIL  no isolation tag in the log — something else failed the run"
  FAIL=1
fi

if grep -q "no file under testDir launches Electron outside the harness" "$WORK/run.log"; then
  echo "  ok    the static scan also flagged them (two independent detections)"
else
  echo "  WARN  the static scan did not report — only the runtime rules held"
fi

# ── the run rule: nothing that opens a window may have run on the host ───────
if grep -qE "✓.*@window|✘.*@window" "$WORK/run.log"; then
  echo "  FAIL  a @window test RAN on the host — this machine forbids that"
  FAIL=1
else
  echo "  ok    no @window test ran on the host (grep-inverted by playwright.config.ts)"
fi

# ═════════════════════════════════════════════════════════════════════════════
# PART 2 — DETECTION (the floor)
# ═════════════════════════════════════════════════════════════════════════════
echo
echo "══ PART 2: detection — the suite-global tripwire ═════════════════════════"
DECOY="$WORK/decoy-real-home"
mkdir -p "$DECOY/.productune" "$DECOY/.prdt" "$DECOY/productune"
echo '{"seeded":true}' > "$DECOY/.productune/seed.json"

# The same mutating fixture, twice: once with the tripwire off (today's
# behaviour) and once on. Only this one fixture runs — with PRODUCTUNE_REAL_HOME
# repointed at the decoy, the isolation rules would treat the DEVELOPER's home as
# "outside", so no launch fixture may run in this configuration.
run_tripwire() {
  PRODUCTUNE_REAL_HOME="$DECOY" T450_FORBIDDEN_HOME="$HOME" PRODUCTUNE_TRIPWIRE="$1" \
    $PW test tripwire-fixture > "$WORK/tripwire-$1.log" 2>&1
  echo $?
}

OFF_RC=$(run_tripwire off)
ON_RC=$(run_tripwire on)

echo
echo "── verdicts (detection) ──────────────────────────────────────────────────"

if grep -q "REFUSING" "$WORK/tripwire-off.log" "$WORK/tripwire-on.log"; then
  echo "  FAIL  the fixture refused to run — the decoy resolved to the real home"
  FAIL=1
fi

if [ "$OFF_RC" -eq 0 ] && grep -q "1 passed" "$WORK/tripwire-off.log"; then
  echo "  ok    tripwire OFF: run is GREEN while the home was rewritten (the defect)"
else
  echo "  FAIL  tripwire OFF: expected a green run, got exit $OFF_RC"
  FAIL=1
fi

if [ -f "$DECOY/.productune/SingletonLock" ]; then
  echo "  ok    the mutation really happened (decoy SingletonLock exists)"
else
  echo "  FAIL  the fixture did not mutate anything — the proof would be vacuous"
  FAIL=1
fi

if [ "$ON_RC" -ne 0 ] && grep -q "REAL HOME MUTATED DURING THIS RUN" "$WORK/tripwire-on.log"; then
  echo "  ok    tripwire ON: same mutation, run forced RED (exit $ON_RC)"
else
  echo "  FAIL  tripwire ON: the run did not go red (exit $ON_RC)"
  FAIL=1
fi

if grep -q "an ordinary passing test that rewrites the real home" "$WORK/tripwire-on.log"; then
  echo "  ok    the tripwire named the test it attributed the change to"
else
  echo "  WARN  the tripwire did not attribute the change to a test"
fi

if grep -q "1 passed" "$WORK/tripwire-on.log"; then
  echo "  ok    the TEST still passed — the RUN is what failed (the whole point)"
else
  echo "  WARN  the test did not pass; the red run may be for another reason"
fi

# ── S4: the floor must survive an everyday reporter flag ─────────────────────
# R1's floor WAS the reporter, and `--reporter=line` replaces the config's reporter
# array — so this one flag removed the whole guarantee with no warning.
PRODUCTUNE_REAL_HOME="$DECOY" T450_FORBIDDEN_HOME="$HOME" PRODUCTUNE_TRIPWIRE=on \
  $PW test tripwire-fixture --reporter=line > "$WORK/tripwire-line.log" 2>&1
LINE_RC=$?
if [ "$LINE_RC" -ne 0 ] && grep -q "REAL HOME MUTATED DURING THIS RUN" "$WORK/tripwire-line.log"; then
  echo "  ok    S4: --reporter=line did NOT disarm the floor (exit $LINE_RC, verdict in globalTeardown)"
else
  echo "  FAIL  S4: --reporter=line silently removed the floor (exit $LINE_RC)"
  FAIL=1
fi

# ═════════════════════════════════════════════════════════════════════════════
# PART 3 — THE OTHER RUNNER. `pnpm test` is vitest, not Playwright.
# ═════════════════════════════════════════════════════════════════════════════
#
# T-450 / S2, and the reason the acceptance was rewritten in terms of the command a
# developer actually types. `pnpm test` is `turbo run test`, which runs `vitest run`
# in BOTH packages; Playwright is `pnpm smoke`. R1 put the entire floor in a
# Playwright reporter, so the runner with the DOCUMENTED history of writing this
# developer's real home (see scripts/vitest-home-sandbox.ts) had no floor at all —
# QA measured a vitest test that deleted the real home reporting "2 passed", exit 0.
#
# Proven the same way as PART 2: a nested vitest project pointed at a DECOY real
# home, run twice.
echo
echo "══ PART 3: detection on the vitest runner (pnpm test) ════════════════════"

VDECOY="$WORK/vitest-decoy-real-home"
VPROJ="$GUI/.t450-verify-vitest"
mkdir -p "$VDECOY/.productune" "$VDECOY/.prdt" "$VDECOY/productune" "$VPROJ"
echo '{"seeded":true}' > "$VDECOY/.productune/settings.json"
# Registered in the cleanup trap by living under $GUI with a known prefix.
cleanup_vitest() { rm -rf "$VPROJ"; }

cat > "$VPROJ/mutate.test.ts" <<EOF
import { it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
// The SHARED refusal guard (S9), exactly as in the Playwright fixture.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertNotForbiddenHome } = require('$TESTS/isolation-rules.cjs')

it('an ordinary passing unit test that rewrites the real home', () => {
  const decoy = process.env.PRODUCTUNE_REAL_HOME
  assertNotForbiddenHome(decoy, process.env.T450_FORBIDDEN_HOME, 'vitest tripwire-fixture')
  fs.writeFileSync(path.join(decoy!, '.productune', 'settings.json'), JSON.stringify({ mutated: Date.now() }))
  fs.rmSync(path.join(decoy!, '.prdt'), { recursive: true, force: true })
  expect(1 + 1).toBe(2) // the test itself is perfectly fine
})
EOF

# The nested config MIRRORS the real ones: arm at module scope, verdict in
# globalSetup's teardown. Anything less would be proving a different design.
cat > "$VPROJ/vitest.config.ts" <<EOF
import { defineConfig } from 'vitest/config'
import { createRequire } from 'node:module'
const cjs = createRequire(import.meta.url)
cjs('$TESTS/real-home-tripwire.cjs').armTripwire('verify-script nested vitest config')
export default defineConfig({
  test: {
    include: ['.t450-verify-vitest/**/*.test.ts'],
    environment: 'node',
    globals: false,
    execArgv: ['--require', '$TESTS/isolation-realm-bootstrap.cjs'],
    globalSetup: ['$REPO/scripts/vitest-real-home-verdict.ts'],
  },
})
EOF

run_vitest_tripwire() {
  # PRODUCTUNE_TRIPWIRE_RUN is cleared so the nested run arms its OWN baseline —
  # it has a different real home, and inheriting the parent's would compare the
  # decoy tree against the developer's actual home.
  ( cd "$GUI" && PRODUCTUNE_REAL_HOME="$VDECOY" T450_FORBIDDEN_HOME="$HOME" \
      PRODUCTUNE_TRIPWIRE="$1" PRODUCTUNE_TRIPWIRE_RUN= \
      node "$GUI/node_modules/vitest/vitest.mjs" run --config "$VPROJ/vitest.config.ts" \
      > "$WORK/vitest-$1.log" 2>&1 )
  echo $?
}

V_OFF_RC=$(run_vitest_tripwire off)
V_ON_RC=$(run_vitest_tripwire on)

echo
echo "── verdicts (vitest / pnpm test) ─────────────────────────────────────────"

if grep -q "REFUSING" "$WORK/vitest-off.log" "$WORK/vitest-on.log"; then
  echo "  FAIL  the vitest fixture refused to run — the decoy resolved to the real home"
  FAIL=1
fi

if [ "$V_OFF_RC" -eq 0 ] && grep -q "1 passed" "$WORK/vitest-off.log"; then
  echo "  ok    vitest, tripwire OFF: GREEN while the home was rewritten (S2, the defect)"
else
  echo "  FAIL  vitest, tripwire OFF: expected a green run, got exit $V_OFF_RC"
  FAIL=1
fi

if [ "$V_ON_RC" -ne 0 ] && grep -q "REAL HOME MUTATED DURING THIS RUN" "$WORK/vitest-on.log"; then
  echo "  ok    vitest, tripwire ON: same mutation, run RED (exit $V_ON_RC)"
else
  echo "  FAIL  vitest, tripwire ON: the run did not go red (exit $V_ON_RC)"
  FAIL=1
fi

if grep -qE "Tests +1 passed|1 passed" "$WORK/vitest-on.log"; then
  echo "  ok    the vitest TEST still passed — the RUN is what failed"
else
  echo "  WARN  the vitest test did not pass; the red run may be for another reason"
fi

# The verdict must survive a reporter flag here too (S4 on the other runner).
V_DOT_RC=$( ( cd "$GUI" && PRODUCTUNE_REAL_HOME="$VDECOY" T450_FORBIDDEN_HOME="$HOME" \
    PRODUCTUNE_TRIPWIRE=on PRODUCTUNE_TRIPWIRE_RUN= \
    node "$GUI/node_modules/vitest/vitest.mjs" run --config "$VPROJ/vitest.config.ts" --reporter=dot \
    > "$WORK/vitest-dot.log" 2>&1 ); echo $? )
if [ "$V_DOT_RC" -ne 0 ]; then
  echo "  ok    vitest, --reporter=dot: floor held (exit $V_DOT_RC)"
else
  echo "  FAIL  vitest, --reporter=dot: the floor was removed by a reporter flag"
  FAIL=1
fi

# PREVENTION reached vitest too: the rules must be installed in a vitest realm.
cat > "$VPROJ/rules-present.test.ts" <<'EOF'
import { it, expect } from 'vitest'
import cp from 'child_process'

it('the isolation rules are installed in this vitest realm', () => {
  expect(!!(globalThis as Record<symbol, unknown>)[Symbol.for('productune.t442.isolationEnforcer')]).toBe(true)
  // S2 named three specific misses. Each one is asserted, not assumed.
  expect(() =>
    cp.spawnSync('/bin/echo', ['x'], { env: { HOME: process.env.PRODUCTUNE_REAL_HOME } as NodeJS.ProcessEnv }),
  ).toThrow(/ISOLATION VIOLATION/)
  expect(() => (process as unknown as { binding: (n: string) => unknown }).binding('spawn_sync')).toThrow(
    /ISOLATION VIOLATION/,
  )
})
EOF
V_RULES_RC=$( ( cd "$GUI" && PRODUCTUNE_REAL_HOME="$VDECOY" T450_FORBIDDEN_HOME="$HOME" \
    PRODUCTUNE_TRIPWIRE=off PRODUCTUNE_TRIPWIRE_RUN= \
    node "$GUI/node_modules/vitest/vitest.mjs" run --config "$VPROJ/vitest.config.ts" \
    rules-present > "$WORK/vitest-rules.log" 2>&1 ); echo $? )
if [ "$V_RULES_RC" -eq 0 ]; then
  echo "  ok    vitest realms carry the isolation rules (spawn guarded, raw binding refused)"
else
  echo "  FAIL  vitest realms have no isolation rules (exit $V_RULES_RC)"
  sed -n '1,25p' "$WORK/vitest-rules.log" | sed 's/^/          /'
  FAIL=1
fi
cleanup_vitest

# ── the developer's real home, across BOTH parts ─────────────────────────────
echo
fingerprint > "$WORK/after.txt"
if diff -q "$WORK/before.txt" "$WORK/after.txt" > /dev/null; then
  echo "  ok    all $(node -e 'console.log(require(process.argv[1]).tripwireSurfaces().length)' "$TESTS/real-home-tripwire.cjs") real-home surfaces unchanged ($BEFORE_LINES entries)"
else
  echo "  FAIL  the REAL home was mutated:"
  diff "$WORK/before.txt" "$WORK/after.txt" | head -40
  FAIL=1
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "T-450 isolation matrix (prevention + detection): PASS"
else
  echo "T-450 isolation matrix (prevention + detection): FAIL"
fi
exit "$FAIL"
