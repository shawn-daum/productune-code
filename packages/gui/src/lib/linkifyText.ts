/**
 * linkifyText — T-P4-114 §C / widened by T-PATCH-093
 *
 * Converts bare references in markdown text to ptn: links for internal routing:
 *   T-P4-NNN              → [T-P4-NNN](ptn:ticket/T-P4-NNN)        (#A78BFA)
 *   docs/…/f.md           → [f.md](ptn:file/docs/…/f.md)           (#38BDF8)
 *   packages/…/f.ts       → [f.ts](ptn:file/packages/…/f.ts)        (#38BDF8)
 *   src/…/f.ts            → [f.ts](ptn:file/src/…/f.ts)             (#38BDF8)
 *   .productune/…/f.json  → [f.json](ptn:file/.productune/…/f.json) (#38BDF8)
 *   ./docs/…/f.md         → leading ./ normalized away in href
 *   config.json (root)    → whitelisted root-level manifests only
 *   ~/.productune/…/f.md  → [f.md](ptn:doctrine/~/.productune/…/f.md) (T-PATCH-106)
 *   /…/.productune/…/f.md → [f.md](ptn:doctrine//…/.productune/…)     (T-PATCH-106)
 *   file:///…/f.md        → [f.md](ptn:doctrine/file:///…/f.md)       (T-PATCH-106)
 *   https://hostname      → [hostname](https://hostname)            (#C8C8CC)
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
 *   1. Bare URL                https?://…           → [hostname](url)
 *   2. Existing markdown link  [text](href)         → preserve verbatim
 *   3. Ticket ID               T-P4-\d+             → ptn:ticket/
 *   4. Relative file path                            → ptn:file/
 *        a. rooted:  ./?  (docs|packages|src|.productune)/…/.ext
 *        b. root-level whitelist: config.json | package.json | tsconfig.json
 *        c. env file: ./?  .env[*]  (optionally under .productune/)
 *
 * URL precedence (alt-1) is FIRST so any URL is consumed whole at its start
 * offset before the file branch can see path tokens (e.g. `src/`) inside it.
 * `[^\s<>"]+` greedily eats the entire URL path, so a `src/x.ts` substring of
 * an https URL is never re-matched as a standalone file link. ✓
 *
 *   5. Absolute doctrine path                         → ptn:doctrine/   (T-PATCH-106)
 *        file://…/.productune/…  |  ~/.productune/…  |  /…/.productune/…
 *
 * Capture groups (positional — consumed by _linkifySegment):
 *   1 bareUrl  2 existingLink  3 ticketId  4 filePath  5 absDoctrine
 * Root tokens / extensions inside group 4/5 are NON-capturing to keep indices
 * stable.
 *
 * Alt-5 (absolute doctrine) intentionally trails the URL (alt-1) and existing
 * markdown-link (alt-2) branches so a `~/.productune/...`/`file://...` token
 * embedded inside an http(s) URL or an existing `[text](href)` is consumed by
 * those first — no false re-match. The leading-`/` absolute form is NOT caught
 * by the bare URL branch (no scheme), so it is matched here only when it carries
 * a `.productune/` doctrine signal. `file://` is anchored at token start; the
 * default `(?<![\w/.\-])` guard does not apply to alt-5 (absolute prefixes are
 * explicit), so a `/Users/.../.productune/...` absolute path is recognized.
 */
const LINK_RE =
  /(https?:\/\/[^\s<>"]+)|(\[[^\]]*\]\([^)]*\))|(T-P4-\d+)|((?<![\w/.\-])\.?\/?(?:(?:docs|packages|src|\.productune)\/[\w/.\-]+\.(?:md|tsx|ts|sh|json)|\.productune\/\.env[a-zA-Z0-9._-]*|\.env[a-zA-Z0-9._-]*|(?:config|package|tsconfig)\.json))|((?:file:\/\/)?(?:~|\/[\w.\-]+)(?:\/[\w.\-]+)*\/\.productune\/(?:po|designer|developer|qa)\/[\w/.\-]+\.md)/g

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
      bareUrl: string | undefined,
      existingLink: string | undefined,
      ticketId: string | undefined,
      filePath: string | undefined,
      absDoctrine: string | undefined,
    ) => {
      // Priority 2 — existing link: keep verbatim
      if (existingLink !== undefined) return existingLink

      // Priority 3 — ticket ID
      if (ticketId !== undefined) {
        return `[${ticketId}](ptn:ticket/${ticketId})`
      }

      // Priority 4 — relative file path
      if (filePath !== undefined) {
        // Normalize leading "./" away so the ptn:file/ href is canonical.
        const normalized = filePath.replace(/^\.\//, '')
        const basename = normalized.split('/').pop() ?? normalized
        return `[${basename}](ptn:file/${normalized})`
      }

      // Priority 5 — absolute / file:// doctrine path (T-PATCH-106)
      // The raw absolute token is carried verbatim after the ptn:doctrine/ tag;
      // routeLink (MdRenderer) decodes/normalizes & classifies tier/persona.
      // basename = last path segment, with any file:// prefix decoded first.
      if (absDoctrine !== undefined) {
        const decoded = absDoctrine.startsWith('file://')
          ? (() => { try { return decodeURIComponent(new URL(absDoctrine).pathname) } catch { return absDoctrine } })()
          : absDoctrine
        const basename = decoded.split('/').pop() ?? decoded
        return `[${basename}](ptn:doctrine/${absDoctrine})`
      }

      // Priority 1 — bare URL
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
