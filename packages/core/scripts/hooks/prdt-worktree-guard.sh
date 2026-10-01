#!/usr/bin/env bash
# prdt — worktree guard (T-779) + track-record guard (T-834). Registered (hook-manifest.json) on PreToolUse,
# matcher `Edit|Write|MultiEdit|NotebookEdit|Bash`; exercised directly by
# test/scripts/worktree-guard-hook.test.ts spawning it.
#
# WHY (2026-09-28, T-601): a developer dispatched with `[ctx].worktree` =
# tracks/T-601 wrote code/packages/core/scripts/prdt (+112) and install.sh (+6)
# in the SHARED code checkout while QA was grilling that same checkout. A
# worker's cwd is the session root, so a `code/…` path lands in the shared
# checkout. The dispatch gate (T-775) only checks at dispatch time; this hook
# checks every write.
#
# RULE: a `prdt-developer` / `prdt-qa` worker whose OWN dispatch prompt carried
# `[ctx].worktree` (naming a checkout other than the shared one) is denied an
# Edit / Write / MultiEdit / NotebookEdit whose target — and a Bash command
# whose recognisable write target — resolves under the shared code checkout
# and outside its worktree. Everything else is silent: its worktree, the
# scratchpad, the meta tree (docs/…, outside code/), a worker with no
# `[ctx].worktree`, the main session, every other persona.
#
# WHICH WORKTREE (T-780): the event's own `agent_id` names this worker. Its
#   worktree is read from, in order:
#   1. the worker's OWN transcript first record (its prompt, byte-identical to
#      the parent's Agent `input.prompt`) — keyed by agent_id, so no pairing
#      question arises at all;
#   2. its run/dispatches marker `checkout`, ONLY when `pairing` = "confirmed".
#   An unconfirmed marker may hold a SIBLING's [ctx] (T-780: FIFO swaps two
#   same-persona starts), and the worker transcript file is created ~2 s after
#   the worker starts — so inside that window the worktree is UNKNOWN and the
#   hook fails OPEN (silent). Decision, not an accident: a deny built on a
#   sibling's [ctx] would name the wrong worktree to a worker that may have
#   none, while the window closes on its own (every later call re-checks) and
#   the incident class (an edit minutes into the task) is never inside it.
#
# SHARED CHECKOUT: `<root>/<.prdt/config.json code.dir>` (root = the outermost
#   ancestor holding `.prdt/po-state.json`, walked from the worktree, else the
#   cwd — same rule as prdt-post-dispatch.sh). No `code.dir` (legacy layout:
#   code root == meta root) → the root itself, minus `docs/`, `.prdt/` and
#   `tracks/` — the meta files a worker legitimately writes and the tracks
#   that sit outside the checkout in the split layout.
#
# BASH (best effort — "the writes the hook can recognise"): a command is split
#   into simple commands on `;` `&&` `||` `|` `&` and newlines (heredoc bodies
#   dropped, comments stripped quote-aware — a `#` only opens one at a word
#   boundary, matching real bash) and each is judged by shape: redirect
#   targets (`>` `>>` `&>` `N>`, but not inside `[[ … ]]`, where `>`/`<` are
#   string comparisons), `tee` files, `sed -i` / `perl -i` files, `cp` `mv`
#   `install` `ln` `rsync` destinations (last operand, or `-t DIR`) — `mv`
#   also checks its SOURCE operand(s), since removing a file from the shared
#   checkout is itself a write — `rm` `rmdir` `mkdir` `touch` `truncate`
#   `unlink` `chmod` `chown` operands, `find … -delete`'s search path(s),
#   `dd of=`, `curl -o`/`--output`, a mutating `git` subcommand run in the
#   shared checkout (`-C DIR` / `--work-tree DIR` or the effective cwd),
#   `tar`'s `-C`/`--directory` destination (only in an extract/append mode —
#   `x`/`r`/`u`/`A` or `--extract`/`--get`/`--append`/`--update`/
#   `--concatenate`/`--catenate`; a plain `-c` create is a read of that
#   directory, left silent like `cat`), `patch`'s `-d`/`--directory` and
#   `unzip`'s `-d` destination, and `npm`'s `--prefix` destination (T-786:
#   F5). `eval`'s body recurses like `bash -c` (T-786: F5). `cd`, `pushd`/
#   `popd` and a `( … )` subshell (scoped: a `cd` inside one does not leak
#   out) move the effective cwd — a bare `cd` (no operand) goes to `$HOME`,
#   matching real bash (T-786: code review #3 — it used to leave the
#   effective cwd unchanged, which could land a later relative path back
#   inside the checkout and false-deny it); `bash -c`/`sh -c`/`zsh -c` recurse
#   into their script argument (capped at 4 levels); `xargs CMD …` is
#   unwrapped like a prefix so a literal target on xargs's OWN command line
#   is seen. A path spelled `$PWD/…` / `${PWD}/…` resolves against the
#   effective cwd. Paths differing only in case are folded before comparing,
#   but only where `sys.platform == "darwin"` (APFS default: case-
#   insensitive) — never on a case-sensitive filesystem, to avoid a false
#   deny there.
#   Still NOT recognised — accepted gaps: an interpreter writing a file from
#   inside its own source (python -c, node -e); a target reaching `xargs` or
#   `find -exec` only via stdin / found paths, never literal on the command
#   line; a `case … esac` pattern boundary is not specially parsed; a target
#   STARTING WITH an unresolved `$VAR` (any variable other than `$PWD`/
#   `${PWD}`) or a command substitution (`$(…)` or backtick) is left unknown
#   rather than guessed, since that leading segment is what decides which
#   directory the path resolves under — guessed as a plain relative path, it
#   could resolve to the wrong directory entirely and false-deny a legacy-
#   layout write that never touches the checkout (T-786: code review #3,
#   `$TMPDIR/x` · `$S/x`). A reference elsewhere in the path (`code/$f`)
#   still resolves literally, unchanged. Backtick substitution is one more
#   shape this gap covers, not parsed.
#
# TRACK RECORDS (T-834): a second rule in the same hook, for EVERY worker
#   persona (`prdt-developer` / `prdt-qa` / `prdt-designer`), with or without
#   `[ctx].worktree`: no write, move or delete under $PRDT_HOME/run/tracks/ —
#   the "cut from main" records `prdt track open --base main` writes (T-833),
#   whose deletion or forgery to `base=dev` turns a refused bare `land` into a
#   silent merge to dev. The same target shapes as above are judged (Edit/
#   Write/MultiEdit/NotebookEdit paths; Bash redirects, tee, cp/mv/rm/…,
#   sed -i, find -delete, bash -c / bash <<EOF bodies); a target spelled
#   `$PRDT_HOME/…` / `${PRDT_HOME}/…` / `$HOME/…` / `~/…` is expanded here
#   (unlike other variables, these are known); a REMOVAL of a directory
#   inside $PRDT_HOME that holds the records (`rm -rf ~/.prdt/run`) is denied
#   too, and so is a copy/extract DESTINATION that holds them (`cp -R x
#   ~/.prdt/run/`, rsync, ditto, `tar -C`, `unzip -d`). A `{a,b}` list is
#   expanded and each alternative judged; a glob target (`*` `?` `[…]`) is
#   denied when its literal part sits under $PRDT_HOME/run or it can match
#   run/tracks (or, for a removal/destination, an ancestor inside
#   $PRDT_HOME: `rm -rf ~/.prdt/r*`). `bash`/`sh`/`zsh`/`dash`/`ksh` with a
#   `-c` alone or combined (`-lc`, `-ec`) recurse, and a wrapper is matched
#   by basename (`/usr/bin/env bash -c`) (T-834 grill A/C/D).
#   Beyond the T-779 shapes, two more are denied for this directory only:
#   an interpreter (python/node/perl/ruby/…) whose inline program — `-c`/`-e`
#   argument, heredoc body, here-string — names it, and a worker's own
#   `prdt track open|land|drop` (PO commands; `review` stays allowed). A
#   real reassignment of PRDT_HOME / HOME — a prefix on the SAME command
#   (`PRDT_HOME=… prdt track …`, `env PRDT_HOME=…`; it reaches that child,
#   not its own `$VAR` arguments), `export X=…`, or a bare `X=…` statement
#   (scoped to its `( … )` subshell); never text inside `echo …` or a
#   comment (T-834 grill B) — is judged against the value it assigns: the real
#   one is still denied, a sandbox one (QA reproductions) is silent, an
#   unresolvable one (`$S/prdt`) is unknown → silent. Reads (cat, ls, jq, a
#   cp FROM the directory) are never denied. Still NOT recognised: a script
#   FILE that writes it (`python3 x.py`), a path built so that no literal
#   spelling of it appears, a target reached via stdin/xargs/find -exec.
#   What a bare `land` does if a record is changed anyway: `prdt` treats a
#   record with a repeated key as untrusted (refuses); a deleted or
#   well-formed `base=dev` record still lands to dev (main never moves).
#
# Fails OPEN everywhere: python3 missing, unparsable JSON, no project, an
# unreadable config — exit 0, no output.

set +e
LC_ALL=C
IFS= read -r -d '' EV 2>/dev/null
[ -n "$EV" ] || exit 0

# fork-0 pre-filter: only a worker persona's event can ever be denied.
case "$EV" in
  *'"agent_type":"prdt-developer"'*|*'"agent_type": "prdt-developer"'*|*'"agent_type":"prdt-qa"'*|*'"agent_type": "prdt-qa"'*) ;;
  *'"agent_type":"prdt-designer"'*|*'"agent_type": "prdt-designer"'*) ;;
  *) exit 0 ;;
esac
command -v python3 >/dev/null 2>&1 || exit 0

PRDT_EVENT_JSON="$EV" python3 - <<'PYEOF'
import hashlib, json, os, re, shlex, sys

def out_open():
    sys.exit(0)


WORKERS = ("prdt-developer", "prdt-qa", "prdt-designer")

try:
    ev = json.loads(os.environ.get("PRDT_EVENT_JSON", ""))
except Exception:
    out_open()
if not isinstance(ev, dict):
    out_open()

# Structural: only TOP-LEVEL members identify the worker (a forged key nested
# in tool_input passed the bash pre-filter, never this).
atype, aid = ev.get("agent_type"), ev.get("agent_id")
if atype not in WORKERS or not isinstance(aid, str) or not aid or "/" in aid:
    out_open()
tool = ev.get("tool_name")
tin = ev.get("tool_input") if isinstance(ev.get("tool_input"), dict) else {}
if tool not in ("Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"):
    out_open()
cwd = ev.get("cwd") if isinstance(ev.get("cwd"), str) and ev.get("cwd").startswith("/") else None

prdt_home = os.environ.get("PRDT_HOME") or os.path.expanduser("~/.prdt")
real_home = os.environ.get("HOME") or os.path.expanduser("~")
# T-834: the track records `prdt track open` writes (T-833). Every worker
# persona is guarded here, with or without [ctx].worktree.
tracks_abs = os.path.realpath(os.path.join(prdt_home, "run", "tracks"))
prdt_home_abs = os.path.realpath(prdt_home)
# Only the shared-checkout rule (T-779) needs a worktree; it covers dev/qa.
guard_co = atype in ("prdt-developer", "prdt-qa")


def ctx_worktree(prompt):
    """(found_ctx, worktree-or-None) from a dispatch prompt's `[ctx]` line."""
    if not isinstance(prompt, str):
        return False, None
    for line in prompt.split("\n"):
        if line.startswith("[ctx] {"):
            try:
                obj = json.loads(line[len("[ctx] "):])
            except Exception:
                return False, None
            if not isinstance(obj, dict):
                return False, None
            wt = obj.get("worktree")
            return True, (wt.strip() if isinstance(wt, str) and wt.strip() else None)
    return True, None  # a prompt with no [ctx]: known, and no worktree


def first_prompt(path):
    try:
        with open(path, encoding="utf-8") as f:
            rec = json.loads(f.readline())
    except Exception:
        return None
    if not (isinstance(rec, dict) and rec.get("type") == "user"):
        return None
    content = (rec.get("message") or {}).get("content") if isinstance(rec.get("message"), dict) else None
    if isinstance(content, list):
        texts = [b.get("text") for b in content if isinstance(b, dict) and b.get("type") == "text"]
        content = texts[0] if texts else None
    return content if isinstance(content, str) else None


def find_root(start):
    d = os.path.realpath(start) if start else None
    root = None
    while d and d != "/":
        if os.path.isfile(os.path.join(d, ".prdt", "po-state.json")):
            root = d
        up = os.path.dirname(d)
        if up == d:
            break
        d = up
    return root


def resolve_checkout():
    """(wt_abs, code_abs, root, legacy) for the T-779 rule, or None."""
    marker = None
    try:
        mp = os.path.join(prdt_home, "run", "dispatches", hashlib.sha256(aid.encode("utf-8")).hexdigest() + ".json")
        with open(mp, encoding="utf-8") as f:
            m = json.load(f)
        if isinstance(m, dict) and m.get("agent_id") == aid:
            marker = m
    except Exception:
        pass
    # 1. the worker's own transcript
    cands = []
    tp, sid = ev.get("transcript_path"), ev.get("session_id")
    if isinstance(tp, str) and tp:
        if os.path.basename(tp) == f"agent-{aid}.jsonl":
            cands.append(tp)
        elif isinstance(sid, str) and sid and "/" not in sid:
            cands.append(os.path.join(os.path.dirname(tp), sid, "subagents", f"agent-{aid}.jsonl"))
    if marker and isinstance(marker.get("transcript"), str):
        cands.append(marker["transcript"])
    known, wt = False, None
    for c in cands:
        p = first_prompt(c)
        if p is not None:
            known, wt = ctx_worktree(p)
            if known:
                break
    # 2. a CONFIRMED marker only
    if not known and marker and marker.get("pairing") == "confirmed" and isinstance(marker.get("checkout"), str):
        known, wt = True, (None if marker["checkout"].strip() in ("", "code") else marker["checkout"].strip())
    if not known or wt is None or wt == "code":
        return None
    root = None
    if wt.startswith("/"):
        root = find_root(wt)
    if not root and cwd:
        root = find_root(cwd)
    if not root and marker and isinstance(marker.get("project_root"), str):
        root = find_root(marker["project_root"])
    if not root:
        return None
    wt_abs = os.path.realpath(wt if wt.startswith("/") else os.path.join(root, wt))
    code_dir = None
    try:
        with open(os.path.join(root, ".prdt", "config.json"), encoding="utf-8") as f:
            cd_ = ((json.load(f) or {}).get("code") or {}).get("dir")
        if isinstance(cd_, str) and cd_.strip() and not cd_.startswith("/") and ".." not in cd_.split("/"):
            code_dir = cd_.strip().rstrip("/")
    except Exception:
        pass
    code_abs = os.path.realpath(os.path.join(root, code_dir)) if code_dir else root
    if wt_abs == code_abs:
        return None  # its "worktree" IS the shared checkout: nothing to guard
    return wt_abs, code_abs, root, code_abs == root


wt_abs = code_abs = root = None
legacy = False
if guard_co:
    _co = resolve_checkout()
    if _co is None:
        guard_co = False
    else:
        wt_abs, code_abs, root, legacy = _co


def under(p, d):
    return p == d or p.startswith(d.rstrip("/") + "/")


# T-783: APFS (the default macOS volume format) is case-insensitive, so
# `.../Code/x` and `.../code/x` name the same on-disk file even though
# os.path.realpath (pure string resolution, no filesystem case lookup)
# leaves their case untouched — fold before comparing on this platform only,
# so a case-sensitive filesystem elsewhere in CI is never over-matched.
IS_DARWIN = sys.platform == "darwin"


def fold(p):
    return p.lower() if IS_DARWIN else p


def under_ci(p, d):
    return under(fold(p), fold(d))


def expand_pwd(path, base):
    """A literal `$PWD/…` / `${PWD}/…` prefix, as bash would expand it (T-783)."""
    for pre in ("${PWD}", "$PWD"):
        if path == pre or path.startswith(pre + "/"):
            return (base or "") + path[len(pre):]
    return path


def has_unresolved_ref(path):
    """T-786 (code review #3): a target STARTING WITH a `$VAR` other than
    `$PWD`/`${PWD}`, or a command substitution (`$(…)` / backtick) — the
    segment that decides which directory the path resolves under is itself
    unknown. Guessing there — joining it as a plain relative path against the
    effective cwd — can land it inside the shared checkout by accident (in
    the legacy layout, code_abs == root, so almost any relative-looking text
    resolves "under" it) and false-deny a write that never touches the
    checkout at all (`$TMPDIR/x`, `$S/x`). Unknown, so left silent — an
    accepted gap, not a guess. A reference elsewhere in the path (`code/$f`)
    names an interior segment only, not the directory it resolves under, so
    it stays on the existing (literal-path) handling."""
    for pre in ("${PWD}", "$PWD"):
        if path == pre or path.startswith(pre + "/"):
            return False
    return path.startswith("$") or path.startswith("`")


def shared(path, base):
    """The realpath of `path` if it is a guarded shared-checkout path, else None."""
    if not guard_co or not isinstance(path, str) or not path:
        return None
    if has_unresolved_ref(path):
        return None
    path = os.path.expanduser(expand_pwd(path, base))
    if not path.startswith("/"):
        if not base:
            return None
        path = os.path.join(base, path)
    rp = os.path.realpath(path)
    if not under_ci(rp, code_abs) or under_ci(rp, wt_abs):
        return None
    if legacy and any(under_ci(rp, os.path.join(root, x)) for x in ("docs", ".prdt", "tracks")):
        return None
    return rp


# ── T-834: the track records ─────────────────────────────────────────────────
# `env` = what this command does to PRDT_HOME / HOME before using them:
#   {"PRDT_HOME": value-or-None, "HOME": value-or-None} — a key absent means
#   "not reassigned" (the hook's own environment applies); None means
#   "reassigned to something this hook cannot resolve" (unknown → silent).
ENV0 = {}


def _resolve_literal(val, env, base):
    """An assignment value / path prefix as bash would see it, or None."""
    if val is None:
        return None
    if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
        val = val[1:-1]
    h = env.get("HOME", real_home) if "HOME" in env else real_home
    for pre in ("${HOME}", "$HOME"):
        if val == pre or val.startswith(pre + "/"):
            if h is None:
                return None
            val = h + val[len(pre):]
            break
    if val == "~" or val.startswith("~/"):
        if h is None:
            return None
        val = h + val[1:]
    if "$" in val or "`" in val or not val:
        return None
    if not val.startswith("/"):
        if not base:
            return None
        val = os.path.join(base, val)
    return val


def eff_prdt_home(env):
    """The PRDT_HOME this command's `prdt` would use, or None when unknown."""
    if "PRDT_HOME" in env:
        return env["PRDT_HOME"]
    if os.environ.get("PRDT_HOME"):
        return prdt_home
    if "HOME" in env:
        return None if env["HOME"] is None else os.path.join(env["HOME"], ".prdt")
    return prdt_home


def same_home(env):
    h = eff_prdt_home(env)
    return h is not None and fold(os.path.realpath(h)) == fold(prdt_home_abs)


run_abs = os.path.realpath(os.path.join(prdt_home, "run"))
GLOB_CH = "*?[{"
MAX_BRACE = 64


def brace_expand(s):
    """bash brace expansion of `{a,b}` lists (T-834 grill [A]); a `{x..y}`
    range or an unbalanced brace is left as-is (judged as a glob later)."""
    out, todo = [], [s]
    while todo and len(out) + len(todo) <= MAX_BRACE:
        cur = todo.pop(0)
        found = False
        for i, c in enumerate(cur):
            if c != "{":
                continue
            depth, commas, j = 0, [], i
            while j < len(cur):
                if cur[j] == "{":
                    depth += 1
                elif cur[j] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                elif cur[j] == "," and depth == 1:
                    commas.append(j)
                j += 1
            if j < len(cur) and commas:
                parts, k = [], i + 1
                for cm in commas + [j]:
                    parts.append(cur[k:cm])
                    k = cm + 1
                todo.extend(cur[:i] + p + cur[j + 1:] for p in parts)
                found = True
                break
        if not found:
            out.append(cur)
    return out + todo


def glob_reaches(pat, ancestor):
    """Can the absolute glob `pat` (`*` `?` `[…]` per component, as bash
    matches them) name run/tracks or something inside it — or, when
    `ancestor`, a directory inside $PRDT_HOME that holds it?"""
    import fnmatch
    pc = [c for c in fold(pat).split("/") if c]
    tc = [c for c in fold(tracks_abs).split("/") if c]
    hc = [c for c in fold(prdt_home_abs).split("/") if c]
    n = min(len(pc), len(tc))
    if not all(fnmatch.fnmatchcase(tc[i], pc[i]) for i in range(n)):
        return False
    if len(pc) >= len(tc):
        return True
    return ancestor and tc[:len(hc)] == hc and len(pc) >= len(hc)


def tracks_target(path, base, env, removal=False):
    """realpath of `path` if it names the track records (or, for a removal /
    a copy-or-extract destination, a directory inside $PRDT_HOME that holds
    them), else None. A `{a,b}` list is expanded and each alternative judged;
    a glob is denied when it sits under $PRDT_HOME/run or can match the
    records (T-834 grill [A])."""
    if not isinstance(path, str) or not path:
        return None
    for alt in brace_expand(path):
        rp = _tracks_target1(alt, base, env, removal)
        if rp:
            return rp
    return None


def _tracks_target1(path, base, env, removal):
    p = path
    for pre, key in (("${PRDT_HOME}", "PRDT_HOME"), ("$PRDT_HOME", "PRDT_HOME")):
        if p == pre or p.startswith(pre + "/"):
            h = env["PRDT_HOME"] if "PRDT_HOME" in env else os.environ.get("PRDT_HOME")
            if h is None:
                return None
            p = h + p[len(pre):]
            break
    else:
        for pre in ("${HOME}", "$HOME"):
            if p == pre or p.startswith(pre + "/"):
                h = env["HOME"] if "HOME" in env else real_home
                if h is None:
                    return None
                p = h + p[len(pre):]
                break
    if has_unresolved_ref(p):
        return None
    p = expand_pwd(p, base)
    if p == "~" or p.startswith("~/"):
        h = env["HOME"] if "HOME" in env else real_home  # bash's `~` is $HOME
        if h is None:
            return None
        p = h + p[1:]
    if not p.startswith("/"):
        if not base:
            return None
        p = os.path.join(base, p)
    if any(ch in p for ch in GLOB_CH):
        comps = os.path.normpath(p).split("/")
        k = next(i for i, c in enumerate(comps) if any(ch in c for ch in GLOB_CH))
        lit = os.path.realpath("/".join(comps[:k]) or "/")
        pat = re.sub(r"\{[^{}]*\}", "*", "/".join([lit] + comps[k:]))
        if under_ci(lit, run_abs) or glob_reaches(pat, removal):
            return pat
        return None
    rp = os.path.realpath(p)
    if under_ci(rp, tracks_abs):
        return rp
    if removal and under_ci(tracks_abs, rp) and under_ci(rp, prdt_home_abs):
        return rp  # `rm -rf ~/.prdt/run` removes the records too
    return None


def deny_tracks(rp, how):
    msg = (f"prdt write guard (T-834): {tracks_abs} holds the PO's track records — `prdt track open` "
           f"writes them, `land` and `drop` remove them, and $PRDT_HOME/run/ is tooling-owned "
           f"(contracts §Return), so a worker cannot write, move or delete anything there — denied {how}: {rp}. "
           f"Reading it (cat, ls) is allowed; report a wrong record to the PO instead of changing it.")
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                             "permissionDecision": "deny",
                                             "permissionDecisionReason": msg}}))
    sys.exit(0)


def deny(rp, how):
    rel = os.path.relpath(rp, code_abs)
    msg = (f"prdt worktree guard (T-779): this worker was dispatched with [ctx].worktree {wt_abs}, "
           f"so it cannot write the shared code checkout {code_abs} — denied {how}: {rp}. "
           f"Edit and test only inside your worktree; the same file there is {os.path.join(wt_abs, rel)}.")
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                             "permissionDecision": "deny",
                                             "permissionDecisionReason": msg}}))
    sys.exit(0)


if tool != "Bash":
    target = tin.get("notebook_path") if tool == "NotebookEdit" else tin.get("file_path")
    rp = tracks_target(target, cwd, ENV0)
    if rp:
        deny_tracks(rp, tool)
    rp = shared(target, cwd)
    if rp:
        deny(rp, tool)
    out_open()

# ── Bash ─────────────────────────────────────────────────────────────────────
cmd = tin.get("command")
if not isinstance(cmd, str) or not cmd.strip():
    out_open()

SEPS = {";", "&&", "||", "|", "&", "|&", "\n", "{", "}"}
WRAPPERS = {"sudo", "command", "time", "nice", "nohup", "env", "exec", "builtin"}
# bash reserved words that can front a command word (T-783: `then rm …`,
# `do rm …`, `else`/`elif`/`!` — a segment split on `;`/`&&`/… still starts
# with the keyword, not the command, unless stripped first)
KEYWORDS = {"then", "do", "else", "elif", "fi", "done", "if", "while", "until",
            "!", "in", "case", "esac", "select", "function"}
XARGS_VALUE_FLAGS = {"-I", "-n", "-P", "-L", "-l", "-s", "-a", "-d", "-E", "-J", "-i"}
# subcommands that change the checkout's index or working tree (a ref-only or
# read-only one — log, status, diff, branch, fetch, worktree — stays silent)
GIT_MUT = {"add", "commit", "checkout", "switch", "reset", "restore", "stash", "merge", "rebase",
           "apply", "am", "cherry-pick", "revert", "rm", "mv", "clean", "pull"}
MAX_SUBSHELL_DEPTH = 4  # `bash -c '…'` recursion cap (T-783)
# T-834: an interpreter whose inline program names the track records is
# denied — the generic gap (a write from inside an interpreter's own source)
# stays open for every other path, but this directory is small and named.
INTERP_RE = re.compile(r"^(python[0-9.]*|pypy[0-9.]*|node|nodejs|deno|bun|perl|ruby|php|osascript|lua|Rscript|awk|gawk)$")
JOIN_RE = re.compile(r"""['"]run['"]\s*[,/+]\s*['"]/?tracks['"]""")
ENV_KEYS = ("PRDT_HOME", "HOME")
REMOVERS = {"rm", "rmdir", "unlink", "shred"}
# T-834 grill [C]: POSIX-family shells whose `-c` (alone or combined, `-lc`)
# runs its first operand as a script.
SHELLS = {"bash", "sh", "zsh", "dash", "ksh", "mksh", "yash", "posh"}


def shell_script(args):
    """(has_c, script-or-None, operands) for a shell's own argv."""
    j, has_c = 0, False
    while j < len(args):
        a = args[j]
        if a == "--":
            j += 1
            break
        if a in ("-o", "+o", "-O", "+O", "--rcfile", "--init-file"):
            j += 2
            continue
        if a.startswith("--"):
            j += 1
            continue
        if len(a) > 1 and a[0] in "-+":
            if a[0] == "-" and "c" in a[1:]:
                has_c = True
            j += 1
            continue
        break
    rest = args[j:]
    return has_c, (rest[0] if has_c and rest else None), rest


def names_tracks(text):
    """Does an inline program mention the REAL track records directory?"""
    t = fold(text)
    for sp in (tracks_abs, os.path.join(prdt_home, "run", "tracks"), "~/.prdt/run/tracks",
               "$PRDT_HOME/run/tracks", "${PRDT_HOME}/run/tracks", ".prdt/run/tracks"):
        if fold(sp) in t:
            return True
    if "run/tracks" in t or JOIN_RE.search(text):
        tl = text.lower()
        return ("prdt_home" in tl or ".prdt" in tl or fold(prdt_home_abs) in t
                or fold(prdt_home) in t)
    return False


def scan_line(ln):
    """One line → (kept-text, heredoc-terminator-words), quote-aware (T-783):
    a `#` only opens a comment at a word boundary (real bash never treats a
    mid-word `#`, e.g. `code/a#b.txt`, as one — plain `commenters="#"` in
    shlex does, and also swallows every command after it on the line); a
    `<<`/`<<-` only opens a heredoc unquoted (real bash ignores one written
    `'a<<b'`). A `<<<` here-string is left alone (no body follows)."""
    out, words = [], []
    q = None
    i, n = 0, len(ln)
    prev_ws = True
    while i < n:
        c = ln[i]
        if q:
            out.append(c)
            if c == q:
                q = None
            i += 1
            prev_ws = False
            continue
        if c in ("'", '"'):
            q = c
            out.append(c)
            i += 1
            prev_ws = False
            continue
        if c == "\\" and i + 1 < n:
            out.append(c)
            out.append(ln[i + 1])
            i += 2
            prev_ws = False
            continue
        if c == "#" and prev_ws:
            break
        if c == "<" and i + 1 < n and ln[i + 1] == "<":
            k = i + 2
            if k < n and ln[k] == "<":  # here-string <<<
                out.append("<<<")
                i = k + 1
                prev_ws = False
                continue
            if k < n and ln[k] == "-":
                k += 1
            while k < n and ln[k] == " ":
                k += 1
            w, wq = "", None
            while k < n and (wq or ln[k] not in " \t;&|)<>"):
                if ln[k] in ("'", '"') and not wq:
                    wq = ln[k]
                elif ln[k] == wq:
                    wq = None
                else:
                    w += ln[k]
                k += 1
            w = w.strip("'\"\\")
            if w:
                words.append(w)
            out.append(ln[i:k])
            i = k
            prev_ws = False
            continue
        out.append(c)
        prev_ws = c in (" ", "\t")
        i += 1
    return "".join(out), words


def strip_heredocs(s):
    """(text-without-bodies, bodies) — bodies[k] belongs to the k-th unquoted
    `<<` operator left in the text (T-834: an interpreter reading its program
    from a heredoc, `python3 - <<EOF`, is judged on that body)."""
    lines, out, pend, bodies, cur = s.split("\n"), [], [], [], []
    for ln in lines:
        if pend:
            if ln.strip() == pend[0]:
                pend.pop(0)
                bodies.append("\n".join(cur))
                cur = []
            else:
                cur.append(ln)
            continue
        kept, words = scan_line(ln)
        out.append(kept)
        pend.extend(words)
    if pend:
        bodies.append("\n".join(cur))  # unterminated: bash reads to EOF
    return "\n".join(out), bodies


def tokens(s):
    lx = shlex.shlex(s, posix=True, punctuation_chars=";&|()<>")
    lx.whitespace = " \t\r"
    lx.whitespace_split = True
    lx.commenters = ""  # comments already stripped, quote-aware, by scan_line
    out = []
    try:
        for t in lx:
            out.append(t)
    except ValueError:
        return None
    return out


def strip_prefixes(words, assigns=None):
    """Pop leading keywords / assignments / wrapper-and-its-flags, in any
    combination (T-783: `then sudo rm …`), until the command word is first.
    A popped PRDT_HOME= / HOME= assignment is appended to `assigns` as
    (name, value) — T-834 grill [B]: only these count as a reassignment."""
    changed = True
    while changed and words:
        changed = False
        if words[0] in KEYWORDS:
            words.pop(0)
            changed = True
            continue
        if "=" in words[0] and not words[0].startswith("=") and words[0].split("=", 1)[0].isidentifier():
            k, v = words.pop(0).split("=", 1)
            if assigns is not None and k in ENV_KEYS:
                assigns.append((k, v))
            changed = True
            continue
        if os.path.basename(words[0]) in WRAPPERS:
            words.pop(0)
            while words and words[0].startswith("-") and words[0] != "-":
                words.pop(0)
            changed = True
            continue
    return words


def run_command(raw_cmd, base_cwd, depth, sh, ch):
    """`sh` = PRDT_HOME / HOME as this shell expands `$VAR` / `~`; `ch` = as a
    child process sees them (exported). Both are mutated in place by a real
    assignment (T-834 grill [B]); a caller passes copies where bash would."""
    if depth > MAX_SUBSHELL_DEPTH or not isinstance(raw_cmd, str):
        return
    text, bodies = strip_heredocs(raw_cmd)
    text = text.replace("\\\n", " ").replace("\n", " ; ")
    hd_idx = 0
    toks = tokens(text)
    if toks is None:
        return

    # group into simple commands; "(" / ")" become their own marker segments
    # so a subshell's `cd` (T-783: `(cd code) ; touch rel.txt`) scopes to it
    # shlex merges adjacent punctuation (`);` · `&&(`): split a paren out
    toks = [x for t in toks for x in (
        re.findall(r"[()]|[^()]+", t) if t and set(t) <= set(";&|()") and set(t) & set("()") else [t])]
    segs, cur = [], []
    for t in toks:
        if t in ("(", ")"):
            if cur:
                segs.append(cur)
                cur = []
            segs.append([t])
            continue
        if t in SEPS or (t and set(t) <= set(";&|()") and not set(t) & set("<>")):
            if cur:
                segs.append(cur)
            cur = []
        else:
            cur.append(t)
    if cur:
        segs.append(cur)

    ecwd = base_cwd
    paren_stack, dir_stack = [], []

    def check(path, how, base=None, removal=False):
        b = base if base is not None else ecwd
        rp = tracks_target(path, b, sh, removal)
        if rp:
            deny_tracks(rp, how)
        rp = shared(path, b)
        if rp:
            deny(rp, how)

    for seg in segs:
        if seg == ["("]:
            paren_stack.append((ecwd, dict(sh), dict(ch)))
            continue
        if seg == [")"]:
            if paren_stack:
                ecwd, s0, c0 = paren_stack.pop()
                sh.clear(); sh.update(s0)
                ch.clear(); ch.update(c0)
            continue
        if seg and seg[0] == "[[":
            # `[[ … ]]`: `>` / `<` inside are string comparisons, not
            # redirects (T-783: `[[ "a" > "b" ]]` is not a write to "b")
            continue
        words, i, stdin_texts = [], 0, []
        while i < len(seg):
            t = seg[i]
            # redirect operators (punctuation_chars splits `2>` into "2" + ">")
            if t in (">", ">>", ">|", "&>", "&>>") or (t and set(t) <= set("<>&|") and ">" in t):
                if words and words[-1].isdigit() and t.startswith(">"):
                    words.pop()
                if i + 1 < len(seg):
                    tgt = seg[i + 1]
                    if not t.endswith("&") and not tgt.startswith("&"):  # `>&2` / `2>&1` name an fd
                        check(tgt, "Bash redirect")
                    i += 2
                    continue
                i += 1
                continue
            if t == "<<":
                if hd_idx < len(bodies):
                    stdin_texts.append(bodies[hd_idx])
                hd_idx += 1
                i += 2
                continue
            if t == "<<<":
                if i + 1 < len(seg):
                    stdin_texts.append(seg[i + 1])
                i += 2
                continue
            if t == "<":
                i += 2
                continue
            words.append(t)
            i += 1
        assigns = []
        words = strip_prefixes(words, assigns)
        if not words:
            # a bare `X=v` changes this shell; the child sees it when X is
            # exported (HOME always is; PRDT_HOME when set or exported before)
            for k, v in assigns:
                rv = _resolve_literal(v, sh, ecwd)
                sh[k] = rv
                if k == "HOME" or k in ch or os.environ.get(k):
                    ch[k] = rv
            continue
        if words and os.path.basename(words[0]) == "xargs":
            words.pop(0)
            while words and words[0].startswith("-") and words[0] != "-":
                f = words[0]
                if f in XARGS_VALUE_FLAGS and len(words) > 1:
                    words.pop(0)
                    words.pop(0)
                else:
                    words.pop(0)
            words = strip_prefixes(words, assigns)
        if not words:
            continue
        name, args = os.path.basename(words[0]), words[1:]
        ops = [a for a in args if not a.startswith("-")]
        # a prefix assignment reaches this command's child only — never its
        # own arguments' expansion, never a later command
        env = dict(ch)
        for k, v in assigns:
            env[k] = _resolve_literal(v, sh, ecwd)
        if name == "export":
            for a in args:
                k, eq, v = a.partition("=")
                if k in ENV_KEYS:
                    if eq:
                        sh[k] = ch[k] = _resolve_literal(v, sh, ecwd)
                    elif k in sh:
                        ch[k] = sh[k]
            continue
        if name == "cd":
            # T-786 (code review #3): bare `cd` (no operand) goes to $HOME,
            # same as real bash — leaving ecwd unchanged let a later relative
            # write resolve against the OLD cwd and false-deny inside it.
            nd = os.path.expanduser(ops[0]) if ops else os.path.expanduser("~")
            ecwd = nd if nd.startswith("/") else (os.path.join(ecwd, nd) if ecwd else None)
            continue
        if name == "pushd":
            if ops:
                nd = os.path.expanduser(ops[0])
                dir_stack.append(ecwd)
                ecwd = nd if nd.startswith("/") else (os.path.join(ecwd, nd) if ecwd else None)
            continue
        if name == "popd":
            if dir_stack:
                ecwd = dir_stack.pop()
            continue
        if name in SHELLS:
            has_c, script, rest = shell_script(args)
            if has_c:
                if script is not None:
                    run_command(script, ecwd, depth + 1, dict(env), dict(env))
                continue
            if stdin_texts and not rest:
                # T-834: `bash <<EOF … EOF` runs the body as a script
                for st in stdin_texts:
                    run_command(st, ecwd, depth + 1, dict(env), dict(env))
                continue
        if name == "eval":
            # T-786 (F5): `eval "echo x > code/a"` hides its redirect inside a
            # single quoted token, invisible to the outer redirect scan —
            # recurse into the reassembled body like `bash -c` does.
            if args:
                run_command(" ".join(args), ecwd, depth + 1, sh, ch)
            continue
        if INTERP_RE.match(name) and same_home(env):
            # T-834: the inline program (-c/-e argument, heredoc, here-string)
            if names_tracks(" ".join(args + stdin_texts)):
                deny_tracks(tracks_abs, f"Bash {name} program naming the track records")
        if name == "prdt" or (INTERP_RE.match(name) and ops and os.path.basename(ops[0]) == "prdt"):
            # T-834: `prdt track open|land|drop` writes or removes the record —
            # PO acts (contracts/git.md); a worker may still run `review`.
            pa = [a for a in (args if name == "prdt" else args[args.index(ops[0]) + 1:]) if not a.startswith("-")]
            if len(pa) >= 2 and pa[0] == "track" and pa[1] in ("open", "land", "drop") and same_home(env):
                deny_tracks(tracks_abs, f"Bash prdt track {pa[1]} (a PO command)")
        if name == "tee":
            for a in ops:
                check(a, "Bash tee")
        elif name in ("rm", "rmdir", "mkdir", "touch", "truncate", "unlink", "shred"):
            for j, a in enumerate(args):
                if a.startswith("-"):
                    continue
                if name == "truncate" and j > 0 and args[j - 1] in ("-s", "--size", "-r", "--reference"):
                    continue
                check(a, f"Bash {name}", removal=name in REMOVERS)
        elif name in ("chmod", "chown", "chgrp"):
            for a in ops[1:]:
                check(a, f"Bash {name}")
        elif name in ("cp", "mv", "install", "ln", "rsync", "ditto"):
            dest, uses_target_flag = None, False
            for j, a in enumerate(args):
                if a in ("-t", "--target-directory") and j + 1 < len(args):
                    dest, uses_target_flag = args[j + 1], True
                elif a.startswith("--target-directory="):
                    dest, uses_target_flag = a.split("=", 1)[1], True
            if dest is None and len(ops) >= 2:
                dest = ops[-1]
            if dest is not None:
                # T-834 grill [D]: a destination DIRECTORY holding run/tracks
                # (run/, $PRDT_HOME) receives a copied-in tracks/ tree
                check(dest, f"Bash {name}", removal=name != "ln")
            if name == "mv":
                # T-783: mv also WRITES its source (removes it) — a worker
                # moving a file OUT of the shared checkout is still a write
                srcs = ops if uses_target_flag else ops[:-1]
                for s in srcs:
                    check(s, "Bash mv (source)", removal=True)
        elif name in ("sed", "gsed", "perl"):
            # T-783: perl's arg-taking flags (-m/-M module, -I include path, …)
            # swallow the rest of that token as their OWN argument — a plain
            # substring scan for "i" false-positives on e.g. "-mdiagnostics"
            PERL_ARG_LETTERS = set("0CDFIMmSVx")

            def has_inplace_flag(a):
                if not (a.startswith("-") and not a.startswith("--")):
                    return False
                for ch in a[1:]:
                    if ch == "i":
                        return True
                    if name == "perl" and ch in PERL_ARG_LETTERS:
                        return False
                return False

            inplace = any(a == "--in-place" or a.startswith("--in-place=") or has_inplace_flag(a) for a in args)
            if inplace:
                script_given = False
                j = 0
                files = []
                while j < len(args):
                    a = args[j]
                    if a in ("-e", "-f", "--expression", "--file"):
                        script_given = True
                        j += 2
                        continue
                    if a.startswith("-"):
                        if name == "perl" and a.endswith("e") and not a.startswith("--"):
                            script_given = True
                            j += 2
                            continue
                        j += 1
                        continue
                    files.append(a)
                    j += 1
                if not script_given and files:
                    files = files[1:]
                for a in files:
                    check(a, f"Bash {name} -i")
        elif name == "find":
            # T-783: `find DIR … -delete` removes matches under DIR in place
            paths = []
            for a in args:
                if a.startswith("-"):
                    break
                paths.append(a)
            if "-delete" in args:
                for p in paths:
                    check(p, "Bash find -delete", removal=True)
        elif name == "dd":
            for a in args:
                if a.startswith("of="):
                    check(a[3:], "Bash dd of=")
        elif name == "curl":
            j = 0
            while j < len(args):
                a = args[j]
                if a in ("-o", "--output") and j + 1 < len(args):
                    check(args[j + 1], "Bash curl -o")
                    j += 2
                    continue
                if a.startswith("--output="):
                    check(a.split("=", 1)[1], "Bash curl -o")
                j += 1
        elif name == "tar":
            # T-786 (F5): -C/--directory is a write target only in an
            # extract/append mode — a plain create (-c) only READS that
            # directory, same as `cat`, and stays silent.
            TAR_WRITE_LONG = {"--extract", "--get", "--append", "--update", "--concatenate", "--catenate"}
            write = any(
                (a.startswith("--") and a in TAR_WRITE_LONG)
                or (a.startswith("-") and not a.startswith("--") and a != "-" and any(ch in a[1:] for ch in "xruA"))
                for a in args
            )
            if write:
                j = 0
                while j < len(args):
                    a = args[j]
                    if a in ("-C", "--directory") and j + 1 < len(args):
                        check(args[j + 1], "Bash tar -C", removal=True)
                        j += 2
                        continue
                    if a.startswith("--directory="):
                        check(a.split("=", 1)[1], "Bash tar -C", removal=True)
                    j += 1
        elif name == "patch":
            j = 0
            while j < len(args):
                a = args[j]
                if a in ("-d", "--directory") and j + 1 < len(args):
                    check(args[j + 1], "Bash patch -d")
                    j += 2
                    continue
                if a.startswith("--directory="):
                    check(a.split("=", 1)[1], "Bash patch -d")
                j += 1
        elif name == "unzip":
            j = 0
            while j < len(args):
                a = args[j]
                if a == "-d" and j + 1 < len(args):
                    check(args[j + 1], "Bash unzip -d", removal=True)
                    j += 2
                    continue
                j += 1
        elif name == "npm":
            j = 0
            while j < len(args):
                a = args[j]
                if a == "--prefix" and j + 1 < len(args):
                    check(args[j + 1], "Bash npm --prefix")
                    j += 2
                    continue
                if a.startswith("--prefix="):
                    check(a.split("=", 1)[1], "Bash npm --prefix")
                j += 1
        elif name == "git":
            repo, j = ecwd, 0
            while j < len(args) and args[j].startswith("-"):
                a = args[j]
                if a == "-C" and j + 1 < len(args):
                    d = os.path.expanduser(args[j + 1])
                    repo = d if d.startswith("/") else (os.path.join(repo, d) if repo else None)
                    j += 2
                    continue
                if a == "--work-tree" and j + 1 < len(args):
                    d = os.path.expanduser(args[j + 1])
                    repo = d if d.startswith("/") else (os.path.join(repo, d) if repo else None)
                    j += 2
                    continue
                if a.startswith("--work-tree="):
                    d = os.path.expanduser(a.split("=", 1)[1])
                    repo = d if d.startswith("/") else (os.path.join(repo, d) if repo else None)
                    j += 1
                    continue
                j += 2 if a in ("-c", "--git-dir") else 1
            sub = args[j] if j < len(args) else ""
            if sub == "stash" and j + 1 < len(args) and args[j + 1] in ("list", "show"):
                sub = ""
            if sub in GIT_MUT and repo and guard_co:
                rp = os.path.realpath(repo)
                if under_ci(rp, code_abs) and not under_ci(rp, wt_abs) and not (legacy and any(
                        under_ci(rp, os.path.join(root, x)) for x in ("docs", ".prdt", "tracks"))):
                    deny(rp, f"Bash git {sub} in the shared checkout")


run_command(cmd, cwd, 0, {}, {})
out_open()
PYEOF
exit 0
