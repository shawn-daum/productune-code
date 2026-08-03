#!/usr/bin/env bash
#
# verify-isolation-bypass-matrix.sh — T-442 F-A, end-to-end proof.
#
# `tests/isolation.guard.spec.ts` proves the rule from inside the suite. This
# script proves it from OUTSIDE, the way QA broke it in round 2: it writes real
# bypass spec files into the real tests/ directory, runs the real Playwright
# suite, and checks three things.
#
#   1. the run goes RED (a bypass must never be a green run)
#   2. every bypass file is reported failed — not skipped, not "collected but
#      never executed"
#   3. the developer's REAL ~/.productune, ~/.prdt and
#      ~/Library/Application Support/productune are byte-for-byte unchanged
#
# It also re-runs ROUND 2's scan logic over the same fixtures, so the output
# shows what the previous rule missed next to what this one catches. A single
# negative control is what made round 2's claim false; the point of this script
# is that the control set is plural and executable.
#
# Fixtures are removed on exit, including on failure (trap). Nothing is
# committed. Run from anywhere:  bash scripts/verify-isolation-bypass-matrix.sh

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUI="$REPO/packages/gui"
TESTS="$GUI/tests"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/t442-bypass-XXXXXX")"

FIXTURES=(
  "$TESTS/sub/evil-subdir.spec.ts"
  "$TESTS/evil-suffix.test.ts"
  "$TESTS/evil-viahelper.spec.ts"
  "$TESTS/evil-helper.ts"
  "$TESTS/sub/deep/evil-deep.test.tsx"
  "$TESTS/evil-childproc.spec.ts"
)

cleanup() {
  rm -f "${FIXTURES[@]}"
  rmdir "$TESTS/sub/deep" "$TESTS/sub" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

fingerprint() {
  for p in "$HOME/.productune" "$HOME/.prdt" "$HOME/Library/Application Support/productune"; do
    echo "=== $p"
    find "$p" -maxdepth 4 -print0 2>/dev/null | xargs -0 stat -f '%N %z %m' 2>/dev/null | sort
  done
}

# ── the fixtures ─────────────────────────────────────────────────────────────
# Written exactly as a naive author would write them: the three-line launch
# everyone copies, with no `env` and no `--user-data-dir`. Each one asks the
# main process where userData landed, so an escape is visible in the log rather
# than silent.

mkdir -p "$TESTS/sub/deep"

# QA bypass #1 — subdirectory. Round 2's readdirSync was not recursive.
cat > "$TESTS/sub/evil-subdir.spec.ts" <<'EOF'
import path from 'path'
import { test } from '@playwright/test'
import { _electron as electron } from '@playwright/test'

const MAIN = path.resolve(__dirname, '..', '..', 'dist-electron', 'main.js')

test('BYPASS subdir: boots Electron with no redirection', async () => {
  const app = await electron.launch({ args: [MAIN] })
  console.log('ESCAPED userData =', await app.evaluate(({ app: a }) => a.getPath('userData')))
  await app.close()
})
EOF

# QA bypass #2 — `.test.ts`. Playwright collects it; round 2 filtered `.spec.ts`.
cat > "$TESTS/evil-suffix.test.ts" <<'EOF'
import path from 'path'
import { test } from '@playwright/test'
import { _electron as electron } from '@playwright/test'

const MAIN = path.resolve(__dirname, '..', 'dist-electron', 'main.js')

test('BYPASS suffix: boots Electron with no redirection', async () => {
  const app = await electron.launch({ args: [MAIN] })
  console.log('ESCAPED userData =', await app.evaluate(({ app: a }) => a.getPath('userData')))
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

test('BYPASS via helper: the spec itself names nothing banned', async () => {
  const app = await bootTheApp()
  console.log('ESCAPED userData =', await app.evaluate(({ app: a }) => a.getPath('userData')))
  await app.close()
})
EOF

# Mine #1 — two levels down AND `.test.tsx`, i.e. both round-2 gaps at once.
cat > "$TESTS/sub/deep/evil-deep.test.tsx" <<'EOF'
import path from 'path'
import { test } from '@playwright/test'
import { _electron as electron } from '@playwright/test'

const MAIN = path.resolve(__dirname, '..', '..', '..', 'dist-electron', 'main.js')

test('BYPASS deep+tsx: boots Electron with no redirection', async () => {
  const app = await electron.launch({ args: [MAIN] })
  console.log('ESCAPED userData =', await app.evaluate(({ app: a }) => a.getPath('userData')))
  await app.close()
})
EOF

# Mine #2 — never touches `_electron` at all. This is the T-440 driver shape:
# spawn the Electron binary directly. A file scan for `_electron` cannot see it.
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
const fixtures = ["sub/evil-subdir.spec.ts","evil-suffix.test.ts","evil-viahelper.spec.ts","evil-helper.ts","sub/deep/evil-deep.test.tsx","evil-childproc.spec.ts"];
const caught = new Set(offenders.map((o) => o.split(":")[0]));
for (const f of fixtures) console.log("  " + (caught.has(f) ? "CAUGHT " : "MISSED ") + f);
' "$TESTS"

# ── baseline ─────────────────────────────────────────────────────────────────
fingerprint > "$WORK/before.txt"
BEFORE_LINES=$(wc -l < "$WORK/before.txt" | tr -d ' ')
echo
echo "── real-home baseline: $BEFORE_LINES entries ─────────────────────────────"

# ── the run ──────────────────────────────────────────────────────────────────
echo
echo "── playwright run (fixtures + the guard spec) ────────────────────────────"
cd "$GUI" || exit 1
node node_modules/@playwright/test/cli.js test evil isolation.guard > "$WORK/run.log" 2>&1
RUN_RC=$?
tail -40 "$WORK/run.log"

# ── verdicts ─────────────────────────────────────────────────────────────────
echo
echo "── verdicts ──────────────────────────────────────────────────────────────"
FAIL=0

if [ "$RUN_RC" -eq 0 ]; then
  echo "  FAIL  the suite went GREEN with bypass specs present"
  FAIL=1
else
  echo "  ok    the suite went RED (exit $RUN_RC)"
fi

for name in evil-subdir evil-suffix evil-viahelper evil-deep evil-childproc; do
  if grep -q "ESCAPED userData" "$WORK/run.log"; then
    echo "  FAIL  a fixture reached a real launch (see ESCAPED userData in the log)"
    FAIL=1
    break
  fi
done

for name in evil-subdir.spec.ts evil-suffix.test.ts evil-viahelper.spec.ts evil-deep.test.tsx evil-childproc.spec.ts; do
  if grep -qE "✘.*$name|✘.*${name%.*}" "$WORK/run.log"; then
    echo "  ok    blocked and reported failed: $name"
  else
    echo "  FAIL  not reported as a failure: $name"
    FAIL=1
  fi
done

if grep -q "T-442 ISOLATION VIOLATION" "$WORK/run.log"; then
  echo "  ok    failures carry the isolation-enforcer tag (blocked by the gate, not by chance)"
else
  echo "  FAIL  no isolation-enforcer tag in the log — something else failed the run"
  FAIL=1
fi

if grep -q "no file under testDir launches Electron outside the harness" "$WORK/run.log"; then
  echo "  ok    the static scan also flagged them (two independent detections)"
else
  echo "  WARN  the static scan did not report — only the runtime gate held"
fi

fingerprint > "$WORK/after.txt"
if diff -q "$WORK/before.txt" "$WORK/after.txt" > /dev/null; then
  echo "  ok    real ~/.productune, ~/.prdt and userData unchanged ($BEFORE_LINES entries)"
else
  echo "  FAIL  the REAL home was mutated:"
  diff "$WORK/before.txt" "$WORK/after.txt" | head -40
  FAIL=1
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "T-442 F-A bypass matrix: PASS"
else
  echo "T-442 F-A bypass matrix: FAIL"
fi
exit "$FAIL"
