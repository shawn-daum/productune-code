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
# Silent no-op on anything that isn't a prdt-* Agent dispatch.

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

# project root: walk up from event cwd
d = ev.get("cwd") or os.getcwd()
root = None
while d and d != "/":
    if os.path.isfile(os.path.join(d, ".prdt", "po-state.json")):
        root = d
        break
    d = os.path.dirname(d)
if not root:
    sys.exit(0)
state_dir = os.path.join(root, ".prdt")
now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

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


# ── SubagentStop: completion-time subagent line (usage summed from its transcript) ──
if event == "SubagentStop":
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
