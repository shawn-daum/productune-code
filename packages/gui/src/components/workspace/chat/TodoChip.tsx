/**
 * TodoChip.tsx — rp-todo-chip row (T-P4-113).
 *
 * Appears between PersonaPresenceBar and rp-msgs when openCount > 0.
 * Shows ClipboardList icon + "할 일 N" text + orange count badge.
 * Click toggles the TodoListPanel accordion.
 */

import { ClipboardList } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUserTodo, selectOpenCount } from '../../../store/useUserTodo'

export default function TodoChip() {
  const { t } = useTranslation()
  const todos = useUserTodo((s) => s.todos)
  const todoExpanded = useUserTodo((s) => s.todoExpanded)
  const toggleExpanded = useUserTodo((s) => s.toggleExpanded)

  const openCount = selectOpenCount(todos)

  // Hidden when no open todos — takes no space.
  if (openCount === 0) return null

  return (
    <div style={chipRow} className="rp-todo-chip">
      <button
        style={chipBtn}
        onClick={toggleExpanded}
        aria-expanded={todoExpanded}
        aria-label={t('workspace.chat.todoChipLabel', { count: openCount })}
      >
        <ClipboardList size={13} strokeWidth={2} style={{ flexShrink: 0 }} />
        <span style={chipLabel}>
          {t('workspace.chat.todoChipLabel', { count: openCount })}
        </span>
        <span style={badge}>{openCount}</span>
      </button>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const chipRow: React.CSSProperties = {
  flexShrink: 0,
  borderBottom: '1px solid var(--border-section)',
  background: 'var(--bg-surface-base)',
  padding: '0 12px',
  display: 'flex',
  alignItems: 'center',
  minHeight: 28,
}

const chipBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-tertiary)',
  padding: '3px 0',
  fontSize: 11,
  borderRadius: 4,
}

const chipLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-tertiary)',
}

const badge: React.CSSProperties = {
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  background: 'var(--accent)',
  color: 'var(--text-static-white)',
  fontSize: 10,
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
  lineHeight: 1,
}
