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
PRODUCTUNE_PART=""
PERSONA=""
TICKET=""

if [ -f "$STATE" ]; then
  # Phase + progress counter (python3, local IO only — no network)
  # Values passed as argv to avoid shell injection via path characters.
  PRODUCTUNE_PART="$(python3 -c "
import json,os,re,sys

state_path=sys.argv[1]
cwd=sys.argv[2]

try:
    with open(state_path) as f:
        state=json.load(f)
except Exception:
    sys.exit(0)

version=state.get('current_version','')
phase=state.get('current_phase')

if not version:
    sys.exit(0)

if phase is None:
    print(version + ' | phase: closed')
    sys.exit(0)

phase_names={1:'PRD',2:'Design',3:'Build',4:'Deploy',5:'Close'}
phase_name=phase_names.get(phase,str(phase))

if phase==1:
    print(version + ' | phase ' + str(phase) + ': ' + phase_name + ' (prd authoring)')
    sys.exit(0)

# Ticket type membership per phase
PHASE_TYPES={
    2:{'design','design-plan'},
    3:{'impl','refactor','test','qa','design+impl','feature'},
    4:{'deploy'},
    5:{'close'},
}
types_for_phase=PHASE_TYPES.get(phase,set())

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
        tm=re.search(r'^type:\s*(\S+)',fm,re.M)
        sm=re.search(r'^status:\s*(\S+)',fm,re.M)
        if not tm or not sm:
            continue
        if tm.group(1) not in types_for_phase:
            continue
        total+=1
        if sm.group(1)=='done':
            done+=1

print(version + ' | phase ' + str(phase) + ': ' + phase_name + ' (' + str(done) + '/' + str(total) + ')')
" "$STATE" "$CWD" 2>/dev/null)"

fi

# ── Compose output ────────────────────────────────────────────────────────────
# Right segment: branch only
RIGHT=""
[ -n "$BRANCH" ] && RIGHT="branch: $BRANCH"

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
