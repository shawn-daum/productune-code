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

/**
 * env target test (T-PATCH-093).
 * True when the file path points at a `.env*` file — basename starts with
 * ".env" (`.env`, `.env.local`, `.env.production`, …), matching the
 * projectEnv IPC ENV_FILENAME rule (`/^\.env[a-zA-Z0-9._-]*$/`).
 * `.productune/config.json` and other non-`.env` paths return false so they
 * still route to the markdown tab.
 */
function isEnvTarget(filePath: string): boolean {
  const basename = filePath.split('/').pop() ?? filePath
  return /^\.env[a-zA-Z0-9._-]*$/.test(basename)
}

// ── Absolute / file:// path routing (T-PATCH-106) ─────────────────────────────

const DOCTRINE_PERSONAS = new Set(['po', 'designer', 'developer', 'qa'])

/**
 * Normalize a clickable href into a local absolute (or tilde) path string.
 * - `file://…`  → decoded pathname (URL decode)
 * - `~/…`       → kept verbatim (doctrine IPC `expandHome` handles ~)
 * - `/…`        → kept verbatim
 * Returns null when href is not a path-shaped token.
 */
function normalizeAbsPath(href: string): string | null {
  if (href.startsWith('file://')) {
    try { return decodeURIComponent(new URL(href).pathname) }
    catch { return decodeURIComponent(href.replace(/^file:\/\//, '')) }
  }
  if (href.startsWith('~/') || href === '~' || href.startsWith('/')) return href
  return null
}

/**
 * Classify a normalized path as a doctrine file and derive its tab args.
 * Tier-2: `~/.productune/<persona>/…`  or  `<home>/.productune/<persona>/…`
 * Tier-1: `<projectDir>/docs/<persona>/…`
 * relName is `habit.md` or `bookshelf/<n>.md` (segments after the persona dir).
 * Returns null when the path isn't doctrine-shaped (.md + known persona).
 * Best-effort only — `doctrine:readFile` (`isAllowedDoctrinePath`) re-validates.
 */
function classifyDoctrine(
  absPath: string,
  projectDir: string | undefined,
): { tier: 1 | 2; persona: string; relName: string } | null {
  if (!absPath.endsWith('.md')) return null

  // Tier-2: …/.productune/<persona>/<rel…>
  const t2 = absPath.match(/\.productune\/(po|designer|developer|qa)\/(.+\.md)$/)
  if (t2 && DOCTRINE_PERSONAS.has(t2[1]!)) {
    return { tier: 2, persona: t2[1]!, relName: t2[2]! }
  }

  // Tier-1: <projectDir>/docs/<persona>/<rel…>
  if (projectDir) {
    const sep = projectDir.endsWith('/') ? '' : '/'
    const prefix = `${projectDir}${sep}docs/`
    if (absPath.startsWith(prefix)) {
      const rest = absPath.slice(prefix.length)
      const m = rest.match(/^(po|designer|developer|qa)\/(.+\.md)$/)
      if (m && DOCTRINE_PERSONAS.has(m[1]!)) {
        return { tier: 1, persona: m[1]!, relName: m[2]! }
      }
    }
  }
  return null
}

/** Route a normalized absolute/file:// path: doctrine → in-project relative → shell fallback. */
function routeAbsPath(absPath: string): void {
  const openTab = useWorkspace.getState().openTab
  const projectDir = useWorkspace.getState().project?.projectDir
  const basename = absPath.split('/').pop() ?? absPath

  // (1) doctrine file → doctrine-file tab (canonical PersonaDefTab call shape)
  const doc = classifyDoctrine(absPath, projectDir)
  if (doc) {
    openTab(
      `doctrine-file:${absPath}`,
      'doctrine-file',
      { tier: doc.tier, persona: doc.persona, absPath, relName: doc.relName, editable: false, projectDir },
      basename,
    )
    return
  }

  // (2) in-project non-doctrine absolute → projectDir-relative → ptn:file viewer
  if (projectDir) {
    const sep = projectDir.endsWith('/') ? '' : '/'
    const prefix = `${projectDir}${sep}`
    if (absPath.startsWith(prefix)) {
      routeLink(`ptn:file/${absPath.slice(prefix.length)}`)
      return
    }
  }

  // (3) everything else → OS default app via shell:openPath fallback
  const api = (window as any).api
  if (api?.openPath) {
    void api.openPath(absPath)
  } else {
    console.warn('[MdRenderer] no shell:openPath bridge; cannot open', absPath)
  }
}

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
    // env-target files → dedicated ENV viewer tab (ProjectEnvPane), keyed by
    // basename. ProjectEnvPane resolves it against projectEnv:read FileGroups.
    if (isEnvTarget(filePath)) {
      openTab(`project-env:${basename}`, 'project-env', { filename: basename }, basename)
      return
    }
    openTab(`markdown:${filePath}`, 'markdown', { path: filePath }, basename)
    return
  }
  // ptn:doctrine/ — linkify-tagged absolute/file:// doctrine token (T-PATCH-106)
  if (href.startsWith('ptn:doctrine/')) {
    const raw = href.slice('ptn:doctrine/'.length)
    const abs = normalizeAbsPath(raw)
    if (abs) { routeAbsPath(abs); return }
  }
  if (/^https?:\/\//.test(href)) {
    let hostname: string
    try { hostname = new URL(href).hostname }
    catch { hostname = href.replace(/^https?:\/\//, '').split('/')[0] ?? href }
    const encodedUrl = encodeURIComponent(href)
    openTab(`browser:${encodedUrl}`, 'browser', { url: href }, hostname)
    return
  }
  // Bare absolute / file:// / ~ href (e.g. explicit `[habit.md](file:///…)` md
  // link that linkify preserved verbatim) — classify & route. (T-PATCH-106)
  const abs = normalizeAbsPath(href)
  if (abs) { routeAbsPath(abs); return }
}

/**
 * Map a link href to a per-type CSS class (T-PATCH-185).
 *
 * Replaces the former `getLinkColor` inline-hex helper. The type-selection
 * logic is preserved 1:1; only the emitted form changed (class vs inline color).
 * Base color for each class is defined in md-recipes.css so chat + dark-document
 * links stay BYTE-IDENTICAL to the previous inline hex (regression 0); the
 * `.md-doc.md-light` scope re-colors them for the light paper surface only.
 *
 *   md-link-internal  ← #38BDF8 (default / regular ptn:file / unknown)
 *   md-link-ticket    ← #8B5CF6 (ptn:ticket)
 *   md-link-env       ← #F59E0B (env-target ptn:file)
 *   md-link-persona   ← #A78BFA (ptn:doctrine)
 *   md-link-https     ← #C8C8CC (http/https)
 */
function getLinkClass(href?: string): string {
  if (!href) return 'md-link-internal'
  if (href.startsWith('ptn:ticket/')) return 'md-link-ticket'
  if (href.startsWith('ptn:file/')) {
    // env-target files get an amber tone to distinguish from regular file cyan.
    return isEnvTarget(href.slice('ptn:file/'.length)) ? 'md-link-env' : 'md-link-internal'
  }
  // doctrine links (T-PATCH-106) — violet-leaning to read as "persona doctrine".
  if (href.startsWith('ptn:doctrine/')) return 'md-link-persona'
  if (/^https?:\/\//.test(href))      return 'md-link-https'
  return 'md-link-internal'
}

function MdLink({ href, children }: { href?: string; children: ReactNode }) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (href) routeLink(href)
  }
  return (
    <a
      href={href}
      className={getLinkClass(href)}
      style={{ textDecoration: 'underline', cursor: 'pointer' }}
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
  h4: ({ children }) => <h4 className="md-h4">{children}</h4>,

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
