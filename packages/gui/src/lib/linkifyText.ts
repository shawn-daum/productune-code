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
 *   file:///…/docs/artifacts/f.html → [f.html](ptn:doctrine/file:///…/f.html) (T-345, any ext, not just doctrine .md)
 *   docs/artifacts/f.html  → [f.html](ptn:file/docs/artifacts/f.html)  (T-345, bare relative mention)
 *   https://hostname      → [hostname](https://hostname)            (#C8C8CC)
 *
 * Skips (this preprocessor, `linkifyText`, never rewrites these):
 *   - Fenced code blocks  ``` … ```
 *   - Inline backtick code  `…`
 *   - Existing markdown links  [text](href)  — preserved as-is
 *
 * T-346: a code span being skipped here is correct for markdown semantics,
 * but real PO/worker messages routinely wrap a path in backticks, so
 * MdRenderer's inline `code` component separately calls the exported
 * `matchSingleLinkTarget(content)` below to render THAT span clickable
 * (same alternation/scope, whole-span match only — see its doc comment).
 * That is render-time, not a preprocessing step, so it's kept out of the
 * skip list above.
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
 *        d. docs/artifacts/*.html design mockup (T-345, any root-level ext
 *           whitelist member EXCEPT html would already be caught by (a); html
 *           is scoped narrowly to docs/artifacts/ only — NOT packages/src/
 *           .productune — since that's the one convention the rest of the
 *           app (helpers.ts artifactOpenType, electron/ipc/artifacts.ts
 *           ALLOWED_EXTS) already uses for "this .html is a viewable design
 *           artifact")
 *
 * URL precedence (alt-1) is FIRST so any URL is consumed whole at its start
 * offset before the file branch can see path tokens (e.g. `src/`) inside it.
 * `[^\s<>"]+` greedily eats the entire URL path, so a `src/x.ts` substring of
 * an https URL is never re-matched as a standalone file link. ✓
 *
 *   5. Absolute file:// / doctrine path               → ptn:doctrine/   (T-PATCH-106, widened T-345)
 *        file://<any path>                    (T-345 — any file:// URI, any ext, not just doctrine .md;
 *                                               covers docs/artifacts/*.html design mockups written by a
 *                                               delegated worker and merely narrated by the PO in prose)
 *        ~/.productune/…  |  /…/.productune/…  (bare, non-scheme absolute paths stay doctrine-scoped only —
 *                                               widening THIS branch to arbitrary bare absolute paths would
 *                                               false-positive on any unrelated /usr/... mention in prose)
 *
 * Capture groups (positional — consumed by _linkifySegment):
 *   1 bareUrl  2 existingLink  3 ticketId  4 filePath  5 absDoctrine
 * Root tokens / extensions inside group 4/5 are NON-capturing to keep indices
 * stable.
 *
 * Alt-5 (absolute doctrine / file://) intentionally trails the URL (alt-1) and
 * existing markdown-link (alt-2) branches so a `~/.productune/...`/`file://...`
 * token embedded inside an http(s) URL or an existing `[text](href)` is
 * consumed by those first — no false re-match. The leading-`/` absolute form
 * (no scheme) is NOT caught by the bare URL branch, so it is matched here only
 * when it carries a `.productune/` doctrine signal — same reasoning as above.
 * `file://` itself is anchored at token start and, being an explicit scheme,
 * is trusted broadly (no doctrine-signal requirement).
 */
const LINK_RE =
  /(https?:\/\/[^\s<>"]+)|(\[[^\]]*\]\([^)]*\))|(T-P4-\d+)|((?<![\w/.\-])\.?\/?(?:(?:docs|packages|src|\.productune)\/[\w/.\-]+\.(?:md|tsx|ts|sh|json)|docs\/artifacts\/[\w/.\-]+\.html|\.productune\/\.env[a-zA-Z0-9._-]*|\.env[a-zA-Z0-9._-]*|(?:config|package|tsconfig)\.json))|(file:\/\/[^\s<>")\]]+|(?:~|\/[\w.\-]+)(?:\/[\w.\-]+)*\/\.productune\/(?:po|designer|developer|qa)\/[\w/.\-]+\.md)/g

/**
 * Anchored (`^…$`) variant of LINK_RE for whole-string matching (T-346).
 * Reused by `matchSingleLinkTarget` to test whether an inline code-span's
 * ENTIRE trimmed content is one linkify-eligible token, as opposed to
 * `_linkifySegment`'s free-floating-substring scan over prose. Same
 * alternation ⇒ same scope/priority as prose linkify, so a backtick-wrapped
 * path routes identically to its plain-prose equivalent — no separate
 * false-positive surface to maintain.
 */
const LINK_RE_ANCHORED = new RegExp(`^(?:${LINK_RE.source})$`)

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

interface ResolvedLink {
  /** Display label — basename / hostname / ticket id (no brackets). */
  label: string
  href: string
}

/**
 * Resolve one already-captured LINK_RE alternation to a `{ label, href }`
 * pair. Shared by `_linkifySegment` (prose, builds `[label](href)` markdown)
 * and `matchSingleLinkTarget` (T-346, whole-string code-span test) so the
 * two call sites can never drift on what counts as a link or what href it
 * produces — priority/precedence logic lives here exactly once.
 *
 * `existingLink` (alt-2, an already-formed `[text](href)` markdown link) has
 * no href/label to resolve — callers handle it themselves before reaching
 * here (prose: pass through verbatim; code-span: alt-2 can't occur since
 * `[...]()`  syntax inside a backtick span is inert markdown, so
 * `matchSingleLinkTarget` never expects it either).
 */
function _resolveMatch(groups: {
  bareUrl: string | undefined
  ticketId: string | undefined
  filePath: string | undefined
  absDoctrine: string | undefined
}): ResolvedLink | null {
  const { bareUrl, ticketId, filePath, absDoctrine } = groups

  // Priority 3 — ticket ID
  if (ticketId !== undefined) {
    return { label: ticketId, href: `ptn:ticket/${ticketId}` }
  }

  // Priority 4 — relative file path
  if (filePath !== undefined) {
    // Normalize leading "./" away so the ptn:file/ href is canonical.
    const normalized = filePath.replace(/^\.\//, '')
    const basename = normalized.split('/').pop() ?? normalized
    return { label: basename, href: `ptn:file/${normalized}` }
  }

  // Priority 5 — absolute / file:// doctrine path (T-PATCH-106, widened T-345)
  // The raw absolute token is carried verbatim after the ptn:doctrine/ tag;
  // routeLink (MdRenderer) decodes/normalizes & classifies tier/persona.
  // basename = last path segment, with any file:// prefix decoded first.
  // T-345: the widened `file://…` alt-5 branch has no extension/dir anchor
  // at its END (unlike the old .productune/…md-anchored form), so a
  // trailing sentence-punctuation or list-separator char (`.`, `,` when
  // several paths are narrated in one line) can get swept into the match —
  // strip it, mirroring the bareUrl branch below.
  if (absDoctrine !== undefined) {
    const cleaned = absDoctrine.replace(/[.,;!?)'"\]]+$/, '')
    const decoded = cleaned.startsWith('file://')
      ? (() => { try { return decodeURIComponent(new URL(cleaned).pathname) } catch { return cleaned } })()
      : cleaned
    const basename = decoded.split('/').pop() ?? decoded
    return { label: basename, href: `ptn:doctrine/${cleaned}` }
  }

  // Priority 1 — bare URL
  if (bareUrl !== undefined) {
    let hostname: string
    try {
      hostname = new URL(bareUrl).hostname
    } catch {
      hostname = bareUrl.replace(/^https?:\/\//, '').split('/')[0] ?? bareUrl
    }
    // Strip trailing punctuation that may have been captured
    const cleanUrl = bareUrl.replace(/[.,;!?)'"\]]+$/, '')
    const cleanHostname =
      cleanUrl !== bareUrl
        ? (() => { try { return new URL(cleanUrl).hostname } catch { return hostname } })()
        : hostname
    return { label: cleanHostname, href: cleanUrl }
  }

  return null
}

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

      const resolved = _resolveMatch({ bareUrl, ticketId, filePath, absDoctrine })
      return resolved ? `[${resolved.label}](${resolved.href})` : match
    },
  )
}

/**
 * T-346 — test whether `raw` (an inline code-span's text content, backticks
 * already stripped by the markdown parser) is, in its entirety once trimmed,
 * ONE linkify-eligible token (file:// URI, docs/artifacts/*.html path, ticket
 * ID, doctrine path, or bare URL — same alternation/scope as prose linkify).
 *
 * Deliberately whole-string only (anchored `^…$`), not a substring scan: a
 * code span like `` `const url = "https://x"` `` must stay inert — only a
 * span whose ENTIRE content is the path/URI (the real-world shape from the
 * T-346 bug report: a bullet list of bare backtick-wrapped `file:///…`
 * mentions) becomes clickable. This is what keeps ordinary code snippets
 * (acceptance criterion 4) from false-positiving.
 *
 * Returns null for anything else, including an inert `[text](href)` markdown
 * sequence typed literally inside a code span (alt-2 has no href/label of
 * its own to resolve — see `_resolveMatch` doc).
 */
export function matchSingleLinkTarget(raw: string): ResolvedLink | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const m = LINK_RE_ANCHORED.exec(trimmed)
  if (!m) return null
  const [, bareUrl, existingLink, ticketId, filePath, absDoctrine] = m
  if (existingLink !== undefined) return null
  return _resolveMatch({ bareUrl, ticketId, filePath, absDoctrine })
}
