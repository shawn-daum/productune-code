// ── Core domain types — synced with PO doctrine (sections/tickets.md, sections/memory.md) ──

// Layer A — Version Cycle Phase (where in the cycle).
// Maps to po-state.json `current_phase` (1..4). Discovery was merged into PRD's
// clarity loop — no separate interview phase.
export type Phase = 'PRD' | 'Design' | 'Build' | 'Close'

export const PHASE_NAMES: Record<number, Phase> = {
  1: 'PRD',
  2: 'Design',
  3: 'Build',
  4: 'Close',
}

// Layer B — ticket type (`stage` field on each ticket).
export type Stage = 'design' | 'impl' | 'refactor' | 'test' | 'qa' | 'deploy'

// Ticket lifecycle status (separate from `stage`).
export type Status = 'todo' | 'in-progress' | 'review' | 'done' | 'blocked' | 'abandoned'

// Auto QA smoke gate result on impl/refactor tickets.
export type QaStatus = 'pending' | 'pass' | 'fail'

export interface Project {
  slug: string
  projectDir: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  status?: 'streaming' | 'done' | 'cancelled'
  created_at: string
}

export interface Session {
  messages: Message[]
  claude_session_id?: string
  updated_at: string
}

export interface Ticket {
  ticket_id: string
  version?: string
  slug?: string
  title?: string
  stage?: Stage
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
}

// `current_task` slice in po-state.json (live ticket being worked).
export interface CurrentTask {
  ticket_id?: string
  slug?: string
  title?: string
  status?: Status
  stage?: Stage
  qa_status?: QaStatus
  qa_loops?: number
  assignee_persona?: string
  started_at?: string
  ended_at?: string | null
  request_summary?: string
}

export interface PhaseTransition {
  phase: number  // 1..4
  started_at?: string
  completed_at?: string
  summary?: string
  user_approved_at?: string
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

export interface PoState {
  project_slug?: string
  current_version?: string
  current_phase?: number  // 1..4; resolves to Phase via PHASE_NAMES
  phase_history?: PhaseTransition[]
  current_task?: CurrentTask
  past_tickets?: Ticket[]
  versions?: Version[]
  recent_turns?: unknown[]
  updated_at?: string
  [key: string]: unknown
}
