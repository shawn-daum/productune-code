#!/usr/bin/env bash
# prdt — unticketed-question check (T-985; where to enforce: T-986 = B).
# Registered on Stop (matcher-less: Stop takes none). Acts for the PO only
# (`agent_type` == `prdt-po`); every other Stop — a worker, a plain session —
# exits silently.
#
# WHY. PO habit says a 2+-path fork becomes a `type: decision` ticket the moment
# it is raised, but nothing noticed when a PO asked the user to choose or confirm
# without one: the user's answer then never shows in the statusline `dec` and
# gets lost (T-985 §problem, the same class as T-869). The UserPromptSubmit
# register check is a next-turn notice; this one acts at Stop, so the PO opens
# or cites the ticket and re-replies before the turn ends.
#
# WHAT IT DOES. On the PO's final reply of a turn it finds the ASKS — the places
# that ask the user to choose or confirm — and blocks the stop ONCE when an ask
# has no decision ticket behind it. Which questions are asks is T-993 = B: a
# choice between options, a yes/no confirmation and a read-back confirmation
# need a ticket; an offer (`열어 드릴까요?`), an information request (`알려
# 주시겠어요?`, a `…되나요?` fact question, an English `X or Y?` fact question)
# and a feedback or closing question (`어떠셨어요?`) do not.
#   question    a `?` sentence in a choose/confirm form (`…할까요?`, `…해도
#               될까요?`, `…맞나요?`, `어느 쪽…?`, `Should I …?`, `Which … should
#               we …?`, `Do you want A or B?`), outside code fences, blockquotes,
#               inline code and quoted spans (a quoted question is a report of
#               one, not an ask). Rhetorical (`왜 …?`) questions are not asks.
#   pick        an imperative choose form (`골라 주세요`, `정해 주세요`).
#   options     a laid-out option set: an `A` line followed later by a `B`
#               line (`A  초안대로`, `- **A** …`, `| A … |`), fenced or not, that
#               carries a recommendation or option marker (`추천`, `←`,
#               `recommend`, `선택지`) — an A/B/C-keyed status table without one
#               is not an option set. A diagram edge (`A --> B`) and a
#               mermaid/dot/plantuml fence are never option lines.
#   waiting     an item under a "waiting for your answer" heading
#               (`답 기다리는 것`, `결정 대기`, `Waiting on you`).
# An ask is COVERED when the reply cites an OPEN `type: decision` ticket for it:
#   options, and a question/pick that names an option letter (`A와 B 중…`),
#     → any open decision id anywhere in the reply (the options belong to the
#       ticket the reply is presenting);
#   a list item (question or waiting item) → an id in that item (its line plus
#     its indented sub-lines) — a waiting list that cites T-974 does not cover
#     the item next to it that cites nothing (fixture: the 「이 기기에 설치」 reply);
#   any other line → an id in its section (heading to next heading).
# A waiting item also counts an open `assignee: user` ticket (statusline `req`).
# Nothing is checked when a `type: decision` ticket file was created or modified
# during the turn (mtime at or after the turn's user prompt, read from the
# transcript) — T-985 acceptance, literally.
#
# BATCH ASK (T-1364 = C). Before that exemption, a reply whose asks carry
# BATCH_ASK_MIN (4) or more distinct open decision ids — each id inside an
# ask's own item or section; an id cited with no ask beside it is not counted —
# is blocked once, so the PO asks one screen-changing item at a time.
#
# ONE BLOCK, NEVER TWO. `stop_hook_active` is the harness's own loop guard:
# false on the first Stop, true on the Stop that follows a block. On true this
# hook exits silently, so a re-reply that still asks without a ticket reaches the
# user rather than looping (the same guard prdt-return-check.sh relies on).
#
# THE REASON CARRIES LINE NUMBERS, NEVER REPLY TEXT. Same discipline as the
# register check: the PO gets which lines, not its own words echoed back.
# WORDING: QUESTION_CHECK_REASON below is the user-confirmed wording (T-990 = A).
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
[ "${PRDT_QUESTION_CHECK:-on}" != "off" ] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0
printf '%s' "$EVENT_JSON" | python3 -I -c "$(sed -n '/^# ---- python ----$/,$p' "$0" | sed '$d')"
exit 0
# The heredoc below is never executed (`exit 0` above): it only keeps the python
# body out of bash's parser, so `bash -n` still reads this file end to end.
: <<'PYEOF'
# ---- python ----
import json, os, re, shutil, signal, stat, subprocess, sys
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


# Wording: T-990 = A (2026-10-06); re-send clause T-1302 (inject-edit).
# %s = the uncovered asks' line numbers ("3, 12").
QUESTION_CHECK_REASON = (
    "[prdt question check] this reply asks the user to choose or confirm with no open decision "
    "ticket cited beside the ask (line %s) — a choose/confirm question, a pick request, an A/B "
    "option set, or an item under a waiting-for-your-answer heading — and no `type: decision` "
    "ticket was created or changed this turn. Open a `type: decision` ticket for each ask or cite "
    "its open ticket id beside it (a waiting item: `assignee: user` counts), then send the reply "
    "again%s, opening with one line that the question now has its ticket, every other line kept — a body "
    "up for approval keeps its numbered lines (or group ranges + ticket link), never the options alone."
)
# T-1116: the language clause that goes after "send the reply again" (wording settled
# under the discipline-wording module, T-1245). %s = the stored chat language; the
# clause is empty when no language is known, so the reason is then byte-identical
# to the T-990 text above.
QUESTION_CHECK_LANG_CLAUSE = " in lang=%s"

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
    "[prdt re-ask check] this reply asks the user (line %s) beside a decision already answered: %s "
    "(answer: `prdt decisions find <id>`). Act on the recorded answer and cite it, never ask it again; "
    "a decision ticket opened this turn for that ask → `dropped` naming the record. Keep the ask only "
    "when the record is stale or conflicting, its state changed, or a consent gate needs live words "
    "— say which beside the ask. Then send the reply again%s, every other line kept."
)
# T-1285 (2) / T-1364 = C: one reply whose asks carry this many distinct OPEN
# decision ids (each id inside an ask's own item or section) is blocked once.
# T-1367 = A (user-approved wording). %s = count, ids, language clause.
BATCH_ASK_MIN = 4
BATCH_ASK_REASON = (
    "[prdt batch-ask check] this reply asks the user about %s open decisions at once (%s). "
    "Ask one screen-changing decision per reply, wording-only ones together in one table; "
    "the others stay open under their tickets, cited by id with no ask beside them. "
    "Then send the reply again%s, every other line kept."
)
DECISIONS_FIND_TIMEOUT_S = 3

# What counts as a citable record id, and where its files live (T-996 = C:
# decisions later get their own `D-NNN` records — add "D" and its dir here).
DECISION_ID_PREFIXES = ("T",)
_PFX = "|".join(re.escape(p) for p in DECISION_ID_PREFIXES)
TICKET_ID_RE = re.compile(r"(?<![A-Za-z0-9])((?:%s)-(?:[BCDFGHJKLMNPQRSTVWXYZ]{1,8}-)?\d{1,6})(?!\d)" % _PFX)
TICKET_FILE_RE = re.compile(r"^(?:%s)-(?:[BCDFGHJKLMNPQRSTVWXYZ]{1,8}-)?\d{1,6}\.md$" % _PFX)
FENCE_RE = re.compile(r"^\s*(?:`{3,}|~{3,})")
DIAGRAM_FENCE_RE = re.compile(r"^\s*(?:`{3,}|~{3,})\s*(?:mermaid|dot|graphviz|plantuml|puml|d2)\b", re.I)
# Text right after an option letter that makes the line a diagram edge (`A --> B`).
EDGE_AFTER_RE = re.compile(r"^\s*(?:-{1,3}>|={1,3}>|-\.|<-|--|→|⟶|⇒)")
# An option set is an ask only when it carries one of these.
OPTION_MARK_RE = re.compile(
    r"추천|권(?:장|고|해|함|하)|←|recommend|선택지|\boptions?\b|\|\s*안\s*\|"
    r"|어느\s*쪽|중\s*(?:어느|하나)|골라|고르|정해\s*주|정하|할지|답\s*주|말씀해\s*주"
    r"|(?<![A-Za-z0-9])[A-H]\s*(?:로|으로)\s*(?:갈|갑|가|할|하)|아니면\s*\**[A-H](?![A-Za-z0-9])", re.I)
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
QUESTION_RE = re.compile(r"([^.!?。？\n]*)[?？]")
LEAD_JUNK_RE = re.compile(r"^[\s\-*+•·>|#\d.)]*(?:\*\*)?\s*")
# T-993 = B. Choose / yes-no confirm / read-back confirm endings.
KO_ASK_END_RE = re.compile(
    r"(?:까요|까|래요|을래|겠어요|겠습니까|맞나요|맞죠|맞을까요|맞아요|맞으세요|맞습니까"
    r"|괜찮나요|괜찮을까요|괜찮으세요|괜찮으신가요|도\s*되나요|도\s*돼요|좋나요|원하세요|원하시나요)"
    r"\s*\)?\s*$")
# Offers and information requests that share those endings — not asks (T-993 B).
KO_NOT_ASK_RE = re.compile(
    r"드릴까요?\s*\)?\s*$|드릴게요\s*$"            # offer: 열어 드릴까요?
    r"|주\s*(?:시겠어요|시겠습니까|겠어요|실래요|실\s*수\s*있을까요)\s*\)?\s*$")  # request: 알려 주시겠어요?
KO_EITHER_RE = re.compile(r"아니면|(?:까요|래요|을래)\s*,")
KO_ASK_ANY_RE = re.compile(r"까요|래요|을래|겠어요|겠습니까")
KO_CHOICE_RE = re.compile(r"어느\s*(?:쪽|것|걸|안)|어떤\s*(?:걸|것|쪽|안)|중\s*(?:어느|무엇|뭐|하나)|중에서")
# English: a yes/no or read-back confirm, or a choice addressed to the user.
EN_CONFIRM_RE = re.compile(
    r"\b(?:should|shall)\s+(?:i|we)\b|\b(?:ok|okay|alright|fine)\s+(?:to|if)\b"
    r"|\bis\s+(?:it|that|this)\s+(?:ok|okay|alright|right|correct|what you)\b"
    r"|\b(?:can|may)\s+i\s+(?:go ahead|proceed)\b|\b(?:go ahead|proceed)\s*(?:with\b|$)"
    r"|\b(?:am i|did i get (?:it|that|this))\s+(?:right|correct)\b|\bsounds?\s+(?:right|good)\s*$", re.I)
EN_CHOOSE_RE = re.compile(
    r"\bwhich\b.*\b(?:should|shall|do you|would you|prefer|want|go with|pick)\b"
    r"|\b(?:should|shall|do you want|would you (?:like|prefer)|want me to|prefer)\b.*\bor\b", re.I)
RHETORICAL_RE = re.compile(r"^(?:왜|어째서|why\b|how come\b)", re.I)
CLOSING_RE = re.compile(
    r"도와\s*드릴|궁금한|더\s*필요한|질문\s*있으|어떠(?:셨|세|신|했)|어땠|괜찮으셨|마음에\s*드(?:셨|시나|세)"
    r"|anything else|any (?:other )?questions|let me know|how (?:does|did) (?:it|that|this) (?:look|feel)", re.I)
PICK_RE = re.compile(
    r"(?:골라|정해|선택해|결정해|승인해)\s*주(?:세요|십시오)|please\s+(?:choose|pick|decide)", re.I)
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
    not a regular file}) over tickets_homes (md is SoT); None when a tickets dir
    that exists cannot be listed (fail open)."""
    out, unknown, broken = {}, set(), []
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
    if broken:
        return None
    return out, unknown


def classify_question(seg):
    """True when the sentence before a `?` asks the user to choose or confirm."""
    seg = LEAD_JUNK_RE.sub("", seg).strip().rstrip("*").strip()
    if not seg or RHETORICAL_RE.search(seg) or CLOSING_RE.search(seg):
        return False
    if KO_CHOICE_RE.search(seg) or EN_CHOOSE_RE.search(seg) or EN_CONFIRM_RE.search(seg):
        return True
    # `이대로 쓸까요, 아니면 … 주시겠어요?` — an either/or is a choice whatever its ending
    if KO_EITHER_RE.search(seg) and KO_ASK_ANY_RE.search(seg):
        return True
    return bool(KO_ASK_END_RE.search(seg)) and not KO_NOT_ASK_RE.search(seg)


def find_asks(text):
    """[(line_idx, kind, option_ref)] — kind ∈ question|pick|options|waiting."""
    lines = text.split("\n")
    asks = []
    in_fence = False
    in_diagram = False
    section_waiting = False
    opt_block = []      # option letters seen in the current block, with line idx
    def flush_options():
        letters = [l for l, _ in opt_block]
        if "A" in letters and "B" in letters[letters.index("A") + 1:]:
            a = opt_block[letters.index("A")][1]
            # a status table keyed A/B/C carries no recommendation / option
            # marker in or right around it (header row above, a few lines after)
            if OPTION_MARK_RE.search("\n".join(lines[max(0, a - 3):opt_block[-1][1] + 9])):
                asks.append((a, "options", True))
        opt_block.clear()
    for i, ln in enumerate(lines):
        if FENCE_RE.match(ln):
            if not in_fence:
                in_diagram = bool(DIAGRAM_FENCE_RE.match(ln))
            in_fence = not in_fence
            continue
        m = None if in_diagram and in_fence else OPTION_LINE_RE.match(ln)
        if m and not EDGE_AFTER_RE.match(ln[m.end():]):
            # T-1377: an `A` after an A…B pair opens the next option set — ten
            # items each laid out A/B are ten asks, each scoped to its own item
            letters = [l for l, _ in opt_block]
            if m.group(1) == "A" and "A" in letters and "B" in letters[letters.index("A") + 1:]:
                flush_options()
            opt_block.append((m.group(1), i))
        if in_fence:
            continue
        if HEADING_RE.match(ln):
            flush_options()
            section_waiting = bool(WAITING_HEADING_RE.search(ln))
        if ln.lstrip().startswith(">"):
            continue
        clean = QUOTED_RE.sub(" ", ln)
        if section_waiting and LIST_ITEM_RE.match(ln) and not ln[:1].isspace():
            asks.append((i, "waiting", False))
            continue
        for q in QUESTION_RE.finditer(clean):
            if classify_question(q.group(1)):
                asks.append((i, "question", bool(OPTION_REF_RE.search(q.group(1)))))
                break
        else:
            if PICK_RE.search(clean):
                asks.append((i, "pick", bool(OPTION_REF_RE.search(clean))))
    flush_options()
    return lines, asks


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
    end = min([h for h in heads if h > i], default=len(lines))
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


# T-1377: an ask approving a body shown above it in its section (a fenced draft).
APPROVAL_RE = re.compile(r"승인|approv", re.I)


def body_above(lines, a, i):
    """True when a closed, non-diagram fence lies in lines[a:i]."""
    open_at = None
    for k in range(a, i):
        if FENCE_RE.match(lines[k]):
            if open_at is None:
                open_at = k
            else:
                if not DIAGRAM_FENCE_RE.match(lines[open_at]):
                    return True
                open_at = None
    return False


def ask_subject(lines, i, kind, option_ref, tickets):
    """T-1377: the decision ids an ask is ABOUT. The decision ids on the ask's own
    line (and, for a list item, the item's first line) name its subject; an id
    elsewhere in the item or section is then a citation (a reason, a source).
    None there → every id in its item or section, except an approval ask after a
    fenced body in its section: that ask is about the body."""
    a, b = ask_scope(lines, i, kind, option_ref)
    is_dec = lambda k: bool(tickets.get(k)) and tickets[k][0] == "decision"
    ids_on = lambda chunk: {m.group(1) for m in TICKET_ID_RE.finditer(chunk) if is_dec(m.group(1))}
    own = ids_on(lines[i]) | (ids_on(lines[a]) if a != i and (lines[i][:1].isspace() or kind == "waiting"
                                                              or LIST_ITEM_RE.match(lines[i])) else set())
    if own:
        return own
    if APPROVAL_RE.search(QUOTED_RE.sub(" ", lines[i])) and body_above(lines, a, i):
        return set()
    return ids_on("\n".join(lines[a:b]))


def reask_check(root, lines, asks, tickets, turn_start):
    """T-1285: (block reason, asked line numbers) when an ask is about (ask_subject,
    T-1377) a decision ticket closed before this turn whose answer is on record;
    else (None, set()). Runs before the decision-changed-this-turn exemption:
    opening a new decision ticket for an answered question is the re-ask itself
    (T-1239 observation 4)."""
    hits = {}
    for i, kind, option_ref in asks:
        for k in ask_subject(lines, i, kind, option_ref, tickets):
            t = tickets[k]
            if t[1] == "done" and t[3] < turn_start - 1:
                hits.setdefault(k, set()).add(i + 1)
    if not hits:
        return None, set()
    rec = recorded_decisions(root, set(hits))
    if not rec:
        return None, set()
    ln = sorted({n for k in rec for n in hits[k]})
    shown = ", ".join(str(n) for n in ln[:LIST_CAP]) + (", +%d more" % (len(ln) - LIST_CAP) if LIST_CAP < len(ln) else "")
    ids = sorted(rec)
    return REASK_REASON % (shown, ", ".join(ids[:LIST_CAP]), lang_clause()), set(ln)


def batch_check(lines, asks, tickets):
    """T-1364 = C: the block reason when the asks carry BATCH_ASK_MIN or more
    distinct open decision ids, each counted only inside an ask's own scope
    (an id merely cited elsewhere in the reply is not asked); else None. Runs
    before the decision-changed-this-turn exemption: opening the tickets in the
    same turn is how a batch usually arrives."""
    asked = set()
    for i, kind, option_ref in asks:
        a, b = ask_scope(lines, i, kind, option_ref)
        for m in TICKET_ID_RE.finditer("\n".join(lines[a:b])):
            t = tickets.get(m.group(1))
            if t and t[0] == "decision" and t[1] == "open":
                asked.add(m.group(1))
    if len(asked) < BATCH_ASK_MIN:
        return None
    ids = sorted(asked)
    shown = ", ".join(ids[:LIST_CAP]) + (", +%d more" % (len(ids) - LIST_CAP) if LIST_CAP < len(ids) else "")
    return BATCH_ASK_REASON % (len(ids), shown, lang_clause())


def block(reason):
    sys.stdout.write(json.dumps({"decision": "block", "reason": reason}))


def main():
    ev = read_event()
    if ev is None:
        return
    if ev.get("hook_event_name") != "Stop" or ev.get("agent_type") != "prdt-po":
        return
    if ev.get("stop_hook_active") is True:
        return
    root = project_root(ev.get("cwd"))
    if not root:
        return
    turn_start, transcript_text = scan_transcript(ev.get("transcript_path"))
    reply = ev.get("last_assistant_message")
    if not (isinstance(reply, str) and reply.strip()):
        reply = transcript_text
    if not (isinstance(reply, str) and reply.strip()):
        return
    lines, asks = find_asks(reply)
    if not asks or turn_start is None:
        return
    idx = ticket_index(root)
    if idx is None:
        return
    tickets, unknown = idx
    # T-1377: every check that applies speaks in the one block, none hides another.
    reask, reasked = reask_check(root, lines, asks, tickets, turn_start)
    reasons = [r for r in (reask, batch_check(lines, asks, tickets)) if r]
    question = question_check(lines, asks, tickets, unknown, turn_start, reply, reasked)
    if question:
        reasons.append(question)
    if reasons:
        block("\n\n".join(reasons))


def question_check(lines, asks, tickets, unknown, turn_start, reply, reasked):
    """T-985: the reason when an ask has no open decision ticket beside it; else
    None. An ask the re-ask check already holds (`reasked` line numbers) is left
    to it: the recorded answer, not a new ticket, is what that ask needs."""
    if any(t == "decision" and mt >= turn_start - 1 for t, _, _, mt in tickets.values()):
        return None
    open_dec = {k for k, (t, s, _, _) in tickets.items() if t == "decision" and s == "open"}
    open_req = {k for k, (t, s, a, _) in tickets.items() if t != "decision" and s == "open" and a == "user"}
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
            ok = bool(found & (open_dec | open_req if kind == "waiting" else open_dec))
        if not ok and i + 1 not in reasked:
            uncovered.append(i + 1)
    if not uncovered:
        return None
    uncovered = sorted(set(uncovered))
    shown = ", ".join(str(n) for n in uncovered[:LIST_CAP])
    if len(uncovered) > LIST_CAP:
        shown += ", +%d more" % (len(uncovered) - LIST_CAP)
    return QUESTION_CHECK_REASON % (shown, lang_clause())


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
