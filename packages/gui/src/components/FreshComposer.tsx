/**
 * FreshComposer (T-P4-101) — "아이디어 먼저" 1-input screen.
 *
 * Shown when onboarding.status === 'pending'. Full-screen centered.
 * Elements: hero headline + supporting copy + composer box (chip row +
 * textarea + footer with paperclip + keyHint + CTA) + optional error row.
 * No ActivityBar / Sidebar / MainPanel / StatusBar.
 *
 * Send flow (T-PATCH-133 A-plan — Decision E + attachment parity):
 *  1. buildAttachedFilesBlock(draft.trim()) → finalText
 *  2. Persist user message via chatAppendMessage (finalText)
 *  3. setDraft('') + clearAttachments() (UI-only; disk cleanup via L1 24h purge
 *     per RESOLUTION-1 — FreshComposer is fire-and-forget so poSendMessage may
 *     still be reading temp files when cleanup would fire)
 *  4. Fire poSendMessage (fire-and-forget)
 *  5. Yield one event-loop tick
 *  6. Call onboardingSetDone → call onConfirm → WorkspaceShell reveals
 *
 * Failure (Decision F): only if chatAppendMessage or setDone throws.
 *  → draft + chips preserved, inline error, retry enabled.
 */

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SendHorizonal, Paperclip, X as XIcon } from 'lucide-react'
import type { Message } from '../lib/types'
import type { Project } from '../lib/types'
import { useComposerAttachments } from '../hooks/useComposerAttachments'
import { useWorkspace } from '../store/workspace'
import { ImageChip, chipRow } from './workspace/chat/ImageChip'
// T-PATCH-109: brand logo for the first-start screen.
import logoUrl from '../assets/logo.png'

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

  // T-PATCH-133: shared attachment hook — image paste + file picker + chip logic.
  const {
    images,
    otherFiles,
    onComposerPaste,
    onAttachFile,
    removeImage,
    removeFile,
    onComposerChange,
    handleTokenDeleteKeyDown,
    buildAttachedFilesBlock,
    clearAttachments,
  } = useComposerAttachments(draft, setDraft, taRef, project.projectDir)

  const hasAttachments = images.length > 0 || otherFiles.length > 0
  const canSend = (draft.trim().length > 0 || hasAttachments) && !sending

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    setError(null)

    const api = (window as any).api
    // Step 1 — Build the final text (prepends ## Attached files block if present).
    const finalText = buildAttachedFilesBlock(draft.trim())

    try {
      // Step 2 — Persist user message to disk.
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        kind: 'user',
        text: finalText,
        status: 'done',
        created_at: new Date().toISOString(),
      }
      await api.chatAppendMessage(project.projectDir, userMsg)

      // Step 3 — Clear draft + chips (UI only; RESOLUTION-1: no cleanupSentFiles here).
      setDraft('')
      clearAttachments()

      // Step 4 — Fire poSendMessage (fire-and-forget; long-running PO turn).
      // T-PATCH-252: latch streaming:true BEFORE the turn fires + before
      // WorkspaceShell mounts. ChatPanel.handleSubmit sets this synchronously,
      // but FreshComposer never did — so on the first-turn entry the PO turn ran
      // with streaming still false and PersonaPresenceBar's usePOPresenceDerive
      // saw streaming=false at mount, leaving the PO sprite stuck grey/idle the
      // whole turn (poEvents onMsgId's streaming:true edge could fire during the
      // setTimeout gap, before poEvents registered / the bar mounted, and get
      // missed). Latching here means the bar mounts already-working; onMsgId is
      // idempotent and onDone still resets streaming:false → idle on completion.
      // setInFlightKind('po') mirrors ChatPanel so trace/bubble routing matches.
      useWorkspace.getState().setInFlightKind('po')
      useWorkspace.getState().setStreaming(true)
      api.poSendMessage({ projectDir: project.projectDir, text: finalText })

      // Step 5 — Yield one event-loop tick so WorkspaceShell mounts before first token.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))

      // Step 6 — Mark onboarding done + reveal workspace.
      await api.onboardingSetDone(project.projectDir)
      onConfirm()
    } catch {
      // chatAppendMessage or onboardingSetDone failed — keep pending + chips intact.
      setError(t('workspace.freshComposer.error'))
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    // T-PATCH-133: atomic token-delete (Backspace/Delete adjacent to [Image #N]).
    if (handleTokenDeleteKeyDown(e)) return
    // Cmd+Enter = send. Plain Enter = newline.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={container}>
      <div style={content}>
        {/* ── Brand logo (T-PATCH-109) ─────────────────────────────────────── */}
        <img
          src={logoUrl}
          alt="Productune"
          style={logoStyle}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />

        {/* ── Hero copy ────────────────────────────────────────────────────── */}
        <h1 style={headline}>{t('workspace.freshComposer.headline')}</h1>
        <p style={supporting}>{t('workspace.freshComposer.supporting')}</p>

        {/* ── Composer box ─────────────────────────────────────────────────── */}
        <div style={composerBox}>
          {/* T-PATCH-133 BDD-2/BDD-4: image chip row — above textarea, inside box */}
          {images.length > 0 && (
            <div style={chipRow}>
              {images.map((img) => (
                <ImageChip
                  key={img.seq}
                  seq={img.seq}
                  path={img.path}
                  previewUrl={img.previewUrl}
                  onRemove={() => removeImage(img.seq)}
                />
              ))}
            </div>
          )}

          <textarea
            ref={taRef}
            autoFocus
            value={draft}
            onChange={(e) => onComposerChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={onComposerPaste}
            placeholder={t('workspace.freshComposer.placeholder')}
            disabled={sending}
            rows={4}
            style={textarea}
          />

          {/* T-PATCH-133 BDD-1: file chip row (non-image paperclip attachments) */}
          {otherFiles.length > 0 && (
            <div style={fileChipRow}>
              {otherFiles.map((path) => (
                <div key={path} style={fileChipStyle}>
                  <span style={fileChipLabel} title={path}>{basename(path)}</span>
                  <button
                    style={fileChipRemove}
                    onClick={() => removeFile(path)}
                    aria-label={t('workspace.chat.removeFile', { name: basename(path) })}
                    title={basename(path)}
                  >
                    <XIcon size={10} strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={composerFooter}>
            {/* T-PATCH-133 BDD-1/BDD-4: paperclip — left of keyHint, preserving layout */}
            <div style={footerLeft}>
              <button
                style={paperclipBtn}
                onClick={onAttachFile}
                disabled={sending}
                aria-label={t('workspace.chat.attachFile')}
                title={t('workspace.chat.attachFile')}
              >
                <Paperclip size={15} />
              </button>
              <span style={keyHint}>{t('workspace.freshComposer.keyHint')}</span>
            </div>
            <button
              style={canSend ? ctaActive : ctaDisabled}
              disabled={!canSend}
              onClick={handleSend}
              aria-label={t('workspace.freshComposer.cta')}
            >
              {sending ? (
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

        {/* ── Inline error (Decision F) ────────────────────────────────────── */}
        {error && (
          <div style={errorRow} role="alert">
            <span style={errorText}>⚠ {error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function basename(p: string): string {
  const seg = p.split('/').filter(Boolean)
  const name = seg[seg.length - 1] ?? p
  return name.length > 24 ? `${name.slice(0, 21)}…` : name
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

const logoStyle: React.CSSProperties = {
  height: 40,
  width: 'auto',
  maxWidth: 200,
  objectFit: 'contain',
  display: 'block',
  marginBottom: 20,
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
}

const composerFooter: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const footerLeft: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const paperclipBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  background: 'transparent',
  border: 'none',
  borderRadius: 6,
  color: '#505050',
  cursor: 'pointer',
  transition: 'color 0.15s, background 0.15s',
}

const keyHint: React.CSSProperties = {
  fontSize: 12,
  color: '#505050',
}

const fileChipRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const fileChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  height: 24,
  padding: '0 6px',
  borderRadius: 4,
  background: '#1E1E1E',
  border: '1px solid #2A2A2A',
  color: '#C8C8CC',
  fontSize: 11,
  fontFamily: 'monospace',
  maxWidth: 200,
}

const fileChipLabel: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const fileChipRemove: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  padding: 0,
  border: 'none',
  borderRadius: '50%',
  background: 'transparent',
  color: '#505050',
  cursor: 'pointer',
  flexShrink: 0,
}

const ctaBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  background: '#8B5CF6',
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
