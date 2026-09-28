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
#   dropped) and each is judged by shape: redirect targets (`>` `>>` `&>` `N>`),
#   `tee` files, `sed -i` / `perl -i` files, `cp` `mv` `install` `ln` `rsync`
#   destinations (last operand, or `-t DIR`), `rm` `rmdir` `mkdir` `touch`
#   `truncate` `unlink` `chmod` `chown` operands, and a mutating `git`
#   subcommand run in the shared checkout (`-C DIR` or the effective cwd). A
#   `cd DIR` earlier in the same command moves the effective cwd. An
#   interpreter writing a file from inside its own source (python -c, node -e)
#   is NOT recognised — accepted gap, named in the ticket's acceptance wording.
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


def shared(path, base):
    """The realpath of `path` if it is a guarded shared-checkout path, else None."""
    if not isinstance(path, str) or not path:
        return None
    path = os.path.expanduser(path)
    if not path.startswith("/"):
        if not base:
            return None
        path = os.path.join(base, path)
    rp = os.path.realpath(path)
    if not under(rp, code_abs) or under(rp, wt_abs):
        return None
    if legacy and any(under(rp, os.path.join(root, x)) for x in ("docs", ".prdt", "tracks")):
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

SEPS = {";", "&&", "||", "|", "&", "|&", "\n", "(", ")", "{", "}"}
REDIR = (">>", ">|", "&>>", "&>", ">")
WRAPPERS = {"sudo", "command", "time", "nice", "nohup", "env", "exec", "builtin"}
# subcommands that change the checkout's index or working tree (a ref-only or
# read-only one — log, status, diff, branch, fetch, worktree — stays silent)
GIT_MUT = {"add", "commit", "checkout", "switch", "reset", "restore", "stash", "merge", "rebase",
           "apply", "am", "cherry-pick", "revert", "rm", "mv", "clean", "pull"}


def strip_heredocs(s):
    lines, out, pend = s.split("\n"), [], []
    for ln in lines:
        if pend:
            if ln.strip() == pend[0]:
                pend.pop(0)
            continue
        out.append(ln)
        i = 0
        while True:
            j = ln.find("<<", i)
            if j < 0:
                break
            k = j + 2
            if k < len(ln) and ln[k] == "<":  # here-string <<<
                i = k + 1
                continue
            if k < len(ln) and ln[k] == "-":
                k += 1
            while k < len(ln) and ln[k] == " ":
                k += 1
            w = ""
            while k < len(ln) and ln[k] not in " ;&|)<>":
                w += ln[k]
                k += 1
            w = w.strip("'\"\\")
            if w:
                pend.append(w)
            i = k
    return "\n".join(out)


def tokens(s):
    lx = shlex.shlex(s, posix=True, punctuation_chars=";&|()<>")
    lx.whitespace = " \t\r"
    lx.whitespace_split = True
    lx.commenters = "#"
    out = []
    try:
        for t in lx:
            out.append(t)
    except ValueError:
        return None
    return out


text = strip_heredocs(cmd).replace("\\\n", " ").replace("\n", " ; ")
toks = tokens(text)
if toks is None:
    out_open()

# group into simple commands, splitting glued punctuation tokens like "&&" / ">>"
segs, cur = [], []
for t in toks:
    if t in SEPS or (t and set(t) <= set(";&|()") and not set(t) & set("<>")):
        if cur:
            segs.append(cur)
        cur = []
    else:
        cur.append(t)
if cur:
    segs.append(cur)

ecwd = cwd


def check(path, how, base=None):
    rp = shared(path, base or ecwd)
    if rp:
        deny(rp, how)


for seg in segs:
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
    while words and "=" in words[0] and not words[0].startswith("=") and words[0].split("=")[0].isidentifier():
        words.pop(0)
    while words and words[0] in WRAPPERS:
        words.pop(0)
        while words and words[0].startswith("-"):
            words.pop(0)
    if not words:
        continue
    name, args = os.path.basename(words[0]), words[1:]
    ops = [a for a in args if not a.startswith("-")]
    if name == "cd":
        if ops:
            nd = os.path.expanduser(ops[0])
            ecwd = nd if nd.startswith("/") else (os.path.join(ecwd, nd) if ecwd else None)
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
        dest = None
        for j, a in enumerate(args):
            if a in ("-t", "--target-directory") and j + 1 < len(args):
                dest = args[j + 1]
            elif a.startswith("--target-directory="):
                dest = a.split("=", 1)[1]
        if dest is None and len(ops) >= 2:
            dest = ops[-1]
        if dest is not None:
            check(dest, f"Bash {name}")
    elif name in ("sed", "gsed", "perl"):
        inplace = any(a == "--in-place" or a.startswith("--in-place=") or
                      (a.startswith("-") and not a.startswith("--") and "i" in a[1:]) for a in args)
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
    elif name == "git":
        repo, j = ecwd, 0
        while j < len(args) and args[j].startswith("-"):
            if args[j] == "-C" and j + 1 < len(args):
                d = os.path.expanduser(args[j + 1])
                repo = d if d.startswith("/") else (os.path.join(repo, d) if repo else None)
                j += 2
                continue
            j += 2 if args[j] in ("-c", "--git-dir", "--work-tree") else 1
        sub = args[j] if j < len(args) else ""
        if sub == "stash" and j + 1 < len(args) and args[j + 1] in ("list", "show"):
            sub = ""
        if sub in GIT_MUT and repo:
            rp = os.path.realpath(repo)
            if under(rp, code_abs) and not under(rp, wt_abs) and not (legacy and any(
                    under(rp, os.path.join(root, x)) for x in ("docs", ".prdt", "tracks"))):
                deny(rp, f"Bash git {sub} in the shared checkout")
out_open()
PYEOF
exit 0
