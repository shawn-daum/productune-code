#!/usr/bin/env bash
# prdt cloud test runner (T-1126) — runs INSIDE a Claude Code cloud session, as
# that session's one and last step. `prdt test cloud` on the Mac creates the
# session and asks it to run this file from the runner commit (`git show
# <runner-sha>:packages/core/scripts/prdt-cloud-test.sh`).
#
# contracts §Git carve-out (2) + contracts/git.md "Cloud test-result push":
# this script is the only actor of that push. It tests one commit, then pushes
# ONE parentless commit whose tree is exactly one file (result.json) to `origin`
# as the session found it, at refs/heads/ci/<T-NNN>/<session>. No force, no
# tags, no other remote, no retry under another ref or flag; a ref that fails
# `git check-ref-format` → nothing is pushed.
#
# Usage: prdt-cloud-test.sh --ticket T-NNN --sha <40-hex> --session <id>
#          --runner-sha <40-hex> [--file <path>]… [--exclude <path>]…
#   paths are relative to packages/core (vitest's root).
# Test seam: PRDT_CLOUD_VITEST_JSON=<file> skips setup + vitest and condenses
#   that file instead (packages/core/test/scripts/prdt-test-cloud.test.ts).
set -u

TICKET=""; SHA=""; SESSION=""; RUNNER_SHA=""; FILES=(); EXCLUDES=()
refuse() { echo "prdt-cloud-test: $1 — nothing pushed" >&2; exit 2; }
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || refuse "$1 needs a value"
  case "$1" in
    --ticket) TICKET=$2 ;;
    --sha) SHA=$2 ;;
    --session) SESSION=$2 ;;
    --runner-sha) RUNNER_SHA=$2 ;;
    --file) FILES+=("$2") ;;
    --exclude) EXCLUDES+=("$2") ;;
    *) refuse "unknown argument $1" ;;
  esac
  shift 2
done
[[ $TICKET =~ ^T-[0-9]+$ ]] || refuse "--ticket must be T-NNN"
[[ $SESSION =~ ^[A-Za-z0-9._-]+$ ]] || refuse "--session must be [A-Za-z0-9._-] only"
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || refuse "--sha must be a full commit id"
[[ $RUNNER_SHA =~ ^[0-9a-f]{40}$ ]] || refuse "--runner-sha must be a full commit id"
for f in ${FILES[@]+"${FILES[@]}"} ${EXCLUDES[@]+"${EXCLUDES[@]}"}; do
  [[ $f =~ ^[A-Za-z0-9._][A-Za-z0-9._/-]*$ && $f != *..* ]] || refuse "unsafe test path $f"
done
REF="refs/heads/ci/$TICKET/$SESSION"
git check-ref-format "$REF" || refuse "$REF fails git check-ref-format"
REPO=$(git rev-parse --show-toplevel 2>/dev/null) || refuse "not inside a git repository"

T0=$(date +%s)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/prdt-cloud.XXXXXX") || refuse "no temp dir"
chmod 755 "$WORK"
TEST_USER=prdt-test
STATUS=ok; REASON=""; TEST_RC=""; SETUP_S=""; TEST_S=""; PREFIX=""; LOG=""
fail() { STATUS=error; REASON=$1; LOG=${2-}; }
as_user() {
  if [ "$(id -u)" = 0 ]; then
    su -s /bin/bash "$TEST_USER" -c "export PATH='$PATH' HOME=\"\$(getent passwd $TEST_USER | cut -d: -f6)\"; $1"
  else
    bash -c "$1"
  fi
}
show() { git -C "$REPO" show "$RUNNER_SHA:$1" > "$2" 2>/dev/null; }

if ! git -C "$REPO" cat-file -e "$RUNNER_SHA^{commit}" 2>/dev/null \
   || ! show packages/core/scripts/prdt-cloud-condense.mjs "$WORK/condense.mjs" \
   || ! show .claude/cloud-setup.sh "$WORK/cloud-setup.sh"; then
  fail "runner commit $RUNNER_SHA or its files are missing in the session repository"
elif ! git -C "$REPO" cat-file -e "$SHA^{commit}" 2>/dev/null; then
  fail "tested commit $SHA is missing in the session repository"
elif [ -n "${PRDT_CLOUD_VITEST_JSON:-}" ]; then
  cp "$PRDT_CLOUD_VITEST_JSON" "$WORK/vitest.json"
else
  if ! bash "$WORK/cloud-setup.sh" "$TEST_USER" > "$WORK/setup.log" 2>&1; then
    fail "cloud-setup.sh failed" "$WORK/setup.log"
  else
    [ "$(id -u)" = 0 ] && chown "$TEST_USER" "$WORK"
    TREE="$WORK/tree"
    if ! as_user "git clone -q --shared --no-checkout '$REPO' '$TREE' && git -C '$TREE' checkout -q --detach $SHA" > "$WORK/clone.log" 2>&1; then
      fail "could not check out $SHA as $TEST_USER" "$WORK/clone.log"
    elif ! as_user "cd '$TREE' && pnpm install --frozen-lockfile" > "$WORK/install.log" 2>&1; then
      fail "pnpm install failed" "$WORK/install.log"
    else
      SETUP_S=$(( $(date +%s) - T0 ))
      ARGS=""
      for f in ${FILES[@]+"${FILES[@]}"}; do ARGS="$ARGS $f"; done
      for e in ${EXCLUDES[@]+"${EXCLUDES[@]}"}; do ARGS="$ARGS --exclude $e"; done
      T1=$(date +%s)
      as_user "cd '$TREE/packages/core' && ./node_modules/.bin/vitest run --reporter=default --reporter=json --outputFile.json='$WORK/vitest.json'$ARGS" > "$WORK/test.log" 2>&1
      TEST_RC=$?
      TEST_S=$(( $(date +%s) - T1 ))
      PREFIX="$TREE/packages/core/"
      [ -s "$WORK/vitest.json" ] || fail "vitest wrote no JSON report (exit $TEST_RC)" "$WORK/test.log"
    fi
  fi
fi

TAIL=""
[ -n "$LOG" ] && [ -f "$LOG" ] && TAIL=$(tail -c 1500 "$LOG")
META=(status="$STATUS" reason="$REASON" ticket="$TICKET" sha="$SHA" session="$SESSION"
      runner_sha="$RUNNER_SHA" session_env="${CLAUDE_CODE_REMOTE_SESSION_ID:-}"
      test_user="$TEST_USER" test_rc="$TEST_RC" setup_s="$SETUP_S" test_s="$TEST_S"
      total_s="$(( $(date +%s) - T0 ))" node="$(node --version 2>/dev/null)" log_tail="$TAIL")
if [ -f "$WORK/condense.mjs" ] && node "$WORK/condense.mjs" "$WORK/vitest.json" "$PREFIX" "${META[@]}" > "$WORK/result.json" 2>"$WORK/condense.err"; then
  :
else
  printf '{"status":"error","reason":"the result could not be condensed","ticket":"%s","sha":"%s","session":"%s"}\n' \
    "$TICKET" "$SHA" "$SESSION" > "$WORK/result.json"
fi

export GIT_AUTHOR_NAME="prdt cloud test" GIT_AUTHOR_EMAIL="cloud-test@prdt.invalid"
export GIT_COMMITTER_NAME="prdt cloud test" GIT_COMMITTER_EMAIL="cloud-test@prdt.invalid"
BLOB=$(git -C "$REPO" hash-object -w "$WORK/result.json") \
  && TREE_ID=$(printf '100644 blob %s\tresult.json\n' "$BLOB" | git -C "$REPO" mktree) \
  && COMMIT=$(git -C "$REPO" -c commit.gpgsign=false commit-tree "$TREE_ID" -m "prdt cloud test result $TICKET $SESSION") \
  || { echo "prdt-cloud-test: could not build the result commit — nothing pushed" >&2; exit 3; }
git -C "$REPO" push --no-follow-tags --end-of-options origin "$COMMIT:$REF"
RC=$?
if [ $RC = 0 ]; then
  echo "PRDT_CLOUD_RESULT pushed $REF status=$STATUS"
else
  echo "PRDT_CLOUD_RESULT push-failed rc=$RC $REF status=$STATUS"
fi
exit $RC
