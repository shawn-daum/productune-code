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

# projectRoot: the FIFTH resolver of the same contract, and until T-493 the odd
# one out twice over — nearest-wins (everything else took the OUTERMOST marker
# since T-484) and lexical (the CLI resolves physically). Both are fixed here so
# all five answer identically; keep in lockstep with `find_project_root` in
# scripts/prdt, the bash `find_proj` in hooks/prdt-session-start.sh and
# hooks/prdt-project-overrides-inject.sh, and the python twins in
# hooks/prdt-post-dispatch.sh / hooks/prdt-user-prompt.sh.
#   * PHYSICAL: `cd -P … && pwd -P` resolves symlink components exactly as python
#     `os.path.realpath` does. Measured 2026-08-18 with `<decoy>/link -> <real>/code`:
#     from `<decoy>/link` this statusline displayed <decoy>'s slug/version/stage
#     while `prdt` in the same terminal read and WROTE <real>'s po-state — the
#     display and the writes describing two different projects. No attacker needed.
#   * OUTERMOST: nearest-wins let a `.prdt/po-state.json` planted anywhere in the
#     cloned CODE tree (an inner dir by construction under the v1.3 meta split)
#     take over the display. Legitimate layouts carry exactly one marker on the
#     chain, so for them outermost == nearest, byte-identical.
PHYS="$(cd -P -- "$CWD" 2>/dev/null && pwd -P)"
D="${PHYS:-$CWD}"; ROOT=""
while [ -n "$D" ] && [ "$D" != "/" ]; do
  [ -f "$D/.prdt/po-state.json" ] && ROOT="$D"
  UP="$(dirname "$D")"
  [ "$UP" = "$D" ] && break
  D="$UP"
done
[ -z "$ROOT" ] && exit 0

ROOT="$ROOT" python3 - <<'PYEOF'
import json, os, re, subprocess, unicodedata

root = os.environ["ROOT"]
try:
    st = json.load(open(os.path.join(root, ".prdt", "po-state.json")))
except Exception:
    raise SystemExit(0)
try:
    cfg_slug = json.load(open(os.path.join(root, ".prdt", "config.json"))).get("slug")
except Exception:
    cfg_slug = None

# --- T-493: nothing from a project-local file reaches the display raw ----------
# `.prdt/po-state.json` and `.prdt/config.json` travel with a clone and are the
# two easiest files in a repo to tamper with, and this script printed their values
# straight through: a CR / U+2028 in `slug` or `version` forged extra display
# lines, an ESC sequence repainted the line, and `version` was additionally
# spliced into the ticket-dir PATH below. Same prescription prdt-user-prompt.sh
# applies to the same four tokens (T-471) — shape-match and emit the MATCHED
# token, never the file's bytes — plus a sanitizer for the two genuinely free-form
# strings (project slug, task slug) and for the git branch.
# KEEP the enums / regex in lockstep with prdt-user-prompt.sh.
#   stage    ∈ define|build|ship|retro|idle
#   version    v<N>[.<m>[.<p>]]
#   ticket_id  T-NNN
#   assignee ∈ po|designer|developer|qa|user
STAGES = ("define", "build", "ship", "retro", "idle")
ASSIGNEES = ("po", "designer", "developer", "qa", "user")
VERSION_RE = re.compile(r"\Av[0-9]{1,4}(?:\.[0-9]{1,4}){0,2}\Z")
TICKET_RE = re.compile(r"\AT-[0-9]{1,5}\Z")


def token(raw, ok, absent=""):
    """The MATCHED token; `absent` when empty; `<withheld>` when off-shape. A
    withheld field says so on the line rather than being dropped — this is a
    display, and silently showing nothing is how the T-358 class of bug reads."""
    v = raw.strip() if isinstance(raw, str) else raw
    if not v:
        return absent
    return v if isinstance(v, str) and ok(v) else "<withheld>"


def clean(raw, cap=40, bar=False):
    """Free-form text → ONE displayable segment. Every character that could add a
    line, move the cursor, or hide text is dropped (unicodedata categories Cc, Cf,
    Zl, Zp — covers LF, CR, VT, FF, ESC, NEL, U+2028/9, ZWSP, the bidi overrides),
    and so is `|` unless `bar` — the separator belongs to this line's own layout,
    not to any value, or a slug/branch carrying one would forge segments. The
    result is then capped."""
    if not isinstance(raw, str):
        return ""
    s = "".join(c for c in raw if (bar or c != "|")
                and unicodedata.category(c) not in ("Cc", "Cf", "Zl", "Zp")).strip()
    return (s[:cap] + "\u2026") if len(s) > cap else s


slug = clean(cfg_slug) or clean(os.path.basename(root)) or "?"
stage = token(st.get("stage"), lambda v: v in STAGES, absent="?") or "?"
version = token(st.get("version"), lambda v: VERSION_RE.match(v) is not None)
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
# `version` reaches the filesystem here, so only a SHAPE-MATCHED value is used
# (`<withheld>` / off-shape → no counting, and no `../` reaching os.listdir).
tdir = os.path.join(root, "docs", "tickets", version) if VERSION_RE.match(version or "") else ""
if tdir and os.path.isdir(tdir):
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
    tid = token(ct.get("ticket_id"), lambda v: TICKET_RE.match(v) is not None)
    who = token(ct.get("assignee"), lambda v: v in ASSIGNEES)
    tslug = clean(ct.get("slug"), cap=16)  # cap so a long slug can't blow out the line
    seg = " ".join(x for x in (tid, tslug) if x)
    if seg:
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
br = clean(br)
if br:
    parts.append(f"branch: {br}")

# Belt: the assembled line is sanitized once more and length-capped, so this
# script emits exactly ONE line no matter what any input held.
print(clean(" | ".join(parts), cap=200, bar=True))
PYEOF
exit 0
