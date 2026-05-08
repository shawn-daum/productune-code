/**
 * ChatPanel — Right panel chat UI (T-P4-041, mockup 5-row layout).
 *
 *   rp-hdr        35 px   header (PO badge + title + minimize + close)
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

import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../store/workspace'
import { usePoChat } from '../../store/poChat'
import type { Message, MessageKind } from '../../lib/types'
import PhaseStrip from './PhaseStrip'
import PersonaPresenceBar from './PersonaPresenceBar'
import MessageBubble from './chat/MessageBubble'
import PoFab from './chat/PoFab'

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

  const panelVisible = usePoChat((s) => s.panelVisible)
  const setPanelVisible = usePoChat((s) => s.setPanelVisible)
  const draft = usePoChat((s) => s.inputDraft)
  const setDraft = usePoChat((s) => s.setDraft)
  const autoScrollLocked = usePoChat((s) => s.autoScrollLocked)
  const setAutoScrollLocked = usePoChat((s) => s.setAutoScrollLocked)

  const msgsRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Track the in-progress assistant msgId so onToken can target it.
  const inFlightMsgIdRef = useRef<string | null>(null)
  const inFlightKindRef = useRef<MessageKind>('po')

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

  // ── Subscribe to streaming events once ───────────────────────────────────
  useEffect(() => {
    const api = (window as any).api
    if (!api?.poOnToken) return

    const offMsgId = api.poOnMsgId((msgId: string) => {
      // Insert the placeholder bubble bound to this msgId.
      const placeholder: Message = {
        id: msgId,
        role: 'assistant',
        kind: inFlightKindRef.current,
        text: '',
        status: 'streaming',
        created_at: new Date().toISOString(),
      }
      inFlightMsgIdRef.current = msgId
      appendMessage(placeholder)
    })

    const offToken = api.poOnToken((msgId: string, chunk: string) => {
      // Append to the matching message — guard against stale ids.
      useWorkspace.setState((s) => {
        const idx = s.messages.findIndex((m) => m.id === msgId)
        if (idx < 0) return s
        const updated = { ...s.messages[idx], text: s.messages[idx].text + chunk }
        const next = [...s.messages]
        next[idx] = updated
        return { messages: next }
      })
    })

    const offAnnounce = api.poOnAnnounce((_msgId: string, payload: { level: string; text: string }) => {
      const trace: Message = {
        id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: 'system',
        kind: 'trace',
        text: payload.text,
        status: 'done',
        created_at: new Date().toISOString(),
      }
      appendMessage(trace)
    })

    const offDone = api.poOnDone(async (msgId: string, info: { sessionId?: string }) => {
      // Mark message done + persist to chat.json + update sessionId.
      const finalMsg = await new Promise<Message | null>((resolve) => {
        useWorkspace.setState((s) => {
          const idx = s.messages.findIndex((m) => m.id === msgId)
          if (idx < 0) {
            resolve(null)
            return s
          }
          const updated = { ...s.messages[idx], status: 'done' as const }
          const next = [...s.messages]
          next[idx] = updated
          resolve(updated)
          return { messages: next }
        })
      })
      const proj = useWorkspace.getState().project
      const api = (window as any).api
      if (proj && finalMsg) {
        try { await api.chatAppendMessage(proj.projectDir, finalMsg) } catch { /* ignore */ }
      }
      if (proj && info.sessionId) {
        setClaudeSessionId(info.sessionId)
        try { await api.chatSetClaudeSessionId(proj.projectDir, info.sessionId) } catch { /* ignore */ }
      }
      setStreaming(false)
      inFlightMsgIdRef.current = null
    })

    return () => {
      offMsgId?.()
      offToken?.()
      offAnnounce?.()
      offDone?.()
    }
  }, [appendMessage, setClaudeSessionId, setStreaming])

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
    const text = draft.trim()
    if (!text || streaming || !project) return

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
    setAutoScrollLocked(false)

    const api = (window as any).api
    try { await api.chatAppendMessage(project.projectDir, userMsg) } catch { /* ignore */ }

    // PO is the sole entry point — pre-allocated assistant bubble is `po` kind.
    // Dispatch decisions surface via PersonaPresenceBar (T-P4-049), not here.
    inFlightKindRef.current = 'po'
    setStreaming(true)
    try {
      await api.poSendMessage({
        projectDir: project.projectDir,
        text,
        resume: claudeSessionId,
      })
    } catch (e) {
      setStreaming(false)
      inFlightMsgIdRef.current = null
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME composition — don't capture Enter mid-Korean composition.
    if ((e.nativeEvent as any).isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // ── ctx caption ─────────────────────────────────────────────────────────
  const ctxCaption = useMemo(() => {
    const ticketId = poState?.current_task?.ticket_id
    const phaseNum = poState?.current_phase ?? 0
    const versionsCount = (poState?.versions?.length as number | undefined) ?? 0
    const round = versionsCount > 0 ? versionsCount : phaseNum > 0 ? 1 : 0
    if (!round && !ticketId) return t('workspace.chat.idleCtx')
    const action = t('workspace.chat.actionDefault')
    if (ticketId) return `round-${round || 1} · ${ticketId} ${action}`
    return `round-${round}`
  }, [poState, t])

  return (
    <>
      {!panelVisible && <PoFab />}
      <div style={{ ...wrap, display: panelVisible ? 'flex' : 'none' }}>
        {/* rp-hdr */}
        <div style={header}>
          <span style={poBadge}>P</span>
          <span style={headerTitle}>{t('workspace.chat.title')}</span>
          <button
            style={iconBtn}
            onClick={() => setPanelVisible(false)}
            aria-label={t('workspace.chat.minimize')}
            title={t('workspace.chat.minimize')}
          >─</button>
          <button
            style={iconBtn}
            onClick={() => setPanelVisible(false)}
            aria-label={t('workspace.chat.close')}
            title={t('workspace.chat.close')}
          >×</button>
        </div>

        {/* rp-ctx */}
        <div style={ctxRow} className="rp-ctx">
          <PhaseStrip poState={poState} variant="chip" />
          <span style={ctxCaptionStyle}>{ctxCaption}</span>
        </div>

        {/* rp-persona-bar (T-P4-049) — placed directly under rp-ctx */}
        <PersonaPresenceBar />

        {/* rp-msgs */}
        <div style={msgs} ref={msgsRef} onScroll={onScroll} className="rp-msgs">
          {messages.length === 0 ? (
            <div style={emptyHint}>{t('workspace.chat.emptyHint')}</div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
        </div>

        {/* rp-input — textarea + send only (no persona selector, v2 sub-c) */}
        <div style={inputArea}>
          <textarea
            ref={taRef}
            style={textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('workspace.chat.inputPlaceholder')}
            rows={2}
            disabled={streaming || !project}
          />
          <div style={inputRow}>
            <button
              style={{ ...sendBtn, opacity: streaming || !draft.trim() ? 0.4 : 1 }}
              onClick={handleSubmit}
              disabled={streaming || !draft.trim() || !project}
            >
              {t('workspace.chat.send')}
            </button>
          </div>
        </div>
      </div>
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

const poBadge: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 4,
  background: '#FF6B2B',
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
  minHeight: 40,
  maxHeight: 120,
  background: '#1E1E1E',
  border: '1px solid #2A2A2A',
  borderRadius: 6,
  color: '#F0F0F0',
  fontSize: 12,
  padding: '6px 8px',
  outline: 'none',
  resize: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const inputRow: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  justifyContent: 'flex-end',
}

const sendBtn: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  background: '#FF6B2B',
  border: 'none',
  borderRadius: 4,
  color: '#0F0F0F',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
}
