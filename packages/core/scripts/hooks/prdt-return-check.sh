#!/usr/bin/env bash
# prdt — worker return-envelope check (T-490 slice 3 → its own hook, T-553). Registered ONCE:
#   SubagentStop (matcher: ^prdt-) — the only event that carries a worker's
#   `last_assistant_message`, i.e. the return itself.
#
# Moved out of prdt-post-dispatch.sh (a state-recording hook that must never
# break a session) so the return check owns its own process and its own output.
# This file ONLY checks the return and queues a closed-vocabulary flag to
# .prdt/.return-flags.json for prdt-user-prompt.sh to render on the PO's next
# prompt — the channel T-498 r9 proved reaches the PO.
#
# NEVER emit `hookSpecificOutput.additionalContext` from this hook (measured
# 2026-08-24, harness 2.1.241, headless rig per T-498 §8/§9b): a SubagentStop
# additionalContext is injected into the WORKER and RESUMES it — one probe line
# produced 9 further SubagentStop firings, the worker itself echoing the token —
# so it reports to the wrong model AND burns worker turns in an unbounded loop.
#
# WHAT CROSSES THE QUEUE FILE IS A CLOSED VOCABULARY, NEVER PAYLOAD TEXT — two
# load-bearing reasons: (1) the flag reaches a model and the text under
# inspection is a worker's own output, so echoing it would make this an injection
# channel out of the very thing being distrusted (prdt-dispatch-gate.sh makes the
# same call on the dispatch side); (2) `.prdt/` is PROJECT-LOCAL and ships with a
# clone (T-471), so the queue file is as tamperable as po-state.json. Only codes
# from RETURN_FLAG_CODES and one persona token cross it, and prdt-user-prompt.sh
# composes every word of the rendered line from its OWN literals after
# shape-matching both.
#
# UNKNOWN EXTRA KEYS ARE ALLOWED AND NEVER FLAGGED — stated here explicitly
# rather than by omission, because it is a decision and not an oversight: the
# envelope schema is a floor, not a whitelist (the dispatch gate makes the same
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
    "missing-key:confidence", "over-cap:task", "over-cap:summary",
    "confidence-out-of-range", "needs_info-without-next_question",
    "hangul:task", "hangul:summary",
)
RETURN_REQUIRED = ("persona", "task", "summary", "confidence")
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


def envelope_flag_codes(text):
    """Closed-vocabulary codes for a worker's final message. [] == well-formed.

    Empty / whitespace-only is NOT a violation here: it means this hook cannot
    see the return (a shape the harness did not hand us), and a check that
    guesses in that case would flag healthy dispatches.
    """
    stripped = text.strip()
    if not stripped:
        return []
    # contracts §Return envelope: "single JSON object, first stdout char `{`".
    # Leading whitespace is tolerated; a ```json fence, a prose paragraph, or a
    # bare array all fail here — which is the observed slip (5 prose returns).
    if stripped[0] != "{":
        return ["not-json-object"]
    try:
        env = json.loads(stripped)
    except Exception:
        # A JSON object followed by prose lands here too, and correctly so: the
        # contract is ONE object, nothing after it.
        return ["parse-failed"]
    if not isinstance(env, dict):
        return ["not-an-object"]
    codes = []
    for k in RETURN_REQUIRED:
        if env.get(k) is None:
            codes.append("missing-key:" + k)
    for k, cap in RETURN_CAPS:
        v = env.get(k)
        if isinstance(v, str) and len(v) > cap:
            codes.append("over-cap:" + k)
    conf = env.get("confidence")
    # bool is an int in Python — `true` is not a confidence.
    if conf is not None and (isinstance(conf, bool)
                             or not isinstance(conf, (int, float))
                             or not (0 <= conf <= 1)):
        codes.append("confidence-out-of-range")
    if env.get("needs_info") is True:
        nq = env.get("next_question")
        if not (isinstance(nq, str) and nq.strip()):
            codes.append("needs_info-without-next_question")
    for k, _cap in RETURN_CAPS:
        v = env.get(k)
        if isinstance(v, str) and hangul_ratio(v) > 0.1:
            codes.append("hangul:" + k)
    return codes


def atomic_write(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
    os.replace(tmp, path)


def queue_flag(codes):
    path = os.path.join(state_dir, ".return-flags.json")
    try:
        with open(path) as f:
            q = json.load(f)
        flags = q.get("flags") if isinstance(q, dict) else None
        if not isinstance(flags, list):
            flags = []
    except Exception:
        flags = []
    flags.append({"ts": now, "persona": persona, "codes": codes})
    # Bounded so an unattended session cannot grow a queue that floods the PO's
    # next prompt; the renderer reports how many it dropped.
    atomic_write(path, {"flags": flags[-RETURN_FLAG_QUEUE_CAP:]})


# Silent on a well-formed return, and silent on any surprise — this is advisory,
# so failing open costs one missed notice while failing loud would cost a turn.
try:
    last = ev.get("last_assistant_message")
    if isinstance(last, str):        # measured shape is a plain string; anything else: no judgment
        codes = [c for c in envelope_flag_codes(last) if c in RETURN_FLAG_CODES]
        if codes:
            queue_flag(codes)
except Exception:
    pass
PYEOF
exit 0
