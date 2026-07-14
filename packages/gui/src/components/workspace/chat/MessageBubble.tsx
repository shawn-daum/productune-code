/**
 * MessageBubble — single chat message renderer (T-P4-041).
 * T-P4-114 §C/§E: linkifyText preprocessing + ptn: href routing in <a>.
 * T-013: MdRenderer replaces inline Markdown fn; action-card kind dispatch added.
 *
 * Eight bubble kinds:
 *   po / designer / dev / qa  → 2 px left border in persona color
 *   trace                     → caption gray, no border
 *   user                      → right-aligned, gray-overlay bg (linkify NOT applied)
 *   ask-user-question         → AskUserQuestionCard (T-013 b)
 *   promotion-candidate       → PromotionCard (T-013 c) |
 *                               PromotionQuestionCard when payload.origin ===
 *                               'user-requested' (T-PATCH-097)
 */

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Message, MessageKind, PromotionPayload } from '../../../lib/types'
import { linkifyText } from '../../../lib/linkifyText'
import { parseAttachedFilesBlock } from '../../../lib/attachedFilesBlock'
import MdRenderer from './MdRenderer'
import AskUserQuestionCard from './AskUserQuestionCard'
import PromotionCard from './PromotionCard'
import PromotionQuestionCard from './PromotionQuestionCard'
import { ImageChip, FileChip, chipRow } from './ImageChip'

// T-006 Option B — PO = violet #8B5CF6 (was orange #FF6B2B)
// designer moved to orange #FB923C (no longer violet)
const PERSONA_COLOR: Record<string, string> = {
  po:       '#8B5CF6',
  designer: '#FB923C',
  dev:      '#38BDF8',
  qa:       '#34D399',
}

const PERSONA_LABEL: Record<string, string> = {
  po:       'PO',
  designer: 'Designer',
  dev:      'Developer',
  qa:       'QA',
}

// ── Streaming cursor keyframe injection (once per document, T-PATCH-148) ──────
// The cursor must blink WITHOUT depending on any other component's global
// keyframe — PersonaPresenceBar may not be mounted on every screen, and T-144
// removed the old `persona-blink` keyframe this cursor used to borrow. So
// MessageBubble owns a dedicated, once-guarded keyframe `mb-cursor-blink`.
// Same once-guard pattern as PersonaPresenceBar.ensureSpriteKeyframe — distinct
// STYLE_ID. Do NOT remove the <style> on cleanup: it is a global single
// injection; removing it would break every other mounted streaming bubble.
const CURSOR_STYLE_ID = 'mb-cursor-keyframes'

function ensureCursorKeyframe() {
  if (typeof document === 'undefined') return
  if (document.getElementById(CURSOR_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = CURSOR_STYLE_ID
  // 1s step-end → crisp on/off typing-cursor blink (vs the old 0.8s ease fade).
  // prefers-reduced-motion: pin opacity, no animation (accessibility).
  style.textContent = `
    @keyframes mb-cursor-blink {
      0%, 49%   { opacity: 1; }
      50%, 100% { opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .mb-cursor { animation: none !important; opacity: 1 !important; }
    }
  `
  document.head.appendChild(style)
}

interface Props {
  message: Message
}

export default function MessageBubble({ message }: Props) {
  const kind: MessageKind =
    message.kind ?? (message.role === 'user' ? 'user' : 'po')

  // T-013: action-card dispatch
  if (kind === 'ask-user-question') return <AskUserQuestionCard message={message} />
  if (kind === 'promotion-candidate') {
    // T-PATCH-097: user-requested promotion gates render as a question-style
    // card; auto-surfaced candidates (origin absent or 'auto') keep the classic
    // PromotionCard — safe no-regression fallback when the origin signal is
    // missing from the payload.
    const origin = (message.payload as PromotionPayload | undefined)?.origin
    if (origin === 'user-requested') return <PromotionQuestionCard message={message} />
    return <PromotionCard message={message} />
  }

  if (kind === 'user') return <UserBubble message={message} />
  if (kind === 'trace') return <TraceLine message={message} />
  return <PersonaBubble message={message} kind={kind as 'po' | 'designer' | 'dev' | 'qa'} />
}

// ── Persona bubble (po / designer / dev / qa) ────────────────────────────────

function PersonaBubble({ message, kind }: { message: Message; kind: 'po' | 'designer' | 'dev' | 'qa' }) {
  const color = PERSONA_COLOR[kind] ?? '#8B5CF6'
  const label = PERSONA_LABEL[kind] ?? kind
  const time = formatTime(message.created_at)

  // T-PATCH-148 (Q3): inject the cursor blink keyframe once. Global single
  // injection — no cleanup (once-guard guarantees idempotency; removing it would
  // break other mounted streaming bubbles).
  useEffect(() => {
    ensureCursorKeyframe()
  }, [])

  return (
    <div style={{ ...rowL, borderLeft: `2px solid ${color}` }}>
      <div style={cmHead}>
        <span style={{ ...cmName, color }}>{label}</span>
        <span style={cmTime}>· {time}</span>
      </div>
      <div style={cmBubble}>
        {/* T-P4-114: linkifyText applied before react-markdown */}
        {/* T-013: MdRenderer replaces inline Markdown fn */}
        <MdRenderer text={linkifyText(message.text)} />
        {message.status === 'streaming' && <span className="mb-cursor" style={cursorStyle}>▋</span>}
      </div>
    </div>
  )
}

// ── User bubble (right-aligned) — linkify NOT applied (XSS 방어) ──────────────

/**
 * T-350: attachments render as chips at the BOTTOM of the bubble instead of the
 * raw `## Attached files` markdown block. The block stays in `message.text`
 * unchanged (model-facing content — PO still receives the paths); this is a
 * pure render-time transform via parseAttachedFilesBlock, so it applies
 * identically to existing history messages (no data migration needed).
 */
function UserBubble({ message }: { message: Message }) {
  const { t } = useTranslation()
  const time = formatTime(message.created_at)
  const parsed = parseAttachedFilesBlock(message.text)

  return (
    <div style={rowR}>
      <div style={cmHead}>
        <span style={cmTime}>{time} ·</span>
        <span style={cmNameUser}>{t('workspace.chat.you')}</span>
      </div>
      <div style={{ ...cmBubble, ...userBubble }}>
        {parsed ? (
          <>
            {parsed.body && <MdRenderer text={parsed.body} />}
            <div style={{ ...chipRow, marginTop: parsed.body ? 6 : 0 }}>
              {parsed.images.map((img) => (
                <ImageChip key={`img-${img.seq}`} seq={img.seq} path={img.path} />
              ))}
              {parsed.files.map((path) => (
                <FileChip key={path} path={path} />
              ))}
            </div>
          </>
        ) : (
          <MdRenderer text={message.text} />
        )}
      </div>
    </div>
  )
}

// ── Trace line — linkifyText applied so file/ticket mentions are clickable ────

function TraceLine({ message }: { message: Message }) {
  return (
    <div style={traceLine}>
      <MdRenderer text={linkifyText(message.text)} />
    </div>
  )
}

// MdLink and routeLink moved to MdRenderer.tsx (T-013)

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// ── styles ──────────────────────────────────────────────────────────────────

const rowL: React.CSSProperties = {
  paddingLeft: 8,
  margin: '4px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  alignItems: 'flex-start',
}

const rowR: React.CSSProperties = {
  margin: '4px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  alignItems: 'flex-end',
}

const cmHead: React.CSSProperties = {
  fontSize: 10,
  display: 'flex',
  gap: 4,
  alignItems: 'baseline',
}

const cmName: React.CSSProperties = {
  fontWeight: 600,
}

const cmNameUser: React.CSSProperties = {
  fontWeight: 600,
  color: '#A0A0A0',
}

const cmTime: React.CSSProperties = {
  color: '#707070',
}

const cmBubble: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: '0 5px 5px 5px',
  background: '#1A1A1A',
  color: '#E5E5E5',
  fontSize: 12,
  lineHeight: 1.45,
  maxWidth: '95%',
  wordBreak: 'break-word',
}

const userBubble: React.CSSProperties = {
  background: '#1E1E1E',
  borderRadius: '5px 0 5px 5px',
  border: '1px solid #2A2A2A',
}

const traceLine: React.CSSProperties = {
  fontSize: 10,
  color: '#707070',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  padding: '2px 4px',
  margin: '2px 0',
}

// T-013 / T-006 Option B: streaming cursor = --persona-po violet (was orange #FF6B2B)
// T-PATCH-148 (Q3): self-owned keyframe `mb-cursor-blink` (was `persona-blink`,
// removed by T-144). 1s step-end = crisp typing-cursor blink. See
// ensureCursorKeyframe for the once-guarded injection + reduced-motion guard.
const cursorStyle: React.CSSProperties = {
  color: '#8B5CF6',
  marginLeft: 2,
  animation: 'mb-cursor-blink 1s step-end infinite',
}

// md-* styles moved to MdRenderer.tsx + md-recipes.css (T-013)
