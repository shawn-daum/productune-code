/**
 * MessageBubble — single chat message renderer (T-P4-041).
 *
 * Six bubble kinds:
 *   po / designer / dev / qa  → 2 px left border in persona color
 *   trace                     → caption gray, no border
 *   user                      → right-aligned, gray-overlay bg
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message, MessageKind } from '../../../lib/types'

const PERSONA_COLOR: Record<Exclude<MessageKind, 'trace' | 'user'>, string> = {
  po:       '#FF6B2B',
  designer: '#A78BFA',
  dev:      '#38BDF8',
  qa:       '#34D399',
}

const PERSONA_LABEL: Record<Exclude<MessageKind, 'trace' | 'user'>, string> = {
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

  if (kind === 'user') return <UserBubble message={message} />
  if (kind === 'trace') return <TraceLine message={message} />
  return <PersonaBubble message={message} kind={kind} />
}

// ── Persona bubble (po / designer / dev / qa) ────────────────────────────────

function PersonaBubble({ message, kind }: { message: Message; kind: 'po' | 'designer' | 'dev' | 'qa' }) {
  const color = PERSONA_COLOR[kind]
  const label = PERSONA_LABEL[kind]
  const time = formatTime(message.created_at)

  return (
    <div style={{ ...rowL, borderLeft: `2px solid ${color}` }}>
      <div style={cmHead}>
        <span style={{ ...cmName, color }}>{label}</span>
        <span style={cmTime}>· {time}</span>
      </div>
      <div style={cmBubble}>
        <Markdown text={message.text} />
        {message.status === 'streaming' && <span style={cursorStyle}>▋</span>}
      </div>
    </div>
  )
}

// ── User bubble (right-aligned) ──────────────────────────────────────────────

function UserBubble({ message }: { message: Message }) {
  const time = formatTime(message.created_at)
  return (
    <div style={rowR}>
      <div style={cmHead}>
        <span style={cmTime}>{time} ·</span>
        <span style={cmNameUser}>You</span>
      </div>
      <div style={{ ...cmBubble, ...userBubble }}>
        <Markdown text={message.text} />
      </div>
    </div>
  )
}

// ── Trace line ───────────────────────────────────────────────────────────────

function TraceLine({ message }: { message: Message }) {
  return (
    <div style={traceLine}>
      {message.text}
    </div>
  )
}

// ── Markdown wrapper — minimal allowed nodes ─────────────────────────────────

function Markdown({ text }: { text: string }) {
  return (
    <div style={{ display: 'inline' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p:    ({ children }) => <span style={mdP}>{children}</span>,
          code: ({ children }) => <code style={mdCode}>{children}</code>,
          ul:   ({ children }) => <ul style={mdList}>{children}</ul>,
          ol:   ({ children }) => <ol style={mdList}>{children}</ol>,
          a:    ({ href, children }) => (
            <a href={href} style={mdLink} target="_blank" rel="noreferrer">{children}</a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

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

const cursorStyle: React.CSSProperties = {
  color: '#FF6B2B',
  marginLeft: 2,
  animation: 'persona-blink 0.8s ease infinite',
}

const mdP: React.CSSProperties = {
  margin: 0,
}

const mdCode: React.CSSProperties = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  background: '#0F0F0F',
  padding: '1px 4px',
  borderRadius: 3,
  fontSize: 11,
}

const mdList: React.CSSProperties = {
  margin: '4px 0',
  paddingLeft: 18,
}

const mdLink: React.CSSProperties = {
  color: '#38BDF8',
  textDecoration: 'underline',
}
