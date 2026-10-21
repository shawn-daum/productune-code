#!/usr/bin/env bash
# prdt — ticket-id autolink on screen (T-1143; decision T-1140 = script, not an LLM
# instruction). Registered on MessageDisplay (matcher-less: the event takes none).
#
# WHY. A Stop link check (prdt-link-check.sh, retired in T-1156) used to append a
# separate `[링크]` block after the reply. This rewrites the bare `T-NNN` inside the reply itself, on
# screen only: `displayContent` replaces the delta; the transcript and what the
# model sees keep the original text (MessageDisplay is display-only).
#
# WHAT IT REWRITES. Every mention of a ticket id (`T-NNN`, legacy `T-PATCH-NNN`)
# that has a ticket file in the current project → `[T-NNN](file://…)`, the
# `prdt tickets --link` shape. Destination = the viewer jump page
# `<root>/.prdt/scratch/viewer/at/T-NNN.html` — but ONLY when that stub AND
# `viewer.html` exist already (`--link` creates both; the hook never generates
# them: a batch blocks rendering). Otherwise the ticket's own md file, which is
# exactly the fallback `--link` prints when the viewer cannot be generated, so a
# link never points at nothing. NOT rewritten: ids already in a markdown link
# (label or destination), in inline code or fenced code, in a path or longer
# token, and ids with no ticket file.
#
# BATCHES. `delta` is whole lines (only the final batch may end mid-line), so an
# id is never split across batches. A fenced block IS split across batches, so
# the open fence is carried per `message_id` in $PRDT_HOME/run/message-display/
# (deleted on the final batch; files older than a day are pruned).
#
# FAILS OPEN. No output at all = the original text. No project
# (`.prdt/po-state.json` on the cwd chain), malformed JSON, missing python3, an
# unreadable tickets dir, a run past RUN_BUDGET_S (well under the event's 10 s
# default) — each exits 0 silently. Never additionalContext, never a decision.
#
# THE EVENT REACHES PYTHON ON STDIN, NEVER AN ENVIRONMENT VARIABLE (ARG_MAX).

set +e
EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0
# fork-0 pre-filter: nothing to link, no fence to track and not the final batch
# (which deletes the message's fence state) → original text
case "$EVENT_JSON" in
  *'T-'*|*'```'*|*'~~~'*|*'"final":true'*|*'"final": true'*) ;;
  *) exit 0 ;;
esac
command -v python3 >/dev/null 2>&1 || exit 0
printf '%s' "$EVENT_JSON" | python3 -I -c "$(sed -n '/^# ---- python ----$/,$p' "$0" | sed '$d')"
exit 0
: <<'PYEOF'
# ---- python ----
import json, os, re, signal, sys

# T-1104: product-first docs layout (docs/artifacts/v1.14/product-first-docs-layout.html).
# KEEP `project_products` / `tickets_homes` in lockstep with `project_products` /
# `product_docs_dirs(root, "tickets")` in scripts/prdt (parity test:
# test/scripts/product-first-shell-readers.test.ts). Layout = `docs/_shared/` is a
# real dir; first product = config `slug`, then `products[].name`, then any
# `docs/<kebab>/` holding `prd/` or `tickets/`. [] = legacy (docs/tickets).
_PROD_NAME_RE = re.compile(r"^(?!v[0-9])(?!backlog\Z)[a-z0-9]+(?:-[a-z0-9]+)*\Z")


def _product_dir_name(slug):
    """config `slug` -> its `docs/<kebab>` folder name (same rule as `product_dir_name` in scripts/prdt)."""
    if not isinstance(slug, str) or not slug:
        return None
    k = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-")
    return k if _PROD_NAME_RE.match(k) else "product"


def project_products(root):
    sh = os.path.join(root, "docs", "_shared")
    if not os.path.isdir(sh) or os.path.islink(sh):
        return []
    try:
        with open(os.path.join(root, ".prdt", "config.json"), encoding="utf-8") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        cfg = {}
    cfg = cfg if isinstance(cfg, dict) else {}
    out = []

    def add(n):
        if isinstance(n, str) and _PROD_NAME_RE.match(n) and n not in out:
            out.append(n)
    add(_product_dir_name(cfg.get("slug")))
    prods = cfg.get("products")
    for e in (prods if isinstance(prods, list) else []):
        add(e.get("name") if isinstance(e, dict) else None)
    try:
        names = sorted(os.listdir(os.path.join(root, "docs")))
    except OSError:
        names = []
    for n in names:
        d = os.path.join(root, "docs", n)
        if os.path.isdir(d) and not os.path.islink(d) and not n.startswith(("_", ".")) \
                and (os.path.isdir(os.path.join(d, "prd")) or os.path.isdir(os.path.join(d, "tickets"))):
            add(n)
    return out


def tickets_homes(root):
    """[(product|None, dir)] — every product's tickets dir, then the shared
    backlog; legacy → [(None, docs/tickets)]."""
    prods = project_products(root)
    if not prods:
        return [(None, os.path.join(root, "docs", "tickets"))]
    return ([(p, os.path.join(root, "docs", p, "tickets")) for p in prods]
            + [(None, os.path.join(root, "docs", "_shared", "tickets"))])



RUN_BUDGET_S = 4
STATE_MAX_AGE_S = 86400

ID_RE = re.compile(r"(?<![A-Za-z0-9_.\\-])(T-(?:PATCH-)?\d{1,6})(?![\d_]|-\w|\.(?:md|html)\b|[A-Za-z])")
# A whitespace-delimited token with a `/` is a path (blanked) unless it opens with
# slash-joined ticket ids (`T-976/T-977`, T-899 fix): those ids are mentions.
PAIR_RUN_RE = re.compile(r"^[(\[{\"'<*_]*T-(?:PATCH-)?\d{1,6}(?:/T-(?:PATCH-)?\d{1,6})+(?![\d/A-Za-z.])")
FENCE_OPEN_RE = re.compile(r"^ {0,3}((?:`{3,})|(?:~{3,}))(.*)$")
CODE_SPAN_RE = re.compile(r"(`+)(?:(?!\1).)+?\1", re.S)
LINK_RE = re.compile(r"\[([^\]\n]*)\]\(([^)\n]*)\)")


def project_root(cwd):
    d = os.path.realpath(cwd or os.getcwd())
    root = None
    while d and d != "/":
        if os.path.isfile(os.path.join(d, ".prdt", "po-state.json")):
            root = d
        # T-1112: a track worktree (tracks/T-NNN, .git is a file) is a project boundary
        if (os.path.isfile(os.path.join(d, ".git")) and os.path.basename(os.path.dirname(d)) == "tracks"
                and os.path.basename(d)[:2] == "T-" and os.path.basename(d)[2:7].isascii()
                and os.path.basename(d)[2:].isdigit() and len(os.path.basename(d)) <= 7):
            root = None
            break
        up = os.path.dirname(d)
        if up == d:
            break
        d = up
    return root


def ticket_ids(root):
    """{id: ticket md path} for every ticket file under the tickets dirs
    (docs/tickets, or in the product layout every docs/PRODUCT/tickets plus
    docs/_shared/tickets/backlog); None = unreadable (fail open)."""
    out, broken = {}, []
    for _prod, base in tickets_homes(root):
        if not os.path.lexists(base):
            continue
        if not os.path.isdir(base) or not os.access(base, os.R_OK | os.X_OK):
            return None
        for d, dirs, files in os.walk(base, onerror=broken.append):
            if d[len(base):].count(os.sep) >= 3:
                dirs[:] = []
            for fn in files:
                m = re.match(r"^(T-(?:PATCH-)?\d{1,6})\.md$", fn)
                if m:
                    out.setdefault(m.group(1), os.path.join(d, fn))
    return None if broken else out




def rewrite_line(line, known, dest_of):
    """Link every unlinked known id in one prose line (code spans blanked first)."""
    if "T-" not in line:
        return line
    masked = CODE_SPAN_RE.sub(lambda m: " " * len(m.group(0)), line)
    labels, dests = [], []
    for m in LINK_RE.finditer(masked):
        labels.append((m.start(1), m.end(1)))
        dests.append((m.start(2), m.end(2)))
    inside = lambda spans, p: any(a <= p < b for a, b in spans)
    scan = list(masked)
    for a, b in dests:
        scan[a:b] = " " * (b - a)
    scan = re.sub(r"\S*/\S*", lambda m: m.group(0) if PAIR_RUN_RE.match(m.group(0)) else " " * len(m.group(0)), "".join(scan))
    out, last = [], 0
    for m in ID_RE.finditer(scan):
        tid, a, b = m.group(1), m.start(1), m.end(1)
        if tid not in known or inside(labels, a) or inside(dests, a):
            continue
        out.append(line[last:a])
        out.append("[%s](file://%s)" % (tid, dest_of(tid)))
        last = b
    out.append(line[last:])
    return "".join(out)


def make_dest_of(root, known):
    viewer = os.path.join(root, ".prdt", "scratch", "viewer")
    have_viewer = os.path.isfile(os.path.join(viewer, "viewer.html"))

    def dest_of(tid):
        stub = os.path.join(viewer, "at", tid + ".html")
        if have_viewer and re.fullmatch(r"T-\d+", tid) and os.path.isfile(stub):
            return stub
        return known[tid]
    return dest_of


def rewrite(delta, known, dest_of, fence):
    """-> (displayed text, fence state after it). fence = None | (char, length)."""
    out = []
    for ln in delta.splitlines(True):
        m = FENCE_OPEN_RE.match(ln)
        if fence is not None:
            if m and m.group(1)[0] == fence[0] and len(m.group(1)) >= fence[1] and not m.group(2).strip():
                fence = None
            out.append(ln)
        elif m:
            fence = (m.group(1)[0], len(m.group(1)))
            out.append(ln)
        else:
            out.append(rewrite_line(ln, known, dest_of))
    return "".join(out), fence


def state_dir():
    home = os.environ.get("PRDT_HOME") or os.path.join(os.path.expanduser("~"), ".prdt")
    return os.path.join(home, "run", "message-display")


def state_path(message_id):
    safe = re.sub(r"[^A-Za-z0-9-]", "", message_id or "")
    return os.path.join(state_dir(), safe) if safe else None


def load_fence(ev):
    p = state_path(ev.get("message_id"))
    if not p or not isinstance(ev.get("index"), int) or ev["index"] == 0:
        return None
    try:
        with open(p, encoding="utf-8") as f:
            c, n = f.read().split()
        return (c, int(n)) if c in ("`", "~") else None
    except Exception:
        return None


def save_fence(ev, fence):
    p = state_path(ev.get("message_id"))
    if not p:
        return
    try:
        if fence is None or ev.get("final") is True:
            if os.path.lexists(p):
                os.unlink(p)
            return
        os.makedirs(state_dir(), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write("%s %d" % fence)
    except Exception:
        pass


def prune_state():
    import time
    try:
        d = state_dir()
        now = time.time()
        for fn in os.listdir(d):
            q = os.path.join(d, fn)
            if now - os.path.getmtime(q) > STATE_MAX_AGE_S:
                os.unlink(q)
    except Exception:
        pass


def main():
    try:
        raw = sys.stdin.read()
        ev = json.loads(raw) if raw.strip() else None
    except Exception:
        return
    if not isinstance(ev, dict) or ev.get("hook_event_name") != "MessageDisplay":
        return
    delta = ev.get("delta")
    if not isinstance(delta, str):
        return
    if not delta:
        # final batch with nothing to show (message ended on a newline): the
        # fence state still goes; save_fence deletes it on final.
        if ev.get("final") is True:
            save_fence(ev, None)
        return
    fence = load_fence(ev)
    root = project_root(ev.get("cwd") or os.environ.get("CLAUDE_PROJECT_DIR"))
    if not root:
        return
    known = ticket_ids(root) if "T-" in delta else {}
    if known is None:
        known = {}
    text, fence = rewrite(delta, known, make_dest_of(root, known), fence)
    save_fence(ev, fence)
    if ev.get("index") == 0:
        prune_state()
    if text != delta:
        sys.stdout.write(json.dumps({
            "hookSpecificOutput": {"hookEventName": "MessageDisplay", "displayContent": text},
        }))


def _out_of_budget(*_):
    raise TimeoutError()


try:
    signal.signal(signal.SIGALRM, _out_of_budget)
    signal.alarm(RUN_BUDGET_S)
    main()
except BaseException:
    pass
sys.exit(0)
PYEOF
