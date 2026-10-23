#!/usr/bin/env bash
# prdt cloud test runner (T-1126) — runs INSIDE a Claude Code cloud session, as
# that session's one and last step. `prdt test cloud` on the Mac creates one
# session per shard and asks each to run this file from the runner commit
# (`git show <runner-sha>:packages/core/scripts/prdt-cloud-test.sh`).
#
# contracts §Git carve-out (2) + contracts/git.md "Cloud test-result push":
# this script is the only actor of that push. It tests one commit, then pushes
# ONE parentless commit whose tree is exactly one file (result.json) to `origin`
# as the session found it, at refs/heads/ci/<T-NNN>/<session>. No force, no
# tags, no other remote, no retry under another ref or flag; a ref that fails
# `git check-ref-format` → nothing is pushed.
#
# Time budget: the cloud agent stops a background command at 40 min (observed
# 2026-10-13, d-v114-t1126-1: output '[killed]', no result). Each phase
# (setup · install · test) runs under its own limit; a phase over its limit is
# stopped (its whole process group) and the run pushes an error result naming
# that phase with the last lines of its log — the one push, never a hang.
# Defaults 180 + 600 + 1200 s keep the worst case near 33 min.
# Progress: `PRDT_PHASE <phase> start|running|end …` lines on stdout; a failed
# phase also prints its log tail (`PRDT_PHASE <phase> log| …`), redacted.
# stdin: every phase reads /dev/null and corepack never prompts — under `set -m`
# a background job keeps the agent shell's open stdin, so a download prompt
# (corepack fetching pnpm for the fresh test user) waited until the setup limit
# (inferred from round 2, 2026-10-14: setup rc=124 at 183s; not measured).
# A failed push prints git's own stderr, `git remote -v`, the origin host and
# the names of credential/url/http git config keys (`PRDT_PHASE push-diag …`),
# every line through redact() — a credential value never reaches the output.
#
# Usage: prdt-cloud-test.sh --ticket T-NNN --sha <40-hex> --session <id>
#          --runner-sha <40-hex> [--shard i/N] [--file <path>]… [--exclude <path>]…
#          [--setup-timeout s] [--install-timeout s] [--test-timeout s]
#   paths are relative to packages/core (vitest's root).
# Test seam: PRDT_CLOUD_VITEST_JSON=<file> skips setup + vitest and condenses
#   that file instead (packages/core/test/scripts/prdt-test-cloud.test.ts).
set -u
set -m  # every background phase job gets its own process group (stopped as a whole on timeout)

TICKET=""; SHA=""; SESSION=""; RUNNER_SHA=""; SHARD=""; FILES=(); EXCLUDES=()
SETUP_TO=180; INSTALL_TO=600; TEST_TO=1200
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# redact: user:token@ in URLs, GitHub/GitLab/Anthropic/OpenAI/AWS/Slack/npm key literals, auth header
# values (also on the next line). T-1221: the same rules, in the same order, as redact() in
# prdt-cloud-condense.mjs; LC_ALL=C so [[:space:]] is ASCII whitespace only, as in the JS copy.
redact() {
  LC_ALL=C sed -E -e '/[Aa]uthorization[:=][[:space:]]*$/{$!N;}' \
    -e 's#(://)[^/@[:space:]]*@#\1***@#g' \
    -e 's#(gh[opusr]_|github_pat_|glpat-)[A-Za-z0-9_]+#\1***#g' \
    -e 's#(sk-ant-)[A-Za-z0-9_-]+#\1***#g' \
    -e 's#(^|[^A-Za-z0-9_-])(sk-)[A-Za-z0-9_-]{8,}#\1\2***#g' \
    -e 's#(AKIA)[0-9A-Z]{16}#\1***#g' \
    -e 's#(xox[abpr]-)[A-Za-z0-9-]+#\1***#g' \
    -e 's#(npm_)[A-Za-z0-9]{20,}#\1***#g' \
    -e 's#([Aa]uthorization|AUTHORIZATION)([:=][[:space:]]*).*#\1\2***#' \
    -e 's#([Bb]earer|[Bb]asic)[[:space:]]+[A-Za-z0-9._~+/=-]+#\1 ***#g'
}
refuse() { echo "prdt-cloud-test: $1 — nothing pushed" >&2; exit 2; }
while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || refuse "$1 needs a value"
  case "$1" in
    --ticket) TICKET=$2 ;;
    --sha) SHA=$2 ;;
    --session) SESSION=$2 ;;
    --runner-sha) RUNNER_SHA=$2 ;;
    --shard) SHARD=$2 ;;
    --file) FILES+=("$2") ;;
    --exclude) EXCLUDES+=("$2") ;;
    --setup-timeout) SETUP_TO=$2 ;;
    --install-timeout) INSTALL_TO=$2 ;;
    --test-timeout) TEST_TO=$2 ;;
    *) refuse "unknown argument $1" ;;
  esac
  shift 2
done
[[ $TICKET =~ ^T-[0-9]+$ ]] || refuse "--ticket must be T-NNN"
[[ $SESSION =~ ^[A-Za-z0-9._-]+$ ]] || refuse "--session must be [A-Za-z0-9._-] only"
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || refuse "--sha must be a full commit id"
[[ $RUNNER_SHA =~ ^[0-9a-f]{40}$ ]] || refuse "--runner-sha must be a full commit id"
[[ -z $SHARD || $SHARD =~ ^[0-9]+/[0-9]+$ ]] || refuse "--shard must be i/N"
for t in "$SETUP_TO" "$INSTALL_TO" "$TEST_TO"; do
  [[ $t =~ ^[1-9][0-9]{0,4}$ ]] || refuse "a phase timeout must be whole seconds"
done
for f in ${FILES[@]+"${FILES[@]}"} ${EXCLUDES[@]+"${EXCLUDES[@]}"}; do
  [[ $f =~ ^[A-Za-z0-9._][A-Za-z0-9._/-]*$ && $f != *..* ]] || refuse "unsafe test path $f"
done
REF="refs/heads/ci/$TICKET/$SESSION"
git check-ref-format "$REF" || refuse "$REF fails git check-ref-format"
REPO=$(git rev-parse --show-toplevel 2>/dev/null) || refuse "not inside a git repository"

T0=$(date +%s)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/prdt-cloud.XXXXXX") || refuse "no temp dir"
WORK=$(cd "$WORK" && pwd)  # no `//` from a TMPDIR ending in `/`: vitest reports normalized paths
chmod 755 "$WORK"
TEST_USER=prdt-test
STATUS=ok; REASON=""; PHASE=""; TEST_RC=""; SETUP_S=""; INSTALL_S=""; TEST_S=""; PREFIX=""; LOG=""
CPUS=$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo "?")
fail() { STATUS=error; REASON=$1; LOG=${2-}; }
say() { echo "PRDT_PHASE $* (t=$(( $(date +%s) - T0 ))s)"; }
as_user() {
  if [ "$(id -u)" = 0 ]; then
    su -s /bin/bash "$TEST_USER" -c "export PATH='$PATH' COREPACK_ENABLE_DOWNLOAD_PROMPT=0 HOME=\"\$(getent passwd $TEST_USER | cut -d: -f6)\"; $1"
  else
    bash -c "$1"
  fi
}
show() { git -C "$REPO" show "$RUNNER_SHA:$1" > "$2" 2>/dev/null; }

# stop_group <pgid>: TERM, then KILL, a whole process group (no-op when gone)
stop_group() {
  [[ ${1-} =~ ^[0-9]+$ && $1 -gt 1 ]] || return 0
  kill -TERM -- "-$1" 2>/dev/null || return 0
  sleep 3
  kill -KILL -- "-$1" 2>/dev/null || true
}
# run_phase <name> <limit-s> <log> <runner: as_user|bash -c> <command>
# → PHASE_RC (124 = over its limit) and PHASE_S. `su -c` starts a new session,
# so the user's shell writes its own pid (= its group) to phase.pgid and a
# timeout stops that group too, not only the job's own.
run_phase() {
  local name=$1 limit=$2 log=$3 how=$4 cmd=$5 start pid now beat
  start=$(date +%s); beat=$start
  rm -f "$WORK/phase.pgid"
  say "$name start limit=${limit}s"
  if [ "$how" = as_user ]; then
    as_user "echo \$\$ > '$WORK/phase.pgid'; $cmd" < /dev/null > "$log" 2>&1 &
  else
    bash -c "$cmd" < /dev/null > "$log" 2>&1 &
  fi
  pid=$!
  PHASE_RC=""
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    now=$(date +%s)
    if [ $(( now - start )) -ge "$limit" ]; then
      stop_group "$(cat "$WORK/phase.pgid" 2>/dev/null)"
      stop_group "$pid"
      PHASE_RC=124
      break
    fi
    if [ $(( now - beat )) -ge 60 ]; then
      beat=$now
      if [ "$name" = test ]; then
        say "test running $(( now - start ))s files_done=$(grep -cE '\.test\.tsx? \(' "$log" 2>/dev/null)"
      else
        say "$name running $(( now - start ))s"
      fi
    fi
  done
  wait "$pid" 2>/dev/null; local rc=$?
  [ -n "$PHASE_RC" ] || PHASE_RC=$rc
  PHASE_S=$(( $(date +%s) - start ))
  say "$name end rc=$PHASE_RC ${PHASE_S}s$([ "$PHASE_RC" = 124 ] && echo " TIMED OUT")"
}

if ! git -C "$REPO" cat-file -e "$RUNNER_SHA^{commit}" 2>/dev/null \
   || ! show packages/core/scripts/prdt-cloud-condense.mjs "$WORK/condense.mjs" \
   || ! show .claude/cloud-setup.sh "$WORK/cloud-setup.sh"; then
  PHASE=setup; fail "runner commit $RUNNER_SHA or its files are missing in the session repository"
elif ! git -C "$REPO" cat-file -e "$SHA^{commit}" 2>/dev/null; then
  PHASE=setup; fail "tested commit $SHA is missing in the session repository"
elif [ -n "${PRDT_CLOUD_VITEST_JSON:-}" ]; then
  cp "$PRDT_CLOUD_VITEST_JSON" "$WORK/vitest.json"
else
  say "runner shard=${SHARD:-1/1} files=${#FILES[@]} cpus=$CPUS"
  PHASE=setup
  run_phase setup "$SETUP_TO" "$WORK/setup.log" bash "bash '$WORK/cloud-setup.sh' '$TEST_USER'"
  SETUP_S=$PHASE_S
  if [ "$PHASE_RC" = 124 ]; then
    fail "setup passed its ${SETUP_TO}s limit" "$WORK/setup.log"
  elif [ "$PHASE_RC" != 0 ]; then
    fail "cloud-setup.sh failed (exit $PHASE_RC)" "$WORK/setup.log"
  else
    [ "$(id -u)" = 0 ] && chown "$TEST_USER" "$WORK"
    TREE="$WORK/tree"
    PHASE=install
    run_phase install "$INSTALL_TO" "$WORK/install.log" as_user \
      "git clone -q --shared --no-checkout '$REPO' '$TREE' && git -C '$TREE' checkout -q --detach $SHA && cd '$TREE' && pnpm install --frozen-lockfile"
    INSTALL_S=$PHASE_S
    if [ "$PHASE_RC" = 124 ]; then
      fail "checkout + pnpm install passed its ${INSTALL_TO}s limit" "$WORK/install.log"
    elif [ "$PHASE_RC" != 0 ]; then
      fail "checkout + pnpm install failed (exit $PHASE_RC)" "$WORK/install.log"
    else
      ARGS=""
      for f in ${FILES[@]+"${FILES[@]}"}; do ARGS="$ARGS $f"; done
      for e in ${EXCLUDES[@]+"${EXCLUDES[@]}"}; do ARGS="$ARGS --exclude $e"; done
      PHASE=test
      run_phase test "$TEST_TO" "$WORK/test.log" as_user \
        "cd '$TREE/packages/core' && exec ./node_modules/.bin/vitest run --reporter=default --reporter=json --outputFile.json='$WORK/vitest.json'$ARGS"
      TEST_RC=$PHASE_RC; TEST_S=$PHASE_S
      PREFIX="$TREE/packages/core/"
      if [ "$PHASE_RC" = 124 ]; then
        rm -f "$WORK/vitest.json"
        fail "the test run passed its ${TEST_TO}s limit" "$WORK/test.log"
      elif [ ! -s "$WORK/vitest.json" ]; then
        fail "vitest wrote no JSON report (exit $TEST_RC)" "$WORK/test.log"
      else
        PHASE=""
      fi
    fi
  fi
fi

TAIL=""
if [ -n "$LOG" ] && [ -f "$LOG" ]; then
  TAIL=$(redact < "$LOG" | tail -c 1500)   # redact the whole log first: a cut inside a token must not leak its tail
  tail -n 20 "$LOG" | redact | while IFS= read -r l; do echo "PRDT_PHASE $PHASE log| $l"; done
fi
[ "$STATUS" = ok ] && PHASE=""
META=(status="$STATUS" reason="$REASON" phase="$PHASE" ticket="$TICKET" sha="$SHA" session="$SESSION"
      shard="$SHARD" runner_sha="$RUNNER_SHA" session_env="${CLAUDE_CODE_REMOTE_SESSION_ID:-}"
      test_user="$TEST_USER" test_rc="$TEST_RC" setup_s="$SETUP_S" install_s="$INSTALL_S" test_s="$TEST_S"
      total_s="$(( $(date +%s) - T0 ))" cpus="$CPUS" node="$(node --version 2>/dev/null)" log_tail="$TAIL")
if [ -f "$WORK/condense.mjs" ] && node "$WORK/condense.mjs" "$WORK/vitest.json" "$PREFIX" "${META[@]}" > "$WORK/result.json" 2>"$WORK/condense.err"; then
  :
else
  printf '{"status":"error","reason":"the result could not be condensed","ticket":"%s","sha":"%s","session":"%s"}\n' \
    "$TICKET" "$SHA" "$SESSION" > "$WORK/result.json"
fi
say "result $(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(`status=${r.status} phase=${r.phase||"-"} total=${r.total??"-"} passed=${r.passed??"-"} failed=${r.failed??"-"} files=${r.files??"-"}`)' "$WORK/result.json" 2>/dev/null)"

export GIT_AUTHOR_NAME="prdt cloud test" GIT_AUTHOR_EMAIL="cloud-test@prdt.invalid"
export GIT_COMMITTER_NAME="prdt cloud test" GIT_COMMITTER_EMAIL="cloud-test@prdt.invalid"
BLOB=$(git -C "$REPO" hash-object -w "$WORK/result.json") \
  && TREE_ID=$(printf '100644 blob %s\tresult.json\n' "$BLOB" | git -C "$REPO" mktree) \
  && COMMIT=$(git -C "$REPO" -c commit.gpgsign=false commit-tree "$TREE_ID" -m "prdt cloud test result $TICKET $SESSION") \
  || { echo "prdt-cloud-test: could not build the result commit — nothing pushed" >&2; exit 3; }
GIT_TERMINAL_PROMPT=0 git -C "$REPO" push --no-follow-tags --end-of-options origin "$COMMIT:$REF" \
  < /dev/null 2> "$WORK/push.err"
RC=$?
if [ $RC = 0 ]; then
  echo "PRDT_CLOUD_RESULT pushed $REF status=$STATUS"
else
  URL=$(git -C "$REPO" remote get-url origin 2>/dev/null)
  if [ -z "$URL" ]; then HOST=none
  elif [[ $URL == *://* ]]; then HOST=${URL#*://}; HOST=${HOST%%/*}; HOST=${HOST##*@}; HOST=${HOST%%:*}
  elif [[ $URL =~ ^([^@/]+@)?([^:/]+): ]]; then HOST=${BASH_REMATCH[2]}
  else HOST=local-path
  fi
  HOST=$(printf '%s' "$HOST" | redact)
  echo "PRDT_PHASE push-diag origin_host=${HOST:-?}"
  REMOTES=$(git -C "$REPO" remote -v 2>/dev/null | redact)
  [ -n "$REMOTES" ] || REMOTES="(none)"
  printf '%s\n' "$REMOTES" | while IFS= read -r l; do echo "PRDT_PHASE push-diag remote $l"; done
  KEYS=$(git -C "$REPO" config --name-only --get-regexp '^(credential|url|http|remote\.origin)\.' 2>/dev/null \
    | redact | sort -u | tr '\n' ' ')
  echo "PRDT_PHASE push-diag git_config_keys=${KEYS:-(none)}"
  redact < "$WORK/push.err" | tail -n 15 | while IFS= read -r l; do echo "PRDT_PHASE push-diag git| $l"; done
  FIRST=$(redact < "$WORK/push.err" | grep -m1 -E '^(fatal|error|remote):' || redact < "$WORK/push.err" | head -n 1)
  echo "PRDT_CLOUD_RESULT push-failed rc=$RC $REF status=$STATUS origin_host=${HOST:-?} git=${FIRST:-(no stderr)}"
fi
exit $RC
