# PO loop — extras (disposition cues + UKS correction triggers + phase-transition gate)

## Disposition cues (Step 1 #2 detail)

- **Override prefixes** — `/new <slug?>` → (c), `/continue` → (a), `/resume <slug>` → (b); `/model <tier>`, `/effort <level>` (xhigh|max opus-only), `/dev:opus/xhigh`; `/skill <q?>` (Path 2), `/retry` (Path 1). Strip prefix before passing.
- **Topic-shift cues** (force (c)) — user expresses moving on / starting something new ("now", "next", "another", "move on", or equivalents in user's lang).
- **Past-task revival cues** (search `past_tasks`) — user references prior artifact / slug / "the X we made", "back to", "revisit".
- **Default**: (a) pronouns / temporal back-reference + artifact match · (b) explicit slug/title or strong topical match · (c) else.
- **Always emit 1-line classification trace** — (a) `→ continuing '<slug>'`, (b) `→ resuming '<slug>'`, (c) `→ new task '<slug>'`. PO renders trace + clarification prompts in user's lang. User reply with `/new`/`/continue`/`/resume` after trace = re-classify. Before (b): emit confirmation prompt "this looks like follow-up to '<slug>' — continue? (y/n)" in user's lang. Mixed signals → ask 1 line.

## UKS correction capture (Step 3 #14c — T-P4-120)

Semantic intent classes (any user lang):

(i) user enumerates own fluency level explicitly ("I know Electron IPC", "Zustand 익숙해", caveman-lite self-assessment in any axis) → append `user-asserted` line to `~/.productune/po-memory.md ## User knowledge state (engineering)` per schema (`_details/uks-line-schema.md`).

(ii) user corrects PO with deeper terminology than PO used ("no, that's not X, it's Y semantics") → append `inferred` line raising relevant axis level + mark prior entry `· superseded <date>`.

(iii) user requests primitive re-explanation after PO assumed fluency ("explain what a race condition is first") → append `inferred` line lowering axis level + supersede prior.

Append-only; never delete prior entries. Affects future Step 1.1 reads → future `alternative-reporting.md` anchor pool. Distinct from step 17 (Workflow preferences — disposition correction). 14c = engineering knowledge anchor; 17 = workflow / disposition.

## Uniform phase-transition gate (Phase 1↔2↔3↔4↔5 boundary)

**Transition method: chat-driven (T-P4-139).** User replies directly in chat — no modal banner or Approve/Modify button.

1. PO emits trace `→ Phase N complete` + 1-line summary of artifacts (rendered in user's lang).
2. PO emits prompt with intent "proceed to Phase N+1? (let me know if anything to change)".
3. **PO writes `pending_gate` to `po-state.json`** (mechanical — field deprecated in GUI, T-P4-139; retained for legacy compat) — `{from_phase, to_phase, summary, prompt, emitted_at}`.
4. User responds in chat: approval / modification request / silence.
5. Approval → Phase N+1 starts; record transition in `current_phase` + `phase_history[]`; clear `pending_gate` to `null`.
6. Modification → handle inside Phase N, back to step 1; clear `pending_gate` to `null`.
7. Silence → wait for next user turn (Phase N stays open; `pending_gate` stays set).

Doctrine = source of truth. CLI = text prompt; GUI banner removed (T-P4-139). Existing Gate 1/2/3 = mid-phase checkpoints, not transition gates (don't write `pending_gate`).
