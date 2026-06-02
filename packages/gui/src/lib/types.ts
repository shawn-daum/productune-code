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

// Layer B — ticket type (`type` field on each ticket md frontmatter).
// Renamed from `Stage` (v2 doctrine, sub-d). Enum values unchanged.
// `doctrine` added 2026-05-15 (T-P4-119 hotfix — whiteboard crash on unknown type).
// `design+impl` added same — composite type Designer emits for cross-phase tickets.
export type TaskType = 'design' | 'impl' | 'refactor' | 'test' | 'qa' | 'deploy' | 'doctrine' | 'design+impl'

export const TYPE_ORDER: TaskType[] = ['design', 'impl', 'refactor', 'test', 'qa', 'deploy', 'doctrine', 'design+impl']

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
 * A single skill entry returned by the `skills:list` IPC handler.
 * `id`       — relative path from ~/.claude/skills root (slash-separated).
 * `name`     — frontmatter `name` field, or last-directory fallback.
 * `description` — frontmatter `description` field, or "".
 * `personas` — frontmatter `personas` array, or path-inference result, or [].
 * `filePath` — absolute path (for future deep-link / viewer).
 */
export interface SkillEntry {
  id: string
  name: string
  description: string
  personas: SkillPersona[]
  filePath: string
}

// ── Pending promotions (T-P4-066) ─────────────────────────────────────────────

export type PromotionTier = 'project' | 'wiki' | 'work-note'
export type PromotionStatus = 'pending' | 'approved' | 'dropped' | 'edited'

/**
 * A persona-returned promotion_candidate queued for user approval.
 * Lifecycle: pending → (approved | dropped | edited) at next turn-start drain.
 */
export interface PendingPromotion {
  id: string
  persona: string
  turn_id: string
  tier: PromotionTier
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
  current_task?: CurrentTask
  /** @deprecated v1 only — readers ignore in v2; GUI uses `useTicketScan` instead. */
  past_tickets?: Ticket[]
  versions?: Version[]
  recent_turns?: unknown[]
  /** Promotion candidates queued for user approval (deferred surface). */
  pending_promotions?: PendingPromotion[]
  updated_at?: string
  [key: string]: unknown
}
