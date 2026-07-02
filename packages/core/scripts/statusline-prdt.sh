#!/usr/bin/env bash
# prdt statusline — PURE DISPLAY (§10). No writes, no side effects; the state/cost
# recording that full's statusline smuggled in lives in hooks/prdt-post-dispatch.sh.
#
# Format: <slug> · <stage> <done>/<open+done> · T-NNN <task>→<persona> · <branch>
# Missing pieces degrade silently (init is deterministic, so slug/stage exist from 0s).

set +e
INPUT="$(cat 2>/dev/null || true)"

CWD=""
if [ -n "$INPUT" ] && command -v jq >/dev/null 2>&1; then
  CWD="$(printf '%s' "$INPUT" | jq -r '.workspace.current_dir // .cwd // ""' 2>/dev/null)"
fi
[ -z "$CWD" ] && CWD="$(pwd)"

# walk up to the project root
D="$CWD"; ROOT=""
while [ -n "$D" ] && [ "$D" != "/" ]; do
  [ -f "$D/.prdt/po-state.json" ] && { ROOT="$D"; break; }
  D="$(dirname "$D")"
done
[ -z "$ROOT" ] && exit 0

ROOT="$ROOT" python3 - <<'PYEOF'
import json, os, re, subprocess

root = os.environ["ROOT"]
try:
    st = json.load(open(os.path.join(root, ".prdt", "po-state.json")))
except Exception:
    raise SystemExit(0)
try:
    slug = json.load(open(os.path.join(root, ".prdt", "config.json"))).get("slug") or os.path.basename(root)
except Exception:
    slug = os.path.basename(root)

stage = st.get("stage") or "?"
version = st.get("version") or ""
parts = [slug]

# ticket progress for the current version dir: done / (open+done)
done = opened = 0
tdir = os.path.join(root, "docs", "tickets", version)
if os.path.isdir(tdir):
    for fn in os.listdir(tdir):
        if not (fn.startswith("T-") and fn.endswith(".md")):
            continue
        try:
            head = open(os.path.join(tdir, fn)).read(600)
        except OSError:
            continue
        m = re.search(r"^status:\s*(\S+)", head, re.M)
        s = m.group(1) if m else ""
        if s == "done":
            done += 1
        elif s == "open":
            opened += 1
total = done + opened
parts.append(f"{stage} {done}/{total}" if total else stage)

ct = st.get("current_task")
if isinstance(ct, dict) and (ct.get("ticket_id") or ct.get("slug")):
    tid = ct.get("ticket_id") or ""
    tslug = ct.get("slug") or ""
    who = ct.get("assignee") or ""
    seg = " ".join(x for x in (tid, tslug) if x)
    parts.append(f"{seg}→{who}" if who else seg)

try:
    br = subprocess.run(["git", "-C", root, "rev-parse", "--abbrev-ref", "HEAD"],
                        capture_output=True, text=True, timeout=2).stdout.strip()
    if br:
        parts.append(br)
except Exception:
    pass

print(" · ".join(parts))
PYEOF
exit 0
