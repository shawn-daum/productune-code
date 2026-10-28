#!/usr/bin/env python3
"""Arrival map: every hook-injected `[prdt ...]` string -> hook event, the code
site that decides when it fires, and which other strings reach the model in the
same moment. Read-only: reads ~/.claude/settings.json and the hook sources,
writes only to stdout.

  python3 -I arrival-map.py                      # full map (markdown)
  python3 -I arrival-map.py --who "link check"   # one string + everything co-arriving
  python3 -I arrival-map.py --hooks-dir DIR --settings FILE

Each string also carries its literal bytes (UTF-8, placeholders such as %s left
unexpanded) and how often its event fires (per session / per dispatch / per turn /
per tool call / per turn end), plus the condition that gates its print: `always`,
`conditional — <the gating statement and line>`, or `unknown — read line N`.
bytes x frequency is the cost the harness-engineering skill optimizes.

Event / condition resolution is derived from the source (usage sites of the
string constant, handler function names, carrier scripts, the early exit / enclosing
if that gates each print), never from a tag or constant name. Guards shared by every
string of a moment (a persona / event / project filter at the hook's top) are printed
as the moment gate and do not make a string conditional. Heuristic spots are tagged
`~` in the output; confirm those by reading the cited line.
"""
import argparse, json, os, re, sys

HOME = os.path.expanduser("~")
REPO_HOOKS = os.path.join(os.getcwd(), "code/packages/core/scripts/hooks")

ap = argparse.ArgumentParser()
ap.add_argument("--settings", default=os.path.join(HOME, ".claude/settings.json"))
ap.add_argument("--hooks-dir", default=REPO_HOOKS if os.path.isdir(REPO_HOOKS)
                else os.path.join(HOME, ".prdt/hooks"))
ap.add_argument("--who", default=None, help="substring of a tag, e.g. 'register check'")
args = ap.parse_args()

# ---- registrations -----------------------------------------------------------
cfg = json.load(open(args.settings))
regs = []  # (event, matcher, script)
for ev, groups in cfg.get("hooks", {}).items():
    for g in groups:
        for h in g.get("hooks", []):
            m = re.search(r"([\w.-]+\.sh)\b", h.get("command", ""))
            if m:
                regs.append((ev, g.get("matcher", ""), m.group(1)))
by_script = {}
for ev, mt, sc in regs:
    by_script.setdefault(sc, set()).add((ev, mt))

def reg_events(sc):
    return sorted({e for e, _ in by_script.get(sc, ())})

# ---- sources -----------------------------------------------------------------
src = {}
for sc in sorted(os.listdir(args.hooks_dir)):
    if sc.endswith(".sh"):
        src[sc] = open(os.path.join(args.hooks_dir, sc), errors="replace").read().split("\n")

DEF_RE = re.compile(r"^(\s*)def (\w+)\(")
BASH_FN_RE = re.compile(r"^(\w+)\(\) \{")
BRANCH_RE = re.compile(r'^if \[ "\$\{1:-\}" = "(--[\w-]+)" \]')

def indent(l):
    return len(l) - len(l.lstrip())

def enclosing_def(lines, i):
    """Name of the def whose body holds line i, else None (module level)."""
    cur = indent(lines[i])
    for j in range(i - 1, -1, -1):
        l = lines[j]
        if not l.strip() or l.lstrip().startswith("#") or indent(l) >= cur:
            continue
        m = DEF_RE.match(l)
        if m:
            return m.group(2)
        cur = indent(l)
        if cur == 0:
            return None
    return None

def enclosing_branch(lines, i):
    for j in range(i, -1, -1):
        m = BRANCH_RE.match(lines[j])
        if m:
            return m.group(1)
        if lines[j].startswith("fi") and j < i:
            return None
    return None

HANDLER = (("post_tool", "PostToolUse"), ("stop", "Stop"))

def handler_event(name):
    for key, ev in HANDLER:
        if name.startswith(key) or ("_" + key) in name and name.endswith("main"):
            return ev
    return None

_memo = {}
def events_at(sc, i, seen=()):
    lines = src[sc]
    d = enclosing_def(lines, i)
    if d is None:
        return module_events(sc)
    return def_events(sc, d, seen)

def module_events(sc):
    reg = set(reg_events(sc))
    handled = {handler_event(m.group(2)) for l in src[sc]
               if (m := DEF_RE.match(l)) and handler_event(m.group(2))}
    rest = reg - handled
    return rest or reg

def def_events(sc, name, seen=()):
    h = handler_event(name)
    if h:
        return {h}
    if (sc, name) in seen:
        return set()
    out = set()
    pat = re.compile(r"\b%s\(" % re.escape(name))
    for i, l in enumerate(src[sc]):
        if pat.search(l) and not DEF_RE.match(l) and not l.lstrip().startswith("#"):
            out |= events_at(sc, i, seen + ((sc, name),))
    return out or set(reg_events(sc))

EMIT_RE = re.compile(r"lines\.append\(|lines\.extend\(|\.write\(|print\(|printf ")

def carriers(sc, flag=None):
    """[(carrier_script, line_index)] — call sites in OTHER hooks that run `sc`
    (a subprocess line carrying `flag`, or any line naming `sc`) AND whose result
    is then emitted (an append / write / print within the next 14 lines). A call
    whose result is only read (a boolean probe) is not a carrier."""
    out = []
    for c, lines in src.items():
        if c == sc or not any(sc in l and not l.lstrip().startswith("#") for l in lines):
            continue
        for i, l in enumerate(lines):
            if l.lstrip().startswith("#"):
                continue
            hit = ("subprocess" in l and flag in l) if flag else (sc in l)
            if hit and any(EMIT_RE.search(x) for x in lines[i + 1:i + 15]):
                out.append((c, i))
    return out


# ---- conditions: the guard that actually gates each print ---------------------------
# A string is `always` only when a walk from its print site up to the function / module
# top finds NO gating statement: no enclosing if/elif/else/for/while/case/except, and no
# earlier sibling that leaves the scope (`|| exit`, `if ...: return`, `sys.exit`). The
# walk follows a constant to its usage sites, a function to its call sites, and a
# subprocess print to the carrier line that emits it. A site the walk cannot read
# (inside a multi-line jq program, a constant nothing uses, a function nothing calls)
# makes the string `unknown`, never `always`.
EXIT_RE = re.compile(r"\b(exit|return|continue|break)\b|sys\.exit|\braise\b")
OPEN_RE = re.compile(r"^(if|elif|else|for|while|until|case|except)\b")
ONE_EXIT_RE = re.compile(r"(\|\||&&)\s*(exit|return|continue|break)\b")
GUARD_IF_RE = re.compile(r"^(if|elif)\b")

def _body_exits(lines, k):
    """True when the block opened by the `if` on line k ends with an exit/return and has no else."""
    base, last, j = indent(lines[k]), None, k + 1
    while j < len(lines):
        l = lines[j]
        if not l.strip() or l.lstrip().startswith("#"):
            j += 1; continue
        s = l.strip()
        if indent(l) <= base:
            if re.match(r"(else|elif)\b", s):
                return False
            break
        last = s
        j += 1
    return bool(last and EXIT_RE.search(last))

def _short(txt, n=70):
    txt = " ".join(txt.split())
    return txt if len(txt) <= n else txt[:n - 1] + "…"

HEREDOC_RE = re.compile(r"<<-?\s*[\\]?(['\"]?)(\w+)\1")
_sq = {}

def sq_state(sc):
    """For each line of a shell script: the index of the line where a single-quoted string
    still open at that line's start began (None when the line starts outside one).
    Tracks comments, double quotes, backslash escapes and heredoc bodies (a Python
    heredoc is not shell quoting)."""
    if sc in _sq:
        return _sq[sc]
    lines, out, sq_start, hd, hd_from = src[sc], [], None, None, None
    dq, stack = False, []  # stack: one [dq_saved, paren_depth] per open `$(`
    for n, l in enumerate(lines):
        out.append(sq_start if sq_start is not None else hd_from)
        if hd is not None:
            if l.strip() == hd:
                hd, hd_from = None, None
            continue
        k = 0
        while k < len(l):
            ch = l[k]
            if sq_start is not None:
                if ch == "'":
                    sq_start = None
            elif ch == "\\":
                k += 1
            elif ch == "$" and l[k + 1:k + 2] == "(" and l[k + 2:k + 3] != "(":
                stack.append([dq, 0]); dq = False; k += 1
            elif dq:
                if ch == '"':
                    dq = False
            elif ch == "'":
                sq_start = n
            elif ch == '"':
                dq = True
            elif ch == "(" and stack:
                stack[-1][1] += 1
            elif ch == ")" and stack:
                if stack[-1][1]:
                    stack[-1][1] -= 1
                else:
                    dq = stack.pop()[0]
            elif ch == "#" and (k == 0 or l[k - 1] in " \t"):
                break
            k += 1
        if sq_start is None and not dq and not stack:
            m = HEREDOC_RE.search(l)
            if m:
                hd = m.group(2)
                hd_from = n if "jq" in l.lower() else None
    _sq[sc] = out
    return out

def in_jq_program(sc, i):
    """True when line i sits inside a single-quoted block opened on a `jq` line (a jq
    program: its indentation and if/then/else are not shell scope)."""
    s0 = sq_state(sc)[i]
    if s0 is None:
        return False
    k = s0
    while True:  # the opener plus the `\\`-continued lines of the same command
        if "jq" in src[sc][k].lower():
            return True
        if k > 0 and src[sc][k - 1].rstrip().endswith("\\"):
            k -= 1
        else:
            return False

def walk_guards(sc, i):
    """(guards, boundary): guards gating line i inside its own scope; boundary is None
    (reached module top), ('def', name) or 'unknown' (cannot read the scope)."""
    lines = src[sc]
    if in_jq_program(sc, i):
        return [], "unknown"
    # a print on a continuation line belongs to the statement that opened it: climb to
    # the statement's first line (a lower-indented line that is not a block opener)
    cur, pos, out = indent(lines[i]), i, []
    while True:
        up = next((j for j in range(pos - 1, -1, -1) if lines[j].strip()
                   and not lines[j].lstrip().startswith("#") and indent(lines[j]) < cur), None)
        if up is None:
            break
        s = lines[up].strip()
        if OPEN_RE.match(s) or DEF_RE.match(lines[up]) or BASH_FN_RE.match(s) or s.endswith((":", "then", "do")):
            break
        cur, pos = indent(lines[up]), up
    for j in range(pos - 1, -1, -1):
        l = lines[j]
        s = l.strip()
        if not s or s.startswith("#"):
            continue
        ind = indent(l)
        if ind > cur:
            continue
        dm = DEF_RE.match(l) or BASH_FN_RE.match(s)
        if dm and ind < cur:
            return out, ("def", dm.group(2) if DEF_RE.match(l) else dm.group(1))
        if BRANCH_RE.match(s):
            if ind < cur:
                cur = ind
            continue
        if ind == cur:
            if dm:
                continue  # a sibling function definition is not a statement that runs
            if ONE_EXIT_RE.search(s) and not s.startswith("#"):
                out.append((sc, j + 1, "early exit", _short(s)))
            elif GUARD_IF_RE.match(s) and (_body_exits(lines, j) or
                    re.search(r"[:;]\s*(then\s+)?(exit|return|continue|sys\.exit)\b", s)):
                out.append((sc, j + 1, "early exit", _short(s)))
            continue
        if OPEN_RE.match(s):
            out.append((sc, j + 1, "enclosing " + s.split()[0].rstrip(":"), _short(s)))
            cur = ind
        elif re.match(r"(try|finally|with)\b.*:\s*$", s):
            cur = ind  # a scope that adds no condition
    return out, None

def site_guards(sc, i, seen=()):
    """(guards, unknown) for a print at (sc, i), following function call sites."""
    g, b = walk_guards(sc, i)
    if b == "unknown":
        return g, True
    if b is None:
        return g, False
    name = b[1]
    if handler_event(name) or (sc, name) in seen:
        return g, False
    pat = re.compile(r"\b%s\(" % re.escape(name))
    calls = [k for k, l in enumerate(src[sc]) if pat.search(l) and not DEF_RE.match(l)
             and not BASH_FN_RE.match(l.strip()) and not l.lstrip().startswith("#")]
    if not calls:
        return g, True
    res = [site_guards(sc, k, seen + ((sc, name),)) for k in calls]
    if any(u for _, u in res):
        return g, True
    free = [r for r, _ in res if not r]
    if free:
        return g, False  # one call site is unguarded: the function can fire unconditionally
    return g + res[0][0], False

def string_guards(s, uses):
    """Derive s['by_event'] = {event: dict(cond, guards, gate_line)}, cond = always |
    conditional | unknown. A string reaches the model through one or more sites (a
    constant's usage sites, or the one print line), each with its own event and guards."""
    sc = s["file"]
    res = {}  # ev -> [(guards, unknown, gate_line)]
    if s["const"]:
        sites = [(sc, u) for u in uses]
    else:
        sites = [(sc, s["line"] - 1)]
    for f, k in sites:
        g, u = site_guards(f, k)
        evs = set(events_at(f, k)) if s["const"] else set(s["events"])
        if s["carry_sites"]:
            c, ci = s["carry_sites"][0]
            g2, u2 = site_guards(c, ci)
            g, u, evs = g + g2, u or u2, set(events_at(c, ci))
        for ev in (evs or set(s["events"])):
            res.setdefault(ev, []).append((g, u, k + 1))
    s["by_event"] = {}
    for ev in s["events"]:
        rows = res.get(ev) or [([], True, s["line"])]
        if s["const"] and not uses:
            rows = [([], True, s["line"])]
        free = [r for r in rows if not r[0] and not r[1]]
        if free:
            s["by_event"][ev] = dict(cond="always", guards=[], gate_line=None)
        elif any(r[1] for r in rows):
            s["by_event"][ev] = dict(cond="unknown", guards=[], gate_line=next(r[2] for r in rows if r[1]))
        else:
            s["by_event"][ev] = dict(cond="conditional", guards=rows[0][0], gate_line=None)

def moment_gates(strs, ev):
    """Guards shared by every string of a moment (>= 2 strings): a filter on who the
    invocation is for (a persona / event / project exit at the hook's top), not a
    condition of one print. Limit: two strings that really share one condition read as a
    moment gate too; the Moments section prints it so the reader can judge."""
    grp = [x for x in strs if ev in x["events"] and x["by_event"][ev]["cond"] != "unknown"]
    if len(grp) < 2:
        return set()
    common = None
    for x in grp:
        keys = {(f, l, k) for f, l, k, _ in x["by_event"][ev]["guards"]}
        common = keys if common is None else common & keys
    return common or set()


# ---- bytes and firing frequency ---------------------------------------------------
LIT_RE = re.compile(r"""[fFrR]?"((?:[^"\\]|\\.)*)"|[fFrR]?'((?:[^'\\]|\\.)*)'""")
CONT_RE = re.compile(r"""\s*[fFrR]?["']""")

def decode(t):
    t = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), t)
    for a, b in (("\\n", "\n"), ('\\"', '"'), ("\\`", "`"), ("\\\\", "\\")):
        t = t.replace(a, b)
    return t

def measure(lines, i):
    """UTF-8 bytes of the string literal that starts at the tag on line i, joined over
    the continuation lines that start with a quote. None when no literal is found."""
    m = TAG_RE.search(lines[i])
    first = lines[i][m.start():]
    text, j, line = [], i, first
    while True:
        lits = [a or b for a, b in LIT_RE.findall(line)]
        text += lits
        if j + 1 < len(lines) and j - i < 14 and CONT_RE.match(lines[j + 1]):
            j += 1; line = lines[j]
        else:
            break
    body = decode("".join(text))
    if not body:
        return None
    return len(body.encode("utf-8"))

FIRES = {"SessionStart": "per session", "SubagentStart": "per dispatch",
         "SubagentStop": "per dispatch", "UserPromptSubmit": "per turn",
         "PostToolUse": "per tool call", "PreToolUse": "per tool call",
         "PostToolBatch": "per tool batch", "Stop": "per turn end"}

def cond_txt(s, ev=None):
    """always | conditional — <the gating statements> | unknown — read line N. Per event
    (a string can be gated differently at each event it reaches)."""
    if ev is None:
        outs = []
        for e in s["events"]:
            o = cond_txt(s, e)
            if o not in [x[1] for x in outs]:
                outs.append((e, o))
        return outs[0][1] if len(outs) == 1 else " | ".join("%s: %s" % x for x in outs)
    r = s["by_event"][ev]
    if r["cond"] == "unknown":
        return "unknown — read line %d" % r["gate_line"]
    gs = r["eff_guards"]
    if not gs:
        return "always"
    ex = [g for g in gs if g[2] == "early exit"] or gs
    head = "; ".join("%s:%d `%s`" % (f, l, _short(x, 48)) for f, l, k, x in ex[:2])
    return "conditional — %s%s" % (head, " (+%d more)" % (len(ex) - 2) if len(ex) > 2 else "")

def fires(s):
    """(frequency of the carrying event, condition derived from the gating statements)."""
    ev = ", ".join("%s (%s)" % (FIRES.get(e, e), e) for e in s["events"]) or "(unknown)"
    return ev, cond_txt(s)

def cond_class(s, ev):
    t = cond_txt(s, ev)
    return "always" if t == "always" else ("unknown" if t.startswith("unknown") else "conditional")

def bytes_txt(s):
    return "%d B" % s["bytes"] if s["bytes"] is not None else "? (multi-line body)"

# ---- strings -----------------------------------------------------------------
TAG_RE = re.compile(r"""["']\[prdt ([a-z][a-z0-9 =_-]*)\]""")
CONST_RE = re.compile(r"^\s*([A-Z][A-Z0-9_]*)\s*=\s*\(?\s*$|^\s*([A-Z][A-Z0-9_]*)\s*=\s*\(")

def comment_above(lines, i):
    k = i - 1
    block = []
    while k >= 0 and lines[k].lstrip().startswith("#"):
        block.append(lines[k].lstrip("# ").strip())
        k -= 1
    block.reverse()
    txt = " ".join(block)
    return (txt[:170] + "…") if len(txt) > 170 else txt

strings = []
for sc, lines in src.items():
    for i, l in enumerate(lines):
        if l.lstrip().startswith("#") or "startswith(" in l or "len(" in l:
            continue
        m = TAG_RE.search(l)
        if not m:
            continue
        tag = m.group(1)
        # constant name: this line or up to 3 lines up
        const, cline = None, i
        for j in range(i, max(i - 4, -1), -1):
            cm = CONST_RE.match(lines[j])
            if cm:
                const, cline = (cm.group(1) or cm.group(2)), j
                break
        fn = enclosing_def(lines, i)
        branch = enclosing_branch(lines, i)
        approx = ""
        carried_by = []
        carry_sites = []
        uses = []
        # events
        if const:
            ev = set()
            pat = re.compile(r"\b%s\b" % const)
            used = False
            uses = []
            for u, ul in enumerate(lines):
                if u == i or ul.lstrip().startswith("#") or not pat.search(ul) or CONST_RE.match(ul):
                    continue
                used = True
                uses.append(u)
                ev |= events_at(sc, u)
            if not used:
                ev = set()
                approx = "~unreferenced constant"
        elif sc.endswith(".sh") and branch:
            cs = carriers(sc, branch)
            ev = set()
            for c, ci in cs:
                ev |= events_at(c, ci)
                carried_by.append("%s:%d" % (c, ci + 1))
                carry_sites.append((c, ci))
            if not cs:
                ev = set(reg_events(sc)); approx = "~branch " + branch
        else:
            ev = events_at(sc, i)
            if fn is None and not reg_events(sc):
                approx = "~unregistered"
        if not ev and not reg_events(sc) and not approx:
            cs = carriers(sc)
            for c, ci in cs:
                ev |= events_at(c, ci)
                carried_by.append("%s:%d" % (c, ci + 1))
                carry_sites.append((c, ci))
        ctx = comment_above(lines, cline)
        strings.append(dict(tag=tag, file=sc, line=i + 1, const=const, fn=fn, branch=branch,
                            events=sorted(ev), approx=approx, carried=carried_by, note=ctx,
                            invoker=(carried_by[0].split(":")[0] if carried_by else sc),
                            bytes=measure(lines, i), carry_sites=carry_sites[:1], uses=uses))

# collapse same tag+file+const duplicates (same string, several printf sites)
seen, uniq = set(), []
for s in strings:
    k = (s["tag"], s["file"], s["const"] or s["line"])
    if k not in seen:
        seen.add(k); uniq.append(s)
strings = uniq
for n, s in enumerate(strings, 1):
    s["id"] = "S%02d" % n
    string_guards(s, s["uses"])
GATES = {}
for _ev in {e for s in strings for e in s["events"]}:
    GATES[_ev] = moment_gates(strings, _ev)
for s in strings:
    for _ev, r in s["by_event"].items():
        r["eff_guards"] = [g for g in r["guards"] if (g[0], g[1], g[2]) not in GATES[_ev]]

def matcher_overlap(a, b):
    if not a or not b:
        return True
    return bool(set(a.split("|")) & set(b.split("|")))

def moments_of(s):
    out = []
    for ev in s["events"]:
        ms = {mt for e, mt in by_script.get(s["invoker"], ()) if e == ev} or {""}
        out.append((ev, ms))
    return out

def co_arrivals(s):
    res = []
    for ev, ms in moments_of(s):
        for t in strings:
            if t is s or ev not in t["events"]:
                continue
            tms = {mt for e, mt in by_script.get(t["invoker"], ()) if e == ev} or {""}
            if any(matcher_overlap(a, b) for a in ms for b in tms):
                kind = "same-invocation" if t["invoker"] == s["invoker"] else "same-event"
                res.append((ev, kind, t))
    return res

def label(s):
    return "%s `[prdt %s]` (%s:%d%s)" % (s["id"], s["tag"], s["file"], s["line"],
                                          " " + s["const"] if s["const"] else "")

# ---- output ------------------------------------------------------------------
def out_who(q):
    hit = [s for s in strings if q in s["tag"] or q in (s["const"] or "")]
    if not hit:
        print("no string matches %r" % q); return
    for s in hit:
        print("### %s" % label(s))
        print("- events: %s %s" % (", ".join(s["events"]) or "(none)", s["approx"]))
        fq, cd = fires(s)
        print("- bytes: %s · fires: %s · prints: %s" % (bytes_txt(s), fq, cd))
        for e in s["events"]:
            for f, l, k, x in s["by_event"][e]["guards"]:
                print("  - gate at %s: %s:%d (%s) `%s`%s" % (e, f, l, k, x, " — moment gate, shared by every string of the event" if (f, l, k) in GATES[e] else ""))
        if s["carried"]:
            print("- emitted via: %s" % ", ".join(s["carried"]))
        print("- condition (source comment): %s" % (s["note"] or "(none — read the cited line)"))
        for ev, kind, t in co_arrivals(s):
            print("- %s · %s · %s · %s · %s" % (ev, kind, label(t), bytes_txt(t), cond_txt(t, ev)))
        print()

def out_full():
    print("# Arrival map (generated; do not hand-edit)\n")
    print("settings: `%s` · sources: `%s`\n" % (args.settings, args.hooks_dir))
    print("## Registrations\n\n| event | matcher | script |\n|---|---|---|")
    for ev, mt, sc in sorted(regs):
        print("| %s | %s | %s |" % (ev, mt or "*", sc))
    print("\n## Strings\n\n| id | tag | site | events | bytes | fires | prints | condition (source comment) | emitted via |\n|---|---|---|---|---|---|---|---|---|")
    for s in strings:
        fq, cd = fires(s)
        print("| %s | `%s` | %s:%d %s | %s %s | %s | %s | %s | %s | %s |" % (
            s["id"], s["tag"], s["file"], s["line"], s["const"] or s["fn"] or "",
            ", ".join(s["events"]) or "-", s["approx"], bytes_txt(s), fq, cd, (s["note"] or "-").replace("|", "/"),
            ", ".join(s["carried"]) or "-"))
    print("\n## Moments (strings that reach the model together)\n")
    evs = sorted({e for s in strings for e in s["events"]})
    for ev in evs:
        group = [s for s in strings if ev in s["events"]]
        print("### %s\n" % ev)
        inv = {}
        for s in group:
            inv.setdefault(s["invoker"], []).append(s)
        for k, v in inv.items():
            print("- one invocation of `%s`: %s" % (k, " · ".join("%s `%s` %s" % (x["id"], x["tag"], bytes_txt(x)) for x in v)))
        al = sum(x["bytes"] or 0 for x in group if cond_class(x, ev) == "always")
        vi = sum(x["bytes"] or 0 for x in group if cond_class(x, ev) == "conditional")
        un = sum(x["bytes"] or 0 for x in group if cond_class(x, ev) == "unknown")
        print("- literal bytes at this moment (%s): always %d B · conditional %d B · unknown %d B (measured literals only; unmeasured bodies not counted)" % (FIRES.get(ev, ev), al, vi, un))
        if GATES.get(ev):
            ex = next(g for g in group if g["by_event"][ev]["cond"] != "unknown")
            print("- moment gate (every string here sits behind it, so it does not separate them): %s" % " · ".join(
                "%s:%d `%s`" % (f, l, x) for f, l, k, x in ex["by_event"][ev]["guards"] if (f, l, k) in GATES[ev]))
        print("- always at this moment: %s" % (" · ".join("%s `%s`" % (x["id"], x["tag"]) for x in group if cond_class(x, ev) == "always") or "(none)"))
        print()
    print("bytes x frequency: a string's cost = its bytes x how often its moment fires (per tool call and per turn dominate per session). Fire counts per session are not measured here; read them from the session transcript.\n")
    print("Session-level text (discipline · overrides · playbook menus) arrives via the SessionStart / SubagentStart / compact "
          "hooks listed above (prdt-session-start*.sh, prdt-*-inject.sh); their bodies are discipline documents, not scanned here.")

(out_who(args.who) if args.who else out_full())
