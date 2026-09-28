#!/usr/bin/env bash
# prdt — worktree guard (T-779). Registered (hook-manifest.json) on PreToolUse,
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
# Fails OPEN everywhere: python3 missing, unparsable JSON, no project, an
# unreadable config — exit 0, no output.

set +e
LC_ALL=C
IFS= read -r -d '' EV 2>/dev/null
[ -n "$EV" ] || exit 0

# fork-0 pre-filter: only a developer / qa worker's event can ever be denied.
case "$EV" in
  *'"agent_type":"prdt-developer"'*|*'"agent_type": "prdt-developer"'*|*'"agent_type":"prdt-qa"'*|*'"agent_type": "prdt-qa"'*) ;;
  *) exit 0 ;;
esac
command -v python3 >/dev/null 2>&1 || exit 0

PRDT_EVENT_JSON="$EV" python3 - <<'PYEOF'
import hashlib, json, os, shlex, sys

def out_open():
    sys.exit(0)

try:
    ev = json.loads(os.environ.get("PRDT_EVENT_JSON", ""))
except Exception:
    out_open()
if not isinstance(ev, dict):
    out_open()

# Structural: only TOP-LEVEL members identify the worker (a forged key nested
# in tool_input passed the bash pre-filter, never this).
atype, aid = ev.get("agent_type"), ev.get("agent_id")
if atype not in ("prdt-developer", "prdt-qa") or not isinstance(aid, str) or not aid or "/" in aid:
    out_open()
tool = ev.get("tool_name")
tin = ev.get("tool_input") if isinstance(ev.get("tool_input"), dict) else {}
if tool not in ("Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"):
    out_open()
cwd = ev.get("cwd") if isinstance(ev.get("cwd"), str) and ev.get("cwd").startswith("/") else None

prdt_home = os.environ.get("PRDT_HOME") or os.path.expanduser("~/.prdt")


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
    out_open()


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


root = None
if wt.startswith("/"):
    root = find_root(wt)
if not root and cwd:
    root = find_root(cwd)
if not root and marker and isinstance(marker.get("project_root"), str):
    root = find_root(marker["project_root"])
if not root:
    out_open()

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
legacy = code_abs == root
if wt_abs == code_abs:
    out_open()  # its "worktree" IS the shared checkout: nothing to guard


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
    if not isinstance(path, str) or not path:
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
    lines, out, pend = s.split("\n"), [], []
    for ln in lines:
        if pend:
            if ln.strip() == pend[0]:
                pend.pop(0)
            continue
        kept, words = scan_line(ln)
        out.append(kept)
        pend.extend(words)
    return "\n".join(out)


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


def strip_prefixes(words):
    """Pop leading keywords / assignments / wrapper-and-its-flags, in any
    combination (T-783: `then sudo rm …`), until the command word is first."""
    changed = True
    while changed and words:
        changed = False
        if words[0] in KEYWORDS:
            words.pop(0)
            changed = True
            continue
        if "=" in words[0] and not words[0].startswith("=") and words[0].split("=", 1)[0].isidentifier():
            words.pop(0)
            changed = True
            continue
        if words[0] in WRAPPERS:
            words.pop(0)
            while words and words[0].startswith("-") and words[0] != "-":
                words.pop(0)
            changed = True
            continue
    return words


def run_command(raw_cmd, base_cwd, depth):
    if depth > MAX_SUBSHELL_DEPTH or not isinstance(raw_cmd, str):
        return
    text = strip_heredocs(raw_cmd).replace("\\\n", " ").replace("\n", " ; ")
    toks = tokens(text)
    if toks is None:
        return

    # group into simple commands; "(" / ")" become their own marker segments
    # so a subshell's `cd` (T-783: `(cd code) ; touch rel.txt`) scopes to it
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

    def check(path, how, base=None):
        rp = shared(path, base if base is not None else ecwd)
        if rp:
            deny(rp, how)

    for seg in segs:
        if seg == ["("]:
            paren_stack.append(ecwd)
            continue
        if seg == [")"]:
            if paren_stack:
                ecwd = paren_stack.pop()
            continue
        if seg and seg[0] == "[[":
            # `[[ … ]]`: `>` / `<` inside are string comparisons, not
            # redirects (T-783: `[[ "a" > "b" ]]` is not a write to "b")
            continue
        words, i = [], 0
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
            if t in ("<", "<<", "<<<"):
                i += 2
                continue
            words.append(t)
            i += 1
        words = strip_prefixes(words)
        if words and os.path.basename(words[0]) == "xargs":
            words.pop(0)
            while words and words[0].startswith("-") and words[0] != "-":
                f = words[0]
                if f in XARGS_VALUE_FLAGS and len(words) > 1:
                    words.pop(0)
                    words.pop(0)
                else:
                    words.pop(0)
            words = strip_prefixes(words)
        if not words:
            continue
        name, args = os.path.basename(words[0]), words[1:]
        ops = [a for a in args if not a.startswith("-")]
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
        if name in ("bash", "sh", "zsh") and "-c" in args:
            ci = args.index("-c")
            if ci + 1 < len(args):
                run_command(args[ci + 1], ecwd, depth + 1)
            continue
        if name == "eval":
            # T-786 (F5): `eval "echo x > code/a"` hides its redirect inside a
            # single quoted token, invisible to the outer redirect scan —
            # recurse into the reassembled body like `bash -c` does.
            if args:
                run_command(" ".join(args), ecwd, depth + 1)
            continue
        if name == "tee":
            for a in ops:
                check(a, "Bash tee")
        elif name in ("rm", "rmdir", "mkdir", "touch", "truncate", "unlink", "shred"):
            for j, a in enumerate(args):
                if a.startswith("-"):
                    continue
                if name == "truncate" and j > 0 and args[j - 1] in ("-s", "--size", "-r", "--reference"):
                    continue
                check(a, f"Bash {name}")
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
                check(dest, f"Bash {name}")
            if name == "mv":
                # T-783: mv also WRITES its source (removes it) — a worker
                # moving a file OUT of the shared checkout is still a write
                srcs = ops if uses_target_flag else ops[:-1]
                for s in srcs:
                    check(s, "Bash mv (source)")
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
                    check(p, "Bash find -delete")
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
                        check(args[j + 1], "Bash tar -C")
                        j += 2
                        continue
                    if a.startswith("--directory="):
                        check(a.split("=", 1)[1], "Bash tar -C")
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
                    check(args[j + 1], "Bash unzip -d")
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
            if sub in GIT_MUT and repo:
                rp = os.path.realpath(repo)
                if under_ci(rp, code_abs) and not under_ci(rp, wt_abs) and not (legacy and any(
                        under_ci(rp, os.path.join(root, x)) for x in ("docs", ".prdt", "tracks"))):
                    deny(rp, f"Bash git {sub} in the shared checkout")


run_command(cmd, cwd, 0)
out_open()
PYEOF
exit 0
