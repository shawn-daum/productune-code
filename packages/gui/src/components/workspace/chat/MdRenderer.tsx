/**
 * MdRenderer — T-013 (a)
 * ReactMarkdown wrapper with full md-* recipe component overrides.
 * CSS recipes: src/styles/md-recipes.css (single import in main.tsx).
 *
 * Syntax highlight: monochrome-leaning subset (sx-*) only.
 * OQ-A9-1 multi-hue palette = NOT implemented (PO未決).
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ReactNode } from 'react'
import { useWorkspace } from '../../../store/workspace'

// ── Link routing (re-used from MessageBubble logic) ───────────────────────────

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
    try { hostname = new URL(href).hostname }
    catch { hostname = href.replace(/^https?:\/\//, '').split('/')[0] ?? href }
    const encodedUrl = encodeURIComponent(href)
    openTab(`browser:${encodedUrl}`, 'browser', { url: href }, hostname)
    return
  }
}

function getLinkColor(href?: string): string {
  if (!href) return '#38BDF8'
  if (href.startsWith('ptn:ticket/')) return '#A78BFA'
  if (href.startsWith('ptn:file/'))   return '#38BDF8'
  if (/^https?:\/\//.test(href))      return '#C8C8CC'
  return '#38BDF8'
}

function MdLink({ href, children }: { href?: string; children: ReactNode }) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (href) routeLink(href)
  }
  return (
    <a
      href={href}
      style={{ color: getLinkColor(href), textDecoration: 'underline', cursor: 'pointer' }}
      onClick={handleClick}
    >
      {children}
    </a>
  )
}

// ── Syntax highlight helper (monochrome subset) ───────────────────────────────
// Operates on plain-string ReactNode children only; passes React nodes through.
// Patterns follow the T-013 Plan §2-2 spec.

const TOKEN_PATTERNS: Array<{ cls: string; re: RegExp }> = [
  // comment — must precede keyword/string to capture // ... lines
  { cls: 'sx-comment', re: /(#.*$|\/\/.*$|\/\*[\s\S]*?\*\/)/gm },
  // string literals (double / single / template)
  { cls: 'sx-string',  re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g },
  // keywords
  { cls: 'sx-keyword', re: /\b(def|return|if|else|elif|for|while|import|from|class|const|let|var|function|async|await|=>|export|default)\b/g },
  // numbers
  { cls: 'sx-number',  re: /\b(\d+\.?\d*)\b/g },
  // punctuation
  { cls: 'sx-punct',   re: /([{}()[\].,;:])/g },
]

function applySyntaxHighlight(children: ReactNode): ReactNode {
  if (typeof children !== 'string') return children

  // Split text into classified segments.
  // Simple approach: run each pattern in order, build a segment list.
  type Seg = { text: string; cls: string | null }
  let segments: Seg[] = [{ text: children, cls: null }]

  for (const { cls, re } of TOKEN_PATTERNS) {
    const next: Seg[] = []
    for (const seg of segments) {
      if (seg.cls !== null) { next.push(seg); continue }
      const parts = seg.text.split(re)
      const m = seg.text.match(re) ?? []
      let mi = 0
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] !== '') next.push({ text: parts[i], cls: null })
        if (i < parts.length - 1 && m[mi] !== undefined) {
          next.push({ text: m[mi]!, cls })
          mi++
        }
      }
    }
    segments = next
  }

  if (segments.length === 1 && segments[0]!.cls === null) return children

  return (
    <>
      {segments.map((s, i) =>
        s.cls
          ? <span key={i} className={s.cls}>{s.text}</span>
          : <span key={i} className="sx-default">{s.text}</span>,
      )}
    </>
  )
}

// ── Component map ─────────────────────────────────────────────────────────────

const mdComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  // headings
  h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="md-h3">{children}</h3>,

  // paragraph — inline display to preserve flow inside bubble
  p: ({ children }) => <p className="md-body" style={{ margin: 0 }}>{children}</p>,

  // inline emphasis
  strong: ({ children }) => <strong className="md-strong">{children}</strong>,

  // blockquote
  blockquote: ({ children }) => <blockquote className="md-blockquote">{children}</blockquote>,

  // hr
  hr: () => <hr className="md-hr" />,

  // code block wrapper (fenced)
  pre: ({ children }) => <pre className="md-code-block">{children}</pre>,

  // code — inline vs block discrimination: block code carries a language className
  code: ({ className, children }) => {
    const isBlock = !!className
    if (isBlock) {
      return <code className={className ?? ''}>{applySyntaxHighlight(children)}</code>
    }
    return <code className="md-code-inline">{children}</code>
  },

  // lists
  ul: ({ children }) => <ul className="md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="md-ol">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,

  // table
  table: ({ children }) => <table className="md-table">{children}</table>,
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th className="md-table-th">{children}</th>,
  td: ({ children }) => <td className="md-table-td">{children}</td>,

  // links — ptn: routing
  a: ({ href, children }) => <MdLink href={href}>{children}</MdLink>,
}

// ── Public component ──────────────────────────────────────────────────────────

interface MdRendererProps {
  text: string
}

export default function MdRenderer({ text }: MdRendererProps) {
  return (
    <div style={{ display: 'inline' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={mdComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
