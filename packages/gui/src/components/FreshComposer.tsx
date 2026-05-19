/**
 * FreshComposer (T-P4-101) — "아이디어 먼저" 1-input screen.
 *
 * Shown when onboarding.status === 'pending'. Full-screen centered.
 * Only element: hero headline + supporting copy + textarea + send CTA.
 * No ActivityBar / Sidebar / MainPanel / StatusBar.
 *
 * Send flow (Decision E):
 *  1. Persist user message via chatAppendMessage
 *  2. Fire poSendMessage (long-running, don't await completion)
 *  3. Yield one event-loop tick (catch synchronous bridge errors)
 *  4. Call onboardingSetDone → call onConfirm → WorkspaceShell reveals
 *
 * Failure (Decision F): only if chatAppendMessage or setDone throws.
 *  → draft preserved, inline error, retry enabled, state stays pending.
 */

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SendHorizonal } from 'lucide-react'
import type { Message } from '../lib/types'
import type { Project } from '../lib/types'

interface Props {
  project: Project
  /** Called when send/start handshake succeeds — triggers WorkspaceShell reveal. */
  onConfirm: () => void
}

export default function FreshComposer({ project, onConfirm }: Props) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const canSend = draft.trim().length > 0 && !sending

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    setError(null)

    const text = draft.trim()
    const api = (window as any).api

    try {
      // Step 1 — Persist user message to disk (chatAppendMessage IPC).
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        kind: 'user',
        text,
        status: 'done',
        created_at: new Date().toISOString(),
      }
      await api.chatAppendMessage(project.projectDir, userMsg)

      // Step 2 — Fire poSendMessage (fire-and-forget; long-running PO turn).
      // Do NOT await — WorkspaceShell / ChatPanel picks up streaming events after reveal.
      api.poSendMessage({ projectDir: project.projectDir, text })

      // Step 3 — Yield one event-loop tick.
      // ChatPanel will subscribe to po:onMsgId after WorkspaceShell mounts,
      // which happens before Claude emits its first token.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))

      // Step 4 — Mark onboarding done + reveal workspace (Decision E).
      await api.onboardingSetDone(project.projectDir)
      onConfirm()
    } catch {
      // chatAppendMessage or onboardingSetDone failed — keep pending.
      setError(t('workspace.freshComposer.error'))
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    // Cmd+Enter = send. Plain Enter = newline (service-wide convention).
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={container}>
      <div style={content}>
        {/* ── Hero copy ──────────────────────────────────────────────────── */}
        <h1 style={headline}>{t('workspace.freshComposer.headline')}</h1>
        <p style={supporting}>{t('workspace.freshComposer.supporting')}</p>

        {/* ── Composer box ───────────────────────────────────────────────── */}
        <div style={composerBox}>
          <textarea
            ref={taRef}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('workspace.freshComposer.placeholder')}
            disabled={sending}
            rows={4}
            style={textarea}
          />
          <div style={composerFooter}>
            <span style={keyHint}>{t('workspace.freshComposer.keyHint')}</span>
            <button
              style={canSend ? ctaActive : ctaDisabled}
              disabled={!canSend}
              onClick={handleSend}
              aria-label={t('workspace.freshComposer.cta')}
            >
              {sending ? (
                /* Spinner — reuses global .pdt-spin class from index.html */
                <svg
                  className="pdt-spin"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <>
                  <span>{t('workspace.freshComposer.cta')}</span>
                  <SendHorizonal size={15} style={{ marginLeft: 6 }} />
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Inline error (Decision F) ───────────────────────────────────── */}
        {error && (
          <div style={errorRow} role="alert">
            <span style={errorText}>⚠ {error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
// Design tokens from plan §D:
//   --surface-body:    #0F0F0F
//   --text-primary:    #E8E8EA (~22px semi-bold)
//   --text-secondary:  #C8C8CC (~14px regular)
//   --surface-subpanel:#1A1A1A (textarea bg)
//   --border-strong:   #2A2A2A (textarea border)
//   --accent:          #FF6B2B (CTA)
//   --health-error:    #F87171 (inline error)

const container: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0F0F0F',
}

const content: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  maxWidth: 680,
  padding: '0 24px',
}

const headline: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  color: '#E8E8EA',
  textAlign: 'center',
  marginBottom: 10,
  lineHeight: 1.4,
}

const supporting: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 400,
  color: '#C8C8CC',
  textAlign: 'center',
  marginBottom: 24,
  lineHeight: 1.6,
}

const composerBox: React.CSSProperties = {
  width: '100%',
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 10,
  padding: '14px 16px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const textarea: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  resize: 'none',
  color: '#E8E8EA',
  fontSize: 14,
  lineHeight: 1.6,
  fontFamily: 'inherit',
  // Focus ring via outline override — accent color
}

const composerFooter: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const keyHint: React.CSSProperties = {
  fontSize: 12,
  color: '#505050',
}

const ctaBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  background: '#FF6B2B',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '7px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.15s',
  minWidth: 36,
  justifyContent: 'center',
}

const ctaActive: React.CSSProperties = {
  ...ctaBase,
  opacity: 1,
}

const ctaDisabled: React.CSSProperties = {
  ...ctaBase,
  opacity: 0.4,
  cursor: 'not-allowed',
}

const errorRow: React.CSSProperties = {
  marginTop: 12,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const errorText: React.CSSProperties = {
  fontSize: 13,
  color: '#F87171',
}
