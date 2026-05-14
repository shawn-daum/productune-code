/**
 * linkifyText — T-P4-114 §C
 *
 * Converts bare references in markdown text to ptn: links for internal routing:
 *   T-P4-NNN           → [T-P4-NNN](ptn:ticket/T-P4-NNN)   (#A78BFA)
 *   docs/…/f.md        → [f.md](ptn:file/docs/…/f.md)       (#38BDF8)
 *   packages/…/f.ts    → [f.ts](ptn:file/packages/…/f.ts)   (#38BDF8)
 *   https://hostname   → [hostname](https://hostname)        (#C8C8CC)
 *
 * Skips:
 *   - Fenced code blocks  ``` … ```
 *   - Inline backtick code  `…`
 *   - Existing markdown links  [text](href)  — preserved as-is
 *
 * No npm dependencies — pure string preprocessor for react-markdown.
 */

// ── Code block splitter ───────────────────────────────────────────────────────

/** Matches fenced (```…```) and inline (`…`) code regions. */
const CODE_BLOCK_RE = /(```[\s\S]*?```|`[^`\n]+`)/g

// ── Combined linkification pattern (one-pass, priority by alternation order) ─

/**
 * Alternation order == priority:
 *   1. Existing markdown link  [text](href)  → preserve verbatim
 *   2. Ticket ID               T-P4-\d+      → ptn:ticket/
 *   3. Relative file path      (docs|packages)/…/.ext → ptn:file/
 *   4. Bare URL                https?://…    → [hostname](url)
 *
 * File paths starting with https:// are consumed by alt-4 at position 0,
 * so docs/ inside a URL is never matched by alt-3. ✓
 */
const LINK_RE =
  /(\[[^\]]*\]\([^)]*\))|(T-P4-\d+)|((docs|packages)\/[\w/.\-]+\.(md|tsx|ts|sh|json))|(https?:\/\/[^\s<>"]+)/g

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pre-process `text` before passing it to react-markdown.
 * Code regions are preserved unchanged; everything else is linkified.
 */
export function linkifyText(text: string): string {
  // Split by code blocks
  const segments: Array<{ t: string; code: boolean }> = []
  let lastIdx = 0
  CODE_BLOCK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CODE_BLOCK_RE.exec(text)) !== null) {
    if (m.index > lastIdx) segments.push({ t: text.slice(lastIdx, m.index), code: false })
    segments.push({ t: m[0], code: true })
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) segments.push({ t: text.slice(lastIdx), code: false })

  return segments.map((s) => (s.code ? s.t : _linkifySegment(s.t))).join('')
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _linkifySegment(text: string): string {
  LINK_RE.lastIndex = 0
  return text.replace(
    LINK_RE,
    (
      match,
      existingLink: string | undefined,
      ticketId: string | undefined,
      filePath: string | undefined,
      _pfx: string | undefined,
      _ext: string | undefined,
      bareUrl: string | undefined,
    ) => {
      // Priority 1 — existing link: keep verbatim
      if (existingLink !== undefined) return existingLink

      // Priority 2 — ticket ID
      if (ticketId !== undefined) {
        return `[${ticketId}](ptn:ticket/${ticketId})`
      }

      // Priority 3 — relative file path
      if (filePath !== undefined) {
        const basename = filePath.split('/').pop() ?? filePath
        return `[${basename}](ptn:file/${filePath})`
      }

      // Priority 4 — bare URL
      if (bareUrl !== undefined) {
        let hostname: string
        try {
          hostname = new URL(bareUrl).hostname
        } catch {
          hostname =
            bareUrl.replace(/^https?:\/\//, '').split('/')[0] ?? bareUrl
        }
        // Strip trailing punctuation that may have been captured
        const cleanUrl = bareUrl.replace(/[.,;!?)'"\]]+$/, '')
        const cleanHostname =
          cleanUrl !== bareUrl
            ? (() => { try { return new URL(cleanUrl).hostname } catch { return hostname } })()
            : hostname
        return `[${cleanHostname}](${cleanUrl})`
      }

      return match
    },
  )
}
