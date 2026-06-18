/**
 * AskUserQuestionCard — T-013 (b)
 *
 * Renders when message.kind === 'ask-user-question'.
 * Shows clickable option cards inline in the chat transcript.
 * On selection: echoes chosen option into transcript, then collapses to resolved chip.
 *
 * IPC: chat:answerQuestion — sends chosen key to main process.
 * If main process handler is absent (follow-up scope per T-013 Plan §5), the
 * UI still resolves locally so UX is unblocked.
 *
 * Idempotency: message.payload.resolved drives resolved chip on re-render;
 * local state mirrors this until store write completes.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2 } from 'lucide-react'
import type { Message, AskUserQuestionPayload } from '../../../lib/types'
import { useWorkspace } from '../../../store/workspace'

interface Props {
  message: Message
}

export default function AskUserQuestionCard({ message }: Props) {
  const { t } = useTranslation()
  const payload = message.payload as AskUserQuestionPayload | undefined
  if (!payload) return null

  // Already resolved — idempotent chip
  if (payload.resolved) {
    const { chosenKey } = payload.resolved
    const chipLabel =
      chosenKey === '__dismissed__'
        ? t('workspace.chat.askQuestion.dismissed')
        : (payload.options.find((o) => o.key === chosenKey)?.title ?? chosenKey)
    return (
      <div style={{ paddingLeft: 8, margin: '4px 0' }}>
        <ResolvedChip label={chipLabel} />
      </div>
    )
  }

  return <LiveCard message={message} payload={payload} />
}

// ── Live option card ──────────────────────────────────────────────────────────

function LiveCard({ message, payload }: { message: Message; payload: AskUserQuestionPayload }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const appendMessage = useWorkspace((s) => s.appendMessage)
  const setMessages = useWorkspace((s) => s.setMessages)
  const project = useWorkspace((s) => s.project)
  const claudeSessionId = useWorkspace((s) => s.claudeSessionId)

  const handleSelect = async (key: string) => {
    if (selectedKey !== null || pending) return

    // ≤100ms: immediate visual selection (AC6 Feedback).
    setSelectedKey(key)
    setPending(true)

    const chosen = payload.options.find((o) => o.key === key)
    const chosenLabel = chosen?.title ?? key

    // Optimistic local resolve so the card shows the chip + the chosen answer
    // surfaces as a user bubble immediately. The RESUME itself originates in
    // main (chat:answerQuestion → runPoTurn), so the card must NOT also fire a
    // second turn — this is a single user echo, not a duplicate dispatch.
    const echoMsg: Message = {
      // T-PATCH-192: include a random suffix (matches every other id factory in
      // the app) so two echoes within the same millisecond can't collide on id.
      id: `u-auq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      kind: 'user',
      text: chosenLabel,
      status: 'done',
      created_at: new Date().toISOString(),
    }
    appendMessage(echoMsg)

    // Patch original message payload to resolved in store (idempotent on remount).
    const msgs = useWorkspace.getState().messages
    const patched = msgs.map((m) =>
      m.id === message.id
        ? {
            ...m,
            payload: {
              ...(m.payload as AskUserQuestionPayload),
              resolved: { chosenKey: key },
            },
          }
        : m,
    )
    setMessages(patched)

    // Persist the user echo to chat.json (the card's resolved patch is persisted
    // main-side by the answer handler). Then flag the in-flight resumed turn so
    // the composer/stream UI reflects it; onDone clears streaming.
    const api = (window as any).api
    if (api?.chatAppendMessage && project) {
      try { await api.chatAppendMessage(project.projectDir, echoMsg) } catch { /* noop */ }
    }

    if (api?.chatAnswerQuestion && project) {
      useWorkspace.getState().setStreaming(true)
      useWorkspace.getState().setInFlightKind('po')
      try {
        await api.chatAnswerQuestion({
          projectDir: project.projectDir,
          messageId: message.id,
          chosenKey: key,
          answerText: chosenLabel,
          sessionId: claudeSessionId,
        })
      } catch {
        // IPC unavailable / resume failed — drop the streaming flag so the
        // composer doesn't stay locked (AC4 non-trapping).
        useWorkspace.getState().setStreaming(false)
      }
    }

    setPending(false)
  }

  const isResolved = selectedKey !== null

  return (
    <div style={{ paddingLeft: 8, margin: '4px 0' }}>
      <div className="action-card">
        <div style={{ fontSize: 13, color: '#E8E8EA', lineHeight: 1.5 }}>
          {payload.question}
        </div>
        <div className="opt-stack">
          {payload.options.map((opt) => {
            const isSelected = selectedKey === opt.key
            const isDimmed = isResolved && !isSelected
            return (
              <button
                key={opt.key}
                className={`opt${isSelected ? ' selected' : ''}${isDimmed ? ' dimmed' : ''}`}
                onClick={() => handleSelect(opt.key)}
                disabled={isResolved}
              >
                <span className="opt-key">{opt.key}</span>
                <span className="opt-body">
                  <span className="opt-title">{opt.title}</span>
                  {opt.description && (
                    <span className="opt-desc">{opt.description}</span>
                  )}
                </span>
                <span className="opt-check">
                  {isSelected && pending && (
                    <Loader2 size={12} className="pdt-spin" style={{ color: '#8B5CF6' }} />
                  )}
                  {isSelected && !pending && (
                    <Check size={12} style={{ color: '#34D399' }} />
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Resolved chip ─────────────────────────────────────────────────────────────

function ResolvedChip({ label }: { label: string }) {
  return (
    <span className="resolved-chip">
      <Check size={12} style={{ color: '#34D399' }} strokeWidth={3} />
      {label}
    </span>
  )
}
