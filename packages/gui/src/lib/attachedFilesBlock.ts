/**
 * attachedFilesBlock.ts (T-350) — render-time parser for the `## Attached files`
 * block that useComposerAttachments.buildAttachedFilesBlock prepends to a sent
 * user message's `text`.
 *
 * Model-facing format is UNCHANGED (T-350 constraint: PO must keep receiving the
 * attachment paths as part of message content) — this module only *reads* that
 * format so the renderer can show chips instead of raw markdown. No data
 * migration: existing chat.json history already has this exact block shape,
 * so old messages parse identically to freshly-sent ones.
 *
 * Built format (useComposerAttachments.ts buildAttachedFilesBlock):
 *   ## Attached files
 *   - #1 -> /abs/path/to/pasted.png   (image line)
 *   - /abs/path/to/doc.pdf            (paperclip file line)
 *
 *   <body text — may be empty>
 */

export interface ParsedAttachedFiles {
  /** Body text with the `## Attached files` block stripped — may be ''. */
  body: string
  /** Pasted-image references, in original order. */
  images: Array<{ seq: number; path: string }>
  /** Paperclip (non-image) file paths, in original order. */
  files: string[]
}

const IMAGE_LINE_RE = /^- #(\d+) -> (.+)$/
const BLOCK_RE = /^## Attached files\n((?:-.+\n)*-.+)\n\n([\s\S]*)$/

/**
 * Parse a message `text` for a leading `## Attached files` block.
 * Returns `null` when the block isn't present (message unaffected — caller
 * should render `text` as-is).
 */
export function parseAttachedFilesBlock(text: string): ParsedAttachedFiles | null {
  const m = BLOCK_RE.exec(text)
  if (!m) return null

  const images: Array<{ seq: number; path: string }> = []
  const files: string[] = []

  for (const line of m[1].split('\n')) {
    const img = IMAGE_LINE_RE.exec(line)
    if (img) {
      images.push({ seq: Number(img[1]), path: img[2] })
    } else {
      // '- <path>' — strip the leading "- "
      files.push(line.replace(/^- /, ''))
    }
  }

  return { body: m[2], images, files }
}
