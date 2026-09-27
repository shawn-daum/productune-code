#!/usr/bin/env bash
# prdt — worker return-envelope GATE (T-553; grew out of the T-490 slice 3 advisory).
# Registered TWICE, one script, one verdict function:
#   PreToolUse (matcher: SubagentHandback) — T-688 개정 1: the return the PO ACTUALLY
#     receives. Measured 2026-09-26 (Claude Code 2.1.282/283, 6/6 real qa returns
#     of the day + the parent transcript): a worker that calls SubagentHandback has
#     its `message` delivered to the PO AT CALL TIME as an `<agent-message>`
#     (`[Subagent hand-back] …`); the task-notification that follows says
#     "Read it there; it is not repeated here" — the worker's FINAL assistant
#     message is never delivered. The harness then even nudges the worker
#     ("[Your previous response had no visible output…]") into ending with prose,
#     and a SECOND SubagentHandback is refused ("Nothing was sent: your report was
#     already delivered"). So the only moment a handback can be judged AND
#     corrected is BEFORE the call: `tool_input.message`, a `permissionDecision:
#     "deny"` with the reason, and the worker calls again with a fixed message.
#   SubagentStop (matcher: ^prdt-) — the return of a worker that did NOT hand
#     back: `last_assistant_message` IS what the parent receives (foreground:
#     framed as `[Subagent hand-back]` — measured on a probe worker that never
#     called the tool; background: the task-notification result).
#
# WHAT IT DOES. It validates the contracts §Return envelope floor (single JSON
# object, first char `{`, persona in the CLI enum, task ≤80, summary ≤200,
# confidence a number 0..1, needs_info ⇒ next_question, machine-facing fields in
# English) and acts on the outcome in exactly three ways:
#   clean return              → prints NOTHING, writes nothing. The worker is never
#                               resumed, not even once — measured cost: one python3
#                               start.
#   first violation           → SubagentStop: prints {"decision":"block","reason":…}.
#     (`stop_hook_active`       Measured 2026-09-04 (Claude Code 2.1.260, 2/2
#      false, or the first        trials) and re-measured on 2.1.266 (T-553): this
#      handback of an agent_id)   RESUMES the worker, it re-emits a corrected final
#                               message, and the parent receives ONLY the corrected
#                               one. PreToolUse: prints the `deny` envelope with the
#                               SAME reason — the worker sees it as the tool's
#                               error and calls SubagentHandback again. The reason
#                               names each violation with the rule AND the offending
#                               value (a length, the first character) so it is
#                               fixable in one pass, then restates the required
#                               shape — the measured re-ask repaired violations the
#                               reason never enumerated (fence + missing keys +
#                               confidence:"high" + a 306-char summary, one pass).
#   second violation          → prints NOTHING and queues a closed-vocabulary flag
#     (`stop_hook_active`       (with `reask: true`) to .prdt/.return-flags.json for
#      true, or a handback       prdt-user-prompt.sh to render on the PO's next prompt.
#      already denied once)     ONE retry is the cap. On SubagentStop the cap needs
#                               no state file of ours: `stop_hook_active` is the
#                               harness's own loop guard (false on the first firing,
#                               true on the re-fire). PreToolUse has no such guard,
#                               so the handback side keeps ITS one-retry state in
#                               the same bridge file the stop side already uses
#                               (`.return-gate-pending.json`, key `hb:<agent_id>`).
#                               A worker that fails twice is never stranded — the PO
#                               gets its return as-is plus the notice.
# It never EDITS a return: it hands it back and the worker rewrites it. Parsing a
# malformed return to repair it is the rejected alternative (T-553 §3) in disguise.
#
# WHOSE STOP IS A RETURN (T-696). 88.5 % of all gate rows before this change were
# persona `po` with no dispatch behind them: an interactive or GUI (po-runner)
# `claude --agent prdt-po` session emits SubagentStop events carrying
# `agent_type: prdt-po` and a fresh `agent_id` for harness-internal agents that
# have NO transcript of their own — measured 2026-09-26: 804/804 `po` rows of the
# day had no `<session>/subagents/agent-<agent_id>.jsonl`, while 134/134
# designer/developer/qa rows had one (and every non-po row back to 09-17). A
# headless `claude -p --agent prdt-po` turn fires `Stop` (agent_type prdt-po, no
# agent_id), never SubagentStop; a genuine `Agent` dispatch of prdt-po fires
# SubagentStart+SubagentStop with a transcript. So the harness-owned signal is
# the worker's OWN transcript file next to the parent's (`transcript_path`):
# absent → not a dispatched worker → no judgment, no log line. Not the T-682
# dispatch marker under ~/.prdt/run/dispatches/: that one depends on OUR
# SubagentStart registration being installed, and a machine without it would
# silently un-gate every return.
#
# TWO CHANNELS, ONE PROHIBITION STILL STANDING. `decision:"block"` + `reason` is a
# DIFFERENT channel from `hookSpecificOutput.additionalContext`. NEVER emit
# additionalContext from a SubagentStop hook (measured 2026-08-24, harness
# 2.1.241): it is injected into the WORKER and resumes it with NO loop guard — one
# probe line produced 9 further firings, the worker echoing the token back. The
# block channel is bounded by `stop_hook_active`; that one is not.
#
# A MACHINE WHOSE MIRROR PREDATES THIS HOOK keeps today's behaviour, not silence:
# its ~/.prdt/hooks/prdt-post-dispatch.sh still carries the advisory-only detector
# (moved out of it here), and install.sh replaces both from the manifest in one run.
# A mirror that has this script but predates the PreToolUse registration judges
# the stop of a handback worker as before (its prose) — the SubagentStop side
# skips a stop only when the transcript shows a DELIVERED handback, and nothing
# then judges that handback; install.sh from the manifest closes that in one run.
#
# WHAT CROSSES THE QUEUE FILE IS A CLOSED VOCABULARY, NEVER PAYLOAD TEXT — two
# load-bearing reasons: (1) the flag reaches the PO model and the text under
# inspection is a worker's own output, so echoing it would make this an injection
# channel out of the very thing being distrusted (prdt-dispatch-gate.sh makes the
# same call on the dispatch side); (2) `.prdt/` is PROJECT-LOCAL and ships with a
# clone (T-471), so the queue file is as tamperable as po-state.json. Only codes
# from RETURN_FLAG_CODES and one persona token cross it, and prdt-user-prompt.sh
# composes every word of the rendered line from its OWN literals after
# shape-matching both. The block `reason` goes to the WORKER — the author of the
# text — and still carries no payload beyond a length, a JSON type name, and the
# first character, each composed here, so the same discipline holds on that side.
# The worker transcript is read for STRUCTURE only (a tool_use named
# SubagentHandback and its tool_result's `success`) — never for text.
#
# UNKNOWN EXTRA KEYS ARE ALLOWED AND NEVER FLAGGED — a decision, not an oversight:
# the envelope schema is a floor, not a whitelist (the dispatch gate makes the same
# call for `[ctx]`), and contracts §Return envelope's own conditional keys mean a
# perfectly well-formed return routinely carries keys this check has never heard
# of. Flagging them would teach the worker to strip signal out of its return.
#
# THE EVENT REACHES PYTHON ON STDIN, NEVER THROUGH AN ENVIRONMENT VARIABLE (T-688
# 개정 1). The old `PRDT_EVENT_JSON="$EVENT_JSON" python3 - <<'PYEOF'` hop put the
# whole event into execve's environment, and ARG_MAX on this machine is 1 MiB
# (getconf): a 1.1 MB `last_assistant_message` made bash print `Argument list too
# long`, python never started, the hook exited 0 — a silent fail-open reproduced
# on HEAD 2026-09-26 (900 KB blocked normally, 1.1 MB passed with no output).
# Now the python source is what travels as an argument (~20 KB, its own file
# read back with sed) and the hook's stdin is python's stdin. Twins with the
# same hop, listed not fixed here: prdt-post-dispatch.sh (same SubagentStop
# payload) and prdt-user-prompt.sh (UserPromptSubmit, both under other tickets).

set +e
# Everything after the `# ---- python ----` line below is the python program; bash
# hands it to python3 as ONE argument and passes its own stdin (the event) through
# untouched. `exit 0` right after keeps bash from ever parsing the python lines.
python3 -c "$(sed -n '/^# ---- python ----$/,$p' "$0" | sed '$d')"
exit 0
# The heredoc below is never executed (`exit 0` above): it only keeps the python
# body out of bash's parser, so `bash -n` still reads this file end to end.
: <<'PYEOF'
# ---- python ----
import json, os, re, sys
from datetime import datetime, timezone

try:
    raw = sys.stdin.read()
    ev = json.loads(raw) if raw.strip() else None
except Exception:
    sys.exit(0)
if not isinstance(ev, dict):
    sys.exit(0)

# Event and agent type are checked STRUCTURALLY, never by substring: the matchers
# are supposed to narrow this to SubagentStop/^prdt- and PreToolUse/SubagentHandback,
# and this is the check that makes a mis-registration a no-op instead of a surprise.
event = ev.get("hook_event_name")
if event == "PreToolUse":
    if ev.get("tool_name") != "SubagentHandback":
        sys.exit(0)
elif event != "SubagentStop":
    sys.exit(0)
sub = str(ev.get("agent_type") or "")
if not sub.startswith("prdt-"):
    sys.exit(0)
persona = sub[len("prdt-"):]

# project root = meta root: walk the WHOLE ancestor chain from the event cwd and
# take the OUTERMOST dir holding `.prdt/po-state.json` (T-484), realpath first
# (T-493). Keep in lockstep with the twins in prdt-post-dispatch.sh and
# prdt-user-prompt.sh. No root → not a prdt project → no judgment.
d = os.path.realpath(ev.get("cwd") or os.getcwd())
root = None
while d and d != "/":
    if os.path.isfile(os.path.join(d, ".prdt", "po-state.json")):
        root = d
    up = os.path.dirname(d)
    if up == d:
        break
    d = up
if not root:
    sys.exit(0)
state_dir = os.path.join(root, ".prdt")
now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# The whole vocabulary that may cross into .prdt/.return-flags.json. Keep this
# tuple in lockstep with the twin in prdt-user-prompt.sh — a test compares the
# two, because a code this side invents and that side does not know is a flag
# that is silently dropped at render time.
RETURN_FLAG_CODES = (
    "not-json-object", "parse-failed", "not-an-object",
    "missing-key:persona", "missing-key:task", "missing-key:summary",
    "missing-key:confidence", "persona-not-in-enum", "over-cap:task", "over-cap:summary",
    "confidence-out-of-range", "needs_info-without-next_question",
    "hangul:task", "hangul:summary",
)
RETURN_REQUIRED = ("persona", "task", "summary", "confidence")
# The SAME closed vocabulary that ticket frontmatter `assignee` is already held to
# — `PERSONAS` in scripts/prdt; a test compares the two tuples.
RETURN_PERSONAS = ("po", "designer", "developer", "qa")
RETURN_CAPS = (("task", 80), ("summary", 200))
RETURN_FLAG_QUEUE_CAP = 8
# Bridge cap (T-634) — see `remember_block`/`recall_block`: an agent_id whose
# block never resolves (crashed, or the PO gave up on the dispatch) leaves an
# orphan entry; capped so an unattended long session cannot grow the bridge
# file without bound.
RETURN_GATE_PENDING_CAP = 64

# Per-FIELD Hangul ratio, letters only — the same measure prdt-dispatch-gate.sh
# applies to `[ctx].goal`/`.acceptance`, and per-field for the same measured
# reason: over a whole envelope the ASCII scaffolding (keys, paths, enums)
# dilutes a fully-Korean field below any usable threshold. Digits and
# punctuation are excluded from numerator AND denominator. Ranges: syllables
# AC00-D7A3, jamo 1100-11FF, compatibility jamo 3130-318F, extended-A A960-A97F,
# extended-B D7B0-D7FF. Counted with the regex engine, not a per-char loop, so a
# multi-megabyte field costs milliseconds.
_HANGUL_RE = re.compile("[\uac00-\ud7a3\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff]")
_ASCII_LETTER_RE = re.compile("[A-Za-z]")


def hangul_ratio(s):
    h = len(_HANGUL_RE.findall(s))
    a = len(_ASCII_LETTER_RE.findall(s))
    return 0.0 if (h + a) == 0 else h / (h + a)


def json_type_name(v):
    # Composed from literals — a type name, never the value.
    if isinstance(v, bool):
        return "a boolean"
    if isinstance(v, str):
        return "a string"
    if isinstance(v, list):
        return "an array"
    if isinstance(v, dict):
        return "an object"
    return "null"


def _overcap_codes(env):
    """[(code, detail)] for whichever of RETURN_CAPS's fields overrun their cap
    in `env`. Split out of `envelope_violations` (T-688) so the SAME literal
    template backs both the normal well-formed-JSON path and the opportunistic
    extraction below — one source of truth for the wording, never two copies
    that can drift."""
    out = []
    for k, cap in RETURN_CAPS:
        v = env.get(k)
        if isinstance(v, str) and len(v) > cap:
            out.append(("over-cap:" + k,
                        "shorten `" + k + "` to ≤" + str(cap) + " chars — yours is " + str(len(v))))
    return out


def _extract_embedded_object(stripped):
    """Best-effort ONLY, never a second verdict on shape: when the return fails
    the strict single-object parse (a report-then-envelope, a fenced blob, a
    stray sentence before or after it — T-688's measured `not-json-object` /
    `parse-failed` cases), pull the span from the first `{` to the last `}` and
    try THAT as JSON. `None` on any failure (no braces, still doesn't parse,
    parses to a non-dict) — the caller then adds nothing, exactly today's
    behaviour. This exists so a field that is ALSO over-cap gets named on the
    very first block instead of staying invisible until a shape-only retry
    lands valid JSON and burns the one retry the gate grants. T-688's log
    (project `.prdt/.return-gate.jsonl`) showed over-cap surfacing for the
    FIRST time only on the re-fire in most `failed` rows; the 개정 1 replay of
    the day's 6 real qa cases then measured WHY the first text had no `{` at
    all: the envelope had gone out via SubagentHandback and the final message
    was a prose line (see the header) — so this extraction changed 0/6 of
    those verdicts and is kept as the harmless improvement it is (77-fixture
    differential, identical verdicts), not as the fix."""
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        obj = json.loads(stripped[start:end + 1])
    except Exception:
        return None
    return obj if isinstance(obj, dict) else None


def envelope_violations(text):
    """[(code, detail)] for a worker's final message. [] == well-formed.

    `detail` is composed from this file's literals plus, at most, a length, a
    JSON type name, or the first character — enough to fix in one pass, never
    the payload. Empty / whitespace-only is NOT a violation: it means this hook
    cannot see the return (a shape the harness did not hand us), and a check that
    guesses in that case would block healthy dispatches.
    """
    stripped = text.strip()
    if not stripped:
        return []
    # contracts §Return envelope: "single JSON object, first stdout char `{`".
    # Leading whitespace is tolerated; a ```json fence, a prose paragraph, or a
    # bare array all fail here — which is the observed slip (5 prose returns).
    if stripped[0] != "{":
        out = [("not-json-object",
                "open with `{` as the first character — no code fence, no heading, no "
                "sentence before the object — the first character is "
                + json.dumps(stripped[0]) + " instead")]
        embedded = _extract_embedded_object(stripped)
        if embedded is not None:
            out += _overcap_codes(embedded)
        return out
    try:
        env = json.loads(stripped)
    except Exception:
        # A JSON object followed by prose lands here too, and correctly so: the
        # contract is ONE object, nothing after it.
        out = [("parse-failed",
                "emit exactly ONE JSON object and nothing else — yours is either "
                "truncated or has text after its closing `}`")]
        embedded = _extract_embedded_object(stripped)
        if embedded is not None:
            out += _overcap_codes(embedded)
        return out
    if not isinstance(env, dict):
        return [("not-an-object", "emit a JSON object — yours parses as " + json_type_name(env) + " instead")]
    out = []
    for k in RETURN_REQUIRED:
        if env.get(k) is None:
            out.append(("missing-key:" + k, "include `" + k + "` — currently missing or null"))
    p = env.get("persona")
    if p is not None and p not in RETURN_PERSONAS:
        out.append(("persona-not-in-enum",
                    "`persona` must be one of " + "|".join(RETURN_PERSONAS) + " (yours is not)"))
    out += _overcap_codes(env)
    conf = env.get("confidence")
    # bool is an int in Python — `true` is not a confidence.
    if conf is not None and (isinstance(conf, bool)
                             or not isinstance(conf, (int, float))
                             or not (0 <= conf <= 1)):
        what = ("the number " + json.dumps(conf) + ", outside 0..1"
                if isinstance(conf, (int, float)) and not isinstance(conf, bool)
                else json_type_name(conf))
        out.append(("confidence-out-of-range",
                    "`confidence` must be a JSON number in 0..1 — yours is " + what))
    if env.get("needs_info") is True:
        nq = env.get("next_question")
        if not (isinstance(nq, str) and nq.strip()):
            out.append(("needs_info-without-next_question",
                        "include `next_question` — exactly one question, ≤200 chars — "
                        "currently missing or blank"))
    for k, _cap in RETURN_CAPS:
        v = env.get(k)
        if isinstance(v, str) and hangul_ratio(v) > 0.1:
            out.append(("hangul:" + k,
                        "write `" + k + "` in English — machine-facing fields are English "
                        "(contracts §Language) — yours is " + str(int(round(hangul_ratio(v) * 100)))
                        + "% Hangul by letters"))
    return out


def block_reason(violations):
    # Every word here is this file's own literal (see the header); the details
    # carry at most a length, a type name, or one character.
    return (
        "[prdt return check] BLOCKED — re-emit your return as a valid return envelope "
        "— call SubagentHandback with `message` set to it. This is the machine "
        "enforcement your discipline announces in contracts "
        "§Return envelope, and this is the ONE re-ask it grants: a second failure passes "
        "through as-is and is reported to the PO. Fix each: "
        + "; ".join(d for _c, d in violations) + ". "
        "Re-emit your ENTIRE return now — the SubagentHandback `message`, or your final "
        "message when you do not hand back — as ONE JSON object and nothing else — first "
        "character `{`, no code fence, no prose before or after it — with `persona` "
        "(" + "|".join(RETURN_PERSONAS) + ") · `task` (≤80 chars) · `summary` (≤200 chars, "
        "the machine outcome) · `confidence` (a JSON number 0..1); keep every other field "
        "you already had — unknown extra keys are allowed."
    )


def atomic_write(path, obj):
    # Symlink-proof (T-647): `path + ".tmp"` is project-local (`.prdt/` ships
    # inside a clone), so a repo can plant `<path>.tmp` as a symlink to any file
    # this uid can write — the old `open(tmp, "w")` followed it, truncating the
    # target with this call's JSON payload, and `os.replace` then consumed the
    # symlink with no trace left. Same primitive as `_guard_write` in
    # prdt-user-prompt.sh (T-567 precedent): O_EXCL creates the temp or nothing
    # — a symlink (or stale leftover) already at that name loses the race and is
    # unlinked (removes the link entry, never follows it) rather than opened —
    # and os.replace renames ONTO the destination name without following a link
    # on either side.
    tmp = path + ".tmp"
    for attempt in (0, 1):
        try:
            fd = os.open(tmp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            break
        except FileExistsError:
            if attempt:
                raise
            os.unlink(tmp)  # our own leftover from a killed run, or a planted link — gone unopened either way
    with os.fdopen(fd, "w") as f:
        json.dump(obj, f, indent=2)
    os.replace(tmp, path)


def _append_line(path, text):
    # Symlink-proof append (T-647, same guarantee as atomic_write above): a
    # planted symlink at this exact append path is the append-side form of the
    # same clone-carried attack. O_NOFOLLOW refuses to open through a symlink at
    # all (raises, ELOOP) rather than silently widening the write onto whatever
    # it points at; a regular file — the normal case, every gate event — opens
    # and appends exactly as before.
    fd = os.open(path, os.O_APPEND | os.O_CREAT | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "a") as f:
        f.write(text)


def queue_flag(codes):
    """Second line: the after-the-fact notice prdt-user-prompt.sh renders."""
    path = os.path.join(state_dir, ".return-flags.json")
    try:
        with open(path) as f:
            q = json.load(f)
        flags = q.get("flags") if isinstance(q, dict) else None
        if not isinstance(flags, list):
            flags = []
    except Exception:
        flags = []
    flags.append({"ts": now, "persona": persona, "codes": codes, "reask": True})
    # Bounded so an unattended session cannot grow a queue that floods the PO's
    # next prompt; the renderer reports how many it dropped.
    atomic_write(path, {"flags": flags[-RETURN_FLAG_QUEUE_CAP:]})


def remember_block(agent_id, codes, ns=""):
    """T-634 bridge across the gate's two STATELESS invocations of the same
    return: the first firing (stop_hook_active False) is the only one that ever
    sees the violating text, so it stashes its codes here, keyed by `agent_id`
    (present on every subagent SubagentStop event alongside `agent_type`,
    measured 2026-08-25 in prdt-call-governor.sh). The re-fire has nothing left
    to detect once the worker repairs it — this is the only way it can still
    name what it repaired. `ns` = "hb:" on the PreToolUse/SubagentHandback side
    (T-688 개정 1), where the SAME entry is also the one-retry cap itself:
    present ⇒ this handback was already denied once ⇒ let this one through."""
    if not agent_id:
        return
    path = os.path.join(state_dir, ".return-gate-pending.json")
    try:
        with open(path) as f:
            d = json.load(f)
        if not isinstance(d, dict):
            d = {}
    except Exception:
        d = {}
    d[ns + agent_id] = codes
    if len(d) > RETURN_GATE_PENDING_CAP:
        for k in list(d.keys())[: len(d) - RETURN_GATE_PENDING_CAP]:
            d.pop(k, None)
    try:
        atomic_write(path, d)
    except Exception:
        pass


def recall_block(agent_id, ns=""):
    """The codes `remember_block` stashed for `agent_id`'s last block, consumed
    (removed) on read — each blocked→resolved pair is bridged exactly once.
    `None` when nothing was stashed (no matching first firing, or the entry was
    already evicted)."""
    if not agent_id:
        return None
    path = os.path.join(state_dir, ".return-gate-pending.json")
    try:
        with open(path) as f:
            d = json.load(f)
        if not isinstance(d, dict):
            d = {}
    except Exception:
        d = {}
    codes = d.pop(ns + agent_id, None)
    try:
        atomic_write(path, d)
    except Exception:
        pass
    return codes


def note_schema_boundary():
    """T-634: `repaired` rows started carrying codes at this `ts`. Written ONCE
    — first hook run after this lands — to `.return-gate-schema.json` so a
    downstream reader (T-632) can split its analysis by `ts` instead of
    assuming the whole file uses today's shape. The 113 lines that predate this
    change are left exactly as they are: no backfill, no rewrite."""
    path = os.path.join(state_dir, ".return-gate-schema.json")
    if os.path.exists(path):
        return
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        with os.fdopen(fd, "w") as f:
            json.dump({"repaired_codes_since": now}, f)
    except FileExistsError:
        pass
    except Exception:
        pass


def log_gate(outcome, codes, agent_id=None, via="stop"):
    """Evidence the gate fired at all: `.prdt/.return-gate.jsonl`, one line per
    gate event (blocked · repaired · failed) — the re-ask rate T-553 §3 reads
    after a round (>30 % re-asks is the trigger for the `prdt return` CLI).
    Codes only, never payload. Never rendered.

    COUNTING METHOD (T-633, the instrument this wording change is measured
    against): `blocked` increments once per first-firing block, unconditionally.
    Each blocked dispatch resolves to exactly one of `repaired` (the re-fire was
    clean) or `failed` (the re-fire still violated) on its NEXT SubagentStop —
    so `repaired + failed` over a window is the count of BLOCKED dispatches that
    reached a second firing in that same window, and `repaired / (repaired +
    failed)` is the repair rate. A `blocked` with no matching `repaired`/`failed`
    yet is a dispatch still in flight (or one that never returned again) — count
    it as neither until it resolves. T-632 reads this ratio; landing this ticket
    does not reset the log, so the pre/post split is by `ts`, not by a cleared
    file.

    CLASS-LEVEL REPAIR RATE (T-634): from `.return-gate-schema.json`'s
    `repaired_codes_since` onward, `repaired` carries the SAME `codes` its row
    was originally `blocked` on (recovered via `remember_block`/`recall_block`,
    keyed on `agent_id` — also written here, so the two rows of one return share
    a value to join on) — so the ratio above can be re-run PER CLASS by
    grouping `repaired`/`failed` rows on a code instead of the whole file; a row
    older than that boundary carries no class on `repaired` and stays out of a
    class-level ratio, same as it always could only feed the whole-file one."""
    row = {"ts": now, "persona": persona, "outcome": outcome, "codes": codes}
    if agent_id:
        row["agent_id"] = agent_id
    # T-688 개정 1: which channel carried the judged text — `handback`
    # (PreToolUse/SubagentHandback `tool_input.message`) or `stop`
    # (SubagentStop `last_assistant_message`). Additive key; rows before this
    # change carry none and are all `stop`.
    row["via"] = via
    _append_line(os.path.join(state_dir, ".return-gate.jsonl"), json.dumps(row) + "\n")


def worker_transcript_path(agent_id):
    """The dispatched worker's OWN transcript, derived from the event's
    `transcript_path` (the PARENT session file `<dir>/<session>.jsonl` on every
    SubagentStart/SubagentStop measured — probe 2026-09-26, 2.1.283) as
    `<dir>/<session>/subagents/agent-<agent_id>.jsonl`; when the event already
    names that file (a PreToolUse inside the worker may), it is used as is.
    `None` when the event gives nothing to derive from."""
    tp = ev.get("transcript_path")
    if not agent_id or not isinstance(tp, str) or not tp.endswith(".jsonl"):
        return None
    leaf = "agent-" + agent_id + ".jsonl"
    if os.path.basename(tp) == leaf:
        return tp
    return os.path.join(tp[: -len(".jsonl")], "subagents", leaf)


def _last_resume_boundary_line(path):
    """0-based line index of the LAST SendMessage-resume boundary in the
    worker transcript at `path`: a `user` row with `isMeta: true` and
    `origin.kind == "coordinator"` — the harness's OWN marker for a parked
    worker being woken by `SendMessage` (measured 2026-09-26 across 162 real
    worker transcripts on this machine, and the exact shape of every "the
    coordinator sent a message" row in the 7-handback fixture
    ~/.claude/projects/…/d8503325-…/subagents/agent-a54cb2ed51270af35.jsonl —
    each of its 6 resumes carries this row, immediately before that segment's
    own handback). Structural only — a boolean and one literal string under a
    fixed key, never the resume TEXT. `-1` when the file holds no such row (a
    worker that was never resumed — the whole file is then one segment,
    exactly today's behaviour) or on any read/parse trouble."""
    last = -1
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if '"coordinator"' not in line or '"isMeta"' not in line:
                    continue  # cheap substring pre-filter before paying for json.loads
                try:
                    row = json.loads(line)
                except Exception:
                    continue
                if isinstance(row, dict) and row.get("isMeta") is True \
                        and isinstance(row.get("origin"), dict) \
                        and row["origin"].get("kind") == "coordinator":
                    last = i
    except Exception:
        return -1
    return last


def handback_delivered(path):
    """True when the worker transcript at `path` shows a SubagentHandback
    tool_use whose tool_result reports `success: true` IN THE CURRENT RESUME
    SEGMENT ONLY — i.e. at or after `_last_resume_boundary_line(path)` — i.e.
    the PO already holds THIS segment's message and THIS segment's final
    assistant message is not what it receives.

    Scoped to the segment because a `SendMessage`-resumed worker hands back
    ONCE PER RESUME (measured: 7/7 handbacks, one per resume, all
    success:true, on the fixture named above) — the un-scoped whole-file scan
    this replaces treated segment 2's (and every later segment's) own return
    as "already delivered" the moment segment 1's handback succeeded, so
    every handback and stop after the FIRST resume skipped judgment
    unconditionally. A worker's transcript file is append-only and never
    shrinks, so scoping to the tail past the last boundary is always a
    narrowing, never a miss: a segment with no boundary before it (the first
    one) still gets the whole file, exactly today's behaviour.

    Structure only (tool name, tool_use_id, the harness's own
    `toolUseResult.success` field, plus the boundary's own `isMeta`/`origin`
    fields), never the text; lines without the tool's name or a collected id
    are not even parsed, so a multi-megabyte transcript costs two substring
    scans. Any read/parse trouble → False (the stop is then judged as before
    — fail toward today's behaviour, never toward silence)."""
    boundary = _last_resume_boundary_line(path)
    ids = set()
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i <= boundary:
                    continue  # an earlier segment's handback — not this one's
                if "SubagentHandback" in line:
                    try:
                        row = json.loads(line)
                    except Exception:
                        continue
                    content = ((row.get("message") or {}).get("content")) if isinstance(row, dict) else None
                    for b in content if isinstance(content, list) else []:
                        if isinstance(b, dict) and b.get("type") == "tool_use" \
                                and b.get("name") == "SubagentHandback" and isinstance(b.get("id"), str):
                            ids.add(b["id"])
                if ids and any(i in line for i in ids):
                    try:
                        row = json.loads(line)
                    except Exception:
                        continue
                    res = row.get("toolUseResult") if isinstance(row, dict) else None
                    content = ((row.get("message") or {}).get("content")) if isinstance(row, dict) else None
                    for b in content if isinstance(content, list) else []:
                        if isinstance(b, dict) and b.get("type") == "tool_result" \
                                and b.get("tool_use_id") in ids \
                                and isinstance(res, dict) and res.get("success") is True:
                            return True
    except Exception:
        return False
    return False


def deny_reason_envelope(reason):
    # PreToolUse's own channel (the one prdt-dispatch-gate.sh uses): the reason
    # reaches the WORKER as the tool call's error, so the worker calls
    # SubagentHandback again with a corrected `message`.
    return {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                   "permissionDecision": "deny",
                                   "permissionDecisionReason": reason}}


# Fail OPEN on any surprise: a gate that misfires strands a dispatch, an advisory
# that misses costs one notice. Nothing below may raise past this block.
try:
    note_schema_boundary()
except Exception:
    pass
try:
    agent_id = ev.get("agent_id")
    if not isinstance(agent_id, str) or not agent_id:
        agent_id = None
    wt = worker_transcript_path(agent_id)

    if event == "PreToolUse":
        # ── the handback: judged BEFORE it is delivered (T-688 개정 1) ──────────
        if wt is not None and not os.path.isfile(wt):
            sys.exit(0)                      # not a dispatched worker (T-696)
        if wt is not None and handback_delivered(wt):
            sys.exit(0)                      # the harness refuses a second one anyway
        if agent_id is None:
            # MEDIUM (QA grill): remember_block/recall_block key their one-retry
            # cap on agent_id and silently no-op without one (by design — a
            # cap keyed on nothing would cap nothing), so judging a handback
            # here with no agent_id would deny it, see `already` come back
            # None on every subsequent call for the SAME worker (nothing ever
            # remembers "already denied once"), and deny it again — an
            # unbounded deny loop, never resolving, for a worker this hook can
            # never identify well enough to let through on its second try.
            # Fail OPEN instead (the header's own rule): a judgment this hook
            # cannot cap is worse than no judgment at all.
            sys.exit(0)
        text = (ev.get("tool_input") or {}).get("message") if isinstance(ev.get("tool_input"), dict) else None
        if not isinstance(text, str):
            sys.exit(0)
        violations = [(c, d) for c, d in envelope_violations(text) if c in RETURN_FLAG_CODES]
        already = None
        try:
            already = recall_block(agent_id, "hb:")   # consumed: this call is the retry
        except Exception:
            pass
        if not violations:
            if already is not None:
                try:
                    log_gate("repaired", already, agent_id, "handback")
                except Exception:
                    pass
            sys.exit(0)
        codes = [c for c, _d in violations]
        if already is None:
            # First handback of this agent_id: deny it, the worker calls again.
            sys.stdout.write(json.dumps(deny_reason_envelope(block_reason(violations))) + "\n")
            sys.stdout.flush()
            try:
                remember_block(agent_id, codes, "hb:")
            except Exception:
                pass
            try:
                log_gate("blocked", codes, agent_id, "handback")
            except Exception:
                pass
        else:
            # Its retry still violates: one retry was the cap. Let it through,
            # queue the notice for the PO.
            try:
                queue_flag(codes)
            except Exception:
                pass
            try:
                log_gate("failed", codes, agent_id, "handback")
            except Exception:
                pass
        sys.exit(0)

    # ── SubagentStop: the return of a worker that did not hand back ─────────
    if wt is None or not os.path.isfile(wt):
        sys.exit(0)                          # not a dispatched worker's return (T-696)
    if handback_delivered(wt):
        sys.exit(0)                          # the PO holds the handback; this text never reaches it
    last = ev.get("last_assistant_message")
    if not isinstance(last, str):        # measured shape is a plain string; anything else: no judgment
        sys.exit(0)
    violations = [(c, d) for c, d in envelope_violations(last) if c in RETURN_FLAG_CODES]
    refire = ev.get("stop_hook_active") is True
    if not violations:
        if refire:
            try:
                original = recall_block(agent_id) or []
                log_gate("repaired", original, agent_id)
            except Exception:
                pass
        sys.exit(0)
    codes = [c for c, _d in violations]
    if not refire:
        # First firing: hand the return back. Print FIRST — the decision must not
        # depend on the evidence log being writable.
        sys.stdout.write(json.dumps({"decision": "block", "reason": block_reason(violations)}) + "\n")
        sys.stdout.flush()
        try:
            remember_block(agent_id, codes)
        except Exception:
            pass
        try:
            log_gate("blocked", codes, agent_id)
        except Exception:
            pass
    else:
        # Re-fire after our block: one retry was the cap. Let it through, queue
        # the notice for the PO.
        try:
            queue_flag(codes)
        except Exception:
            pass
        try:
            recall_block(agent_id)  # consumed for cleanup; this row keeps its own freshly-detected codes
        except Exception:
            pass
        try:
            log_gate("failed", codes, agent_id)
        except Exception:
            pass
except SystemExit:
    raise
except Exception:
    pass
PYEOF
