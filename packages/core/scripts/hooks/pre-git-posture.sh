#!/usr/bin/env bash
# Claude Code hook — PreToolUse, matcher: Bash
# Enforces the PO git posture rule (git-workflow.md ## Posture) mechanically.
#
# WHY: doctrine says PO/session stays RESIDENT on `v<N>` and ticket work is
# worktree-isolated — NEVER `git checkout <ticket-branch>` in the main working
# tree, and build work is never committed straight to a product `main`. The soft
# doctrine rule keeps getting ignored, so this hook turns the highest-confidence
# violation into a hard BLOCK (Gate A), and surfaces a lower-confidence one as a
# non-blocking WARN (Gate B).
#
# TWO GATES:
#   GATE A — BLOCK: `git checkout`/`git switch` ONTO a ticket branch in the main
#            working tree. ticket-branch pattern = v*-T-*  |  feat/T-*  |  */T-<N>-*.
#            This is unambiguous: ticket branches must live in a worktree, never
#            be checked out in the main tree (it displaces v<N>). Hard block.
#
#   GATE B — WARN (non-block): a plain non-merge `git commit` while HEAD==main in
#            a repo whose .productune/po-state.json has a version + current_phase==3.
#            This *might* be a PO product-build-direct-to-main violation — but the
#            SAME signature is produced by productune's own tooling repo (developed
#            directly on main) and by a fresh repo's initial commit / P5 merge→main.
#            There is no reliable signal to separate a true violation from those
#            legit cases, so we DO NOT block: we only print a one-line advisory to
#            stderr and exit 0. Never breaks a commit.
#
# SCOPE / SAFETY:
#   - Only inspects `git` commands. Non-git Bash → instant pass.
#   - Gate A only fires for checkout/switch ONTO a ticket-branch-named ref.
#   - Fail-OPEN on any parse error / missing tool → never false-blocks.

set +e

EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

COMMAND="$(printf '%s' "$EVENT_JSON" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null)"

[ -z "$COMMAND" ] && exit 0

# Fast bail — must mention git at all.
case "$COMMAND" in
  *git*) ;;
  *) exit 0 ;;
esac

CWD="$(printf '%s' "$EVENT_JSON" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('cwd', ''))
except Exception:
    print('')
" 2>/dev/null)"
[ -z "$CWD" ] && CWD="$PWD"

emit_block() {
  printf '{"decision":"block","reason":%s}\n' \
    "$(printf '%s' "$1" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')"
  exit 0
}

# ── GATE A: block checkout/switch ONTO a ticket branch in the MAIN tree ──────
# A ticket-branch target is matched as the checkout/switch argument. We classify
# the command with python so quoting/flags don't trip a glob. Fail-open to "ok".
GATEA="$(printf '%s' "$COMMAND" | python3 -c "
import sys, re, shlex
try:
    cmd = sys.stdin.read().strip()
    try:
        toks = shlex.split(cmd)
    except Exception:
        print('ok'); raise SystemExit
    # find a 'git' token then the subcommand checkout|switch
    sub = None
    for i, t in enumerate(toks):
        if t == 'git' or t.endswith('/git'):
            j = i + 1
            # skip global flags like -C <dir>, -c k=v
            while j < len(toks) and toks[j].startswith('-'):
                if toks[j] in ('-C', '-c'):
                    j += 2
                else:
                    j += 1
            if j < len(toks):
                sub = toks[j]
                rest = toks[j+1:]
            break
    if sub not in ('checkout', 'switch'):
        print('ok'); raise SystemExit
    # collect candidate target refs = non-flag args.
    # for 'switch -c NEW' / 'checkout -b NEW' the NEW branch is being CREATED,
    # not checked out in-tree onto an existing ticket branch — but creating a
    # ticket branch in the main tree is itself the violation, so we still flag.
    # We DO skip '--' file-path operands (checkout -- <file> restores a file).
    targets = []
    skip_next = False
    seen_ddash = False
    for a in rest:
        if seen_ddash:
            break
        if a == '--':
            seen_ddash = True
            continue
        if a.startswith('-'):
            # flags that take a value we don't care about; -b/-c take the branch
            continue
        targets.append(a)
    tk = re.compile(r'(^v.*-T-.*)|(^feat/T-.*)|(/T-\\d+-)')
    for tgt in targets:
        if tk.search(tgt):
            print('ticket:' + tgt); raise SystemExit
    print('ok')
except SystemExit:
    raise
except Exception:
    print('ok')
" 2>/dev/null)"

case "$GATEA" in
  ticket:*)
    TGT="${GATEA#ticket:}"
    # Only block in the MAIN working tree. If we're already inside a worktree
    # (git rev-parse --git-dir contains /worktrees/), creating/switching a
    # ticket branch there is exactly correct → fail-open pass.
    GITDIR="$(cd "$CWD" 2>/dev/null && git rev-parse --git-dir 2>/dev/null)"
    case "$GITDIR" in
      */worktrees/*) exit 0 ;;   # inside a worktree — legit, pass
    esac
    emit_block "ticket 작업은 worktree 에서 — main tree 에 ticket-branch checkout 금지.

대상 branch: $TGT

이 checkout/switch 는 main working tree 의 \`v<N>\` 를 밀어내고 PO-orchestrate / dev-work 역할 분리를 무너뜨립니다 (git-workflow.md ## Posture).

수정 — worktree 격리:

  git worktree add .productune/worktrees/<ticket-id>/ -b $TGT v<N>

(ticket branch 는 worktree 안에서만 살아있고 main tree 에는 절대 checkout 하지 않습니다. worktree 안에서의 checkout/switch 는 이 게이트를 통과합니다.)"
    ;;
esac

# ── GATE B: WARN-only on plain commit to product main (no block) ─────────────
# Decision: WARN, not block. The detectable signature (po-state has a version +
# current_phase==3 + HEAD==main + plain non-merge `git commit`) is ALSO produced
# by productune's own tooling repo (this one), by a fresh repo's initial commit,
# and by the P5 version→main merge. None of those are violations and blocking
# would break legit work — including productune's own main commits. So Gate B
# never blocks; it only prints a one-line advisory to stderr.
is_plain_commit() {
  printf '%s' "$COMMAND" | python3 -c "
import sys, shlex
try:
    toks = shlex.split(sys.stdin.read().strip())
except Exception:
    print('no'); raise SystemExit
sub = None; rest = []
for i, t in enumerate(toks):
    if t == 'git' or t.endswith('/git'):
        j = i + 1
        while j < len(toks) and toks[j].startswith('-'):
            j += 2 if toks[j] in ('-C', '-c') else 1
        if j < len(toks):
            sub = toks[j]; rest = toks[j+1:]
        break
# plain commit = 'git commit ...'  with no merge involved.
# (a merge produces a commit via 'git merge', not 'git commit', so subcommand
#  must literally be 'commit'; --amend / -m are still plain commits.)
print('yes' if sub == 'commit' else 'no')
" 2>/dev/null
}

if [ "$(is_plain_commit)" = "yes" ]; then
  # Resolve project root from cwd (walk up to find .productune/po-state.json).
  ROOT_DIR="$CWD"
  STATE=""
  for _ in 1 2 3 4 5 6 7 8; do
    if [ -f "$ROOT_DIR/.productune/po-state.json" ]; then
      STATE="$ROOT_DIR/.productune/po-state.json"; break
    fi
    parent="$(dirname "$ROOT_DIR")"
    [ "$parent" = "$ROOT_DIR" ] && break
    ROOT_DIR="$parent"
  done

  if [ -n "$STATE" ]; then
    # SKIP entirely if this is a tooling repo (productune itself is developed
    # directly on main → the Gate B signature is expected, not a violation).
    # Real product builds lack this flag, so the WARN still fires for them.
    # Fail-open: any parse error → treat as NOT a tooling repo (warn may proceed).
    TOOLING="$(python3 -c "
import json,sys
try:
    s=json.load(open('$STATE'))
    print('yes' if s.get('tooling_repo') is True else 'no')
except Exception:
    print('no')
" 2>/dev/null)"
    if [ "$TOOLING" = "yes" ]; then
      exit 0
    fi

    # phase + version present? (handle both legacy flat + A4 nested shapes)
    PHASE="$(python3 -c "
import json,sys
try:
    s=json.load(open('$STATE'))
    cv=s.get('current_version')
    if isinstance(cv,dict):
        ver=cv.get('id'); ph=cv.get('current_phase')
    else:
        ver=cv; ph=s.get('current_phase')
    print(('%s|%s') % (ver or '', ph if ph is not None else ''))
except Exception:
    print('|')
" 2>/dev/null)"
    VER="${PHASE%%|*}"; PH="${PHASE##*|}"
    if [ -n "$VER" ] && [ "$PH" = "3" ]; then
      BR="$(cd "$ROOT_DIR" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null)"
      if [ "$BR" = "main" ]; then
        printf 'productune posture WARN: P3 build 중 main 에 직접 commit 감지 (version=%s). PO product build 라면 ticket worktree → %s merge 흐름을 쓰세요 (git-workflow.md ## Posture). [productune-self / fresh-repo initial / P5 merge 는 정상 — 차단 안 함]\n' "$VER" "$VER" >&2
      fi
    fi
  fi
fi

exit 0
