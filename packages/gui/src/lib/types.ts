// ── Core domain types — synced with PO doctrine (sections/tickets.md, sections/memory.md) ──
//
// po-state.json schema_version: 2 (since 2026-05-08).
//   - Phase 1..5 (PRD/Design/Build/Deploy/Close) — Layer A
//   - ticket `type` enum (was `stage`) — Layer B
//   - po-state slim: no `past_tickets[]`, no `persona_session_meta` post-close;
//     ticket md (`docs/tickets/<version>/T-NNN.md`) = SoT for ticket-scoped data;
//     `versions[]` capped at 5.

// Layer A — Version Cycle Phase (where in the cycle).
// Maps to po-state.json `current_phase` (1..5). Discovery was merged into PRD's
// clarity loop — no separate interview phase.
export type Phase = 'PRD' | 'Design' | 'Build' | 'Deploy' | 'Close'

export const PHASE_NAMES: Record<number, Phase> = {
  1: 'PRD',
  2: 'Design',
  3: 'Build',
  4: 'Deploy',
  5: 'Close',
}

// ── prdt (v1) stage — adapter A4 (T-287) ──────────────────────────────────────
// prdt po-state uses a FLAT 4-value lifecycle string instead of the legacy 1..5
// `current_phase` numeric model above. This is a separate, mutually-exclusive
// axis (a prdt po-state has `stage`, never `current_phase`, and vice versa) —
// see `PoState.stage` below and `isPrdtPoState` in phase-mapping.ts. Legacy
// `Phase`/`PHASE_NAMES` are untouched and keep driving legacy-project rendering.
export type Stage = 'define' | 'build' | 'ship' | 'retro'

// Layer B — ticket type (`type` field on each ticket md frontmatter).
// Renamed from `Stage` (v2 doctrine, sub-d).
// Canonical 9 types — SoT: persona/designer/bookshelf/ticket-schema.md.
// `close` / `docs` added for v0.5 B1 (T-017) doctrine sync.
// `design+impl` removed for v0.5 B1 — not a doctrine type (was a transient
// composite never emitted by the canonical schema); unused across the GUI.
export type TaskType =
  | 'design'
  | 'impl'
  | 'refactor'
  | 'test'
  | 'qa'
  | 'deploy'
  | 'close'
  | 'docs'
  | 'doctrine'

export const TYPE_ORDER: TaskType[] = [
  'design',
  'impl',
  'refactor',
  'test',
  'qa',
  'deploy',
  'close',
  'docs',
  'doctrine',
]

// Ticket lifecycle status (separate from `type`).
// Plan-Do-See lifecycle: todo → in-progress → review → user-verify → done | blocked | abandoned
export type Status = 'todo' | 'in-progress' | 'review' | 'user-verify' | 'done' | 'blocked' | 'abandoned'

// Auto QA smoke gate result on impl/refactor tickets.
export type QaStatus = 'pending' | 'pass' | 'fail'

export interface Project {
  slug: string
  projectDir: string
}

/**
 * Bubble style discriminator. `role` (user/assistant/system) is for the LLM
 * conversation; `kind` is for visual treatment in `ChatPanel`.
 *  - po / designer / dev / qa: persona response — colored 2 px left border.
 *  - trace: tool/announce events — gray, no border.
 *  - user: user input — right-aligned, gray-overlay bg, no border.
 *  - ask-user-question: inline option-card surface (T-013 sub-b).
 *  - promotion-candidate: inline approve/reject card surface (T-013 sub-c).
 */
export type MessageKind =
  | 'po'
  | 'designer'
  | 'dev'
  | 'qa'
  | 'trace'
  | 'user'
  | 'ask-user-question'    // T-013 (b)
  | 'promotion-candidate'  // T-013 (c)

// ── T-013 action-card payload types ──────────────────────────────────────────

export interface AskUserQuestionPayload {
  question: string
  options: Array<{ key: string; title: string; description?: string }>
  /** Present once resolved — drives idempotent resolved-chip render. */
  resolved?: { chosenKey: string }
}

export interface PromotionPayload {
  candidateSummary: string
  targetTier: string
  rationale: string
  sourceTicketId: string
  /**
   * Trigger origin (T-PATCH-097). Distinguishes a user-requested promotion gate
   * (render as a question-style card) from an auto-surfaced candidate (classic
   * PromotionCard). Absent → treated as `'auto'` so existing payloads written
   * before this field are a safe no-regression fallback to PromotionCard.
   *
   * DEPENDENCY: the gate-emit path (engine / IPC) must stamp
   * `origin: 'user-requested'` on promotions created from a user utterance/action
   * for the question-style branch to activate. Until that lands, every promotion
   * payload lacks the field and renders as the classic PromotionCard.
   */
  origin?: 'user-requested' | 'auto'
  /** Present once resolved — drives idempotent resolved-card render. */
  resolved?: { outcome: 'approved' | 'rejected' }
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  /** UI bubble kind. Optional for backwards compat with chat.json written
   *  before T-P4-041; loader patches missing kinds via `role` heuristic. */
  kind?: MessageKind
  text: string
  status?: 'streaming' | 'done' | 'cancelled'
  created_at: string
  /** Action-card payload (T-013). Present only for ask-user-question / promotion-candidate kinds. */
  payload?: AskUserQuestionPayload | PromotionPayload
  /**
   * Trace sub-level (T-PATCH-033). Carried from AnnouncePayload.level for `kind: 'trace'`
   * messages so the renderer can group consecutive `tool` traces under one disclosure
   * without brittle text-prefix sniffing. Absent for non-trace messages.
   */
  traceLevel?: string
  /** T-PATCH-108: tool_use.input for kind:'trace' & traceLevel:'tool'. Raw input
   *  object forwarded from the runner; the renderer serializes/truncates it. */
  toolInput?: unknown
  /** T-PATCH-108: tool name parsed from the runner (avoids re-stripping the text
   *  prefix). Present for kind:'trace' & traceLevel:'tool'. */
  toolName?: string
}

export interface Session {
  messages: Message[]
  claude_session_id?: string
  updated_at: string
}

/**
 * Ticket — shape parsed from ticket md frontmatter (`docs/tickets/<version>/T-NNN.md`).
 * Ticket md = single source of truth (v2). `useTicketScan` hook returns the
 * scan output as `Ticket[]`.
 *
 * `stage` is kept as a transient legacy alias for v1 fallback — readers should
 * prefer `type`. New code never writes `stage`.
 */
export interface Ticket {
  ticket_id: string
  version?: string | null
  slug?: string
  title?: string
  type?: TaskType
  /** @deprecated v1 alias for `type`. Read-only fallback during migration. */
  stage?: TaskType
  status?: Status
  qa_status?: QaStatus
  qa_loops?: number
  assignee?: string
  estimated_complexity?: string
  risk_flags?: string
  requires_user_gate?: boolean   // frontmatter gate flag for auto-surface (T-PATCH-079)
  branch?: string
  worktree_path?: string
  success_metric?: string | null
  validation_method?: string | null
  observed_result?: string | null
  started_at?: string | null
  completed_at?: string | null
  duration_min?: number | null
  /** Body-derived (parsed from ticket md `## Request` first paragraph). */
  request_summary?: string
  /** Filesystem path of the source ticket md (relative or absolute). */
  path?: string
  /** File mtime (epoch ms) — "last touched" signal for dashboard sort (T-PATCH-162). */
  mtime?: number
}

// `current_task` slice in po-state.json (live ticket being worked).
export interface CurrentTask {
  ticket_id?: string
  slug?: string
  title?: string
  status?: Status
  type?: TaskType
  /** @deprecated v1 alias — read-only. */
  stage?: TaskType
  qa_status?: QaStatus
  qa_loops?: number
  assignee_persona?: string
  /**
   * prdt (v1) short persona name (`po|designer|developer|qa`) — adapter A4.
   * The prdt `current_task` shape is `{ticket_id, slug, assignee}`; `assignee`
   * is distinct from the legacy `assignee_persona` field name above (kept
   * separate rather than aliased, since the two schemas never co-occur).
   */
  assignee?: string
  started_at?: string
  ended_at?: string | null
  request_summary?: string
}

export interface PhaseTransition {
  phase: number  // 1..5
  started_at?: string
  completed_at?: string
  summary?: string
  user_approved_at?: string
}

// Open phase-transition gate. Set by PO when it emits the gate prompt;
// cleared when user approves (advance) or modifies (stay in current phase).
export interface PendingGate {
  from_phase: number  // 1..5
  to_phase: number    // 2..5 (or null when terminal — Phase 5 close → no next)
  summary: string     // 1-line description of artifacts produced in from_phase
  prompt: string      // English template; PO renders in user's lang at runtime
  emitted_at: string
}

export interface VersionOutcome {
  north_star?: string | null
  input_metrics?: string[]
  validation_method?: string | null
  observed_result?: string | null
  retrospective_path?: string | null
}

export interface Version {
  id: string
  started_at?: string
  ended_at?: string | null
  prd_anchor?: string
  outcome?: VersionOutcome
}

// ── Skill catalog entry (T-P4-118 — IPC dynamic scan) ─────────────────────────

/** Persona column keys — mirrors SkillMatrixTab PersonaCol. */
export type SkillPersona = 'po' | 'designer' | 'dev' | 'qa'

/**
 * Skill layer classification (T-018 / v0.5 B2).
 * Operationalises the 2-layer doctrine from common/bookshelf/skills.md:
 *  - explicit  (Layer 1) — intentionally provisioned to ≥1 persona; invoke only
 *                          when on the project allowlist.
 *  - auto      (Layer 2) — description-match sufficient; any project of this type
 *                          benefits → Claude may auto-select without provisioning.
 *  - unused               — domain-irrelevant category OR unmapped (personas == []);
 *                          skip at install, never invoke.
 */
export type SkillLayer = 'explicit' | 'auto' | 'unused'

/**
 * A single skill entry returned by the `skills:list` IPC handler.
 * `id`       — relative path from ~/.claude/skills root (slash-separated).
 * `name`     — frontmatter `name` field, or last-directory fallback.
 * `description` — frontmatter `description` field, or "".
 * `personas` — frontmatter `personas` array, or path-inference result, or [].
 * `filePath` — absolute path (for future deep-link / viewer).
 * `layer`    — T-018 2-layer classification: explicit | auto | unused.
 */
export interface SkillEntry {
  id: string
  name: string
  description: string
  personas: SkillPersona[]
  filePath: string
  layer: SkillLayer
}

// ── Pending promotions (T-P4-066) ─────────────────────────────────────────────

/**
 * Promotion classification — doctrine scope × kind (v0.5 B1 / T-017).
 * SoT: po/bookshelf/promotion-process.md + common/bookshelf/promotion-candidate-schema.md.
 *
 * The legacy 3-tier model (`project | wiki | work-note`) is abolished: `wiki`
 * is no longer a promotion target, and `work-note` collapsed into the
 * scope×kind grid. Promotions are now 4 quadrants on 2 axes:
 *   - `scope`: project (repo-local) vs global (cross-project, ~/.productune)
 *   - `kind`:  habit (always-read, curated edit) vs bookshelf (on-demand, append)
 * Path resolution:
 *   project → docs/<persona>/...     global → ~/.productune/<persona>/...
 *   habit   → habit.md (curated)     bookshelf → bookshelf/<file>.md (append)
 */
export type PromotionScope = 'project' | 'global'
export type PromotionKind = 'habit' | 'bookshelf'

/**
 * Canonical promotion classification token used for display/labels:
 * `<scope>/<kind>`, e.g. `project/habit`, `global/bookshelf`.
 */
export type PromotionTier = `${PromotionScope}/${PromotionKind}`

export const PROMOTION_TIERS: PromotionTier[] = [
  'project/habit',
  'project/bookshelf',
  'global/habit',
  'global/bookshelf',
]

export type PromotionStatus = 'pending' | 'approved' | 'dropped' | 'edited'

/**
 * A persona-returned promotion_candidate queued for user approval.
 * Lifecycle: pending → (approved | dropped | edited) at next turn-start drain.
 *
 * `scope` / `kind` are the canonical classification (doctrine scope×kind).
 * `tier` is retained as an optional legacy field for backward-compat with
 * promotions already persisted under the old 3-tier model — readers derive
 * scope×kind from `target` path when `scope`/`kind` are absent.
 */
export interface PendingPromotion {
  id: string
  persona: string
  turn_id: string
  scope?: PromotionScope
  kind?: PromotionKind
  /** @deprecated legacy 3-tier classifier — superseded by scope×kind. Read-only. */
  tier?: string
  target: string
  delta: string
  rationale: string
  status: PromotionStatus
  surfaced_at?: string
  decided_at?: string
  final_target?: string
}

/**
 * po-state.json shape. v2 introduces `schema_version`; reads tolerate v1 absent.
 *
 * v2 changes:
 *   - `current_phase`: 1..5 (was 1..4; Phase 4 = Deploy inserted, Phase 5 = Close).
 *   - `past_tickets[]` REMOVED. GUI derives ticket lists via `useTicketScan`.
 *   - `versions[]` capped at 5; older versions only via `outcome.retrospective_path`.
 *   - `current_task.type` replaces `current_task.stage` (legacy alias kept for read).
 *   - `phase_history[]` is current-version only; cleared on version close.
 *   - `current_task.persona_sessions{}` and `persona_session_meta{}` dropped on close.
 */
export interface PoState {
  schema_version?: number
  project_slug?: string
  current_version?: string
  current_phase?: number  // 1..5; resolves to Phase via PHASE_NAMES
  phase_history?: PhaseTransition[]
  pending_gate?: PendingGate | null
  /**
   * prdt (v1) lifecycle field — adapter A4 (T-287). Present ONLY on a prdt
   * po-state (4-field schema: `{schema_version, stage, version, current_task}`);
   * absent on every legacy po-state. `isPrdtPoState()` in phase-mapping.ts uses
   * this field's presence as the project-kind discriminator at the store level.
   */
  stage?: Stage
  /**
   * prdt (v1) flat version field — adapter A8 (T-291). prdt po-state carries a
   * single `version` string (e.g. "v1.1") instead of the legacy `current_version`
   * + `versions[]` array. Present only on a prdt po-state (alongside `stage`);
   * legacy po-state uses `current_version`.
   *
   * T-306: at the renderer store ingress (useWorkspace.setPoState) this value is
   * BRIDGED into `current_version` via `bridgePrdtVersion` (phase-mapping.ts), so
   * version-keyed consumers (PRD auto-nav, ticket-review auto-open, artifact
   * scoping, dashboards) work unmodified for prdt. `versions[]` is never
   * synthesized — array-driven institutions stay suppressed via isPrdtPoState.
   */
  version?: string
  current_task?: CurrentTask
  /** @deprecated v1 only — readers ignore in v2; GUI uses `useTicketScan` instead. */
  past_tickets?: Ticket[]
  versions?: Version[]
  recent_turns?: unknown[]
  /**
   * T-PATCH-203: close_gate slice — materialized into po-state by the
   * prompt-gate-inject / pre-phase-gate-guard hooks from
   * ~/.productune/config/close-gate.p3.json while the project is in an
   * enumerable-gate phase (currently P3/Build). Each item: { step, status,
   * waivable }. Absent outside P3 (or before the hook runs) → GUI treats as
   * graceful pass-fallback (see aggregateGate). Typed loosely (status is a
   * string union written by shell hooks) to stay tolerant of unknown values.
   */
  close_gate?: Array<{ step: string; status?: string; waivable?: boolean; type?: string }>
  /** Promotion candidates queued for user approval (deferred surface). */
  pending_promotions?: PendingPromotion[]
  updated_at?: string
  [key: string]: unknown
}
