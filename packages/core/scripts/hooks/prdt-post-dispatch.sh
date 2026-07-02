#!/usr/bin/env bash
# prdt — Claude Code PostToolUse hook, matcher: Agent (v1 hook #3).
#
# Mechanical state recording after a persona dispatch (§9 #3) — the side effects
# that full productune hid inside the statusline (v1 statusline is display-only, §10):
#   a) .prdt/sessions.json     — {persona: {agent_id?, last_seen}} (jq-atomic via python)
#   b) .prdt/turns.jsonl       — cost/usage archive, same field names + 2-scope layout
#      as full (scope=subagent per dispatch · scope=main transcript-cumulative,
#      delta-gated). Best-effort: absent usage/cost fields → nulls, never a failure.
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

tool = ev.get("tool_name") or ""
tin = ev.get("tool_input") or {}
if tool != "Agent":
    sys.exit(0)
sub = str(tin.get("subagent_type") or "")
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
agent_id = resp_obj.get("agentId") or resp_obj.get("agent_id")
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

# b1) scope=subagent — per-dispatch record (mirrors full's subagent writer fields)
cost = resp_obj.get("total_cost_usd")
if cost is None and isinstance(resp_obj.get("cost"), dict):
    cost = resp_obj["cost"].get("total_cost_usd")
line = {"ts": now, "scope": "subagent", "persona": persona,
        "session_id": resp_obj.get("session_id") or agent_id,
        "model": (resp_obj.get("model") or {}).get("id") if isinstance(resp_obj.get("model"), dict) else resp_obj.get("model"),
        "cost_usd": cost if isinstance(cost, (int, float)) else None,
        "cost_basis": "subagent_total", "usage": usage_from(resp_obj),
        "version": version, "task_slug": task_slug, "ticket_id": ticket_id}
with open(turns, "a") as f:
    f.write(json.dumps(line, ensure_ascii=False) + "\n")

# b2) scope=main — transcript-cumulative token sum, delta-gated per session
tpath = ev.get("transcript_path")
sid = ev.get("session_id") or "_nosession"
if tpath and os.path.isfile(tpath):
    tot = {"input": 0, "output": 0, "cache": 0}
    seen = False
    try:
        with open(tpath) as f:
            for raw in f:
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                u = usage_from((msg.get("message") or {}) if isinstance(msg.get("message"), dict) else msg)
                if u:
                    seen = True
                    for k in tot:
                        tot[k] += u[k]
    except Exception:
        seen = False
    if seen:
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
                    "model": None, "cost_usd": None,
                    "cost_basis": "main_session_cumulative", "usage": tot,
                    "version": version, "task_slug": task_slug, "ticket_id": ticket_id}
            with open(turns, "a") as f:
                f.write(json.dumps(line, ensure_ascii=False) + "\n")
PYEOF
exit 0
