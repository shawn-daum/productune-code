#!/usr/bin/env bash
# prdt — Claude Code state-recording hook (v1 hook #3). Registered TWICE:
#   PostToolUse (matcher: Agent)      — dispatch time: sessions.json + main line
#                                       (+ subagent line if the sync response carries usage)
#   SubagentStop (matcher: ^prdt-)    — completion time: subagent line summed from
#                                       agent_transcript_path (2026-07-02: background
#                                       dispatch responses carry NO usage — launch metadata only)
# Dedupe: .prdt/.subagent-gate.json marks agent_ids whose subagent line is already written.
#
# Mechanical state recording after a persona dispatch (§9 #3) — the side effects
# that full productune hid inside the statusline (v1 statusline is display-only, §10):
#   a) .prdt/sessions.json     — {persona: {agent_id?, last_seen}} (jq-atomic via python)
#   b) .prdt/turns.jsonl       — cost/usage archive, same field names + 2-scope layout
#      as full (scope=subagent per dispatch · scope=main transcript-cumulative,
#      delta-gated). Best-effort: absent usage/cost fields → nulls, never a failure.
#      cost_usd absent from the payload → ESTIMATED from usage × API price table
#      (2026-07-02 확정, 열린 항목 ③): cache read = 0.1×input, cache write(5m) = 1.25×input.
#      cost_source marks "reported" vs "estimated" (additive field; GUI-safe).
#   c) meta autosave beat (T-367, PRD v1.2) — fire-and-forget metaAutosaveTick
#      via the core meta-cli bridge, only when .prdt/meta.git exists.
#   d) return-envelope advisory (T-490 slice 3, SubagentStop only) — a worker
#      whose final message is not a well-formed envelope gets a closed-vocabulary
#      flag queued to .prdt/.return-flags.json for prdt-user-prompt.sh to render.
#      DETECTION ONLY: nothing is blocked, nothing is retried, and this hook still
#      prints NOTHING on SubagentStop (see the measurement at that section — a
#      SubagentStop additionalContext resumes the WORKER, not the PO).
# Silent no-op on anything that isn't a prdt-* Agent dispatch.

set +e
EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

PRDT_EVENT_JSON="$EVENT_JSON" python3 - <<'PYEOF'
import json, os, re, shutil, subprocess, sys
from datetime import datetime, timezone

try:
    ev = json.loads(os.environ.get("PRDT_EVENT_JSON", ""))
except Exception:
    sys.exit(0)

event = ev.get("hook_event_name") or "PostToolUse"
tool = ev.get("tool_name") or ""
tin = ev.get("tool_input") or {}
if event == "SubagentStop":
    sub = str(ev.get("agent_type") or "")
elif tool == "Agent":
    sub = str(tin.get("subagent_type") or "")
else:
    sys.exit(0)
if not sub.startswith("prdt-"):
    sys.exit(0)
persona = sub[len("prdt-"):]

# project root = meta root: walk the WHOLE ancestor chain from the event cwd and
# take the OUTERMOST dir holding `.prdt/po-state.json` (T-484 — never the
# nearest: a `.prdt/` planted inside the cloned CODE tree is an inner candidate
# by construction and can never win; legitimate layouts carry exactly one marker
# on the chain, so for them outermost == nearest). Keep in lockstep with the
# bash find_proj in prdt-session-start.sh / prdt-project-overrides-inject.sh and
# the twin below in prdt-user-prompt.sh.
# Under the v1.3 physical split (PRD §v1.3 설계 결정 4) the session cwd may be the
# CODE root (`<projectRoot>/<code.dir>`); this walk then resolves the parent
# projectRoot, where `.prdt/` (and meta.git) live. Legacy layout finds it at
# depth 0. All meta ops below anchor at this projectRoot.
# PHYSICAL first (T-493): realpath before walking — the CLI resolver does
# (`Path.resolve()`), and a lexical walk answers a DIFFERENT project whenever the
# cwd carries a symlink component, which is how the statusline and `prdt` ended
# up reading/writing two different po-state files in one terminal.
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

# ── meta autosave beat (T-367) ────────────────────────────────────────────────
# The persona-turn beat this hook already fires on (PostToolUse:Agent +
# SubagentStop) doubles as the META repo's autosave beat — PRD v1.2 경계 결정 2
# reuses the §10 lifecycle signals, no new trigger system. CLI terminal
# sessions and GUI-spawned sessions both run through this SAME hook, so this
# single call site is what makes meta commits fire identically from either
# surface (parity by construction). All git logic stays in core: we spawn the
# meta-cli bridge (metaAutosaveTick) fire-and-forget — never blocks the turn,
# never prints. Silent no-op when the project has no meta split (meta.git
# absent — checked FIRST, before any spawn), or node / the built core bridge
# is unavailable on this machine.
try:
    if os.path.isfile(os.path.join(state_dir, "meta.git", "HEAD")):
        prdt_repo = None
        _envf = os.path.expanduser("~/.prdt/prdt.env")
        if os.path.isfile(_envf):
            for _line in open(_envf, encoding="utf-8").read().splitlines():
                if _line.startswith("PRDT_REPO="):
                    prdt_repo = _line.split("=", 1)[1].strip()
                    break
        _node = shutil.which("node")
        # PRDT_REPO = <repo>/packages/core (install.sh's $ROOT)
        _bridge = os.path.join(prdt_repo or "", "dist", "bin", "meta-cli.cjs")
        if prdt_repo and _node and os.path.isfile(_bridge):
            subprocess.Popen(
                [_node, _bridge, "tick", root],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
except Exception:
    pass

resp = ev.get("tool_response")
resp_obj = resp if isinstance(resp, dict) else {}
resp_text = resp if isinstance(resp, str) else json.dumps(resp_obj)


def atomic_write(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
    os.replace(tmp, path)


# a) sessions.json
sess_path = os.path.join(state_dir, "sessions.json")
try:
    with open(sess_path) as f:
        sess = json.load(f)
    if not isinstance(sess, dict):
        sess = {}
except Exception:
    sess = {}
agent_id = ev.get("agent_id") or resp_obj.get("agentId") or resp_obj.get("agent_id")
if not agent_id:
    m = re.search(r'"agent[_]?[iI]d"\s*:\s*"([^"]+)"', resp_text)
    agent_id = m.group(1) if m else None
entry = {"last_seen": now}
if agent_id:
    entry["agent_id"] = agent_id
sess[persona] = {**sess.get(persona, {}), **entry}
atomic_write(sess_path, sess)

# context for turns lines: version / task from po-state
version = task_slug = ticket_id = None
try:
    with open(os.path.join(state_dir, "po-state.json")) as f:
        st = json.load(f)
    version = st.get("version")
    ct = st.get("current_task")
    if isinstance(ct, dict):
        task_slug, ticket_id = ct.get("slug"), ct.get("ticket_id")
except Exception:
    pass


# USD per MTok (input, output) — cached 2026-07-02 from the Claude API price table.
# Sonnet 5 has intro pricing ($2/$10) through 2026-08-31; list price used here.
# Cache multipliers: read = 0.1 × input · write(5m TTL) = 1.25 × input.
PRICES = {
    "fable-5": (10.0, 50.0), "mythos-5": (10.0, 50.0),
    "opus-4-8": (5.0, 25.0), "opus-4-7": (5.0, 25.0), "opus-4-6": (5.0, 25.0),
    "opus-4-5": (5.0, 25.0), "opus-4-1": (15.0, 75.0), "opus-4-0": (15.0, 75.0),
    "sonnet-5": (3.0, 15.0), "sonnet-4": (3.0, 15.0),
    "haiku-4-5": (1.0, 5.0), "haiku-3-5": (0.8, 4.0), "haiku-3": (0.25, 1.25),
}


def price_for(model):
    m = (model or "").lower()
    for key in sorted(PRICES, key=len, reverse=True):
        if key in m:
            return PRICES[key]
    return None


def estimate_cost(per_model):
    """per_model: {model: {input, output, cache_read, cache_creation}} → USD or None."""
    total, priced = 0.0, False
    for model, u in per_model.items():
        p = price_for(model)
        if not p:
            continue
        pi, po = p
        total += (u["input"] * pi + u["output"] * po
                  + u["cache_read"] * 0.1 * pi + u["cache_creation"] * 1.25 * pi) / 1e6
        priced = True
    return round(total, 6) if priced else None


def usage4_from(obj):
    """4-bucket split for pricing: {input, output, cache_read, cache_creation} or None."""
    u = obj.get("usage") if isinstance(obj, dict) else None
    if not isinstance(u, dict):
        return None
    def g(*names):
        tot, seen = 0, False
        for nm in names:
            v = u.get(nm)
            if isinstance(v, (int, float)):
                tot += int(v); seen = True
        return tot, seen
    ti, s1 = g("input", "input_tokens")
    to, s2 = g("output", "output_tokens")
    cr, s3 = g("cache_read", "cache_read_input_tokens")
    cw, s4 = g("cache_creation", "cache_creation_input_tokens")
    if not (s1 or s2 or s3 or s4):
        return None
    return {"input": ti, "output": to, "cache_read": cr, "cache_creation": cw}


def usage_from(obj):
    u = obj.get("usage") if isinstance(obj, dict) else None
    if not isinstance(u, dict):
        return None
    def g(*names):
        tot, seen = 0, False
        for nm in names:
            v = u.get(nm)
            if isinstance(v, (int, float)):
                tot += int(v); seen = True
        return tot, seen
    ti, s1 = g("input", "input_tokens")
    to, s2 = g("output", "output_tokens")
    tc, s3 = g("cache", "cache_read", "cache_creation",
               "cache_read_input_tokens", "cache_creation_input_tokens")
    return {"input": ti, "output": to, "cache": tc} if (s1 or s2 or s3) else None


turns = os.path.join(state_dir, "turns.jsonl")
gate_sub_path = os.path.join(state_dir, ".subagent-gate.json")


def load_json_map(path):
    try:
        with open(path) as f:
            g = json.load(f)
        return g if isinstance(g, dict) else {}
    except Exception:
        return {}


def sum_transcript(path):
    """Sum per-model 4-bucket usage over a transcript JSONL. → (per_model, seen)"""
    per_model, seen = {}, False
    try:
        with open(path) as f:
            for raw in f:
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                body = (msg.get("message") or {}) if isinstance(msg.get("message"), dict) else msg
                u4 = usage4_from(body)
                if u4:
                    seen = True
                    mdl = body.get("model") if isinstance(body, dict) else None
                    acc = per_model.setdefault(mdl or "_unknown",
                                               {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0})
                    for k in acc:
                        acc[k] += u4[k]
    except Exception:
        return {}, False
    return per_model, seen


def three_bucket(per_model):
    tot = {"input": 0, "output": 0, "cache": 0}
    for u in per_model.values():
        tot["input"] += u["input"]
        tot["output"] += u["output"]
        tot["cache"] += u["cache_read"] + u["cache_creation"]
    return tot


# ── worker return-envelope check (T-490 slice 3) ───────────────────────────────
# DETECTION ONLY, and that is a design constraint rather than a shortcut: by the
# time a worker's final message exists its tokens are already spent, so there is
# nothing left to block, and an automatic retry would spend a SECOND worker on a
# judgment only the PO can make. Nothing below ever blocks, denies, or
# re-dispatches — it records that a return was malformed so the PO sees it.
#
# WHY THE FLAG IS QUEUED TO A FILE INSTEAD OF PRINTED (measured 2026-08-24,
# harness 2.1.241, headless rig per T-498 §8/§9b): a SubagentStop hook's
# `hookSpecificOutput.additionalContext` does NOT reach the parent (PO) model —
# it is injected into the WORKER and RESUMES it. One probe line
# (`PROBE_SAS=6464`) produced 9 further SubagentStop firings, the worker itself
# answering "I've received the additional context (PROBE_SAS=6464)". Emitting
# here would therefore burn worker turns in a loop in order to report that a
# worker burned its turns — the exact inversion of this check's purpose.
# PostToolUse additionalContext DOES render to the parent (same probe, matchers
# `Agent` and `Bash` both read back), but PostToolUse/Agent fires at LAUNCH for a
# background dispatch (`{"isAsync":true,"status":"async_launched"}` — no final
# message to inspect), which is how prdt dispatches actually run. So: detect HERE,
# where `last_assistant_message` is, and render from prdt-user-prompt.sh, the
# channel T-498 r9 proved reaches the PO. The cost is that the flag lands on the
# PO's NEXT prompt instead of mid-turn. NEVER print on SubagentStop from this hook.
#
# WHAT CROSSES THAT FILE IS A CLOSED VOCABULARY, NEVER PAYLOAD TEXT — two
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


def check_return_envelope(ev, state_dir, persona):
    """Queue a return-envelope flag for prdt-user-prompt.sh to render. Silent on
    a well-formed return, and silent on any surprise — this is advisory, so
    failing open costs one missed notice while failing loud would cost a turn."""
    last = ev.get("last_assistant_message")
    if not isinstance(last, str):
        return                      # measured shape is a plain string; anything else: no judgment
    codes = [c for c in envelope_flag_codes(last) if c in RETURN_FLAG_CODES]
    if not codes:
        return
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


# ── SubagentStop: completion-time subagent line (usage summed from its transcript) ──
if event == "SubagentStop":
    # advisory FIRST and outside the turns-line dedupe below: the dedupe
    # answers "was this agent's cost already recorded", which has nothing to
    # do with whether its return was well formed. Wrapped, because a state
    # hook must never break a session over an advisory.
    try:
        check_return_envelope(ev, state_dir, persona)
    except Exception:
        pass
    gate = load_json_map(gate_sub_path)
    if agent_id and gate.get(agent_id):
        sys.exit(0)  # sync dispatch already recorded this agent at PostToolUse time
    atp = ev.get("agent_transcript_path")
    per_model, seen = sum_transcript(atp) if atp and os.path.isfile(atp) else ({}, False)
    cost = estimate_cost(per_model) if seen else None
    line = {"ts": now, "scope": "subagent", "persona": persona,
            "session_id": agent_id,
            "model": max(per_model, key=lambda m: sum(per_model[m].values())) if per_model else None,
            "cost_usd": cost, "cost_source": "estimated" if cost is not None else None,
            "cost_basis": "subagent_total", "usage": three_bucket(per_model) if seen else None,
            "version": version, "task_slug": task_slug, "ticket_id": ticket_id}
    with open(turns, "a") as f:
        f.write(json.dumps(line, ensure_ascii=False) + "\n")
    if agent_id:
        gate[agent_id] = True
        atomic_write(gate_sub_path, gate)
    sys.exit(0)

# b1) scope=subagent — dispatch-time record, ONLY when the (sync) response carries
#     usage/cost; background launches carry none — SubagentStop covers them.
cost = resp_obj.get("total_cost_usd")
if cost is None and isinstance(resp_obj.get("cost"), dict):
    cost = resp_obj["cost"].get("total_cost_usd")
sub_model = (resp_obj.get("model") or {}).get("id") if isinstance(resp_obj.get("model"), dict) else resp_obj.get("model")
cost_source = "reported" if isinstance(cost, (int, float)) else None
if cost_source is None:
    u4 = usage4_from(resp_obj)
    if u4 and sub_model:
        cost = estimate_cost({sub_model: u4})
        cost_source = "estimated" if cost is not None else None
sub_usage = usage_from(resp_obj)
if sub_usage or isinstance(cost, (int, float)):
    line = {"ts": now, "scope": "subagent", "persona": persona,
            "session_id": resp_obj.get("session_id") or agent_id,
            "model": sub_model,
            "cost_usd": cost if isinstance(cost, (int, float)) else None,
            "cost_source": cost_source,
            "cost_basis": "subagent_total", "usage": sub_usage,
            "version": version, "task_slug": task_slug, "ticket_id": ticket_id}
    with open(turns, "a") as f:
        f.write(json.dumps(line, ensure_ascii=False) + "\n")
    if agent_id:
        gate = load_json_map(gate_sub_path)
        gate[agent_id] = True
        atomic_write(gate_sub_path, gate)

# b2) scope=main — transcript-cumulative token sum, delta-gated per session
tpath = ev.get("transcript_path")
sid = ev.get("session_id") or "_nosession"
if tpath and os.path.isfile(tpath):
    per_model, seen = sum_transcript(tpath)
    if seen:
        # recorded usage keeps the legacy 3-bucket shape (cache = read + creation)
        tot = three_bucket(per_model)
        main_cost = estimate_cost(per_model)
        gate_path = os.path.join(state_dir, ".cost-main-gate.json")
        try:
            with open(gate_path) as f:
                gate = json.load(f)
            if not isinstance(gate, dict):
                gate = {}
        except Exception:
            gate = {}
        key_total = sum(tot.values())
        if gate.get(sid) != key_total:
            gate[sid] = key_total
            atomic_write(gate_path, gate)
            line = {"ts": now, "scope": "main", "persona": "po", "session_id": sid,
                    "model": max(per_model, key=lambda m: sum(per_model[m].values())) if per_model else None,
                    "cost_usd": main_cost,
                    "cost_source": "estimated" if main_cost is not None else None,
                    "cost_basis": "main_session_cumulative", "usage": tot,
                    "version": version, "task_slug": task_slug, "ticket_id": ticket_id}
            with open(turns, "a") as f:
                f.write(json.dumps(line, ensure_ascii=False) + "\n")
PYEOF
exit 0
