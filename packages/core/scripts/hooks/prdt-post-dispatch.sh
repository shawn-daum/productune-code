#!/usr/bin/env bash
# prdt — Claude Code state-recording hook (v1 hook #3). Registered THREE times:
#   PostToolUse (matcher: Agent)      — dispatch time: sessions.json + main line
#                                       (+ subagent line if the sync response carries usage)
#   SubagentStop (matcher: ^prdt-)    — completion time: subagent line summed from
#                                       agent_transcript_path (2026-07-02: background
#                                       dispatch responses carry NO usage — launch metadata only)
#   SubagentStart (matcher: ^prdt-)   — T-682 slice 3: the mode-independent START of a
#                                       dispatch — in-flight marker only, nothing else
#                                       (see the LIFECYCLE note at the marker block)
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
import contextlib, fcntl, hashlib, json, os, re, shlex, shutil, subprocess, sys
from datetime import datetime, timezone

try:
    ev = json.loads(os.environ.get("PRDT_EVENT_JSON", ""))
except Exception:
    sys.exit(0)

event = ev.get("hook_event_name") or "PostToolUse"
tool = ev.get("tool_name") or ""
tin = ev.get("tool_input") or {}
if event in ("SubagentStop", "SubagentStart"):
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
    # SubagentStart (T-682 slice 3) is a marker-only event for this hook — it
    # is not a persona-turn beat, so it fires no autosave tick.
    if event != "SubagentStart" and os.path.isfile(os.path.join(state_dir, "meta.git", "HEAD")):
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
    # it points at; a regular file — the normal case, every dispatch — opens and
    # appends exactly as before.
    fd = os.open(path, os.O_APPEND | os.O_CREAT | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "a") as f:
        f.write(text)


# ── T-682: "in flight" dispatch markers ──────────────────────────────────────
# `statusline-prdt.sh`'s "running" footer segment reads these — machine-
# generated, never PO narration (acceptance). Machine-scope on purpose:
# `<PRDT_HOME>/run/dispatches/<sha256(agent_id)>.json`, the existing `run/`
# tooling-owned carve-out (contracts §Overrides) — so it sidesteps T-655's
# still-open question about which project-local `.prdt/` files ride the meta
# backup, and needs no new `prdt` subcommand: this hook is the only writer.
#
# LIFECYCLE (slice 3 — rebuilt on QA's measured event order, Claude Code
# 2.1.283, re-measured here 2026-09-26 with a `claude -p` probe):
#   FOREGROUND Agent call:  SubagentStart → SubagentStop → PostToolUse:Agent
#   BACKGROUND Agent call:  SubagentStart → PostToolUse:Agent → SubagentStop
#   resume (SendMessage):   PostToolUse:SendMessage → SubagentStart → SubagentStop
#                           (same agent_id; PostToolUse:SendMessage never
#                           reaches this hook — its matcher is `Agent`)
# so PostToolUse:Agent is NOT a start signal (slice 1/2 keyed the start on it
# and every foreground dispatch — 63 of 112 real ones — showed as running for
# STALE_HOURS after it had finished). SubagentStart is the mode-independent
# start; SubagentStop the mode-independent end:
#   SubagentStart  → marker written (or REVIVED for a known agent_id: a resume
#                    keeps the ticket id of its original dispatch), `since`=now,
#                    no `stopped_at`. T-774: also carries `model` — the dispatch
#                    gate's per-model-tier in-flight cap reads this same field
#                    off every OTHER open marker (see prdt-dispatch-gate.sh);
#                    see MODEL_TIERS/norm_model above for what it holds.
#                    T-775: and `checkout` (`[ctx].worktree`, else "code") —
#                    the gate denies a second live developer/qa dispatch into
#                    the same checkout (see checkout_from_ctx below).
#   PostToolUse   → pairing refinement only: the response carries `agentId`
#                    and the input carries the `[ctx]` prompt, so an EXISTING
#                    marker's ticket_id/dispatch_id (and, T-774, `model`) are
#                    corrected from the authoritative source. Never revives a
#                    stopped marker. It
#                    CREATES one only when none exists AND the response says
#                    `status:"async_launched"` (a background launch, still
#                    running) — the fallback that keeps background dispatches
#                    visible on a machine whose settings.json predates the
#                    SubagentStart registration in hook-manifest.json.
#   SubagentStop   → `stopped_at` stamped; the file STAYS for the resume case.
#   prune          → F10: THIS hook (the tooling that owns `run/`) removes
#                    marker files from disk, at every event it handles, once
#                    `stopped_at` — or `since`, for a marker that never saw a
#                    SubagentStop (crash / quota kill) — is older than
#                    MARKER_RETENTION_HOURS. The statusline never deletes
#                    (pure display); it merely stops SHOWING a never-stopped
#                    marker after its own STALE_HOURS, which is shorter.
# TICKET ID at SubagentStart — the open design question of slice 3. The event
# carries only agent_id + agent_type, no `[ctx]`. Sources, in order:
#   1. a marker already on disk for this agent_id (resume) — its ticket_id.
#   2. the PARENT transcript (`transcript_path` in the event): the probe shows
#      the assistant `tool_use` block for the Agent call (subagent_type +
#      the `[ctx]` prompt) is already in that file when SubagentStart fires,
#      and its tool_result is not yet. So: the OLDEST pending Agent tool_use
#      (no tool_result yet) of this agent_type whose `tool_use_id` no marker
#      has claimed. Same-persona fan-out in one assistant message is paired
#      FIFO — a heuristic; PostToolUse:Agent corrects a wrong pairing for a
#      background dispatch the moment it fires, and the running segment is
#      one row per ticket anyway.
#      T-780 PAIRING: QA measured that FIFO swaps two concurrent same-persona
#      starts in 6 of 20 runs (every run when the starts arrive in reverse),
#      and a FOREGROUND swap lasted until the dispatch ended — while the gate's
#      T-774 tier cap and T-775 checkout deny read these very fields. The
#      worker's OWN transcript cannot settle it here: its first record (the
#      prompt, byte-identical to the parent tool_use's `input.prompt`,
#      measured 2026-09-28) is stamped before this hook runs but the FILE is
#      created ~2 s later, after every SubagentStart hook has returned
#      (birthtime − first-record timestamp 1.98–2.16 s over 5 real workers).
#      So every marker carries `pairing`:
#        "confirmed"    the tool_use is provably this worker's — PostToolUse:
#                       Agent's (agentId ↔ tool_input) pair, the worker's own
#                       first prompt matched byte-for-byte to a parent Agent
#                       tool_use (marker_reconcile, below), or exactly ONE
#                       pending call of this agent_type left once the calls
#                       held by confirmed markers are set aside.
#        "unconfirmed"  a FIFO guess among two or more candidates, or no
#                       candidate at all. The dispatch gate never denies on an
#                       unconfirmed marker's model/checkout (it re-checks the
#                       worker transcript itself, prdt-dispatch-gate.sh).
#      marker_reconcile runs at EVERY event this hook handles (and before a
#      SubagentStop stamps and joins its schedule row): an open unconfirmed
#      marker whose worker transcript now exists is re-paired from that
#      transcript's first prompt — a foreground swap is corrected at the next
#      dispatch event instead of surviving until its end.
#   3. `.prdt/po-state.json` `current_task.ticket_id` — the PO's own record
#      of what it is working on.
#   none → the marker is still written (persona-only) so SubagentStop has
#   something to stamp; the statusline shows only markers with a ticket id.
# Rejected: pushing a pending queue from the PreToolUse gate hook (a second
# writer, and a gate-denied call would need un-queueing); changing the `[ctx]`
# contract to carry ticket_id (contract change for a display feature).
# Best-effort throughout: every marker operation is wrapped so a failure never
# changes the dispatch's exit code or its other recorded output.
MARKER_RETENTION_HOURS = 24
# `T-682`, `d-T682-s3-…` (the PO's dispatch_id convention has no hyphen), never
# the `T-4` inside `GPT-4` (F9: left boundary) nor `T-68` inside `T-6829`.
TICKET_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9])T-?([0-9]{1,5})(?![0-9])")

# T-774: the marker's `model` field is the TIER a dispatch runs at, never a
# versioned model id — the Agent tool's own `model` parameter is restricted to
# exactly these four values (its enum), and `prdt-dispatch-gate.sh` normalizes
# its own read of `tool_input.model` to the same set (T-774, same ticket) so
# the two sides compare literally. A call that carries no override resolves to
# whatever the harness/agent-definition default is — this hook cannot see that
# resolution from here, so it is recorded as the literal "default" bucket
# rather than guessed at. A value outside the four (a stale fixture, a future
# enum member this copy predates) also falls into "default" — never invented,
# never silently dropped.
MODEL_TIERS = {"sonnet", "opus", "haiku", "fable"}


def norm_model(v):
    return v if isinstance(v, str) and v in MODEL_TIERS else "default"


def marker_dir():
    home = os.environ.get("PRDT_HOME") or os.path.expanduser("~/.prdt")
    return os.path.join(home, "run", "dispatches")


def marker_path(aid):
    return os.path.join(marker_dir(), hashlib.sha256(aid.encode("utf-8")).hexdigest() + ".json")


def marker_load(aid):
    try:
        with open(marker_path(aid), encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) and data.get("agent_id") == aid else None
    except Exception:
        return None


def marker_save(data):
    os.makedirs(marker_dir(), exist_ok=True)
    atomic_write(marker_path(data["agent_id"]), data)


def ctx_from_prompt(prompt):
    if not isinstance(prompt, str):
        return None
    for pline in prompt.split("\n"):
        if pline.startswith("[ctx] {"):
            try:
                obj = json.loads(pline[len("[ctx] "):])
            except Exception:
                return None
            return obj if isinstance(obj, dict) else None
    return None


_SLUG_TICKETS = None


def ticket_by_slug(slug):
    """T-773: the id of the ticket md whose frontmatter `slug` equals `slug`
    (an open ticket first, then the highest id) — the PO's `[ctx].slug` IS the
    ticket slug, but carries no `T-NNN`, so every marker used to land with
    `ticket_id: null` and `prdt schedule` could not show in-flight rows. Same
    rule as `schedule_ticket_for_ctx` in scripts/prdt (the gate's schedule
    record). A frontmatter-only line scan of docs/tickets/**/T-*.md, cached for
    this one hook run; any read failure is just no match."""
    global _SLUG_TICKETS
    if not (isinstance(slug, str) and slug.strip()):
        return None
    if _SLUG_TICKETS is None:
        _SLUG_TICKETS = {}
        tdir = os.path.join(root, "docs", "tickets")
        for dp, _dn, fns in os.walk(tdir):
            for fn in fns:
                if not (fn.startswith("T-") and fn.endswith(".md")):
                    continue
                fm = {}
                try:
                    with open(os.path.join(dp, fn), encoding="utf-8") as f:
                        if f.readline().rstrip("\n") != "---":
                            continue
                        for _ in range(60):
                            ln = f.readline()
                            if not ln or ln.rstrip("\n") == "---":
                                break
                            k, sep, v = ln.partition(":")
                            if sep and k.strip() in ("id", "slug", "status"):
                                fm[k.strip()] = v.strip().strip("'\"")
                except Exception:
                    continue
                tid = fm.get("id") or fn[:-3]
                m = re.match(r"\AT-([0-9]{1,5})\Z", tid)
                if not (m and fm.get("slug")):
                    continue
                cand = (fm.get("status") == "open", int(m.group(1)), tid)
                prev = _SLUG_TICKETS.get(fm["slug"])
                if prev is None or cand > prev:
                    _SLUG_TICKETS[fm["slug"]] = cand
    hit = _SLUG_TICKETS.get(slug.strip())
    return hit[2] if hit else None


def ticket_from_ctx(ctx_obj):
    """(dispatch_id, ticket_id) — `[ctx]` has no `ticket_id` (contracts
    §Dispatch). T-773: the ticket whose md slug equals `[ctx].slug` first;
    else the documented heuristic — a `T-NNN` token in dispatch_id, then goal,
    then slug; the digits are always re-assembled as `T-<digits>`, the shape
    the read side's TICKET_RE requires."""
    if not isinstance(ctx_obj, dict):
        return None, None
    did = ctx_obj.get("dispatch_id")
    dispatch_id = did if isinstance(did, str) and did.strip() else None
    try:
        by_slug = ticket_by_slug(ctx_obj.get("slug"))
    except Exception:
        by_slug = None
    if by_slug:
        return dispatch_id, by_slug
    for field in (dispatch_id, ctx_obj.get("goal"), ctx_obj.get("slug")):
        if isinstance(field, str):
            m = TICKET_TOKEN_RE.search(field)
            if m:
                return dispatch_id, f"T-{m.group(1)}"
    return dispatch_id, None


def checkout_from_ctx(ctx_obj):
    """T-775: the checkout a dispatch works in — `[ctx].worktree` verbatim (the
    dispatch gate normalizes it), `"code"` (the shared code checkout) when the
    `[ctx]` has none, None when there is no `[ctx]` to read at all (the gate's
    one-live-dispatch-per-checkout rule then skips this marker: unknown, never
    guessed)."""
    if not isinstance(ctx_obj, dict):
        return None
    wt = ctx_obj.get("worktree")
    return wt.strip() if isinstance(wt, str) and wt.strip() else "code"


def pending_agent_calls(transcript_path, agent_type, tail_bytes=4 * 1024 * 1024):
    """Agent tool_use blocks of `agent_type` in the parent transcript's tail
    that have no tool_result yet, oldest first: [(tool_use_id, prompt, model)].
    `model` is the call's raw `input.model` (T-774) — un-normalized here, the
    caller runs it through `norm_model()`."""
    if not (isinstance(transcript_path, str) and os.path.isfile(transcript_path)):
        return []
    try:
        size = os.path.getsize(transcript_path)
        with open(transcript_path, "rb") as f:
            if size > tail_bytes:
                f.seek(size - tail_bytes)
                f.readline()  # drop the partial first line
            raw = f.read().decode("utf-8", "replace")
    except Exception:
        return []
    calls, resolved = [], set()
    for line in raw.split("\n"):
        if '"tool_use"' not in line and '"tool_result"' not in line:
            continue
        try:
            rec = json.loads(line)
        except Exception:
            continue
        content = ((rec.get("message") or {}).get("content")) if isinstance(rec, dict) else None
        if not isinstance(content, list):
            continue
        for blk in content:
            if not isinstance(blk, dict):
                continue
            if blk.get("type") == "tool_use" and blk.get("name") == "Agent":
                tin_ = blk.get("input") or {}
                if isinstance(tin_, dict) and tin_.get("subagent_type") == agent_type and isinstance(blk.get("id"), str):
                    calls.append((blk["id"], tin_.get("prompt"), tin_.get("model")))
            elif blk.get("type") == "tool_result" and isinstance(blk.get("tool_use_id"), str):
                resolved.add(blk["tool_use_id"])
    return [(tid, prompt, model) for tid, prompt, model in calls if tid not in resolved]


def claimed_tool_use_ids():
    """(every tool_use_id a marker holds, those held by a `confirmed` one)."""
    ids, confirmed = set(), set()
    try:
        names = os.listdir(marker_dir())
    except OSError:
        return ids, confirmed
    for n in names:
        if not n.endswith(".json"):
            continue
        try:
            with open(os.path.join(marker_dir(), n), encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and isinstance(data.get("tool_use_id"), str):
                ids.add(data["tool_use_id"])
                if data.get("pairing") == "confirmed":
                    confirmed.add(data["tool_use_id"])
        except Exception:
            continue
    return ids, confirmed


def po_state_ticket():
    try:
        with open(os.path.join(state_dir, "po-state.json"), encoding="utf-8") as f:
            ct = (json.load(f) or {}).get("current_task")
        tid = ct.get("ticket_id") if isinstance(ct, dict) else None
        return tid if isinstance(tid, str) and re.match(r"\AT-[0-9]{1,5}\Z", tid) else None
    except Exception:
        return None


def agent_transcript_path(aid):
    """T-695 slice 2: the WORKER transcript this dispatch writes — derived from
    the event's parent `transcript_path` (`…/projects/<slug>/<session_id>.jsonl`)
    and `session_id`: `…/projects/<slug>/<session_id>/subagents/agent-<aid>.jsonl`
    (layout measured 2026-09-26, Claude Code 2.1.283). The dispatch gate reads
    this file's tail and mtime to tell a live worker from a phantom marker (a
    429-killed run never gets SubagentStop); a marker without the path costs
    the gate one `find` over every project. None when the event lacks either."""
    tp, sid = ev.get("transcript_path"), ev.get("session_id")
    if not (isinstance(tp, str) and tp and isinstance(sid, str) and sid):
        return None
    if "/" in sid or "/" in aid:
        return None
    return os.path.join(os.path.dirname(tp), sid, "subagents", f"agent-{aid}.jsonl")


def marker_start(aid):
    """SubagentStart: write or revive the marker for `aid` (see LIFECYCLE)."""
    prior = marker_load(aid)
    data = {
        "agent_id": aid, "persona": persona, "dispatch_id": None, "ticket_id": None,
        "tool_use_id": None, "model": None, "project_root": root, "since": now,
        "session_id": ev.get("session_id") if isinstance(ev.get("session_id"), str) else None,
        "transcript": agent_transcript_path(aid), "checkout": None,
        "pairing": None,
        "parent_transcript": ev.get("transcript_path") if isinstance(ev.get("transcript_path"), str) else None,
    }
    if prior:
        for k in ("dispatch_id", "ticket_id", "tool_use_id", "checkout", "pairing"):
            data[k] = prior.get(k) if isinstance(prior.get(k), str) else None
        # T-774: a resume is the SAME logical dispatch continuing, never a new
        # tier pick — carry the prior marker's model forward (a legacy marker
        # from before this ticket has none; norm_model() below falls back to
        # "default" for it exactly as a fresh, tier-less marker would).
        data["model"] = norm_model(prior.get("model")) if prior.get("model") is not None else None
        data["resumed_from"] = prior.get("since") if isinstance(prior.get("since"), str) else None
    if not prior:
        claimed, confirmed_claims = claimed_tool_use_ids()
        pending = pending_agent_calls(ev.get("transcript_path"), sub)
        # T-780: one call left once the confirmed claims are set aside IS this
        # worker's — any other count leaves the FIFO pick unconfirmed.
        open_calls = [c for c in pending if c[0] not in confirmed_claims]
        for tuid, prompt, model in pending:
            if tuid in claimed:
                continue
            data["dispatch_id"], data["ticket_id"] = ticket_from_ctx(ctx_from_prompt(prompt))
            data["checkout"] = checkout_from_ctx(ctx_from_prompt(prompt))
            data["tool_use_id"] = tuid
            data["model"] = norm_model(model)
            data["pairing"] = "confirmed" if len(open_calls) == 1 and open_calls[0][0] == tuid else "unconfirmed"
            break
    if not data["pairing"]:
        data["pairing"] = "unconfirmed"
    if not data["ticket_id"]:
        data["ticket_id"] = po_state_ticket()
    if data["model"] is None:
        data["model"] = "default"
    marker_save(data)


def marker_refine(aid, ctx_obj, tool_use_id, launched_async, model=None):
    """PostToolUse:Agent: correct an existing marker's pairing; create one only
    for a still-running background launch that has none (see LIFECYCLE). T-774:
    `model` is corrected from the same authoritative (agentId ↔ tool_input)
    source as `ticket_id`/`dispatch_id` above it — same rationale, same call
    site already has it at zero extra cost.

    T-780 round 2 (QA grill): `ctx_obj` is THIS event's own tool_input — the
    (agentId ↔ tool_input) pair PostToolUse:Agent hands us is authoritative by
    construction (both sides come off the SAME tool call), never a FIFO guess.
    The prior `elif dispatch_id and not data.get("dispatch_id")` only wrote
    dispatch_id when the marker had none yet, so a marker that already carried
    a WRONG FIFO-guessed dispatch_id from SubagentStart, and whose slug/goal
    never resolves a ticket (ticket_id stays None), kept that wrong id forever
    — while `pairing` was stamped "confirmed" unconditionally below anyway.
    QA measured 13 of 20 concurrent-start rounds landing exactly there: two
    markers left holding the SAME dispatch_id, both marked confirmed.
    dispatch_id/ticket_id are therefore ALWAYS overwritten from this event's
    own ctx_obj — ticket_id to whatever resolves (or None), never preserved
    from a stale guess — before pairing is stamped confirmed."""
    dispatch_id, ticket_id = ticket_from_ctx(ctx_obj)
    nmodel = norm_model(model) if model is not None else None
    data = marker_load(aid)
    if data is None:
        if not launched_async:
            return
        data = {"agent_id": aid, "persona": persona, "dispatch_id": None, "ticket_id": None,
                "tool_use_id": None, "model": nmodel or "default", "project_root": root, "since": now,
                "session_id": ev.get("session_id") if isinstance(ev.get("session_id"), str) else None,
                "transcript": agent_transcript_path(aid)}
    co = checkout_from_ctx(ctx_obj)
    if co is not None:
        data["checkout"] = co
    data["ticket_id"], data["dispatch_id"] = ticket_id, dispatch_id
    if isinstance(tool_use_id, str):
        data["tool_use_id"] = tool_use_id
    if nmodel is not None:
        data["model"] = nmodel
    # T-780: the (agentId ↔ tool_input) pair of this event is the authoritative one.
    data["pairing"] = "confirmed"
    marker_save(data)


def worker_first_prompt(path):
    """T-780: the worker transcript's first record's prompt (its user message
    content — the parent Agent tool_use's `input.prompt`, byte-identical), or
    None while the file does not exist yet / reads as anything else."""
    try:
        with open(path, encoding="utf-8") as f:
            rec = json.loads(f.readline())
    except Exception:
        return None
    msg = rec.get("message") if isinstance(rec, dict) and rec.get("type") == "user" else None
    content = msg.get("content") if isinstance(msg, dict) else None
    if isinstance(content, list):
        texts = [b.get("text") for b in content if isinstance(b, dict) and b.get("type") == "text"]
        content = texts[0] if texts and isinstance(texts[0], str) else None
    return content if isinstance(content, str) else None


def agent_call_by_prompt(transcript_path, agent_type, prompt, tail_bytes=4 * 1024 * 1024):
    """The (tool_use_id, model) of the Agent tool_use of `agent_type` whose
    prompt equals `prompt` — the LATEST one (a re-dispatch of the same prompt
    is the newer call) — or None."""
    if not (isinstance(transcript_path, str) and os.path.isfile(transcript_path)):
        return None
    try:
        size = os.path.getsize(transcript_path)
        with open(transcript_path, "rb") as f:
            if size > tail_bytes:
                f.seek(size - tail_bytes)
                f.readline()
            raw = f.read().decode("utf-8", "replace")
    except Exception:
        return None
    hit = None
    for line in raw.split("\n"):
        if '"tool_use"' not in line:
            continue
        try:
            rec = json.loads(line)
        except Exception:
            continue
        content = ((rec.get("message") or {}).get("content")) if isinstance(rec, dict) else None
        if not isinstance(content, list):
            continue
        for blk in content:
            if not (isinstance(blk, dict) and blk.get("type") == "tool_use" and blk.get("name") == "Agent"):
                continue
            tin_ = blk.get("input") or {}
            if (isinstance(tin_, dict) and tin_.get("subagent_type") == agent_type
                    and tin_.get("prompt") == prompt and isinstance(blk.get("id"), str)):
                hit = (blk["id"], tin_.get("model"))
    return hit


def marker_reconcile():
    """T-780: re-pair every open `unconfirmed` marker whose worker transcript
    now exists from that transcript's own first prompt (see LIFECYCLE ·
    T-780 PAIRING). A marker whose prompt matches no parent Agent call stays
    unconfirmed — never guessed."""
    try:
        names = os.listdir(marker_dir())
    except OSError:
        return
    with marker_lock():
        _reconcile(names)


def _reconcile(names):
    for n in names:
        if not n.endswith(".json"):
            continue
        try:
            with open(os.path.join(marker_dir(), n), encoding="utf-8") as f:
                data = json.load(f)
            if not (isinstance(data, dict) and isinstance(data.get("agent_id"), str)):
                continue
            if data.get("stopped_at") or data.get("pairing") == "confirmed":
                continue
            prompt = worker_first_prompt(data.get("transcript")) if isinstance(data.get("transcript"), str) else None
            if prompt is None:
                continue
            call = agent_call_by_prompt(data.get("parent_transcript"), "prdt-" + str(data.get("persona") or ""), prompt)
            if call is None:
                continue
            ctx_obj = ctx_from_prompt(prompt)
            data["dispatch_id"], tid = ticket_from_ctx(ctx_obj)
            data["ticket_id"] = tid or data.get("ticket_id")
            data["checkout"] = checkout_from_ctx(ctx_obj)
            data["tool_use_id"], data["model"] = call[0], norm_model(call[1])
            data["pairing"] = "confirmed"
            marker_save(data)
        except Exception:
            continue


@contextlib.contextmanager
def marker_lock():
    """T-780: serializes marker_reconcile's read-modify-write against
    marker_stop — a reconcile that loaded a marker just before a concurrent
    SubagentStop stamped it would otherwise save it back without `stopped_at`.
    Best-effort: no lock obtainable → proceed unlocked, as before T-780."""
    fd = None
    try:
        run_dir = os.path.dirname(marker_dir())
        os.makedirs(run_dir, exist_ok=True)
        fd = os.open(os.path.join(run_dir, "dispatches.lock"), os.O_CREAT | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        fcntl.flock(fd, fcntl.LOCK_EX)
    except Exception:
        if fd is not None:
            os.close(fd)
        fd = None
    try:
        yield
    finally:
        if fd is not None:
            os.close(fd)


def marker_stop(aid):
    if not aid:
        return
    try:
        with marker_lock():
            data = marker_load(aid)
            if data is not None and not data.get("stopped_at"):
                data["stopped_at"] = now
                marker_save(data)
    except Exception:
        pass


def marker_prune():
    """F10: remove marker files older than MARKER_RETENTION_HOURS from disk —
    `stopped_at` when stamped, else `since` (a dispatch that never reached
    SubagentStop). Runs at every event this hook handles; only this hook
    (never the statusline) unlinks under run/dispatches."""
    try:
        names = os.listdir(marker_dir())
    except OSError:
        return
    cutoff = datetime.now(timezone.utc).timestamp() - MARKER_RETENTION_HOURS * 3600
    for n in names:
        if not n.endswith(".json"):
            continue
        fp = os.path.join(marker_dir(), n)
        try:
            with open(fp, encoding="utf-8") as f:
                data = json.load(f)
            ts = (data.get("stopped_at") or data.get("since")) if isinstance(data, dict) else None
            t = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
        except Exception:
            continue  # unreadable/unparseable: not this hook's to judge — left alone
        if t < cutoff:
            try:
                os.unlink(fp)
            except Exception:
                pass


# ── T-773: the `stop` row of .prdt/schedule.jsonl ────────────────────────────
# The dispatch gate appends a `dispatch` row per dispatch (`prdt schedule
# record`); this hook appends its `stop` row at SubagentStop — outcome ·
# duration_s, joined to it by `tool_use_id` (else `dispatch_id`). Written only
# when a matching `dispatch` row exists, so a dispatch from before the record
# landed (or one the gate never saw) adds nothing. duration_s is one run
# segment (`since` → now; a resume revives `since`, so each resumed segment
# gets its own row); these are the samples v1.12's time weights come from
# (T-764). outcome: `quota-killed` when the worker transcript's last record
# is the harness's `<synthetic>` placeholder, `returned` when the final
# message opens with `{` (the envelope shape), else `no-envelope`. A 429-killed
# run that never reaches SubagentStop has no stop row — `prdt schedule report`
# shows its duration as unrecorded.
def schedule_stop(aid):
    if not aid:
        return
    data = marker_load(aid)
    if data is None:
        return
    log = os.path.join(state_dir, "schedule.jsonl")
    tuid, did = data.get("tool_use_id"), data.get("dispatch_id")
    if not (isinstance(tuid, str) and tuid) and not (isinstance(did, str) and did):
        return
    try:
        with open(log, encoding="utf-8") as f:
            lines = f.read().splitlines()
    except OSError:
        return
    match = False
    for ln in lines:
        try:
            r = json.loads(ln)
        except Exception:
            continue
        if not (isinstance(r, dict) and r.get("kind") == "dispatch"):
            continue
        if (tuid and r.get("tool_use_id") == tuid) or (did and not r.get("tool_use_id") and r.get("dispatch_id") == did):
            match = True
            break
    if not match:
        return
    dur = None
    try:
        t0 = datetime.strptime(data.get("since"), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        t1 = datetime.strptime(now, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        dur = max(0, int((t1 - t0).total_seconds()))
    except Exception:
        pass
    outcome = None
    atp = ev.get("agent_transcript_path") or data.get("transcript")
    try:
        if isinstance(atp, str) and os.path.isfile(atp):
            with open(atp, "rb") as f:
                f.seek(max(0, os.path.getsize(atp) - 8000))
                tail = [x for x in f.read().decode("utf-8", "replace").split("\n") if x.strip()]
            if tail and '"model":"<synthetic>"' in tail[-1]:
                outcome = "quota-killed"
    except Exception:
        pass
    if outcome is None:
        lam = ev.get("last_assistant_message")
        outcome = "returned" if isinstance(lam, str) and lam.lstrip().startswith("{") else "no-envelope"
    row = {"kind": "stop", "ts": now, "dispatch_id": did if isinstance(did, str) else None,
           "tool_use_id": tuid if isinstance(tuid, str) else None, "agent_id": aid,
           "persona": persona, "ticket": data.get("ticket_id"), "outcome": outcome, "duration_s": dur}
    _append_line(log, json.dumps(row, ensure_ascii=False) + "\n")


if event == "SubagentStart":
    # Marker-only event: no sessions.json / turns.jsonl / autosave here — those
    # stay keyed on PostToolUse:Agent + SubagentStop exactly as before.
    aid = ev.get("agent_id")
    if isinstance(aid, str) and aid:
        try:
            marker_start(aid)
        except Exception:
            pass
    try:
        marker_reconcile()
    except Exception:
        pass
    try:
        marker_prune()
    except Exception:
        pass
    sys.exit(0)

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

if event != "SubagentStop" and agent_id:
    try:
        marker_refine(agent_id, ctx_from_prompt(tin.get("prompt")), ev.get("tool_use_id"),
                      resp_obj.get("status") == "async_launched", tin.get("model"))
    except Exception:
        pass
    try:
        marker_reconcile()
    except Exception:
        pass
    try:
        marker_prune()
    except Exception:
        pass

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
    # T-682: the in-flight marker's "completion time" — stamped `stopped_at`,
    # never unlinked (a resume via SendMessage re-fires SubagentStart with the
    # SAME agent_id and needs this record to recover its ticket id; see
    # marker_stop). Independent of the cost-recording dedup right below — the
    # stamp lands whether or not THIS SubagentStop turns out to be a dup of an
    # already-recorded sync dispatch. Best-effort: a missing/corrupt marker is
    # not an error. T-780: reconcile first, so the stop row joins the dispatch
    # row of THIS worker's own tool_use.
    try:
        marker_reconcile()
    except Exception:
        pass
    marker_stop(agent_id)
    try:
        schedule_stop(agent_id)
    except Exception:
        pass
    try:
        marker_prune()
    except Exception:
        pass
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
    _append_line(turns, json.dumps(line, ensure_ascii=False) + "\n")
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
    _append_line(turns, json.dumps(line, ensure_ascii=False) + "\n")
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
            _append_line(turns, json.dumps(line, ensure_ascii=False) + "\n")
PYEOF
exit 0
