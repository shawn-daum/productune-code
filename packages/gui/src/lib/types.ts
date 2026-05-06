// ── Core domain types — shared across R4 workspace slices ──────────────────

export type Stage = 'PRD' | 'Design' | 'Build' | 'QA' | 'Deploy' | 'Operate'

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

export interface TicketData {
  id: string
  title: string
  status: 'open' | 'in-progress' | 'done'
  stage: Stage
  assignee?: string
}

export interface CurrentTask {
  stage?: Stage
  ticket_id?: string
  title?: string
}

export interface PoState {
  project_slug?: string
  current_task?: CurrentTask
  updated_at?: string
  [key: string]: unknown
}
