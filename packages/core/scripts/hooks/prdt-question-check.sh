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
# has no decision ticket behind it:
#   question    a `?` sentence ending in a choose/confirm form (`…할까요?`,
#               `…맞나요?`, `어느 쪽…?`, `Should I …?`, `A or B?`), outside code
#               fences, blockquotes, inline code and quoted spans (a quoted
#               question is a report of one, not an ask). Rhetorical (`왜 …?`)
#               and closing (`더 필요한 게 있을까요?`) questions are not asks.
#   pick        an imperative choose form (`골라 주세요`, `정해 주세요`).
#   options     a laid-out option set: an `A` line followed later by a `B`
#               line (`A  초안대로`, `- **A** …`, `| A … |`), fenced or not.
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
# ONE BLOCK, NEVER TWO. `stop_hook_active` is the harness's own loop guard:
# false on the first Stop, true on the Stop that follows a block. On true this
# hook exits silently, so a re-reply that still asks without a ticket reaches the
# user rather than looping (the same guard prdt-return-check.sh relies on).
#
# THE REASON CARRIES LINE NUMBERS, NEVER REPLY TEXT. Same discipline as the
# register check: the PO gets which lines, not its own words echoed back.
# WORDING: QUESTION_CHECK_REASON below is a NEUTRAL PLACEHOLDER until the
# designer's `inject-edit` words it and the user confirms (T-985 acceptance).
#
# FAILS OPEN. No project (`.prdt/po-state.json` on the cwd chain), an unreadable
# transcript, an unknown turn start, malformed JSON, a missing python3 — each
# exits 0 with no output. A Stop hook must never strand a session.
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
command -v python3 >/dev/null 2>&1 || exit 0
printf '%s' "$EVENT_JSON" | python3 -c "$(sed -n '/^# ---- python ----$/,$p' "$0" | sed '$d')"
exit 0
# The heredoc below is never executed (`exit 0` above): it only keeps the python
# body out of bash's parser, so `bash -n` still reads this file end to end.
: <<'PYEOF'
# ---- python ----
import json, os, re, sys
from datetime import datetime

# Placeholder wording (T-985: designer inject-edit + user confirmation pending).
# %s = the uncovered asks' line numbers ("3, 12").
QUESTION_CHECK_REASON = (
    "[prdt question check] this reply asks the user to choose or confirm with no open decision "
    "ticket behind it (line %s), and no decision ticket was created or changed this turn. "
    "Open a `type: decision` ticket for each such ask, or cite its open ticket beside it, "
    "then send the reply again."
)
LIST_CAP = 5

TICKET_ID_RE = re.compile(r"(?<![A-Za-z0-9])T-(\d{1,6})(?!\d)")
TICKET_FILE_RE = re.compile(r"^T-\d{1,6}\.md$")
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
QUESTION_RE = re.compile(r"([^.!?。？\n]*)[?？]")
LEAD_JUNK_RE = re.compile(r"^[\s\-*+•·>|#\d.)]*(?:\*\*)?\s*")
KO_ASK_END_RE = re.compile(
    r"(?:까요|까|래요|을래|겠어요|겠습니까|맞나요|맞죠|맞을까요|맞아요|괜찮나요|괜찮을까요"
    r"|되나요|좋나요|원하세요|원하시나요)\s*\)?\s*$")
KO_CHOICE_RE = re.compile(r"어느\s*(?:쪽|것|걸|안)|어떤\s*(?:걸|것|쪽|안)|중\s*(?:어느|무엇|뭐|하나)|중에서")
EN_ASK_RE = re.compile(
    r"^(?:should|shall|do you want|would you like|ok to|okay to|is it ok|can i|may i|proceed|go with|which)\b"
    r"|\bwhich\b|\bor\b", re.I)
RHETORICAL_RE = re.compile(r"^(?:왜|어째서|why\b|how come\b)", re.I)
CLOSING_RE = re.compile(
    r"도와\s*드릴|궁금한|더\s*필요한|질문\s*있으|anything else|any (?:other )?questions|let me know", re.I)
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


def scan_transcript(path):
    """(turn_start_epoch | None, last main-session assistant text | None), read
    from the END in chunks. turn start = the last main-session user PROMPT record
    (string content or a text block — never a tool_result)."""
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
                if _is_prompt_record(rec):
                    ts = rec.get("timestamp")
                    try:
                        start = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).timestamp()
                    except Exception:
                        return None, last_text
                    return start, last_text
            if total >= TAIL_MAX or total >= size:
                return None, last_text
            total = min(total + TAIL_CHUNK, TAIL_MAX, size)
    except Exception:
        return None, None


def ticket_index(root):
    """{T-NNN: (type, status, assignee, mtime)} over docs/tickets/** (md is SoT)."""
    out = {}
    base = os.path.join(root, "docs", "tickets")
    if not os.path.isdir(base):
        return out
    for d, dirs, files in os.walk(base):
        if d[len(base):].count(os.sep) >= 3:
            dirs[:] = []
        for fn in files:
            if not TICKET_FILE_RE.match(fn):
                continue
            p = os.path.join(d, fn)
            try:
                with open(p, errors="replace") as f:
                    head = f.read(800)
                mtime = os.path.getmtime(p)
            except OSError:
                continue
            fm = head.split("\n---", 1)[0] if head.startswith("---") else ""
            g = lambda k: (re.search(r"^%s:\s*(\S+)" % k, fm, re.M) or [None, None])[1]
            out[fn[:-3]] = (g("type"), g("status"), g("assignee"), mtime)
    return out


def classify_question(seg):
    """True when the sentence before a `?` asks the user to choose or confirm."""
    seg = LEAD_JUNK_RE.sub("", seg).strip().rstrip("*").strip()
    if not seg or RHETORICAL_RE.search(seg) or CLOSING_RE.search(seg):
        return False
    return bool(KO_ASK_END_RE.search(seg) or KO_CHOICE_RE.search(seg) or EN_ASK_RE.search(seg))


def find_asks(text):
    """[(line_idx, kind, option_ref)] — kind ∈ question|pick|options|waiting."""
    lines = text.split("\n")
    asks = []
    in_fence = False
    section_waiting = False
    opt_block = []      # option letters seen in the current block, with line idx
    def flush_options():
        letters = [l for l, _ in opt_block]
        if "A" in letters and "B" in letters[letters.index("A") + 1:]:
            asks.append((opt_block[letters.index("A")][1], "options", True))
        opt_block.clear()
    for i, ln in enumerate(lines):
        if FENCE_RE.match(ln):
            in_fence = not in_fence
            continue
        m = OPTION_LINE_RE.match(ln)
        if m:
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
    tickets = ticket_index(root)
    if any(t == "decision" and mt >= turn_start - 1 for t, _, _, mt in tickets.values()):
        return
    open_dec = {k for k, (t, s, _, _) in tickets.items() if t == "decision" and s == "open"}
    open_req = {k for k, (t, s, a, _) in tickets.items() if t != "decision" and s == "open" and a == "user"}
    ids_in = lambda chunk: {"T-" + m.group(1) for m in TICKET_ID_RE.finditer(chunk)}
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
        if not ok:
            uncovered.append(i + 1)
    if not uncovered:
        return
    uncovered = sorted(set(uncovered))
    shown = ", ".join(str(n) for n in uncovered[:LIST_CAP])
    if len(uncovered) > LIST_CAP:
        shown += ", +%d more" % (len(uncovered) - LIST_CAP)
    sys.stdout.write(json.dumps({"decision": "block", "reason": QUESTION_CHECK_REASON % shown}))


try:
    main()
except Exception:
    pass
sys.exit(0)
PYEOF
