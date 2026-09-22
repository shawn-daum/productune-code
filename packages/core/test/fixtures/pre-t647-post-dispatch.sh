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
#      (2026-07-02 확정, 열린 항목 ③): cache read = per-model multiplier×input
#      (default 0.1×), cache write(5m) = 1.25×input. cost_source marks
#      "reported" vs "estimated" vs "estimated_partial" (T-543 round 2 F2,
#      narrowed round 3 R2-1): a transcript mixing a priced model with an
#      unpriced model that actually contributes non-zero tokens never yields
#      a partial sum silently mislabeled "estimated" — cost_usd stays null,
#      cost_source is "estimated_partial", and the dropped model ids land in
#      an additive `cost_unpriced_models` field (all additive; GUI-safe). An
#      unpriced model with ZERO tokens in every bucket — Claude Code's real
#      `model:"<synthetic>"` session-limit/interrupt placeholder lines are
#      exactly this — is not a partial sum: it contributes nothing, so it is
#      dropped from consideration rather than voiding the whole total.
#   c) meta autosave beat (T-367, PRD v1.2) — fire-and-forget metaAutosaveTick
#      via the core meta-cli bridge, only when .prdt/meta.git exists.
#   d) (moved, T-553) the worker return-envelope check that used to live here is
#      its own hook now — prdt-return-check.sh, same SubagentStop registration.
#      This hook still prints NOTHING on SubagentStop (see the note at that
#      section — a SubagentStop additionalContext resumes the WORKER, not the PO).
#   e) (T-584) two more properties of a dispatch, ADDITIVE keys on the
#      scope=subagent line (every reader — `prdt usage`/`estimate`, the GUI cost
#      archive — json-parses a line and picks keys, so additive keys are safe;
#      verified against _scan_turns_file / costArchive.ts 2026-09-14):
#        `refs`          — the worker's REFERENCE SET, derived from the SAME
#                          agent_transcript_path this hook already sums usage
#                          from. The harness exposes no such surface on its own
#                          (checked: the SubagentStop payload carries usage-free
#                          launch metadata + the transcript path + the last
#                          message; `prdt` has no subcommand for it), so it is
#                          derived from the worker's own tool_use records and
#                          attachments. The record states its own boundary:
#                            observed[]       Read.file_path · Grep/Glob path —
#                                             exact.
#                            bash_observed[]  path args of read-shaped Bash
#                                             segments (cat/sed/head/tail/grep/
#                                             …) — HEURISTIC (argv parsing), the
#                                             dominant read path on this machine
#                                             (auto mode steers workers to Bash).
#                                             Tokens land VERBATIM: relative to
#                                             whatever cwd that segment ran in,
#                                             globs unexpanded, `~` unexpanded —
#                                             this derivation resolves nothing.
#                            injected[]       files the harness injected without
#                                             a tool call — hook additionalContext
#                                             `----- BEGIN x (<path>) -----`
#                                             delimiters + CLAUDE.md instruction
#                                             files (transcript `attachment`
#                                             records).
#                            unobservable{}   COUNTS of consults this derivation
#                                             cannot see into: bash_opaque (a
#                                             Bash segment that is not a known
#                                             read/neutral command — python/node
#                                             heredocs, git, find, curl…), agent
#                                             (a sub-dispatch's reads live in ITS
#                                             transcript), web, mcp, skill.
#                          "read nothing" is `source:"agent_transcript"` with
#                          empty lists and zero counts; "we could not see" is a
#                          non-zero unobservable count or `source:null` (no
#                          transcript at this recording point). A record written
#                          BEFORE this change has no `refs` key at all — history
#                          is never backfilled. Lists are capped (REF_CAP) with the
#                          dropped count in `truncated`, so one record is bounded;
#                          file growth stays T-400's (rotation) problem.
#        `playbooks_run`  — the envelope's `playbooks_run[]` NAMES (never the
#                          free-text `why`: payload-free like every other field
#                          here). Source order: the event's `last_assistant_message`
#                          (the return itself — the same field prdt-return-check.sh
#                          gates on, same SubagentStop registration), else the
#                          transcript's last assistant text block. `playbooks_source`
#                          names which one — or why none was captured:
#                          "envelope_without_key" (a return that omitted the key)
#                          vs "no_envelope" (nothing parseable — a session-limit
#                          placeholder, an unparsed return). A legitimately empty
#                          `[]` is captured as `[]`; "not captured" is `null`.
#      Both are best-effort behind try/except: a derivation failure marks
#      `refs.error` and never costs the usage record.
#      Cost, measured 2026-09-15 over the 60 most recent worker transcripts on
#      this machine (0.5–9.5 MB each): +700 B min · +1.4 KB median · +2.5 KB
#      p90 · +3.2 KB max per scope=subagent line (the line was ~330 B before);
#      9–46 ref entries, the 200 cap never reached; hook wall time unchanged
#      (median 354 ms vs 347 ms before — the transcript was already being read
#      once for usage). Home: turns.jsonl itself, not a sibling — one dispatch
#      = one line keeps the join trivial for `prdt usage`/`estimate`, and
#      ~1.5 KB × ~500 dispatches/yr is well inside T-400's rotation horizon.

set +e
EVENT_JSON="$(cat 2>/dev/null || true)"
[ -z "$EVENT_JSON" ] && exit 0

PRDT_EVENT_JSON="$EVENT_JSON" python3 - <<'PYEOF'
import json, os, re, shlex, shutil, subprocess, sys
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
# Under the v1.3 physical split (PRD history §v1.3 설계 결정 4) the session cwd may be the
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
        # TRUST (T-519 F5 — DECISION: accepted machine-local assumption, not
        # narrowed). This reads PRDT_REPO from ~/.prdt/prdt.env and spawns
        # <PRDT_REPO>/dist/bin/meta-cli.cjs detached (start_new_session). A worker
        # that rewrites that one line gets detached exec on every later dispatch —
        # a persistence primitive. We do NOT try to lock the target down here,
        # because it cannot be: ~/.prdt/ is a same-OS-user zone, and a process that
        # can write prdt.env can already run `node` on anything the user can, this
        # spawn or not. The real boundary is the contracts "~/.prdt is read-only
        # for every persona" rule (a discipline rule, not a file permission), the
        # same boundary decision T-519 takes for the governor run dir. The one
        # mechanical guard kept is os.path.isfile(_bridge) below: no target file,
        # no spawn — so a stale/blank PRDT_REPO fails silent, it does not run
        # something unexpected.
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


# USD per MTok (input, output, cache-read multiplier×input) — cached 2026-07-02
# from the Claude API price table, refreshed 2026-09-14 (T-543 round 1: the
# table never carried a row for `opus-5` at all — it shipped 2026-07-02 with
# only the opus-4-x family, before opus-5 existed, and was never revisited
# when opus-5 became the default/heaviest-used tier; a missing-row bug, not a
# shape/collection defect — every other model priced correctly through the
# same code path).
#
# Round 2 (T-543 F7, QA-verified against the live official pricing page +
# two more sources, 2026-09-14) fixed two more rows that were ALREADY wrong,
# found while re-checking round 1's table rather than caused by it:
#   - sonnet-5 was (3.0, 15.0) — the $2/$10 intro price became the standard
#     price; the $3/$15 increase planned for 2026-09-01 was never applied.
#     Overstated 742 records ~50%.
#   - fable-5-1 has no PRICES row of its own and inherited fable-5's rate by
#     substring match; the input/output rate happens to be correct, but its
#     cache-read discount is 0.025×, not the 0.1× every other current model
#     gets — applying 0.1× uniformly overstated 119 records' cache-read cost
#     4×. Given its own PRICES row below (matched before the shorter
#     "fable-5" key, since price_for() checks longest keys first) so the
#     rate now carries its own multiplier instead of inheriting a wrong one.
# Not fixed here (QA finding, not required by this round — T-628 territory,
# a stale/self-check-free table): fast mode ($10/$50) has no row.
# Cache multipliers: read = per-row 3rd value × input (default 0.1×, see
# fable-5-1) · write(5m TTL) = 1.25 × input (uniform — not reported wrong).
PRICES = {
    "fable-5-1": (10.0, 50.0, 0.025),
    "fable-5": (10.0, 50.0, 0.1), "mythos-5": (10.0, 50.0, 0.1),
    "opus-5": (5.0, 25.0, 0.1),
    "opus-4-8": (5.0, 25.0, 0.1), "opus-4-7": (5.0, 25.0, 0.1), "opus-4-6": (5.0, 25.0, 0.1),
    "opus-4-5": (5.0, 25.0, 0.1), "opus-4-1": (15.0, 75.0, 0.1), "opus-4-0": (15.0, 75.0, 0.1),
    "sonnet-5": (2.0, 10.0, 0.1), "sonnet-4": (3.0, 15.0, 0.1),
    "haiku-4-5": (1.0, 5.0, 0.1), "haiku-3-5": (0.8, 4.0, 0.1), "haiku-3": (0.25, 1.25, 0.1),
}


def price_for(model):
    m = (model or "").lower()
    for key in sorted(PRICES, key=len, reverse=True):
        if key in m:
            row = PRICES[key]
            # R2-3 (T-543 round 3): the 3-tuple refactor (round 1) made a
            # hand-edited row that is still a legal Python literal but the
            # WRONG shape possible — e.g. a 2-tuple missing the cache-read
            # multiplier. Before this check, `pi, po, cr_mult = p` raised an
            # uncaught ValueError that killed this whole python process; the
            # bash wrapper's trailing `exit 0` then swallowed that death, so
            # NO turns.jsonl record was written for the dispatch at all
            # (usage included) — and for the main/b2 path that repeats on
            # every dispatch for the rest of the session. Validate the shape
            # here instead: a malformed row is reported on stderr (non-
            # silent) and treated as unpriced, same as a missing row — the
            # dispatch still gets a record (refused/partial when its tokens
            # are non-zero, per estimate_cost) instead of losing everything.
            if not (
                isinstance(row, (tuple, list))
                and len(row) == 3
                and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in row)
            ):
                sys.stderr.write(
                    "prdt-post-dispatch: malformed PRICES row for %r: %r "
                    "(expected a 3-tuple of numbers) — treating as unpriced\n"
                    % (key, row)
                )
                return None
            return row
    return None


def estimate_cost(per_model):
    """per_model: {model: {input, output, cache_read, cache_creation}}
    → (USD or None, [unpriced model ids]).

    F2 (T-543 round 2): a transcript mixing a priced and an unpriced model
    used to silently drop the unpriced model's tokens and return a number
    for the priced share alone — a confident-looking total indistinguishable
    from a real one. That is exactly what made round 1's "32 opus-5 priced"
    history records confident UNDERESTIMATES rather than healthy records
    (one 2026-07-30 record: real opus-5-rate cost >= $18.8, recorded $7.51 —
    the rest of that transcript's usage belonged to another, unpriced-at-the-
    time model and was silently dropped from the sum). A transcript now
    prices only when EVERY model in it has a price row; otherwise this
    returns no number
    (None) and names what went unpriced, so the caller marks cost_source
    "estimated_partial" instead of "estimated" and — per this ticket's
    decision to make the gap visible in DATA, not only in code — records
    which models were dropped in a `cost_unpriced_models` field, rather than
    writing a partial sum that reads exactly like a complete one.

    R2-1 (T-543 round 3): round 2 treated "an unpriced model is present" as
    identical to "the total cannot be trusted", and that equivalence breaks
    at zero tokens. Claude Code transcripts really do carry
    `model:"<synthetic>"` lines — session-limit/interrupt placeholders — and
    every one of them is zero-token in every bucket. price_for() finds no
    row for them, so round 2 called any transcript containing one "priced +
    unpriced mixed" and refused the whole sum, even though it is exactly
    computable (the unpriced contributor adds nothing). Measured on real
    transcripts: 8.8% of opus-5 subagent transcripts and 15% of main-session
    transcripts since 2026-09-01 mix a priced model with a zero-token one —
    main sessions accumulate, so one session-limit message nulled every
    later record in that session. Fix: an unpriced model with ZERO tokens
    across all four buckets is dropped from consideration entirely — it is
    not a partial sum, so it neither joins `unpriced` nor blocks pricing. An
    unpriced model with ANY non-zero bucket still refuses exactly as round 2
    did (F2 must not regress).
    """
    total, priced_models, unpriced = 0.0, 0, []
    for model, u in per_model.items():
        p = price_for(model)
        if not p:
            if any(u.get(k, 0) for k in ("input", "output", "cache_read", "cache_creation")):
                unpriced.append(model)
            # else: zero-token unpriced model — contributes nothing, is not
            # a partial sum, so it is silently excluded rather than voiding
            # the total (R2-1).
            continue
        pi, po, cr_mult = p
        total += (u["input"] * pi + u["output"] * po
                  + u["cache_read"] * cr_mult * pi + u["cache_creation"] * 1.25 * pi) / 1e6
        priced_models += 1
    if priced_models == 0:
        return None, []  # nothing priced at all — unchanged from round 1 (not a "partial" case)
    if unpriced:
        return None, unpriced  # some priced, some genuinely non-zero unpriced — refuse
    return round(total, 6), []


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


# ── T-584: reference set + playbooks_run, derived from the transcript / the return ──
REF_CAP = 200
# Bash argv[0] classes for the heuristic. READ: path-shaped args are consults.
# SKIP_FIRST: the first non-flag arg is a pattern/script, not a path.
# NEUTRAL: known not to consult a file (so it is NOT counted as opaque).
BASH_READ = {"cat", "sed", "head", "tail", "less", "more", "bat", "grep", "rg", "egrep",
             "fgrep", "awk", "nl", "jq", "diff", "wc", "strings", "stat", "file"}
BASH_SKIP_FIRST = {"sed", "grep", "rg", "egrep", "fgrep", "awk", "jq"}
BASH_NEUTRAL = {"cd", "echo", "printf", "export", "true", "false", "set", "exit", "pwd",
                "sleep", "date", "test", "[", "mkdir", "touch", "rm", "mv", "cp", "chmod",
                "ln", "tee", "sort", "uniq", "cut", "tr", "xargs", "which", "type", "env",
                "TZ=Asia/Seoul", "time"}
UNOBS_TOOL_CLASS = {"Agent": "agent", "Task": "agent", "WebFetch": "web", "WebSearch": "web",
                    "Skill": "skill"}
_HEREDOC = re.compile(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?")
_BEGIN_PATH = re.compile(r"-----\s*BEGIN [^()\n]*\(([^()\n]+)\)")


def _pathish(tok):
    return (not tok.startswith("-") and tok not in ("*", ".", "..")
            and ("/" in tok or re.search(r"\.[A-Za-z0-9]{1,8}$", tok) is not None)
            and not tok.startswith("$"))


def _bash_segments(cmd):
    """Pipeline/list segments of a Bash command, heredoc bodies folded into the
    segment that opened them (a python/node heredoc is ONE opaque consult, not
    thirty)."""
    segs, skip_until = [], None
    for ln in (cmd or "").split("\n"):
        if skip_until is not None:
            if ln.strip() == skip_until:
                skip_until = None
            continue
        m = _HEREDOC.search(ln)
        if m:
            skip_until = m.group(1)
            ln = ln[:m.start()]  # the opener (`python3 -`) stays one segment; its body is skipped
        segs.extend(re.split(r"\s*(?:;|&&|\|\||\|)\s*", ln))
    return [x.strip() for x in segs if x.strip()]


def _bash_refs(cmd):
    """→ (paths consulted by read-shaped segments, opaque segment count)."""
    paths, opaque = [], 0
    for seg in _bash_segments(cmd):
        try:
            toks = shlex.split(seg)
        except ValueError:
            toks = seg.split()
        while toks and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", toks[0]):
            toks = toks[1:]  # leading VAR=value assignments
        if not toks:
            continue
        head = os.path.basename(toks[0])
        if head in BASH_NEUTRAL or head.startswith("#"):
            continue
        if head not in BASH_READ:
            opaque += 1
            continue
        args, skip_next = [], False
        for t in toks[1:]:
            if skip_next:
                skip_next = False  # target of a bare `>` / `<` / `2>` — a redirect, not a consult
                continue
            if re.match(r"^\d*[<>]", t) or t == "&>":
                skip_next = t.rstrip("&") in ("<", ">", ">>", "2>", "1>", "&>") or t in ("2>", "&>")
                continue
            if not t.startswith("-"):
                args.append(t)
        if head in BASH_SKIP_FIRST and args:
            args = args[1:]
        paths.extend(t for t in args if _pathish(t))
    return paths, opaque


def _cap(seq):
    out = sorted(set(x for x in seq if isinstance(x, str) and x))
    return out[:REF_CAP], max(0, len(out) - REF_CAP)


def derive_refs(path):
    """Reference set of one worker transcript. → refs dict (see header e).
    `source` is None when there is no transcript to read at all."""
    observed, bash_obs, injected = [], [], []
    unobs = {"bash_opaque": 0, "agent": 0, "web": 0, "mcp": 0, "skill": 0}
    last_text = None
    with open(path, encoding="utf-8", errors="replace") as f:
        for raw in f:
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if not isinstance(msg, dict):
                continue
            if msg.get("type") == "attachment":
                att = msg.get("attachment") if isinstance(msg.get("attachment"), dict) else {}
                if att.get("type") == "hook_additional_context":
                    c = att.get("content")
                    for chunk in (c if isinstance(c, list) else [c]):
                        if isinstance(chunk, str):
                            injected.extend(_BEGIN_PATH.findall(chunk))
                elif att.get("type") == "instructions":
                    for fi in (att.get("files") or []):
                        if isinstance(fi, dict) and isinstance(fi.get("path"), str):
                            injected.append(fi["path"])
                continue
            if msg.get("type") != "assistant":
                continue
            content = (msg.get("message") or {}).get("content")
            if not isinstance(content, list):
                continue
            for b in content:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "text" and isinstance(b.get("text"), str):
                    last_text = b["text"]
                if b.get("type") != "tool_use":
                    continue
                name = str(b.get("name") or "")
                inp = b.get("input") if isinstance(b.get("input"), dict) else {}
                if name == "Read":
                    observed.append(inp.get("file_path"))
                elif name in ("Grep", "Glob"):
                    observed.append(inp.get("path") or ".")
                elif name == "Bash":
                    ps, op = _bash_refs(inp.get("command"))
                    bash_obs.extend(ps)
                    unobs["bash_opaque"] += op
                elif name in UNOBS_TOOL_CLASS:
                    unobs[UNOBS_TOOL_CLASS[name]] += 1
                elif name.startswith("mcp__"):
                    unobs["mcp"] += 1
    o, t1 = _cap(observed)
    bo, t2 = _cap(bash_obs)
    inj, t3 = _cap(injected)
    refs = {"source": "agent_transcript", "observed": o, "bash_observed": bo,
            "injected": inj, "unobservable": unobs}
    if t1 + t2 + t3:
        refs["truncated"] = t1 + t2 + t3
    return refs, last_text


def parse_envelope(text):
    """The return envelope as a dict, tolerant of a code fence or trailing prose.
    None when nothing object-shaped parses."""
    if not isinstance(text, str):
        return None
    s = re.sub(r"^\s*```(?:json)?\s*|\s*```\s*$", "", text.strip())
    i, j = s.find("{"), s.rfind("}")
    if i < 0 or j <= i:
        return None
    for cand in (s[i:], s[i:j + 1]):
        try:
            obj = json.loads(cand)
        except Exception:
            continue
        if isinstance(obj, dict):
            return obj
    return None


def playbooks_from(*texts):
    """First text that parses as an envelope decides. → (names or None, source)
    where source names the winning text's label, or why none was captured."""
    saw_envelope = False
    for label, text in texts:
        env = parse_envelope(text)
        if env is None:
            continue
        saw_envelope = True
        if "playbooks_run" not in env:
            continue
        pr = env.get("playbooks_run")
        if not isinstance(pr, list):
            continue
        names = []
        for it in pr:
            nm = it.get("name") if isinstance(it, dict) else it
            if isinstance(nm, str) and nm:
                names.append(nm[:64])
        return names[:32], label
    return None, ("envelope_without_key" if saw_envelope else "no_envelope")


def _response_texts(resp):
    """Text blocks of a sync Agent tool_response (a str, or a dict whose
    `content` is a list of {type:"text", text} blocks) — the worker's return
    lives in one of those, never in the response dict as a whole."""
    if isinstance(resp, str):
        return [resp]
    c = resp.get("content") if isinstance(resp, dict) else None
    out = []
    for b in (c if isinstance(c, list) else [c]):
        if isinstance(b, dict) and isinstance(b.get("text"), str):
            out.append(b["text"])
        elif isinstance(b, str):
            out.append(b)
    return out


def annotate_t584(line, transcript_path, *texts):
    """Attach `refs` · `playbooks_run` · `playbooks_source` to a subagent line.
    Best-effort: a failure marks refs.error and never blocks the record."""
    last_text = None
    try:
        if transcript_path and os.path.isfile(transcript_path):
            line["refs"], last_text = derive_refs(transcript_path)
        else:
            line["refs"] = {"source": None}
    except Exception:
        line["refs"] = {"source": None, "error": True}
    try:
        names, src = playbooks_from(*texts, ("transcript", last_text))
    except Exception:
        names, src = None, "no_envelope"
    line["playbooks_run"] = names
    line["playbooks_source"] = src


# ── worker return-envelope check — NOT HERE (moved to prdt-return-check.sh, T-553) ──
# It fires on the same SubagentStop registration. What stays true for THIS hook:
# NEVER emit `hookSpecificOutput.additionalContext` on SubagentStop (measured
# 2026-08-24, harness 2.1.241: it is injected into the WORKER and resumes it —
# one probe line produced 9 further firings), so this state hook prints nothing.

# ── SubagentStop: completion-time subagent line (usage summed from its transcript) ──
if event == "SubagentStop":
    gate = load_json_map(gate_sub_path)
    if agent_id and gate.get(agent_id):
        sys.exit(0)  # sync dispatch already recorded this agent at PostToolUse time
    atp = ev.get("agent_transcript_path")
    per_model, seen = sum_transcript(atp) if atp and os.path.isfile(atp) else ({}, False)
    cost, unpriced = estimate_cost(per_model) if seen else (None, [])
    line = {"ts": now, "scope": "subagent", "persona": persona,
            "session_id": agent_id,
            "model": max(per_model, key=lambda m: sum(per_model[m].values())) if per_model else None,
            "cost_usd": cost,
            "cost_source": "estimated" if cost is not None else ("estimated_partial" if unpriced else None),
            "cost_basis": "subagent_total", "usage": three_bucket(per_model) if seen else None,
            "version": version, "task_slug": task_slug, "ticket_id": ticket_id}
    if unpriced:
        line["cost_unpriced_models"] = sorted(unpriced)
    annotate_t584(line, atp, ("last_assistant_message", ev.get("last_assistant_message")))
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
# F3 (T-543 round 2): this sync response can carry usage with NO model field at
# all — the source of the 101 null-model turns.jsonl records QA traced on
# 2026-09-14, mechanically distinct from sum_transcript() above (which has
# defaulted `mdl or "_unknown"` since the first cost version and so cannot
# null WHEN a per-model usage line is present — corrected R2-5, T-543 round
# 3: at record level a missing/empty agent transcript still writes
# {model: null, usage: null} through the caller's `if per_model else None`,
# a different mechanism than sum_transcript()'s own per-line default; a
# 2026-07-16 record carries exactly that signature). Mark it "_unknown" like
# that sibling path instead of writing a record nobody can attribute to a
# model. Recurrence: none observed since 2026-08-20, but this code path is
# still live — not retired, not chased.
sub_model = sub_model or "_unknown"
cost_source = "reported" if isinstance(cost, (int, float)) else None
unpriced_sub = []
if cost_source is None:
    u4 = usage4_from(resp_obj)
    if u4:
        cost, unpriced_sub = estimate_cost({sub_model: u4})
        cost_source = "estimated" if cost is not None else ("estimated_partial" if unpriced_sub else None)
sub_usage = usage_from(resp_obj)
if sub_usage or isinstance(cost, (int, float)):
    line = {"ts": now, "scope": "subagent", "persona": persona,
            "session_id": resp_obj.get("session_id") or agent_id,
            "model": sub_model,
            "cost_usd": cost if isinstance(cost, (int, float)) else None,
            "cost_source": cost_source,
            "cost_basis": "subagent_total", "usage": sub_usage,
            "version": version, "task_slug": task_slug, "ticket_id": ticket_id}
    if unpriced_sub:
        line["cost_unpriced_models"] = sorted(unpriced_sub)
    # T-584: no transcript at this recording point → refs.source null (unobservable,
    # not "read nothing"); the sync response's TEXT BLOCKS may still carry the
    # envelope — never the json-dumped response dict, which parses as a key-less
    # "envelope" and would mislabel every sync record envelope_without_key.
    annotate_t584(line, None, *[("tool_response", t) for t in _response_texts(resp)])
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
        main_cost, main_unpriced = estimate_cost(per_model)
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
                    "cost_source": "estimated" if main_cost is not None else ("estimated_partial" if main_unpriced else None),
                    "cost_basis": "main_session_cumulative", "usage": tot,
                    "version": version, "task_slug": task_slug, "ticket_id": ticket_id}
            if main_unpriced:
                line["cost_unpriced_models"] = sorted(main_unpriced)
            with open(turns, "a") as f:
                f.write(json.dumps(line, ensure_ascii=False) + "\n")
PYEOF
exit 0
