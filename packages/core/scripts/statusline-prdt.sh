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

# ticket type → prdt stage. Keyed on the REAL ticket-type enum (design/impl/qa/ops
# — TICKET_TYPES in scripts/prdt); idiomatic aliases follow so free-form/legacy
# frontmatter still buckets. Prior map keyed on types that never ship (feature/
# deploy/…) and sent qa→retro + left ops unmapped, so the `ship` bucket was always
# empty (T-403 LOW). ops→ship fixes that. Unmapped types fall to the version total.
TYPE_TO_STAGE = {
    # canonical enum
    "design": "define", "impl": "build", "qa": "build", "ops": "ship",
    # tolerated aliases
    "docs": "define", "prd": "define", "spec": "define", "feature": "define",
    "build": "build", "refactor": "build", "bug": "build", "fix": "build",
    "chore": "build", "test": "build",
    "deploy": "ship", "release": "ship",
    "retro": "retro", "close": "retro",
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

# branch (T-426): meta/code split projects (PRD §v1.3) carry no `.git` at
# root — the code repo lives at `<root>/<config.code.dir>` (default "code").
# Mirrors project-kind.ts codeDirName/codeRoot (THE CONTRACT) so this stays in
# lockstep with the CLI/GUI resolution; kept local since this is a pure bash+
# python display script with no import path into that TS module.
CODE_DIR_DEFAULT = "code"


def code_dir_name():
    """config.code.dir (a non-empty str, not escaping root) or None."""
    try:
        cfg = json.load(open(os.path.join(root, ".prdt", "config.json")))
    except Exception:
        return None
    if isinstance(cfg, dict) and isinstance(cfg.get("code"), dict):
        d = cfg["code"].get("dir")
        if isinstance(d, str) and d.strip():
            t = d.strip()
            if os.path.isabs(t) or ".." in re.split(r"[/\\]+", t):
                return None
            return t
    return None


def git_branch(path):
    try:
        r = subprocess.run(["git", "-C", path, "rev-parse", "--abbrev-ref", "HEAD"],
                            capture_output=True, text=True, timeout=2)
        b = r.stdout.strip()
        return b if r.returncode == 0 and b else None
    except Exception:
        return None


# Root repo wins (non-split projects, unchanged); else the configured/default
# code repo; else the segment is silently absent (pure-display degrade rule).
br = git_branch(root)
if br is None:
    br = git_branch(os.path.join(root, code_dir_name() or CODE_DIR_DEFAULT))
if br:
    parts.append(f"branch: {br}")

print(" | ".join(parts))
PYEOF
exit 0
