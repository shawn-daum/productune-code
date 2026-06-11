#!/usr/bin/env bash
# Claude Code statusLine — productune-aware single line.
# Receives a JSON event on stdin (workspace.current_dir, model.id, transcript_path, ...)
# Prints:  v{ver} | phase {N}: {name} ({done}/{total}) | branch: {branch} · persona · ticket
#
# Designed to be cheap (no network calls, local IO only).
# Falls back gracefully when fields are missing.

set +e

INPUT="$(cat 2>/dev/null || true)"

json_get() {
  local path="$1"
  printf '%s' "$INPUT" | python3 -c "
import json,sys
try:
    data=json.loads(sys.stdin.read())
    val=data
    for k in '$path'.split('.'):
        if isinstance(val,dict):
            val=val.get(k)
        else:
            val=None
        if val is None: break
    print(val if val is not None else '')
except Exception:
    print('')
" 2>/dev/null
}

CWD="$(json_get workspace.current_dir)"
[ -z "$CWD" ] && CWD="$PWD"

# ── Git branch ────────────────────────────────────────────────────────────────
# Note: `git rev-parse --abbrev-ref HEAD` writes the literal string "HEAD"
# in two cases: detached HEAD and unborn HEAD. Distinguish them so a freshly
# `git init`-ed repo doesn't show a meaningless "[HEAD]" badge.
BRANCH=""
if [ -d "$CWD/.git" ] || git -C "$CWD" rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH="$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  if [ "$BRANCH" = "HEAD" ]; then
    if git -C "$CWD" rev-parse --verify --quiet HEAD >/dev/null 2>&1; then
      # Real detached HEAD — show short SHA instead of the literal "HEAD".
      BRANCH="@$(git -C "$CWD" rev-parse --short HEAD 2>/dev/null)"
    else
      # Unborn HEAD (no commits yet).
      INIT_BRANCH="$(git -C "$CWD" config --get init.defaultBranch 2>/dev/null)"
      BRANCH="${INIT_BRANCH:+$INIT_BRANCH:}empty"
    fi
  fi
fi

# ── productune state ──────────────────────────────────────────────────────────
STATE="$CWD/.productune/po-state.json"

# Worktree fallback: when cwd lacks .productune/po-state.json, resolve the main
# checkout root via git-common-dir and read state from there.
# git rev-parse --git-common-dir outputs either an absolute path (worktree case)
# or a relative path like ".git" (main checkout). In both cases, dirname of the
# resolved .git dir is the main repo root.
# TICKET_ROOT tracks which directory to use for docs/tickets/ counting.
TICKET_ROOT="$CWD"
if [ ! -f "$STATE" ]; then
  _COMMON_DIR="$(git -C "$CWD" rev-parse --git-common-dir 2>/dev/null)" || _COMMON_DIR=""
  if [ -n "$_COMMON_DIR" ]; then
    # Resolve to absolute path (handle relative output like ".git")
    case "$_COMMON_DIR" in
      /*) _MAIN_ROOT="$(dirname "$_COMMON_DIR")" ;;
      *)  _MAIN_ROOT="$(cd "$CWD/$_COMMON_DIR/.." 2>/dev/null && pwd)" ;;
    esac
    if [ -n "$_MAIN_ROOT" ] && [ -f "$_MAIN_ROOT/.productune/po-state.json" ]; then
      STATE="$_MAIN_ROOT/.productune/po-state.json"
      TICKET_ROOT="$_MAIN_ROOT"
    fi
  fi
fi

PRODUCTUNE_PART=""
PHASE_TOKEN=""   # A4: compact [vX.Y PZ·done/total] token for the branch segment
PERSONA=""
TICKET=""

if [ -f "$STATE" ]; then
  # Phase + progress counter (python3, local IO only — no network)
  # Values passed as argv to avoid shell injection via path characters.
  # Outputs two lines: line 1 = verbose PRODUCTUNE_PART, line 2 = compact PHASE_TOKEN.
  _STATE_OUT="$(python3 -c "
import json,os,re,sys

state_path=sys.argv[1]
cwd=sys.argv[2]   # ticket root (main repo root when in a worktree)

try:
    with open(state_path) as f:
        state=json.load(f)
except Exception:
    sys.exit(0)

# Support both schema versions:
#   legacy (flat):  current_version = "v1.0",  current_phase = 2  (top-level)
#   current (A4+):  current_version = {id, label, current_phase, ...}
cv=state.get('current_version','')
if isinstance(cv, dict):
    version=cv.get('id','')
    phase=cv.get('current_phase')
else:
    version=cv
    phase=state.get('current_phase')

if not version:
    sys.exit(0)

if phase is None:
    print(version + ' | phase: closed')
    print('')
    sys.exit(0)

phase_names_long={1:'PRD',2:'Design',3:'Build',4:'Deploy',5:'Close'}
phase_names_short={1:'prd',2:'design',3:'build',4:'deploy',5:'close'}
phase_name_long=phase_names_long.get(phase,str(phase))
phase_name_short=phase_names_short.get(phase,str(phase))

if phase==1:
    print(version + ' | phase ' + str(phase) + ': ' + phase_name_long + ' (prd authoring)')
    # A4 compact token for phase 1 — no ticket count (PRD authoring has no sub-tickets)
    print('[' + version + ' P' + str(phase) + '·' + phase_name_short + ']')
    sys.exit(0)

# Count tickets by phase field (A4: phase-field-based, not type-based)
ticket_dir=os.path.join(cwd,'docs','tickets',version)
done=total=0

if os.path.isdir(ticket_dir):
    for fname in os.listdir(ticket_dir):
        if not fname.endswith('.md'):
            continue
        fpath=os.path.join(ticket_dir,fname)
        try:
            with open(fpath,'r',errors='replace') as fh:
                head=fh.read(600)
        except OSError:
            continue
        # Parse YAML frontmatter (read-first-only, no full parse overhead)
        if not head.startswith('---'):
            continue
        end=head.find('---',3)
        if end<0:
            continue
        fm=head[3:end]
        pm=re.search(r'^phase:\s*(\S+)',fm,re.M)
        sm=re.search(r'^status:\s*(\S+)',fm,re.M)
        if not pm or not sm:
            continue
        try:
            ticket_phase=int(pm.group(1))
        except ValueError:
            continue
        if ticket_phase!=phase:
            continue
        total+=1
        if sm.group(1)=='done':
            done+=1

# Line 1: verbose (existing format)
print(version + ' | phase ' + str(phase) + ': ' + phase_name_long + ' (' + str(done) + '/' + str(total) + ')')
# Line 2: A4 compact token
print('[' + version + ' P' + str(phase) + '·' + str(done) + '/' + str(total) + ']')
" "$STATE" "$TICKET_ROOT" 2>/dev/null)"

  PRODUCTUNE_PART="$(printf '%s' "$_STATE_OUT" | sed -n '1p')"
  PHASE_TOKEN="$(printf '%s' "$_STATE_OUT" | sed -n '2p')"
fi

# ── Compose output ────────────────────────────────────────────────────────────
# Right segment: branch + A4 phase token
RIGHT=""
if [ -n "$BRANCH" ]; then
  RIGHT="branch: $BRANCH"
fi

# Join segments with ' | '
OUTPUT=""
[ -n "$PRODUCTUNE_PART" ] && OUTPUT="$PRODUCTUNE_PART"
if [ -n "$RIGHT" ]; then
  OUTPUT="${OUTPUT:+$OUTPUT | }$RIGHT"
fi

if [ -z "$OUTPUT" ]; then
  printf 'productune'
else
  printf '%s' "$OUTPUT"
fi

# ── Usage state write (T-025) ──────────────────────────────────────────────────
# Parse rate_limits.{five_hour,seven_day} from the statusLine hook JSON (stdin).
# Only present for claude.ai / firstParty subscribers; either key may be absent.
# Atomically write ~/.productune/usage-state.json so the GUI fs.watch picks it up.
# No-op when the fields are absent (free-tier / API-key users).
python3 - "$INPUT" <<'PYEOF' 2>/dev/null
import json, os, sys, time, tempfile

raw = sys.argv[1] if len(sys.argv) > 1 else ''
if not raw:
    sys.exit(0)

try:
    data = json.loads(raw)
except Exception:
    sys.exit(0)

rl = data.get('rate_limits')
if not rl or not isinstance(rl, dict):
    sys.exit(0)

payload = {}
for key in ('five_hour', 'seven_day'):
    axis = rl.get(key)
    if not isinstance(axis, dict):
        continue
    pct = axis.get('used_percentage')
    resets = axis.get('resets_at')
    if pct is None:
        continue
    entry = {'used_percentage': pct}
    if resets is not None:
        entry['resets_at'] = resets
    payload[key] = entry

if not payload:
    sys.exit(0)

payload['updated_at'] = int(time.time())

dest = os.path.expanduser('~/.productune/usage-state.json')
os.makedirs(os.path.dirname(dest), exist_ok=True)

# Atomic write: write to tmp in same dir, then rename.
dirpath = os.path.dirname(dest)
fd, tmp = tempfile.mkstemp(dir=dirpath, suffix='.tmp')
try:
    with os.fdopen(fd, 'w') as f:
        json.dump(payload, f)
    os.replace(tmp, dest)
except Exception:
    try:
        os.unlink(tmp)
    except OSError:
        pass
PYEOF
