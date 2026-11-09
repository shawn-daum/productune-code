#!/usr/bin/env bash
# prdt — unticketed-question check (T-985; where to enforce: T-986 = B).
# Registered on Stop (matcher-less: Stop takes none) and on PostToolUse (matcher
# `Bash`). Acts for the PO only (`agent_type` == `prdt-po`); every other event —
# a worker, a plain session — exits silently.
#
# POSTTOOLUSE FIRST, STOP LAST (T-1389; the language check's pattern, T-1307).
# The PO checks its reply draft with `prdt wordlist check … -` before sending it
# (the `[prdt reply]` hot line asks for that on every tool call). On the
# PostToolUse of that Bash call this hook runs the same checks below on the DRAFT
# (the heredoc body or the quoted string piped to it) and returns what it finds as
# PostToolUse additionalContext, so the first full reply is written right. Each
# finding (re-ask per record ids, batch per id set, question once) is reported at
# most once per turn (turn = `prompt_id`, else the last prompt record of the
# transcript), recorded in $PRDT_HOME/run/question-check/turns/<session>.json.
# Stop stays the last resort: it judges the FINAL reply as before and blocks only
# when that reply still breaks a check — a reply that complies is never blocked.
#
# WHY. PO habit says an ask whose answer outlives the turn becomes a `type:
# decision` ticket the moment it is raised, but nothing noticed when a PO asked
# the user one without it: the user's answer then never shows in the statusline `dec` and
# gets lost (T-985 §problem, the same class as T-869). The UserPromptSubmit
# register check is a next-turn notice; this one acts at Stop, so the PO opens
# or cites the ticket and re-replies before the turn ends.
#
# WHAT IT DOES. On the PO's final reply of a turn it finds the ASKS — the places
# that ask the user to choose, approve or confirm something whose answer must
# outlive the turn — and blocks the stop ONCE when an ask has no ticket behind it.
# The criterion is the answer's lifetime, not the sentence's shape (T-1474 = A,
# wording T-1476 = A, reversing T-993 = B): scope, direction, a standing rule, a
# choice costly to reverse, approving what real users will see or injected
# instruction text, reversing a recorded decision, an action needing the user's
# consent (install, push, deploy, delete) and a read-back of the user's request
# need a ticket. A pick, approval or confirm whose answer serves only the work at
# hand (one value such as a date or a name, how to carry out a settled direction,
# an easily reversed pick, a confirm only to continue) does not, options and a
# recommendation included (ntf-pm T-1068's 「Slack 복사본 날짜」 pick). Neither do
# a proceed-confirm (T-1465: `지금 Define을 시작할까요?`), an offer (`열어 드릴까요?`),
# an information request (`알려 주시겠어요?`, a `…되나요?` fact question) or a
# feedback or closing question (`어떠셨어요?`).
#
# A MODEL JUDGES WHICH LINES ARE ASKS (T-1379, decision T-1380 = D). Three rounds
# of sentence patterns traded missed asks for false blocks (「팀장님이 어떻게 할지
# 알려 주세요」 vs 「사용자가 볼 화면을 A 와 B 중 어느 쪽으로 할지 알려 주세요」), so
# the reply goes, line-numbered, to a small model (`claude -p --model haiku`, no
# tools, no settings, no session record) with JUDGE_SYSTEM_PROMPT, and its answer
# is the list of ask line numbers. The judge prompt goes to that separate call
# only, never into the PO's input. Everything after it stays deterministic: each
# judged line gets its kind from the reply's own structure —
#   waiting     a top-level list item under a "waiting for your answer" heading
#               (`답 기다리는 것`, `결정 대기`, `Waiting on you`);
#   options     an option line (`A  초안대로`, `- **A** …`, `| A … |`);
#   question    any other line; it names an option when it carries an option
#               letter (`A와 B 중…`).
# WHO PAYS. Only a PO Stop that could block calls the model: the fork-0 `case`
# drops every other Stop before python3 starts, and a PO Stop after a decision
# ticket changed this turn calls it only when the reply cites a ticket the
# re-ask or batch-ask check could act on (judge_needed).
# ONE DETERMINISTIC FORM BESIDE THE JUDGE (T-1428, narrowed by T-1477): a confirm
# request on a body (CONFIRM_ASK_RE: 「이대로 괜찮으면 … 답해 주세요」, 「이 문구로
# 괜찮은지 … 알려 주세요」) goes through the same durable-answer judgment: when the
# judge answers, it is an ask only if the judge named it (a body confirm used only
# for the work at hand is not). Only a failed judge leaves it an ask on its own.
# THE JUDGE FAILS OPEN, VISIBLY. No `claude` on PATH, a timeout (JUDGE_TIMEOUT_S),
# a non-zero exit, an error result (no auth) or an unreadable answer → no asks,
# no block, and one line in $PRDT_HOME/run/question-check.log (also stderr,
# which the harness shows in its debug log). Every call, failed or not, logs
# its outcome and duration there.
# An ask is COVERED when the reply cites an OPEN `type: decision` ticket for it:
#   options, and a question/pick that names an option letter (`A와 B 중…`),
#     → any open decision id anywhere in the reply (the options belong to the
#       ticket the reply is presenting);
#   a list item (question or waiting item) → an id in that item (its line plus
#     its indented sub-lines) — a waiting list that cites T-974 does not cover
#     the item next to it that cites nothing (fixture: the 「이 기기에 설치」 reply);
#   any other line → an id in its section (heading to next heading).
# A waiting item also counts an open `assignee: user` ticket (statusline `req`).
# A non-option ask also counts, in the same scope, an open `type: impl` / `design`
# ticket still awaiting its request read-back (T-1477): user-started (a user quote
# in `## problem`) with no quote under `### 확인` yet — the places the dispatch gate
# reads. The answer is recorded there, so no separate decision ticket. A work
# ticket already confirmed, or never user-started, covers nothing: an install
# question or a standing-rule pick beside it still needs a decision ticket.
# Nothing is checked when a `type: decision` ticket file was created or modified
# during the turn (mtime at or after the turn's user prompt, read from the
# transcript) — T-985 acceptance, literally.
#
# BATCH ASK (T-1364 = C). Before that exemption, a reply whose asks carry
# BATCH_ASK_MIN (4) or more distinct open decision ids — each id inside an
# ask's own item or section, an item's section heading line included (T-1426:
# `**N. title (T-nnn)**` above its option items); an id cited with no ask beside
# it is not counted — is blocked once, so the PO asks one screen-changing item
# at a time.
#
# RE-ASK (T-1285; subject by meaning, T-1470 = T-1469 A). Also before that
# exemption, an ask that asks the user again a decision already answered is
# blocked once. WHICH decision an ask is about is the judge's call, never the
# position of an id: when the reply cites decision tickets closed before this
# turn whose answer `prdt decisions find` holds (answered, not reversed), the
# same judge call also gets each one's question (title, `## problem`,
# `## options`) and recorded answer (`## outcome`) and names, per ask line, the
# decision it asks again, if any. A citation alone never blocks: a proceed-
# confirm, a new body or a new decision that only cites a record as its ground
# passes (the id-position scope rules of T-1377 / T-1429 / T-1465 are gone —
# each false positive had added one more markdown-layout exception). A failed
# judge names no re-ask.
#
# ONE BLOCK, NEVER TWO. `stop_hook_active` is the harness's own loop guard:
# false on the first Stop, true on the Stop that follows a block. On true this
# hook exits silently, so a re-reply that still asks without a ticket reaches the
# user rather than looping (the same guard prdt-return-check.sh relies on).
#
# THE REASON CARRIES LINE NUMBERS, NEVER REPLY TEXT. Same discipline as the
# register check: the PO gets which lines, not its own words echoed back.
# WORDING: the three reasons + DRAFT_TAIL / SENT_TAIL are the user-confirmed T-1390 wording (T-1425 = A).
#
# TICKET IDS ARE PLUGGABLE. DECISION_ID_PREFIXES / TICKET_DIRS name what counts
# as a citable record (`T-NNN` under docs/tickets today; T-996 = C moves
# decisions to their own `D-NNN` records later — add the prefix and its dir).
#
# FAILS OPEN. No project (`.prdt/po-state.json` on the cwd chain), an unreadable
# transcript, malformed JSON, a missing python3, an unreadable tickets dir, a
# run past RUN_BUDGET_S seconds — each exits 0 with no output. A cited ticket id
# whose file cannot be read, or is not a regular file (a FIFO is never opened),
# counts as covering its ask. A Stop hook must never strand a session.
#
# TRANSCRIPT BUDGET. The turn start is searched for in the last TAIL_MAX bytes
# of the transcript. When the turn's prompt lies further back, the reply is
# still checked, and the oldest record time inside that window stands in for
# the turn start (so a decision ticket changed earlier in a very long turn may
# not exempt it — the stated limit).
#
# DEFAULT ON (T-1260; user approval T-1245 1, reverses T-996/T-1001/T-1003).
# Decision tickets stay, and a PO ask with no open decision ticket blocks once.
# `PRDT_QUESTION_CHECK=off` in the hook's environment disables it; any other
# value or none = on.
#
# THE EVENT REACHES PYTHON ON STDIN, NEVER THROUGH AN ENVIRONMENT VARIABLE
# (T-688 개정 1: a large `last_assistant_message` in execve's environment hits
# ARG_MAX and silently skips the hook). `printf` is a bash builtin, so piping the
# captured event through it never execs with the payload as an argument.

set +e
EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0
# Fork-0 pre-filter: every non-PO Stop leaves here before python3 starts.
case "$EVENT_JSON" in
  *'"prdt-po"'*) ;;
  *) exit 0 ;;
esac
# T-1389: a PostToolUse leaves here unless it can carry a reply draft.
case "$EVENT_JSON" in
  *'"PostToolUse"'*) case "$EVENT_JSON" in *'wordlist'*) ;; *) exit 0 ;; esac ;;
esac
[ "${PRDT_QUESTION_CHECK:-on}" != "off" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0
printf '%s' "$EVENT_JSON" | python3 -I -c "$(sed -n '/^# ---- python ----$/,$p' "$0" | sed '$d')"
exit 0
# The heredoc below is never executed (`exit 0` above): it only keeps the python
# body out of bash's parser, so `bash -n` still reads this file end to end.
: <<'PYEOF'
# ---- python ----
import hashlib, json, os, re, shutil, signal, stat, subprocess, sys, tempfile, time
from datetime import datetime

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
    if not _PROD_NAME_RE.match(k):
        return "product"
    # T-1215: layout-reserved names (PRODUCT_RESERVED_NAMES in prdt_lanes.py) get a suffix
    return k + "-product" if k in ("prd", "tickets", "artifacts", "wiki", "features", "archive", "po", "designer", "developer", "qa") else k


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


# Wording: T-990 = A (2026-10-06); re-send clause T-1302 (inject-edit); criterion clause T-1476 = A (draft 3).
# %s = the uncovered asks' line numbers ("3, 12").
QUESTION_CHECK_REASON = (
    "[prdt question check] line %s asks the user a decision whose answer must outlive the turn (PO habit "
    "Triage) with no open `type: decision` id beside it. Open one per ask "
    "(a waiting item: `assignee: user` counts; a body to confirm goes in it, numbered) and cite its id beside the ask."
)
# T-1116: the language clause (since T-1390 inside SENT_TAIL, Stop only; wording settled
# under the discipline-wording module, T-1245). %s = the stored chat language; empty when none is known.
QUESTION_CHECK_LANG_CLAUSE = " in lang=%s"
# T-1390 (T-1425 = A): the one closing line per output — the draft is fixed before it
# is sent (PostToolUse; the `[prdt reply]` line of that moment carries the language),
# the sent reply stays and only the fix is sent (Stop; %s = the language clause).
DRAFT_TAIL = "Fix the draft before you send it."
SENT_TAIL = "The sent reply stays: send only the fix%s, never the reply again."

# T-1281: the stored chat language only — never the device language.
USER_LANG_RE = re.compile(r"\A[a-z]{2,3}\Z")


def stored_user_lang():
    home = os.environ.get("PRDT_HOME") or os.path.join(os.path.expanduser("~"), ".prdt")
    try:
        with open(os.path.join(home, "user-lang"), encoding="utf-8", errors="replace") as f:
            v = "".join(f.read(64).split())
    except OSError:
        v = ""
    return v if USER_LANG_RE.match(v) else None


def lang_clause():
    if not QUESTION_CHECK_LANG_CLAUSE:
        return ""
    lang = stored_user_lang()  # T-1281: stored only
    return QUESTION_CHECK_LANG_CLAUSE % lang if lang else ""
LIST_CAP = 5
RUN_BUDGET_S = 5

# T-1285 (mechanism T-1313 = A): an ask beside a decision the user already
# answered. Wording: T-1365 = A (Designer inject-edit, 2026-11-02;
# docs/productune/artifacts/v1.16/lane-records-build-entry-step.md §B To-Be).
# %s = line numbers, record ids, language clause.
REASK_REASON = (
    "[prdt re-ask check] line %s asks again a decision already answered: %s (`prdt decisions find <id>`). "
    "Act on the recorded answer and cite it; a ticket opened this turn for that ask → `dropped` naming the "
    "record. Ask again only when the record is stale or conflicting, its state changed, or a consent gate "
    "needs live words — say which."
)
# T-1285 (2) / T-1364 = C: one reply whose asks carry this many distinct OPEN
# decision ids (each id inside an ask's own item or section) is blocked once.
# T-1367 = A (user-approved wording). %s = count, ids, language clause.
BATCH_ASK_MIN = 4
BATCH_ASK_REASON = (
    "[prdt batch-ask check] %s open decisions asked at once (%s). Ask the one screen-changing decision, "
    "wording-only ones in one table; the rest stay open, cited by id, no ask."
)
DECISIONS_FIND_TIMEOUT_S = 3

# What counts as a citable record id, and where its files live (T-996 = C:
# decisions later get their own `D-NNN` records — add "D" and its dir here).
DECISION_ID_PREFIXES = ("T",)
# T-1477: the work tickets whose id covers a read-back confirm of the request they record.
WORK_TICKET_TYPES = ("impl", "design")
_PFX = "|".join(re.escape(p) for p in DECISION_ID_PREFIXES)
TICKET_ID_RE = re.compile(r"(?<![A-Za-z0-9])((?:%s)-(?:[BCDFGHJKLMNPQRSTVWXYZ]{1,8}-)?\d{1,6})(?!\d)" % _PFX)
TICKET_FILE_RE = re.compile(r"^(?:%s)-(?:[BCDFGHJKLMNPQRSTVWXYZ]{1,8}-)?\d{1,6}\.md$" % _PFX)
FENCE_RE = re.compile(r"^\s*(?:`{3,}|~{3,})")
HEADING_RE = re.compile(r"^\s*(?:#{1,6}\s+\S|\*\*[^*].*\*\*\s*:?\s*$)")
WAITING_HEADING_RE = re.compile(
    r"답\s*(?:을\s*)?기다리|결정\s*대기|waiting\s+(?:on|for)\s+(?:you|your)", re.I)
LIST_ITEM_RE = re.compile(r"^\s*(?:[-*+•]|\d{1,3}[.)])\s+\S")
# An option line: optional list/table/bold lead, ONE capital letter A–H
# (optionally 안 / bold-closed), then end, whitespace, or ) . : — -.
OPTION_LINE_RE = re.compile(
    r"^\s*(?:[-*+•]\s+|\|\s*)?(?:\*\*)?([A-H])(?:안)?(?:\*\*)?(?=$|[\s).:—-])")
# Spans whose `?` is not an ask: inline code and quoted text.
QUOTED_RE = re.compile(
    r"`[^`\n]*`|\*\"[^\"\n]*\"\*|\"[^\"\n]*\"|“[^”\n]*”|「[^」\n]*」|『[^』\n]*』|‘[^’\n]*’")
OPTION_REF_RE = re.compile(r"(?<![A-Za-z0-9])[A-H](?:안)?(?=$|[\s·,와과로중를을이가/)])")


def read_event():
    try:
        raw = sys.stdin.read()
        ev = json.loads(raw) if raw.strip() else None
    except Exception:
        return None
    return ev if isinstance(ev, dict) else None


def project_root(cwd):
    # OUTERMOST dir holding .prdt/po-state.json, physical path first (T-484/T-493),
    # the same walk prdt-user-prompt.sh and prdt-post-dispatch.sh make.
    d = os.path.realpath(cwd or os.getcwd())
    root = None
    while d and d != "/":
        if os.path.isfile(os.path.join(d, ".prdt", "po-state.json")):
            root = d
        # T-1112: a track worktree (tracks/T-NNN, .git is a file) is a project boundary
        if (os.path.isfile(os.path.join(d, ".git")) and os.path.basename(os.path.dirname(d)) == "tracks"
                and re.match(r"\AT-(?:[BCDFGHJKLMNPQRSTVWXYZ]{1,8}-)?[0-9]{1,5}\Z", os.path.basename(d))):  # T-1298: T-NNN or T-<PREFIX>-<n>
            root = None
            break
        up = os.path.dirname(d)
        if up == d:
            break
        d = up
    return root


TAIL_CHUNK = 512 * 1024
TAIL_MAX = 8 * 1024 * 1024


def _is_prompt_record(rec):
    if rec.get("type") != "user" or rec.get("isSidechain") is not False:
        return False
    msg = rec.get("message")
    content = msg.get("content") if isinstance(msg, dict) else None
    if isinstance(content, str):
        return bool(content.strip())
    if isinstance(content, list):
        return any(isinstance(b, dict) and b.get("type") == "text" for b in content)
    return False


def _text_of(rec):
    if rec.get("type") != "assistant" or rec.get("isSidechain") is not False:
        return None
    msg = rec.get("message")
    content = msg.get("content") if isinstance(msg, dict) else None
    if not isinstance(content, list):
        return None
    for blk in reversed(content):
        if isinstance(blk, dict) and blk.get("type") == "text" and isinstance(blk.get("text"), str) \
                and blk["text"].strip():
            return blk["text"]
    return None


def _epoch(ts):
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def scan_transcript(path):
    """(turn_start_epoch | None, last main-session assistant text | None), read
    from the END in chunks. turn start = the last main-session user PROMPT record
    (string content or a text block — never a tool_result). No prompt within
    TAIL_MAX → the oldest record time in the window (see TRANSCRIPT BUDGET)."""
    try:
        if not (isinstance(path, str) and os.path.isfile(path)):
            return None, None
        size = os.path.getsize(path)
        if size <= 0:
            return None, None
        total = min(size, TAIL_CHUNK)
        while True:
            with open(path, "rb") as f:
                f.seek(max(0, size - total))
                raw = f.read()
            lines = raw.decode("utf-8", "replace").split("\n")
            if size - total > 0:
                lines = lines[1:]
            last_text = None
            oldest = None
            for jl in reversed(lines):
                jl = jl.strip()
                if not jl:
                    continue
                try:
                    rec = json.loads(jl)
                except Exception:
                    continue
                if not isinstance(rec, dict):
                    continue
                if last_text is None:
                    last_text = _text_of(rec)
                ts = _epoch(rec.get("timestamp"))
                if ts is not None:
                    oldest = ts if oldest is None else min(oldest, ts)
                if _is_prompt_record(rec):
                    return ts, last_text
            if total >= size:
                return None, last_text
            if total >= TAIL_MAX:
                return oldest, last_text
            total = min(total + TAIL_CHUNK, TAIL_MAX, size)
    except Exception:
        return None, None


def ticket_index(root):
    """({id: (type, status, assignee, mtime)}, {ids whose file was unreadable or
    not a regular file}, {id: path}) over tickets_homes (md is SoT); None when a
    tickets dir that exists cannot be listed (fail open)."""
    out, unknown, broken, paths = {}, set(), [], {}
    for _prod, base in tickets_homes(root):   # T-1104: docs/tickets or every product's
        if not os.path.lexists(base):
            continue
        if not os.path.isdir(base) or not os.access(base, os.R_OK | os.X_OK):
            return None
        for d, dirs, files in os.walk(base, onerror=broken.append):
            if d[len(base):].count(os.sep) >= 3:
                dirs[:] = []
            for fn in files:
                if not TICKET_FILE_RE.match(fn):
                    continue
                p = os.path.join(d, fn)
                try:
                    st = os.stat(p)
                    if not stat.S_ISREG(st.st_mode):   # a FIFO would hang open()
                        unknown.add(fn[:-3])
                        continue
                    with open(p, errors="replace") as f:
                        head = f.read(800)
                except OSError:
                    unknown.add(fn[:-3])
                    continue
                fm = head.split("\n---", 1)[0] if head.startswith("---") else ""
                g = lambda k: (re.search(r"^%s:\s*(\S+)" % k, fm, re.M) or [None, None])[1]
                out[fn[:-3]] = (g("type"), g("status"), g("assignee"), st.st_mtime)
                paths[fn[:-3]] = p
    if broken:
        return None
    return out, unknown, paths


# T-1379 (T-1380 = D): the judge. Model-facing text for a separate `claude -p`
# call, never injected into the PO's input. First line, Boundary and DURABLE
# ANSWERS: T-1476 = A draft 2, verbatim (T-1477).
JUDGE_SYSTEM_PROMPT = (
    "You check one chat reply that an AI product owner is about to send to its user, the person it "
    "works for. Find every line where the reply asks THAT USER to decide something whose answer must outlive "
    "this turn (see DURABLE ANSWERS): choose between options, approve a plan, draft, wording or an action "
    "that needs the user's consent, or confirm a read-back the assistant needs before it continues.\n"
    "These are asks, whatever their wording and even when what is decided is meant for other people "
    "(a screen users will see, a mail customers will get):\n"
    "- a question or request whose answer is the user's own choice or approval: 「A 와 B 중 어느 쪽으로 "
    "할지 알려 주세요」, 「이 문구로 괜찮은지 알려 주세요」, 「이대로 괜찮으면 답해 주세요」, 「설치할까요?」, "
    "「승인해 주세요」, 「컨펌해 주세요」, \"Should I ship it?\", \"Is that right?\";\n"
    "- options laid out for the user to pick from (A / B lines with a recommendation): give the first "
    "option line;\n"
    "- each choice or approval listed under a heading saying it waits for the user's answer.\n"
    "These are not asks:\n"
    "- asking the user for a fact or information (an address, a log, whether something works on their "
    "machine, their schedule, a version, how to do something, a name they remember): 「이름이 떠오르시면 "
    "알려 주세요」, 「에러 메시지를 알려 주세요」;\n"
    "- asking the user to look at, try or check something and report what they see: 「화면에 버튼이 "
    "보이는지 봐 주세요」, 「다시 열어서 확인해 주세요」;\n"
    "- telling the user how to do a step: 「거기서 Submit 만 눌러 주시면 돼요」, 「터미널에서 이 명령을 "
    "실행해 주세요」;\n"
    "- asking what someone else (a manager, another team, a customer) decided or will decide, or asking "
    "the user to ask, tell or reply to someone else;\n"
    "- a proceed-confirm: a line only asking whether the assistant should start or continue its OWN next "
    "step inside the work already agreed (「지금 v1.17 Define을 시작할까요?」, 「진행할까요?」, 「이어서 "
    "할까요?」, \"Shall I start the next step?\"). No alternatives are offered and nothing needs the "
    "user's consent. Boundary: it is still an ask when the action needs the user's consent (install, push, "
    "deploy, destructive git, deleting, sending to other people, spending money); one that offers "
    "alternatives or asks approval of a drafted body is judged by DURABLE ANSWERS;\n"
    "- a statement that cites an earlier decision or ticket id (T-1362) to say it is settled, kept, or "
    "will not be asked again (「T-1362 는 다시 묻지 않아요」): it asks nothing, even beside an id;\n"
    "- offers (「열어 드릴까요?」, \"Would you like me to...\"), feedback or closing questions "
    "(「어떠셨어요?」), rhetorical questions;\n"
    "- a question or request that is quoted, reported, given as an example, inside code or a "
    "blockquote;\n"
    "- a status table, report or status line, and what the assistant says it will do or show next "
    "(「다음에 보여 드릴게요」);\n"
    "- an empty line.\n"
    "DURABLE ANSWERS. A line that chooses, approves or confirms is an ask only when later work or a later "
    "session relies on its answer:\n"
    "- scope: what a version or task includes or leaves out, or entering a stage (「v2.6 Build 로 들어갈까요?」);\n"
    "- direction: which approach the product or project takes from here (「커밋 규약을 훅으로 강제할지, 지시 + "
    "측정으로 갈지 골라 주세요」);\n"
    "- a standing rule: a convention, policy or instruction line that governs future work;\n"
    "- a choice costly to reverse: deleting, migrating data, publishing, sending to other people, spending "
    "money, renaming what users already know;\n"
    "- approving what real users will see before it ships (screens, messages, product terms) or a change to "
    "injected instruction text; reversing a recorded decision;\n"
    "- an action that needs the user's consent, and a read-back of the user's request the assistant needs "
    "confirmed before it starts.\n"
    "Any other choose, approve or confirm line is not an ask, options and a recommendation included: its "
    "answer serves only the work at hand and is easy to change later — one value (a date, a name, a number, "
    "a label), how to carry out a direction already settled, a small fix the next step can change, a confirm "
    "only to continue the current task (「휴가 다음 날 Slack 복사본 날짜를 다음 영업일로 할까요, 오늘로 할까요?」, "
    "「테스트를 지금 돌릴까요, 커밋 뒤에 돌릴까요?」, 「파일 이름은 report.html 로 할게요, 괜찮으세요?」). Unsure "
    "whether later work relies on the answer → it is an ask.\n"
    "Lines come as `N| text`. Answer `asks` with the ask line numbers; [] when there is none.\n"
    "RE-ASKS. After the reply the input may list closed decisions the reply cites, each with the question "
    "it settled and the user's recorded answer. For each ask line, decide by meaning whether it asks the "
    "user that same question again: the same choice between the same options, the same yes/no, or whether "
    "to keep or change the recorded answer. Each one goes in `reasks` as {line, id}. Not a re-ask: an ask "
    "that only cites a closed decision as its ground, background or source, such as approval of a new body "
    "or plan built on the recorded answer, a new decision about something that answer did not settle, or a "
    "read-back of the user's newest words. An id cited beside an ask never makes it a re-ask by itself. "
    "When a decision's question is only a short name, judge by the subject the recorded answer settles: an "
    "ask about that same subject, in other words, is a re-ask. Asking the user to confirm the recorded "
    "answer itself (「…하는 게 맞을까요?」 about what is already recorded) is a re-ask too. Not a re-ask, even "
    "on that subject and even when it keeps or changes the recorded answer: a read-back of the user's words "
    "that the record does not hold (「오늘 「…」라고 하신 건, …맞을까요?」). "
    "`reasks` is [] when none, or when no decisions are listed."
)
JUDGE_SCHEMA = ('{"type":"object","properties":{"asks":{"type":"array","items":{"type":"integer"}},'
                '"reasks":{"type":"array","items":{"type":"object","properties":{"line":{"type":"integer"},'
                '"id":{"type":"string"}},"required":["line","id"]}}},"required":["asks","reasks"]}')
JUDGE_MODEL = "haiku"
JUDGE_TIMEOUT_S = 25
JUDGE_HEAD_CHARS = 4000     # a longer reply is sent as its head + tail, line numbers kept
JUDGE_TAIL_CHARS = 16000
JUDGE_LOG = "question-check.log"
JUDGE_LOG_KEEP = 500


def judge_log(msg):
    """One line per judge call in $PRDT_HOME/run/question-check.log (newest
    JUDGE_LOG_KEEP kept) and on stderr. Never raises."""
    line = "%s %s" % (datetime.now().astimezone().isoformat(timespec="seconds"), msg)
    try:
        sys.stderr.write("prdt-question-check: %s\n" % msg)
    except Exception:
        pass
    try:
        home = os.environ.get("PRDT_HOME") or os.path.join(os.path.expanduser("~"), ".prdt")
        d = os.path.join(home, "run")
        os.makedirs(d, exist_ok=True)
        p = os.path.join(d, JUDGE_LOG)
        try:
            with open(p, encoding="utf-8", errors="replace") as f:
                old = f.read().splitlines()[-(JUDGE_LOG_KEEP - 1):]
        except OSError:
            old = []
        with open(p, "w", encoding="utf-8") as f:
            f.write("\n".join(old + [line]) + "\n")
    except Exception:
        pass


def judge_input(lines, briefs=None):
    """The reply as `N| text` lines; past JUDGE_HEAD_CHARS + JUDGE_TAIL_CHARS the
    middle is left out (one `…` line), every kept line keeps its own number.
    T-1470: `briefs` ({id: (question, answer)}) follow the reply, unnumbered."""
    return reply_input(lines) + decisions_input(briefs)


def decisions_input(briefs):
    if not briefs:
        return ""
    ind = lambda t: "\n".join("    " + ln for ln in t.splitlines() if ln.strip()) or "    (none)"
    out = ["", "", "---- closed decisions this reply cites (not part of the reply) ----"]
    for k, (q, a) in briefs.items():
        out += ["[%s]" % k, "  question:", ind(q), "  recorded answer:", ind(a)]
    return "\n".join(out)


def reply_input(lines):
    numbered = ["%d| %s" % (k + 1, ln) for k, ln in enumerate(lines)]
    if sum(len(x) + 1 for x in numbered) <= JUDGE_HEAD_CHARS + JUDGE_TAIL_CHARS:
        return "\n".join(numbered)
    head, n = [], 0
    for x in numbered:
        if JUDGE_HEAD_CHARS < n + len(x) + 1:
            break
        head.append(x)
        n += len(x) + 1
    tail, n = [], 0
    for x in reversed(numbered[len(head):]):
        if JUDGE_TAIL_CHARS < n + len(x) + 1:
            break
        tail.append(x)
        n += len(x) + 1
    return "\n".join(head + ["…"] + list(reversed(tail)))


def _judge_once(cmd, env, text, timeout, cwd):
    """((asks, reasks) | None, failure reason | None, exit code). `reasks` =
    [(line, id)] as the model gave them; a missing or malformed `reasks` reads
    as [] (no re-ask), never as a failed judge."""
    try:
        r = subprocess.run(cmd, input=text, capture_output=True, text=True, env=env, timeout=timeout, cwd=cwd)
    except subprocess.TimeoutExpired:
        return None, "timeout", None
    except Exception as e:
        return None, type(e).__name__, None
    out = None
    try:
        out = json.loads(r.stdout)
        if not isinstance(out, dict) or out.get("is_error"):
            raise ValueError("error-result")
        so = out.get("structured_output")
        nums = so.get("asks") if isinstance(so, dict) else None
        if not isinstance(nums, list) or not all(isinstance(n, int) and not isinstance(n, bool) for n in nums):
            raise ValueError("no-asks-list")
        raw = so.get("reasks")
        reasks = [(x["line"], x["id"].strip()) for x in (raw if isinstance(raw, list) else [])
                  if isinstance(x, dict) and isinstance(x.get("line"), int) and not isinstance(x.get("line"), bool)
                  and isinstance(x.get("id"), str)]
    except Exception as e:
        why = str(e) if isinstance(e, ValueError) and str(e) in ("error-result", "no-asks-list") else "unreadable"
        if isinstance(out, dict):   # the CLI's own status fields, never the reply or a credential
            why += " subtype=%s api_status=%s" % (str(out.get("subtype"))[:40], str(out.get("api_error_status"))[:40])
        return None, why, r.returncode
    return (nums, reasks), None, r.returncode


def judge_asks(lines, briefs=None):
    """(0-based indexes of the lines the model judges asks, [(0-based line, id)]
    of the asks it judges re-asks of a decision in `briefs`); None when the
    judge could not answer (fails open, logged). An error result (seen as an
    intermittent `Not logged in`) is tried once more inside the same
    JUDGE_TIMEOUT_S. The call runs from an empty dir (the CLI lists its cwd)
    with cmux's injected hooks off (CMUX_CLAUDE_HOOKS_DISABLED: the cmux shim
    on PATH otherwise adds its own SessionStart/Stop hooks, ~10 s a call)."""
    cli = shutil.which("claude")
    if not cli:
        judge_log("judge=skip reason=no-claude-cli")
        return None
    cmd = [cli, "-p", "--model", JUDGE_MODEL, "--setting-sources", "", "--tools", "", "--strict-mcp-config",
           "--no-session-persistence", "--disable-slash-commands", "--output-format", "json",
           "--json-schema", JUDGE_SCHEMA, "--system-prompt", JUDGE_SYSTEM_PROMPT]
    env = dict(os.environ, PRDT_QUESTION_CHECK="off", CMUX_CLAUDE_HOOKS_DISABLED="1")
    text = judge_input(lines, briefs)
    t0 = time.monotonic()
    ms = lambda: int((time.monotonic() - t0) * 1000)
    try:
        cwd = tempfile.mkdtemp(prefix="prdt-qc-judge-")
    except OSError as e:
        judge_log("judge=fail reason=no-empty-dir:%s ms=%d" % (type(e).__name__, ms()))
        return None
    try:
        tries = 0
        while True:
            tries += 1
            left = JUDGE_TIMEOUT_S - (time.monotonic() - t0)
            got, why, rc = _judge_once(cmd, env, text, left, cwd)
            if why and why.startswith("error-result") and tries < 2 and JUDGE_TIMEOUT_S - (time.monotonic() - t0) > 3:
                continue
            break
    finally:
        shutil.rmtree(cwd, ignore_errors=True)
    if why:
        judge_log("judge=fail reason=%s exit=%s tries=%d ms=%d" % (why, rc, tries, ms()))
        return None
    nums, reasks = got
    idx = sorted({n - 1 for n in nums if 1 <= n <= len(lines)})
    briefs = briefs or {}
    re_idx = sorted({(n - 1, k) for n, k in reasks if 1 <= n <= len(lines) and k in briefs})
    judge_log("judge=ok asks=%d tries=%d ms=%d decisions=%d reasks=%d" % (len(idx), tries, ms(), len(briefs), len(re_idx)))
    return idx, re_idx


def ask_kinds(lines, idx):
    """[(line_idx, kind, option_ref)] for the judged ask lines — kind ∈
    question|options|waiting, read from the reply's own structure."""
    want = set(idx)
    asks = []
    in_fence = False
    section_waiting = False
    for i, ln in enumerate(lines):
        if FENCE_RE.match(ln):
            in_fence = not in_fence
        elif not in_fence and HEADING_RE.match(ln):
            section_waiting = bool(WAITING_HEADING_RE.search(ln))
        if i not in want or not ln.strip():   # an empty line is never an ask line
            continue
        # a code fence or a blockquote reports or shows text, it asks nothing —
        # except an option line, which counts fenced or not (T-985)
        if (in_fence or FENCE_RE.match(ln) or ln.lstrip().startswith(">")) and not OPTION_LINE_RE.match(ln):
            continue
        if section_waiting and not in_fence and LIST_ITEM_RE.match(ln) and not ln[:1].isspace():
            asks.append((i, "waiting", False))
        elif OPTION_LINE_RE.match(ln):
            asks.append((i, "options", True))
        else:
            asks.append((i, "question", bool(OPTION_REF_RE.search(QUOTED_RE.sub(" ", ln)))))
    return asks


def judge_needed(reply, tickets, turn_start):
    """False when no check could block whatever the judge says: a decision
    ticket changed this turn (question check exempt) and the reply cites no
    decision the re-ask check could act on and fewer than BATCH_ASK_MIN open
    ones — the model call is then skipped."""
    if not any(t == "decision" and mt >= turn_start - 1 for t, _, _, mt in tickets.values()):
        return True
    cited = {m.group(1) for m in TICKET_ID_RE.finditer(reply)}
    dec = [tickets[k] for k in cited if k in tickets and tickets[k][0] == "decision"]
    if any(s == "done" and mt < turn_start - 1 for _, s, _, mt in dec):
        return True
    return sum(1 for _, s, _, _ in dec if s == "open") >= BATCH_ASK_MIN


def section_bounds(lines, i):
    in_fence = False
    heads = []
    for k, ln in enumerate(lines):
        if FENCE_RE.match(ln):
            in_fence = not in_fence
            continue
        if not in_fence and HEADING_RE.match(ln):
            heads.append(k)
    start = max([h for h in heads if h <= i], default=0)
    end = min([h for h in heads if i < h], default=len(lines))
    return start, end


def item_bounds(lines, i):
    start = i
    while start > 0 and lines[start][:1].isspace() and lines[start].strip():
        start -= 1
    end = i + 1
    while end < len(lines) and lines[end].strip() and lines[end][:1].isspace():
        end += 1
    return start, end


def ask_scope(lines, i, kind, option_ref):
    """(start, end) of the lines that speak for one ask: a list item → the item;
    anything else (an option set, a question naming an option) → its section."""
    if kind == "waiting" or LIST_ITEM_RE.match(lines[i]) or lines[i][:1].isspace():
        return item_bounds(lines, i)
    return section_bounds(lines, i)


def prdt_cli():
    p = os.environ.get("PRDT_BIN") or os.path.join(
        os.environ.get("PRDT_HOME") or os.path.join(os.path.expanduser("~"), ".prdt"), "bin", "prdt")
    if os.path.isfile(p) and os.access(p, os.X_OK):
        return p
    return shutil.which("prdt")


def recorded_decisions(root, ids):
    """The ids among `ids` that `prdt decisions find` reports as answered, not
    reversed, closed (T-1313 = A). Any failure → empty (fails open)."""
    cli = prdt_cli()
    if not cli:
        return set()
    try:
        r = subprocess.run([cli, "decisions", "find", *sorted(ids), "--json"], cwd=root, capture_output=True,
                           text=True, timeout=DECISIONS_FIND_TIMEOUT_S, stdin=subprocess.DEVNULL)
        recs = json.loads(r.stdout) if r.returncode == 0 else []
    except Exception:
        return set()
    return {x.get("id") for x in recs if isinstance(x, dict) and x.get("id") in ids and x.get("kind") == "ticket"
            and x.get("status") == "done" and x.get("answered") is True and not x.get("reversed_by")}


# T-1428: a confirm request on a body, read deterministically beside the judge — the
# L1 observation (3) sentences 「이대로 괜찮으면 이 메시지에 답해 주세요」 · 「이 문구로
# 괜찮은지, 고칠 줄이 있는지 알려 주세요」 went unasked when the model missed them. A
# reference to the body (이대로 · 이 문구 · 위 내용 …), then 괜찮/맞/좋 + a condition or
# whether ending, then an answer verb + 주-, all inside one sentence. Matched on the line
# with QUOTED_RE spans blanked; fenced and blockquoted lines are never read.
CONFIRM_ASK_RE = re.compile(
    r"(?:이대로|이렇게|그대로|(?:이|위|아래|위의|아래의)\s*(?:문구|내용|초안|본문|문장|글|안|노트|버전|목록|표|계획))"
    r"[^.?!\n]{0,40}?(?:괜찮|맞|좋)(?:으시면|으면|다면|은지|는지|을지)"
    r"[^.?!\n]{0,60}?(?:답|알려|말씀|회신|승인|컨펌|확정)\s*(?:해\s*)?(?:주세요|주시겠어요|주실래요|주셔도|주시면|줘)"
)


def confirm_ask_lines(lines):
    """T-1428: 0-based indexes of the lines CONFIRM_ASK_RE reads as a confirm request,
    outside fences and blockquotes, quoted spans blanked."""
    out, in_fence = [], False
    for i, ln in enumerate(lines):
        if FENCE_RE.match(ln):
            in_fence = not in_fence
            continue
        if in_fence or ln.lstrip().startswith(">"):
            continue
        if CONFIRM_ASK_RE.search(QUOTED_RE.sub(" ", ln)):
            out.append(i)
    return out


# T-1470: what the judge is told about each closed decision the reply cites.
DECISION_BRIEF_MAX = 6      # decisions per judge call, in the order the reply first cites them
BRIEF_QUESTION_CHARS = 900
BRIEF_ANSWER_CHARS = 500
BRIEF_READ_BYTES = 32768
THIN_QUESTION_NOTE = ("(this record kept no question text, only the name above: the question it settled is "
                      "whatever the recorded answer below answers, and the user's quoted words there show the subject)")


def _md_section(body, name):
    m = re.search(r"^##[ \t]+%s[ \t]*$(.*?)(?=^##[ \t]|\Z)" % re.escape(name), body, re.M | re.S)
    return m.group(1).strip() if m else ""


def _clip(text, n):
    return text if len(text) <= n else text[:n - 1].rstrip() + "…"


def decision_brief(path):
    """(question, recorded answer) of a decision ticket: question = title +
    `## problem` + `## options`, answer = `## outcome` without its empty key
    headings. None when the file cannot be read (that decision is then not
    offered to the judge)."""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read(BRIEF_READ_BYTES)
    except (OSError, TypeError):
        return None
    fm, body = "", text
    if text.startswith("---"):
        fm, _, body = text[3:].partition("\n---")
    t = re.search(r"^title:[ \t]*(.+)$", fm, re.M) or re.search(r"^slug:[ \t]*(.+)$", fm, re.M)
    title = t.group(1).strip().strip("\"'") if t else ""
    has_title = bool(re.search(r"^title:[ \t]*\S", fm, re.M))
    problem, options = _md_section(body, "problem"), _md_section(body, "options")
    q = "\n".join(x for x in (title, problem, options) if x)
    if not has_title and not options:
        # T-1470 QA: a thin record (slug + slug-like problem, no options) states no question,
        # so the judge compared asks with a bare slug. Say what the record is.
        said = re.findall(r"「([^」]+)」", _md_section(body, "outcome"))
        q += "\n" + THIN_QUESTION_NOTE + "".join("\nthe subject, in the user's words: " + w for w in said[:2])
    a = "\n".join(ln for ln in _md_section(body, "outcome").splitlines()
                  if ln.strip() and not ln.lstrip().startswith("#"))
    return _clip(q, BRIEF_QUESTION_CHARS), _clip(a, BRIEF_ANSWER_CHARS)


def closed_briefs(root, reply, tickets, paths, turn_start):
    """T-1470: {id: (question, answer)} of the decision tickets the reply cites
    that closed before this turn with an answer on record (`prdt decisions
    find`: answered, not reversed) — what the judge compares each ask with.
    {} when none, or when the record cannot be read (fails open)."""
    order = []
    for m in TICKET_ID_RE.finditer(reply):
        k = m.group(1)
        t = tickets.get(k)
        if k not in order and t and t[0] == "decision" and t[1] == "done" and t[3] < turn_start - 1:
            order.append(k)
    if not order:
        return {}
    rec = recorded_decisions(root, set(order))
    out = {}
    for k in order:
        if k in rec and len(out) < DECISION_BRIEF_MAX:
            b = decision_brief(paths.get(k))
            if b:
                out[k] = b
    return out


def reask_check(lines, asks, reasks):
    """T-1285 / T-1470: (block reason, asked line numbers, ids) for the ask lines
    the judge named as asking again a recorded decision (`reasks`, already
    limited to the decisions it was given); else (None, set(), []). A judged
    re-ask on a line that is not an ask is dropped. Runs before the
    decision-changed-this-turn exemption: opening a new decision ticket for an
    answered question is the re-ask itself (T-1239 observation 4)."""
    ask_lines = {i for i, _, _ in asks}
    hits = {}
    for i, k in reasks:
        if i in ask_lines:
            hits.setdefault(k, set()).add(i + 1)
    if not hits:
        return None, set(), []
    ln = sorted({n for k in hits for n in hits[k]})
    shown = ", ".join(str(n) for n in ln[:LIST_CAP]) + (", +%d more" % (len(ln) - LIST_CAP) if LIST_CAP < len(ln) else "")
    ids = sorted(hits)
    return REASK_REASON % (shown, ", ".join(ids[:LIST_CAP])), set(ln), ids


def batch_check(lines, asks, tickets):
    """T-1364 = C: the block reason when the asks carry BATCH_ASK_MIN or more
    distinct open decision ids, each counted only inside an ask's own scope
    (an id merely cited elsewhere in the reply is not asked); else None. Runs
    before the decision-changed-this-turn exemption: opening the tickets in the
    same turn is how a batch usually arrives."""
    asked = set()
    for i, kind, option_ref in asks:
        a, b = ask_scope(lines, i, kind, option_ref)
        chunk = lines[a:b]
        # T-1426: an item's ask also speaks for the heading line of its section —
        # `**N. title (T-nnn)**` above `- A …` option items names the decision there.
        h, _ = section_bounds(lines, i)
        if h < a and HEADING_RE.match(lines[h]):
            chunk = [lines[h]] + chunk
        for m in TICKET_ID_RE.finditer("\n".join(chunk)):
            t = tickets.get(m.group(1))
            if t and t[0] == "decision" and t[1] == "open":
                asked.add(m.group(1))
    if len(asked) < BATCH_ASK_MIN:
        return None, []
    ids = sorted(asked)
    shown = ", ".join(ids[:LIST_CAP]) + (", +%d more" % (len(ids) - LIST_CAP) if LIST_CAP < len(ids) else "")
    return BATCH_ASK_REASON % (len(ids), shown), ids


def block(reason):
    sys.stdout.write(json.dumps({"decision": "block", "reason": reason}))


def findings(root, reply, turn_start):
    """[(key, reason)] — every check that applies to `reply`, in block order
    (re-ask, batch-ask, question). `key` names the violation for the once-per-turn
    PostToolUse report (T-1389). [] when nothing applies or anything fails open."""
    idx = ticket_index(root)
    if idx is None:
        return []
    tickets, unknown, paths = idx
    if not judge_needed(reply, tickets, turn_start):
        return []
    lines = reply.split("\n")
    # T-1470: the recorded decisions the reply cites go to the same judge call, which
    # names the asks that ask one of them again. A failed judge → no asks, no re-asks.
    briefs = closed_briefs(root, reply, tickets, paths, turn_start)
    judged = judge_asks(lines, briefs)
    if judged is None:
        # T-1428 / T-1477: a failed judge leaves only the deterministic confirm requests. When the
        # judge answered, a confirm request is an ask only if it named it (DURABLE ANSWERS).
        judged = sorted(confirm_ask_lines(lines)), []
    judged, reasks = judged
    if not judged:
        return []
    asks = ask_kinds(lines, judged)
    # T-1377: every check that applies speaks in the one block, none hides another.
    out = []
    reask, reasked, reask_ids = reask_check(lines, asks, reasks)
    if reask:
        out.append(("reask:" + ",".join(reask_ids), reask))
    batch, batch_ids = batch_check(lines, asks, tickets)
    if batch:
        out.append(("batch:" + ",".join(batch_ids), batch))
    question = question_check(lines, asks, tickets, unknown, turn_start, reply, reasked, paths)
    if question:
        out.append(("question", question))
    return out


# T-1389: the reply draft a `prdt wordlist check … -` Bash call reads on stdin.
WORDLIST_STDIN_RE = re.compile(r"prdt\s+wordlist\s+check\b[^\n|;&]*?\s-(?=\s|$|[;&|)])")
HEREDOC_RE = re.compile(r"<<-?[ \t]*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n(.*?)\n[ \t]*\2[ \t]*(?:\n|$)", re.S)
DQ_RE = re.compile(r'"((?:[^"\\]|\\.)*)"', re.S)
SQ_RE = re.compile(r"'([^']*)'", re.S)


def wordlist_draft(command):
    """The draft text of a `prdt wordlist check … -` command: the longest heredoc
    body, else the longest quoted string (double-quoted escapes undone); None
    when the command is not that check or carries no draft."""
    if not (isinstance(command, str) and WORDLIST_STDIN_RE.search(command)):
        return None
    bodies = [m.group(3) for m in HEREDOC_RE.finditer(command)]
    if not bodies:
        bodies = [re.sub(r'\\([\\"$`])', r"\1", m.group(1)) for m in DQ_RE.finditer(command)]
        bodies += [m.group(1) for m in SQ_RE.finditer(command)]
    bodies = [b for b in bodies if b.strip()]
    return max(bodies, key=len) if bodies else None


def turn_key(ev):
    """The turn this event belongs to: `prompt_id`, else a hash of the last
    main-session prompt record in the transcript tail; None when neither."""
    pid = ev.get("prompt_id")
    if isinstance(pid, str) and pid:
        return "p:" + pid
    try:
        path = ev.get("transcript_path")
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            f.seek(max(0, size - TAIL_MAX))
            raw = f.read().decode("utf-8", "replace").split("\n")
        for jl in reversed(raw):
            jl = jl.strip()
            if not jl:
                continue
            try:
                rec = json.loads(jl)
            except Exception:
                continue
            if isinstance(rec, dict) and _is_prompt_record(rec):
                return "t:" + hashlib.sha256(jl.encode("utf-8")).hexdigest()[:16]
    except Exception:
        return None
    return None


def unreported(ev, keys):
    """T-1389: the keys not yet reported this turn, recorded as reported now.
    No turn known → every key (nothing to dedupe against)."""
    turn = turn_key(ev)
    if turn is None:
        return list(keys)
    sid = re.sub(r"[^A-Za-z0-9_-]", "_", str(ev.get("session_id") or "nosession"))[:80]
    home = os.environ.get("PRDT_HOME") or os.path.join(os.path.expanduser("~"), ".prdt")
    d = os.path.join(home, "run", "question-check", "turns")
    p = os.path.join(d, sid + ".json")
    try:
        with open(p, encoding="utf-8") as f:
            st = json.load(f)
    except (OSError, ValueError):
        st = {}
    sent = st.get("sent") if isinstance(st, dict) and st.get("turn") == turn else None
    sent = [k for k in sent if isinstance(k, str)] if isinstance(sent, list) else []
    new = [k for k in keys if k not in sent]
    if new:
        try:
            os.makedirs(d, exist_ok=True)
            tmp = "%s.tmp%d" % (p, os.getpid())
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({"turn": turn, "sent": sent + new}, f)
            os.replace(tmp, p)
        except OSError:
            pass
    return new


def post_tool_main(ev, root):
    """T-1389: the checks on the draft a `prdt wordlist check -` call read,
    reported once per finding per turn as PostToolUse additionalContext."""
    if ev.get("tool_name") != "Bash":
        return
    ti = ev.get("tool_input")
    draft = wordlist_draft(ti.get("command") if isinstance(ti, dict) else None)
    if not draft:
        return
    turn_start, _ = scan_transcript(ev.get("transcript_path"))
    if turn_start is None:
        return
    found = findings(root, draft, turn_start)
    new = set(unreported(ev, [k for k, _ in found]))
    reasons = [r for k, r in found if k in new]
    if reasons:
        sys.stdout.write(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PostToolUse", "additionalContext": "\n\n".join(reasons) + "\n" + DRAFT_TAIL}}))


def main():
    ev = read_event()
    if ev is None:
        return
    event = ev.get("hook_event_name")
    if event not in ("Stop", "PostToolUse") or ev.get("agent_type") != "prdt-po":
        return
    root = project_root(ev.get("cwd"))
    if not root:
        return
    if event == "PostToolUse":
        post_tool_main(ev, root)
        return
    if ev.get("stop_hook_active") is True:
        return
    turn_start, transcript_text = scan_transcript(ev.get("transcript_path"))
    reply = ev.get("last_assistant_message")
    if not (isinstance(reply, str) and reply.strip()):
        reply = transcript_text
    if not (isinstance(reply, str) and reply.strip()):
        return
    if turn_start is None:
        return
    # Stop is the last resort (T-1389): the final reply is judged in full, and a
    # reply that complies gets no output whatever was reported on PostToolUse.
    reasons = [r for _, r in findings(root, reply, turn_start)]
    if reasons:
        block("\n\n".join(reasons) + "\n" + SENT_TAIL % lang_clause())


def reasked_section(lines, i, reasked):
    """T-1377: True when the ask's own line, or any line of its section, is held
    by the re-ask check — one decision, one instruction: re-ask's."""
    if i + 1 in reasked:
        return True
    a, b = section_bounds(lines, i)
    return any(a < n <= b for n in reasked)


def ids_in_text(text):
    return {m.group(1) for m in TICKET_ID_RE.finditer(text)}


# T-1477: the places the dispatch gate reads (prdt-dispatch-gate.sh T-1151): a user quote
# anywhere in `## problem` makes the ticket user-started; a quote under `### 확인` /
# `### confirm` is the user's reply to the read-back.
USER_QUOTE_RE = re.compile(r"\*\"[^\"\n]+\"\*|“[^”\n]+”")
ANY_QUOTE_RE = re.compile(r"\*\"[^\"\n]+\"\*|“[^”\n]+”|「[^」\n]+」")


def awaits_readback(path):
    """True when a work ticket is user-started and its `### 확인` holds no quote yet —
    the request read-back its dispatch waits for. False when unreadable."""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read(BRIEF_READ_BYTES)
    except (OSError, TypeError):
        return False
    in_prob = in_fence = in_confirm = False
    started = confirmed = False
    for ln in text.split("\n"):
        if FENCE_RE.match(ln):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if re.match(r"^##[ \t]", ln):
            in_prob = bool(re.match(r"^##[ \t]+(?:problem|문제)", ln, re.I))
            in_confirm = False
            continue
        if not in_prob:
            continue
        if re.match(r"^###[ \t]", ln):
            in_confirm = bool(re.match(r"^###[ \t]+(?:확인|confirm)(?![^\s(])", ln, re.I))
            continue
        bare = re.sub(r"`[^`\n]*`", " ", ln)
        started = started or bool(USER_QUOTE_RE.search(bare))
        confirmed = confirmed or (in_confirm and bool(ANY_QUOTE_RE.search(bare)))
    return started and not confirmed


def question_check(lines, asks, tickets, unknown, turn_start, reply, reasked, paths=None):
    """T-985: the reason when an ask has no open decision ticket beside it; else
    None. An ask the re-ask check already holds (`reasked` line numbers), or one
    in the same section as such an ask, is left to it: the recorded answer, not a
    new ticket, is what that decision needs."""
    if any(t == "decision" and mt >= turn_start - 1 for t, _, _, mt in tickets.values()):
        return None
    open_dec = {k for k, (t, s, _, _) in tickets.items() if t == "decision" and s == "open"}
    open_req = {k for k, (t, s, a, _) in tickets.items() if t != "decision" and s == "open" and a == "user"}
    # T-1477: a read-back of the user's request is recorded under that work ticket's `### 확인`
    # (PO habit Triage), so an open impl / design ticket still awaiting that confirm, cited
    # beside a non-option ask, covers it.
    paths = paths or {}
    open_work = {k for k in ids_in_text(reply) if k in tickets and tickets[k][0] in WORK_TICKET_TYPES
                 and tickets[k][1] == "open" and awaits_readback(paths.get(k))}
    # an id whose file could not be read counts as covering (fails open)
    open_dec |= unknown
    open_req |= unknown
    ids_in = lambda chunk: {m.group(1) for m in TICKET_ID_RE.finditer(chunk)}
    reply_ids = ids_in(reply)
    uncovered = []
    for i, kind, option_ref in asks:
        if kind == "options" or option_ref:
            ok = bool(reply_ids & open_dec)
        else:
            if kind == "waiting" or LIST_ITEM_RE.match(lines[i]) or lines[i][:1].isspace():
                a, b = item_bounds(lines, i)
            else:
                a, b = section_bounds(lines, i)
            found = ids_in("\n".join(lines[a:b]))
            ok = bool(found & (open_dec | open_work | (open_req if kind == "waiting" else set())))
        if not ok and not reasked_section(lines, i, reasked):
            uncovered.append(i + 1)
    if not uncovered:
        return None
    uncovered = sorted(set(uncovered))
    shown = ", ".join(str(n) for n in uncovered[:LIST_CAP])
    if LIST_CAP < len(uncovered):
        shown += ", +%d more" % (len(uncovered) - LIST_CAP)
    return QUESTION_CHECK_REASON % shown


def _out_of_budget(*_):
    raise TimeoutError()


try:
    signal.signal(signal.SIGALRM, _out_of_budget)
    signal.alarm(RUN_BUDGET_S + JUDGE_TIMEOUT_S)
    main()
except BaseException:
    pass
sys.exit(0)
PYEOF
