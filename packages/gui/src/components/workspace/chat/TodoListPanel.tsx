/**
 * TodoListPanel.tsx — accordion-style expandable todo list (T-P4-113).
 *
 * Rendered directly below TodoChip (flex push-down, rp-msgs slides down).
 * Max-height 200px with scroll.
 *
 * Todo types:
 *   check      — checkbox click → completeTodo + injectUserMessage("[user] done: …")
 *   text-input — description + text field + submit → completeTodo + injectUserMessage("[user]: …")
 *   link       — clickable description → openTab(href)
 *
 * Done rows: opacity 0.4 + text-decoration line-through. Dismissed: hidden.
 */

import { useState } from 'react'
import { Square, CheckSquare, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  useUserTodo,
  selectVisibleTodos,
  type UserTodo,
} from '../../../store/useUserTodo'
import { useWorkspace } from '../../../store/workspace'
import { injectUserMessage } from '../../../lib/injectUserMessage'

export default function TodoListPanel() {
  const { t } = useTranslation()
  const todos = useUserTodo((s) => s.todos)
  const todoExpanded = useUserTodo((s) => s.todoExpanded)
  const completeTodo = useUserTodo((s) => s.completeTodo)
  const streaming = useWorkspace((s) => s.streaming)
  const openTab = useWorkspace((s) => s.openTab)

  const [inputValues, setInputValues] = useState<Record<string, string>>({})

  if (!todoExpanded) return null

  const visibleTodos = selectVisibleTodos(todos)

  const handleCheck = async (todo: UserTodo) => {
    if (todo.status === 'done' || streaming) return
    completeTodo(todo.id)
    await injectUserMessage(`[user] done: ${todo.description}`)
  }

  const handleTextSubmit = async (todo: UserTodo) => {
    const text = (inputValues[todo.id] ?? '').trim()
    if (!text || streaming) return
    completeTodo(todo.id)
    setInputValues((prev) => ({ ...prev, [todo.id]: '' }))
    await injectUserMessage(`[user]: ${text}`)
  }

  const handleLinkClick = (todo: UserTodo) => {
    if (todo.href) {
      // Open file path as markdown tab; href can be a file path or tab id.
      openTab(todo.href, 'markdown', {}, todo.description)
    }
  }

  return (
    <div style={panelStyle}>
      {visibleTodos.length === 0 ? (
        <span style={emptyCaption}>{t('workspace.chat.todoEmpty')}</span>
      ) : (
        visibleTodos.map((todo) => {
          const isDone = todo.status === 'done'
          return (
            <div key={todo.id} style={{ ...rowStyle, opacity: isDone ? 0.4 : 1 }}>
              {/* id caption */}
              <span style={idCaption}>#{todo.id.slice(0, 8)}</span>

              <div style={rowInner}>
                {/* check type — left checkbox */}
                {todo.type === 'check' && (
                  <button
                    style={checkBtn}
                    onClick={() => handleCheck(todo)}
                    disabled={isDone || streaming}
                    aria-label={isDone ? 'done' : 'mark done'}
                  >
                    {isDone ? (
                      <CheckSquare size={13} strokeWidth={2} />
                    ) : (
                      <Square size={13} strokeWidth={2} />
                    )}
                  </button>
                )}

                <div style={contentCol}>
                  {/* link type — clickable description */}
                  {todo.type === 'link' ? (
                    <button
                      style={linkBtn}
                      onClick={() => handleLinkClick(todo)}
                    >
                      <span style={descStyle(isDone)}>{todo.description}</span>
                      <ChevronRight size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
                    </button>
                  ) : (
                    <span style={descStyle(isDone)}>{todo.description}</span>
                  )}

                  {/* text-input type — input + submit (hidden when done) */}
                  {todo.type === 'text-input' && !isDone && (
                    <div style={inputRowStyle}>
                      <input
                        style={textInput}
                        type="text"
                        value={inputValues[todo.id] ?? ''}
                        onChange={(e) =>
                          setInputValues((prev) => ({
                            ...prev,
                            [todo.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (
                            e.key === 'Enter' &&
                            !(e.nativeEvent as any).isComposing
                          ) {
                            handleTextSubmit(todo)
                          }
                        }}
                        disabled={streaming}
                        placeholder={t('workspace.todo.inputPlaceholder')}
                      />
                      <button
                        style={{
                          ...submitBtn,
                          opacity:
                            streaming || !(inputValues[todo.id]?.trim()) ? 0.5 : 1,
                        }}
                        onClick={() => handleTextSubmit(todo)}
                        disabled={streaming || !(inputValues[todo.id]?.trim())}
                      >
                        {t('workspace.chat.todoSubmit')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  flexShrink: 0,
  maxHeight: 200,
  overflowY: 'auto',
  background: '#161616',
  borderBottom: '1px solid #2A2A2A',
  padding: '4px 0',
}

const emptyCaption: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: '#505050',
  textAlign: 'center',
  padding: '8px 12px',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '5px 12px',
  gap: 2,
  borderBottom: '1px solid #1A1A1A',
  transition: 'opacity 0.15s ease',
}

const idCaption: React.CSSProperties = {
  fontSize: 10,
  color: '#707070',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}

const rowInner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 6,
}

const checkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: '#909090',
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
  marginTop: 1,
}

const contentCol: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

function descStyle(isDone: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    color: '#D0D0D0',
    lineHeight: 1.4,
    textDecoration: isDone ? 'line-through' : 'none',
  }
}

const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  textAlign: 'left',
  color: '#D0D0D0',
}

const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 5,
  alignItems: 'center',
}

const textInput: React.CSSProperties = {
  flex: 1,
  height: 24,
  background: '#1E1E1E',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#E0E0E0',
  fontSize: 11,
  padding: '0 7px',
  outline: 'none',
  fontFamily: 'inherit',
}

const submitBtn: React.CSSProperties = {
  height: 24,
  padding: '0 10px',
  background: '#8B5CF6',
  border: 'none',
  borderRadius: 4,
  color: '#0F0F0F',
  fontSize: 10,
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'opacity 0.12s ease',
}
