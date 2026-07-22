#!/usr/bin/env bash
# prdt statusline — PURE DISPLAY (§10). No writes, no side effects; the state/cost
# recording that full's statusline smuggled in lives in hooks/prdt-post-dispatch.sh.
#
# Format: <slug> | <version> | <stage> <sdone>/<stotal> | total <vdone>/<vtotal> | T-NNN <task>→<persona> | branch: <branch>
#   - <stage> N/M counts ONLY tickets whose type maps to the current stage
#     (TYPE_TO_STAGE); `| total` is the version-wide open+done count, appended
#     only when out-of-stage tickets exist (else it would duplicate the stage count).
#   - <task> slug is capped at 16 chars (+ …) so a long slug can't blow out the line.
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

# ticket type → prdt stage. ops / unmapped types are excluded from the stage
# bucket but still counted in the version-wide total.
TYPE_TO_STAGE = {
    "feature": "define", "docs": "define", "design": "define",
    "prd": "define", "spec": "define",
    "impl": "build", "build": "build", "refactor": "build",
    "bug": "build", "fix": "build", "chore": "build",
    "deploy": "ship", "release": "ship",
    "qa": "retro", "test": "retro", "retro": "retro", "close": "retro",
}

# ticket progress for the current version dir:
#   sdone/stotal — tickets whose type maps to the current stage
#   vdone/vtotal — all open+done tickets in the version (version-wide)
sdone = stotal = vdone = vtotal = 0
tdir = os.path.join(root, "docs", "tickets", version)
if os.path.isdir(tdir):
    for fn in os.listdir(tdir):
        if not (fn.startswith("T-") and fn.endswith(".md")):
            continue
        try:
            head = open(os.path.join(tdir, fn)).read(600)
        except OSError:
            continue
        ms = re.search(r"^status:\s*(\S+)", head, re.M)
        s = ms.group(1) if ms else ""
        if s not in ("done", "open"):
            continue
        is_done = s == "done"
        vtotal += 1
        vdone += is_done
        mt = re.search(r"^(?:type|stage):\s*(\S+)", head, re.M)
        ttype = mt.group(1) if mt else ""
        if TYPE_TO_STAGE.get(ttype) == stage:
            stotal += 1
            sdone += is_done

if version and version != slug:
    parts.append(version)
if stotal:
    prog = f"{stage} {sdone}/{stotal}"
    if vtotal != stotal:  # out-of-stage tickets exist → surface the version total too
        prog += f" | total {vdone}/{vtotal}"
    parts.append(prog)
elif vtotal:
    parts.append(f"{stage} | total {vdone}/{vtotal}")
else:
    parts.append(stage)

ct = st.get("current_task")
if isinstance(ct, dict) and (ct.get("ticket_id") or ct.get("slug")):
    tid = ct.get("ticket_id") or ""
    tslug = ct.get("slug") or ""
    if len(tslug) > 16:  # cap so a long slug can't blow out the statusline
        tslug = tslug[:16] + "…"
    who = ct.get("assignee") or ""
    seg = " ".join(x for x in (tid, tslug) if x)
    parts.append(f"{seg}→{who}" if who else seg)

try:
    br = subprocess.run(["git", "-C", root, "rev-parse", "--abbrev-ref", "HEAD"],
                        capture_output=True, text=True, timeout=2).stdout.strip()
    if br:
        parts.append(f"branch: {br}")
except Exception:
    pass

print(" | ".join(parts))
PYEOF
exit 0
