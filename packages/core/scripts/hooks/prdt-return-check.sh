#!/usr/bin/env bash
# prdt — worker return-envelope GATE (T-553; grew out of the T-490 slice 3 advisory).
# Registered ONCE:
#   SubagentStop (matcher: ^prdt-) — the only event that carries a worker's
#   `last_assistant_message`, i.e. the return itself, while the worker is still live.
#
# WHAT IT DOES. It validates the contracts §Return envelope floor (single JSON
# object, first char `{`, persona in the CLI enum, task ≤80, summary ≤200,
# confidence a number 0..1, needs_info ⇒ next_question, machine-facing fields in
# English) and acts on the outcome in exactly three ways:
#   clean return              → prints NOTHING, writes nothing. The worker is never
#                               resumed, not even once — measured cost: one python3
#                               start.
#   first violation           → prints {"decision":"block","reason":…}. Measured
#     (`stop_hook_active`       2026-09-04 (Claude Code 2.1.260, 2/2 trials) and
#      false)                   re-measured on 2.1.266 (T-553): this RESUMES the
#                               worker, it re-emits a corrected final message, and
#                               the parent receives ONLY the corrected one. The
#                               reason names each violation with the rule AND the
#                               offending value (a length, the first character) so
#                               it is fixable in one pass, then restates the required
#                               shape — the measured re-ask repaired violations the
#                               reason never enumerated (fence + missing keys +
#                               confidence:"high" + a 306-char summary, one pass).
#   second violation          → prints NOTHING and queues a closed-vocabulary flag
#     (`stop_hook_active`       (with `reask: true`) to .prdt/.return-flags.json for
#      true)                    prdt-user-prompt.sh to render on the PO's next prompt.
#                               ONE retry is the cap, and the cap needs no state file
#                               of ours: `stop_hook_active` is the harness's own loop
#                               guard (false on the first firing, true on the re-fire).
#                               A worker that fails twice is never stranded — the PO
#                               gets its return as-is plus the notice.
# It never EDITS a return: it hands it back and the worker rewrites it. Parsing a
# malformed return to repair it is the rejected alternative (T-553 §3) in disguise.
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
#
# UNKNOWN EXTRA KEYS ARE ALLOWED AND NEVER FLAGGED — a decision, not an oversight:
# the envelope schema is a floor, not a whitelist (the dispatch gate makes the same
# call for `[ctx]`), and contracts §Return envelope's own conditional keys mean a
# perfectly well-formed return routinely carries keys this check has never heard
# of. Flagging them would teach the worker to strip signal out of its return.

set +e
EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

PRDT_EVENT_JSON="$EVENT_JSON" python3 - <<'PYEOF'
import json, os, re, sys
from datetime import datetime, timezone

try:
    ev = json.loads(os.environ.get("PRDT_EVENT_JSON", ""))
except Exception:
    sys.exit(0)
if not isinstance(ev, dict):
    sys.exit(0)

# Event and agent type are checked STRUCTURALLY, never by substring: the matcher
# is supposed to narrow this to SubagentStop/^prdt-, and this is the check that
# makes a mis-registration a no-op instead of a surprise.
if ev.get("hook_event_name") != "SubagentStop":
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
        return [("not-json-object",
                 "the first character is " + json.dumps(stripped[0]) + " but the contract "
                 "says `{` — a code fence, a heading, or a sentence before the object all count")]
    try:
        env = json.loads(stripped)
    except Exception:
        # A JSON object followed by prose lands here too, and correctly so: the
        # contract is ONE object, nothing after it.
        return [("parse-failed",
                 "the text does not parse as ONE JSON object — either the object is "
                 "truncated or there is text after its closing `}`")]
    if not isinstance(env, dict):
        return [("not-an-object", "the JSON parses but is " + json_type_name(env) + ", not an object")]
    out = []
    for k in RETURN_REQUIRED:
        if env.get(k) is None:
            out.append(("missing-key:" + k, "required key `" + k + "` is missing or null"))
    p = env.get("persona")
    if p is not None and p not in RETURN_PERSONAS:
        out.append(("persona-not-in-enum",
                    "`persona` must be one of " + "|".join(RETURN_PERSONAS) + " (yours is not)"))
    for k, cap in RETURN_CAPS:
        v = env.get(k)
        if isinstance(v, str) and len(v) > cap:
            out.append(("over-cap:" + k, "`" + k + "` is " + str(len(v)) + " chars, cap " + str(cap)))
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
                        "`needs_info` is true but `next_question` is missing or blank "
                        "— exactly one question, ≤200 chars"))
    for k, _cap in RETURN_CAPS:
        v = env.get(k)
        if isinstance(v, str) and hangul_ratio(v) > 0.1:
            out.append(("hangul:" + k,
                        "`" + k + "` is " + str(int(round(hangul_ratio(v) * 100))) + "% Hangul by "
                        "letters — machine-facing fields are English (contracts §Language)"))
    return out


def block_reason(violations):
    # Every word here is this file's own literal (see the header); the details
    # carry at most a length, a type name, or one character.
    return (
        "[prdt return check] BLOCKED — your final message is not a valid return envelope "
        "(contracts §Return envelope). This is the ONE re-ask: a second failure passes "
        "through as-is and is reported to the PO. What is wrong: "
        + "; ".join(d for _c, d in violations) + ". "
        "Re-emit your ENTIRE return now as ONE JSON object and nothing else — first "
        "character `{`, no code fence, no prose before or after it — with `persona` "
        "(" + "|".join(RETURN_PERSONAS) + ") · `task` (≤80 chars) · `summary` (≤200 chars, "
        "the machine outcome) · `confidence` (a JSON number 0..1); keep every other field "
        "you already had — unknown extra keys are allowed."
    )


def atomic_write(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
    os.replace(tmp, path)


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


def log_gate(outcome, codes):
    """Evidence the gate fired at all: `.prdt/.return-gate.jsonl`, one line per
    gate event (blocked · repaired · failed) — the re-ask rate T-553 §3 reads
    after a round (>30 % re-asks is the trigger for the `prdt return` CLI).
    Codes only, never payload. Never rendered."""
    with open(os.path.join(state_dir, ".return-gate.jsonl"), "a") as f:
        f.write(json.dumps({"ts": now, "persona": persona, "outcome": outcome, "codes": codes}) + "\n")


# Fail OPEN on any surprise: a gate that misfires strands a dispatch, an advisory
# that misses costs one notice. Nothing below may raise past this block.
try:
    last = ev.get("last_assistant_message")
    if not isinstance(last, str):        # measured shape is a plain string; anything else: no judgment
        sys.exit(0)
    violations = [(c, d) for c, d in envelope_violations(last) if c in RETURN_FLAG_CODES]
    refire = ev.get("stop_hook_active") is True
    if not violations:
        if refire:
            try:
                log_gate("repaired", [])
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
            log_gate("blocked", codes)
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
            log_gate("failed", codes)
        except Exception:
            pass
except SystemExit:
    raise
except Exception:
    pass
PYEOF
exit 0
