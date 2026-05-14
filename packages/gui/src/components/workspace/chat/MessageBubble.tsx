/**
 * MessageBubble — single chat message renderer (T-P4-041).
 * T-P4-114 §C/§E: linkifyText preprocessing + ptn: href routing in <a>.
 *
 * Six bubble kinds:
 *   po / designer / dev / qa  → 2 px left border in persona color
 *   trace                     → caption gray, no border
 *   user                      → right-aligned, gray-overlay bg (linkify NOT applied)
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message, MessageKind } from '../../../lib/types'
import { linkifyText } from '../../../lib/linkifyText'
import { useWorkspace } from '../../../store/workspace'

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
        {/* T-P4-114: linkifyText applied before react-markdown */}
        <Markdown text={linkifyText(message.text)} />
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
        <Markdown text={message.text} />
      </div>
    </div>
  )
}

// ── Trace line — linkifyText applied so file/ticket mentions are clickable ────

function TraceLine({ message }: { message: Message }) {
  return (
    <div style={traceLine}>
      <Markdown text={linkifyText(message.text)} />
    </div>
  )
}

// ── Markdown wrapper ──────────────────────────────────────────────────────────

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
          // T-P4-114: ptn: href routing + external URL → browser tab
          a:    ({ href, children }) => <MdLink href={href}>{children}</MdLink>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

// ── MdLink — ptn: prefix router ───────────────────────────────────────────────

function MdLink({ href, children }: { href?: string; children: React.ReactNode }) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!href) return
    routeLink(href)
  }

  return (
    <a
      href={href}
      style={getLinkStyle(href)}
      onClick={handleClick}
      // keep cursor pointer even though onClick handles navigation
    >
      {children}
    </a>
  )
}

/**
 * Route a link href to the correct workspace action.
 * Called from onClick handler so it has access to the current store state.
 */
function routeLink(href: string): void {
  const openTab = useWorkspace.getState().openTab

  if (href.startsWith('ptn:ticket/')) {
    const id = href.slice('ptn:ticket/'.length)
    openTab(`ticket-review:${id}`, 'ticket-review', { ticketId: id }, id)
    return
  }

  if (href.startsWith('ptn:file/')) {
    const filePath = href.slice('ptn:file/'.length)
    const basename = filePath.split('/').pop() ?? filePath
    openTab(`markdown:${filePath}`, 'markdown', { path: filePath }, basename)
    return
  }

  if (/^https?:\/\//.test(href)) {
    let hostname: string
    try {
      hostname = new URL(href).hostname
    } catch {
      hostname = href.replace(/^https?:\/\//, '').split('/')[0] ?? href
    }
    const encodedUrl = encodeURIComponent(href)
    openTab(`browser:${encodedUrl}`, 'browser', { url: href }, hostname)
    return
  }

  if (href.startsWith('ptn:')) {
    // Unknown ptn: prefix — noop (security guard)
    return
  }

  // Non-ptn, non-http: prevent default (already done by onClick) — noop
}

/**
 * Derive link color from href prefix.
 *   ptn:ticket/  → #A78BFA  (--persona-designer, purple)
 *   ptn:file/    → #38BDF8  (--persona-dev, blue)
 *   https?://    → #C8C8CC  (--text-secondary, gray)
 *   fallback     → #38BDF8  (existing mdLink color)
 */
function getLinkStyle(href?: string): React.CSSProperties {
  const base: React.CSSProperties = { textDecoration: 'underline', cursor: 'pointer' }
  if (!href) return { ...base, color: '#38BDF8' }
  if (href.startsWith('ptn:ticket/')) return { ...base, color: '#A78BFA' }
  if (href.startsWith('ptn:file/'))   return { ...base, color: '#38BDF8' }
  if (/^https?:\/\//.test(href))      return { ...base, color: '#C8C8CC' }
  return { ...base, color: '#38BDF8' }
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
