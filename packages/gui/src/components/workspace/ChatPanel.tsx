/**
 * ChatPanel — Right panel chat UI (T-P4-041, mockup 5-row layout).
 *
 *   rp-hdr        35 px   header (PO badge + title + restart)
 *   rp-ctx       ~28 px   phase chip + round-N · T-NNN action
 *   rp-persona-bar 24 px  T-P4-049 (positioned here via this component)
 *   rp-msgs       flex-1  message list — 6 bubble kinds
 *   rp-input      auto    textarea + send button (no persona selector — v2 sub-c)
 *
 * Single PO session per project. Persists to <projectDir>/.productune/chat.json.
 * Streaming via main-process spawn of `claude --output-format stream-json`,
 * with echo-mode fallback when claude CLI isn't installed.
 *
 * v2 doctrine sub-c: persona selector removed. PO orchestrator decides dispatch
 * autonomously per `po-instructions.md` Routing. Visibility = PersonaPresenceBar.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Paperclip, ArrowUp, RefreshCw } from 'lucide-react'
import { useWorkspace } from '../../store/workspace'
import { usePoChat } from '../../store/poChat'
import type { Message } from '../../lib/types'
import PhaseStrip from './PhaseStrip'
import PersonaPresenceBar from './PersonaPresenceBar'
import MessageBubble from './chat/MessageBubble'
import TodoChip from './chat/TodoChip'
import TodoListPanel from './chat/TodoListPanel'
import PendingGateChip from './chat/PendingGateChip'
import RateLimitBanner from './chat/RateLimitBanner'
import { useSessionHealth } from '../../store/sessionHealth'

export default function ChatPanel() {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const messages = useWorkspace((s) => s.messages)
  const poState = useWorkspace((s) => s.poState)
  const claudeSessionId = useWorkspace((s) => s.claudeSessionId)
  const streaming = useWorkspace((s) => s.streaming)

  const setMessages = useWorkspace((s) => s.setMessages)
  const appendMessage = useWorkspace((s) => s.appendMessage)
  const setClaudeSessionId = useWorkspace((s) => s.setClaudeSessionId)
  const setStreaming = useWorkspace((s) => s.setStreaming)

  // ── Session health (T-012) ────────────────────────────────────────────────
  const healthState = useSessionHealth((s) => s.state)
  const healthDetail = useSessionHealth((s) => s.detail)
  const clearHealth = useSessionHealth((s) => s.clearHealth)
  const rateLimited = healthState === 'rate-limited'

  const draft = usePoChat((s) => s.inputDraft)
  const setDraft = usePoChat((s) => s.setDraft)
  const autoScrollLocked = usePoChat((s) => s.autoScrollLocked)
  const setAutoScrollLocked = usePoChat((s) => s.setAutoScrollLocked)

  const msgsRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // ── Load session on project change ───────────────────────────────────────
  useEffect(() => {
    if (!project) return
    const api = (window as any).api
    api.chatGetSession(project.projectDir).then((session: any) => {
      const msgs: Message[] = (session?.messages ?? []).map((m: Message) => ({
        ...m,
        kind: m.kind ?? (m.role === 'user' ? 'user' : 'po'),
      }))
      setMessages(msgs)
      setClaudeSessionId(session?.claude_session_id ?? null)
    }).catch(() => { /* no session yet */ })
  }, [project, setMessages, setClaudeSessionId])

  // ── Auto-scroll ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScrollLocked) return
    const el = msgsRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, autoScrollLocked])

  const onScroll = () => {
    const el = msgsRef.current
    if (!el) return
    const atBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) < 24
    setAutoScrollLocked(!atBottom)
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const trimmed = draft.trim()
    if (!trimmed && attachedFiles.length === 0) return
    if (streaming || !project) return

    // Compose body — attached files prefixed as a small block PO/claude can read.
    const filesBlock = attachedFiles.length > 0
      ? `## Attached files\n${attachedFiles.map((p) => `- ${p}`).join('\n')}\n\n`
      : ''
    const text = `${filesBlock}${trimmed}`

    const userMsg: Message = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      kind: 'user',
      text,
      status: 'done',
      created_at: new Date().toISOString(),
    }
    appendMessage(userMsg)
    setDraft('')
    setAttachedFiles([])
    setAutoScrollLocked(false)

    const api = (window as any).api
    try { await api.chatAppendMessage(project.projectDir, userMsg) } catch { /* ignore */ }

    // PO is the sole entry point — pre-allocated assistant bubble is `po` kind.
    // Dispatch decisions surface via PersonaPresenceBar (T-P4-049), not here.
    // inFlightKind/Id state now lives in workspace store (T-P4-119 uplift).
    useWorkspace.getState().setInFlightKind('po')
    setStreaming(true)
    try {
      await api.poSendMessage({
        projectDir: project.projectDir,
        text,
        resume: claudeSessionId,
      })
    } catch (e) {
      setStreaming(false)
      useWorkspace.getState().setInFlightMsgId(null)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME composition — don't capture Enter mid-Korean composition.
    if ((e.nativeEvent as any).isComposing) return
    // Cmd+Enter (or Ctrl+Enter) → submit. Plain Enter → newline (default).
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // textarea autosize — height follows content (cap 200px).
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  const [attachedFiles, setAttachedFiles] = useState<string[]>([])
  const [filesListOpen, setFilesListOpen] = useState(false)

  const onAttachFile = async () => {
    try {
      const paths: string[] = await (window as any).api.openFilePicker()
      if (!paths || paths.length === 0) return
      // dedupe (drag-add same file twice)
      setAttachedFiles((prev) => {
        const set = new Set(prev)
        for (const p of paths) set.add(p)
        return Array.from(set)
      })
      requestAnimationFrame(() => taRef.current?.focus())
    } catch { /* IPC unavailable — noop */ }
  }

  const removeAttached = (path: string) => {
    setAttachedFiles((prev) => prev.filter((p) => p !== path))
  }

  const [sendHover, setSendHover] = useState(false)
  const [attachHover, setAttachHover] = useState(false)
  const [restartTipPos, setRestartTipPos] = useState<{ top: number; left: number } | null>(null)
  const restartBtnRef = useRef<HTMLButtonElement>(null)
  const setRestartModalOpen = usePoChat((s) => s.setRestartModalOpen)

  const onRestartClick = () => {
    setRestartModalOpen(true)
  }
  const onRestartEnter = () => {
    const r = restartBtnRef.current?.getBoundingClientRect()
    if (r) setRestartTipPos({ top: r.bottom + 6, left: r.right })
  }
  const onRestartLeave = () => setRestartTipPos(null)

  // ── ctx caption ─────────────────────────────────────────────────────────
  const ctxCaption = useMemo(() => {
    const ticketId = poState?.current_task?.ticket_id
    if (!ticketId) return t('workspace.chat.idleCtx')
    const action = t('workspace.chat.actionDefault')
    return `${ticketId} ${action}`
  }, [poState, t])

  return (
    <>
      <div style={wrap}>
        {/* rp-hdr */}
        <div style={header}>
          <span style={poBadge}>P</span>
          <span style={headerTitle}>{t('workspace.chat.title')}</span>
          <button
            ref={restartBtnRef}
            style={{
              ...iconBtn,
              background: restartTipPos ? '#2A2A2A' : 'transparent',
              color: restartTipPos ? '#F0F0F0' : '#A0A0A0',
            }}
            onMouseEnter={onRestartEnter}
            onMouseLeave={onRestartLeave}
            onClick={onRestartClick}
            aria-label={t('workspace.chat.restartSession')}
          >
            <RefreshCw size={13} strokeWidth={2} />
          </button>
        </div>

        {/* rp-ctx */}
        <div style={ctxRow} className="rp-ctx">
          <PhaseStrip poState={poState} variant="chip" />
          <span style={ctxCaptionStyle}>{ctxCaption}</span>
        </div>

        {/* rp-persona-bar (T-P4-049) — placed directly under rp-ctx */}
        <PersonaPresenceBar />

        {/* rp-todo-chip (T-P4-113) — hidden when openCount === 0 */}
        <TodoChip />

        {/* rp-todo-panel (T-P4-113) — accordion, expands below chip */}
        <TodoListPanel />

        {/* rp-pending-gate-chip (T-P4-158) — hidden when pending_gate == null */}
        <PendingGateChip />

        {/* rp-msgs */}
        <div style={msgs} ref={msgsRef} onScroll={onScroll} className="rp-msgs">
          {messages.length === 0 ? (
            <div style={emptyHint}>{t('workspace.chat.emptyHint')}</div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
        </div>

        {/* rp-rate-limit-banner (T-012) — visible only when rate-limited */}
        {rateLimited && (
          <RateLimitBanner
            detail={healthDetail}
            onExpired={() => {
              clearHealth()
              setStreaming(false)
            }}
          />
        )}

        {/* rp-input — textarea (auto-grow) + paperclip + send (Cmd+Enter) */}
        <div style={inputArea}>
          <textarea
            ref={taRef}
            style={textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('workspace.chat.inputPlaceholder')}
            rows={1}
            disabled={streaming || !project || rateLimited}
          />
          <div style={inputRow}>
            <button
              style={{
                ...iconActionBtn,
                background: attachHover ? '#2A2A2A' : 'transparent',
                color: attachHover ? '#F0F0F0' : '#A0A0A0',
              }}
              onMouseEnter={() => setAttachHover(true)}
              onMouseLeave={() => setAttachHover(false)}
              onClick={onAttachFile}
              aria-label={t('workspace.chat.attachFile')}
              title={t('workspace.chat.attachFile')}
              disabled={streaming || !project || rateLimited}
            >
              <Paperclip size={14} strokeWidth={2} />
            </button>

            {attachedFiles.length > 0 && (
              <div
                style={fileChipWrap}
                onMouseEnter={() => setFilesListOpen(true)}
                onMouseLeave={() => setFilesListOpen(false)}
              >
                <span style={fileChip}>
                  {attachedFiles.length === 1
                    ? basename(attachedFiles[0])
                    : `${attachedFiles.length} ${t('workspace.chat.filesCount')}`}
                </span>
                {filesListOpen && (
                  <div style={fileListPopup}>
                    {attachedFiles.map((p) => (
                      <div key={p} style={fileListRow}>
                        <span style={fileListPath} title={p}>{p}</span>
                        <button
                          style={fileListRemove}
                          onClick={() => removeAttached(p)}
                          aria-label={t('workspace.chat.removeFile')}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ flex: 1 }} />
            <button
              style={{
                ...sendBtn,
                opacity: streaming || !draft.trim() || rateLimited ? 0.5 : 1,
                // T-013 / T-006 Option B: send button = --persona-po violet
                background: sendHover && !(streaming || !draft.trim() || rateLimited) ? '#9D74F8' : '#8B5CF6',
              }}
              onMouseEnter={() => setSendHover(true)}
              onMouseLeave={() => setSendHover(false)}
              onClick={handleSubmit}
              disabled={streaming || !draft.trim() || !project || rateLimited}
            >
              <ArrowUp size={12} strokeWidth={2.5} />
              <span>{t('workspace.chat.send')}</span>
              {sendHover && !(streaming || !draft.trim()) && (
                <span style={kbdHint}>⌘↵</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {restartTipPos && createPortal(
        <div
          style={{
            position: 'fixed',
            top: restartTipPos.top,
            left: restartTipPos.left,
            transform: 'translateX(-100%)',
            background: '#1E1E1E',
            border: '1px solid #2A2A2A',
            color: '#E0E0E0',
            padding: '4px 9px',
            borderRadius: 4,
            fontSize: 11,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 1000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            maxWidth: 'calc(100vw - 20px)',
          }}
        >
          {t('workspace.chat.restartHint')}
        </div>,
        document.body,
      )}
    </>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  gridArea: 'chat',
  width: '100%',
  background: '#141414',
  borderLeft: '1px solid #2A2A2A',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  minWidth: 0,
}

const header: React.CSSProperties = {
  height: 35,
  flexShrink: 0,
  borderBottom: '1px solid #2A2A2A',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 12px',
}

// T-013 / T-006 Option B: poBadge = --persona-po violet (was orange #FF6B2B)
const poBadge: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 4,
  background: '#8B5CF6',
  color: '#0F0F0F',
  fontSize: 11,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const headerTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#F0F0F0',
  flex: 1,
}

const iconBtn: React.CSSProperties = {
  width: 22,
  height: 22,
  background: 'transparent',
  border: 'none',
  color: '#909090',
  fontSize: 14,
  cursor: 'pointer',
  borderRadius: 3,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.12s ease, color 0.12s ease',
}

const ctxRow: React.CSSProperties = {
  flexShrink: 0,
  padding: '4px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  borderBottom: '1px solid #1f1f1f',
  background: '#101010',
}

const ctxCaptionStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#909090',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}

const msgs: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const emptyHint: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
  textAlign: 'center',
  marginTop: 24,
  padding: '0 16px',
}

const inputArea: React.CSSProperties = {
  flexShrink: 0,
  borderTop: '1px solid #2A2A2A',
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  background: '#121212',
}

const textarea: React.CSSProperties = {
  width: '100%',
  minHeight: 36,
  maxHeight: 200,
  background: '#1E1E1E',
  border: '1px solid #2A2A2A',
  borderRadius: 6,
  color: '#F0F0F0',
  fontSize: 12,
  padding: '8px 10px',
  outline: 'none',
  resize: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  lineHeight: 1.5,
  overflow: 'hidden',
}

const inputRow: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
}

const iconActionBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
  transition: 'background 0.12s ease, color 0.12s ease',
}

// T-013 / T-006 Option B: sendBtn base bg overridden inline per sendHover state
const sendBtn: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  background: '#8B5CF6',
  border: 'none',
  borderRadius: 6,
  color: '#FFFFFF',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  transition: 'background 0.12s ease, opacity 0.12s ease',
}

const kbdHint: React.CSSProperties = {
  fontSize: 10,
  fontFamily: 'monospace',
  background: 'rgba(0,0,0,0.18)',
  borderRadius: 3,
  padding: '1px 4px',
  marginLeft: 2,
}

function basename(p: string): string {
  const seg = p.split('/').filter(Boolean)
  const name = seg[seg.length - 1] ?? p
  return name.length > 24 ? `${name.slice(0, 21)}…` : name
}

const fileChipWrap: React.CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
}

const fileChip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 24,
  padding: '0 8px',
  borderRadius: 4,
  background: '#1E1E1E',
  border: '1px solid #2A2A2A',
  color: '#C8C8CC',
  fontSize: 11,
  fontFamily: 'monospace',
  maxWidth: 180,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  userSelect: 'none',
}

const fileListPopup: React.CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 6px)',
  left: 0,
  minWidth: 220,
  maxWidth: 360,
  maxHeight: 200,
  overflowY: 'auto',
  background: '#1C1C20',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 6,
  padding: 4,
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  zIndex: 200,
}

const fileListRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 6px',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'monospace',
  color: '#E8E8EA',
}

const fileListPath: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const fileListRemove: React.CSSProperties = {
  width: 18,
  height: 18,
  border: 'none',
  background: 'transparent',
  color: '#A0A0A0',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  borderRadius: 3,
  flexShrink: 0,
}
