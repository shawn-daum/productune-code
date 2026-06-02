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
 *   promotion-candidate       → PromotionCard (T-013 c)
 */

import type { Message, MessageKind } from '../../../lib/types'
import { linkifyText } from '../../../lib/linkifyText'
import MdRenderer from './MdRenderer'
import AskUserQuestionCard from './AskUserQuestionCard'
import PromotionCard from './PromotionCard'

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

interface Props {
  message: Message
}

export default function MessageBubble({ message }: Props) {
  const kind: MessageKind =
    message.kind ?? (message.role === 'user' ? 'user' : 'po')

  // T-013: action-card dispatch
  if (kind === 'ask-user-question') return <AskUserQuestionCard message={message} />
  if (kind === 'promotion-candidate') return <PromotionCard message={message} />

  if (kind === 'user') return <UserBubble message={message} />
  if (kind === 'trace') return <TraceLine message={message} />
  return <PersonaBubble message={message} kind={kind as 'po' | 'designer' | 'dev' | 'qa'} />
}

// ── Persona bubble (po / designer / dev / qa) ────────────────────────────────

function PersonaBubble({ message, kind }: { message: Message; kind: 'po' | 'designer' | 'dev' | 'qa' }) {
  const color = PERSONA_COLOR[kind] ?? '#8B5CF6'
  const label = PERSONA_LABEL[kind] ?? kind
  const time = formatTime(message.created_at)

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
        {message.status === 'streaming' && <span style={cursorStyle}>▋</span>}
      </div>
    </div>
  )
}

// ── User bubble (right-aligned) — linkify NOT applied (XSS 방어) ──────────────

function UserBubble({ message }: { message: Message }) {
  const time = formatTime(message.created_at)
  return (
    <div style={rowR}>
      <div style={cmHead}>
        <span style={cmTime}>{time} ·</span>
        <span style={cmNameUser}>You</span>
      </div>
      <div style={{ ...cmBubble, ...userBubble }}>
        <MdRenderer text={message.text} />
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
const cursorStyle: React.CSSProperties = {
  color: '#8B5CF6',
  marginLeft: 2,
  animation: 'persona-blink 0.8s ease infinite',
}

// md-* styles moved to MdRenderer.tsx + md-recipes.css (T-013)
