/**
 * frontmatter.ts — T-PATCH-179
 *
 * Lightweight, dependency-free YAML frontmatter splitter for the markdown
 * DOCUMENT layer (MarkdownViewer). Deliberately NOT gray-matter: that lib
 * assumes Node Buffer/fs and does not bundle cleanly into the renderer.
 *
 * Scope is intentionally dumb: split a top-of-file `---\n…\n---` block into a
 * flat `{ key: value }` map plus the remaining body. The parser does NOT split
 * inline arrays (`risk_flags: [auth, PII]` / `risk_flags: auth, PII`) or unwrap
 * nested maps — values are kept as raw trimmed strings. The display layer
 * (MetadataPanel) is the smart half that interprets them.
 *
 * Pure function, React-agnostic. Never throws: on any structural miss (no
 * opening fence, no closing fence) it returns `{ data: {}, body: raw }` so the
 * caller renders the original content verbatim with zero loss.
 */

export interface ParsedFrontmatter {
  /** Flat key → raw-string-value map. Empty when no valid block was found. */
  data: Record<string, string>
  /** Document body with the frontmatter block stripped (or raw on miss). */
  body: string
}

/**
 * Parse a top-of-file YAML frontmatter block.
 *
 * Rules:
 *  - Only engages when `raw` begins exactly with a `---` fence line.
 *  - The block runs until the next standalone `---` fence line; everything
 *    after that fence is the body.
 *  - Inside the block, only `key: value` single lines are captured (flat).
 *    Lines that are list-item continuations (`- foo`) or that have no colon
 *    are skipped — their content is preserved by being left out of `data`
 *    only, never re-emitted into the body.
 *  - Empty values (`started_at:`) are captured as empty strings.
 *  - No closing fence / no opening fence → `{ data: {}, body: raw }`.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  if (!raw) return { data: {}, body: raw }

  // Normalize only for fence detection; we slice from the ORIGINAL `raw` so the
  // body keeps its exact bytes (CRLF, trailing whitespace, etc.).
  // Opening fence must be the very first line.
  const firstNewline = raw.indexOf('\n')
  if (firstNewline === -1) return { data: {}, body: raw }
  const firstLine = raw.slice(0, firstNewline).replace(/\r$/, '')
  if (firstLine.trim() !== '---') return { data: {}, body: raw }

  // Find the closing fence: a line whose trimmed content is exactly '---',
  // scanning line-by-line after the opening fence.
  const lines = raw.split('\n')
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.replace(/\r$/, '').trim() === '---') {
      closeIdx = i
      break
    }
  }
  if (closeIdx === -1) return { data: {}, body: raw }

  // Block lines are (1 .. closeIdx-1); body is everything after the close fence.
  const blockLines = lines.slice(1, closeIdx)
  const bodyLines = lines.slice(closeIdx + 1)

  const data: Record<string, string> = {}
  for (const line of blockLines) {
    const l = line.replace(/\r$/, '')
    const trimmed = l.trim()
    // Skip blank lines, comments, and list-item continuations.
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('- ')) continue
    const colon = l.indexOf(':')
    if (colon === -1) continue
    const key = l.slice(0, colon).trim()
    if (!key) continue
    const value = l.slice(colon + 1).trim()
    data[key] = value
  }

  // Strip one leading blank line off the body so the panel isn't followed by an
  // awkward empty paragraph (frontmatter files conventionally have a blank line
  // before the first heading).
  let body = bodyLines.join('\n')
  body = body.replace(/^\s*\n/, '')

  return { data, body }
}
