/**
 * ImageChip (T-PATCH-133) — attachment pill for inline-referenced pasted images.
 *
 * Originally inlined in ChatPanel (T-PATCH-098). Extracted here so FreshComposer
 * can reuse the same presentation without duplicating code (A-plan extraction).
 *
 * Exports:
 *   ImageChip    — the pill component (default-named export)
 *   ImageGlyph   — standalone Lucide Image SVG glyph (14 px)
 *   chipRow      — CSSProperties for the flex-wrap chip row above the textarea
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

// ── ImageGlyph ────────────────────────────────────────────────────────────────

/**
 * Lucide `Image` glyph as inline SVG — 14 px tile icon, soft stroke,
 * --text-secondary colour. No import side-effects; no broken-glyph risk.
 */
export function ImageGlyph(): JSX.Element {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}

// ── ImageChip ─────────────────────────────────────────────────────────────────

/**
 * Single attachment pill. Hover affordances per §4.b / §3:
 * chip border → strong, X bg / colour → one step brighter.
 * Raw filename only in the title tooltip; visible label = localised "image" token.
 * Reuses existing `workspace.chat.*` i18n keys (T-PATCH-133 RESOLUTION-2 — no new keys).
 */
export function ImageChip({
  seq,
  path,
  previewUrl,
  onRemove,
}: {
  seq: number
  path: string
  previewUrl?: string
  onRemove: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [hover,  setHover]  = useState(false)
  const [xHover, setXHover] = useState(false)

  return (
    <div
      style={{
        ...chip,
        borderColor: hover ? 'var(--border-strong)' : 'var(--border-default)',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={path}
    >
      <span style={chipTile}>
        {/* §4.c.1.b: real thumbnail from the pasted bytes (object URL) when available;
            Lucide Image glyph fallback when path-only. No file:// anywhere. */}
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={chipThumb}
          />
        ) : (
          <ImageGlyph />
        )}
      </span>
      {/* §4.d §7: `#N` prefix (muted) matches the inline [Image #N] token. */}
      <span style={chipLabel}>
        <span style={chipSeq}>#{seq}</span>{' '}
        {t('workspace.chat.imageLabel')}
      </span>
      <button
        style={{
          ...chipRemove,
          background: xHover ? 'var(--surface-base)' : 'transparent',
          color:      xHover ? 'var(--text-secondary)' : 'var(--text-muted)',
        }}
        onMouseEnter={() => setXHover(true)}
        onMouseLeave={() => setXHover(false)}
        onClick={onRemove}
        aria-label={t('workspace.chat.removeImage')}
        title={t('workspace.chat.removeImage')}
      >
        <X size={12} strokeWidth={3} />
      </button>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

/** flex-wrap row of attachment chips between textarea and inputRow / composerFooter. */
export const chipRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1-5)',
  height: 28,
  maxWidth: 180,
  paddingLeft: 'var(--space-1)',
  paddingRight: 'var(--space-2)',
  background: 'var(--surface-subpanel)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg)',
  transition: 'border-color var(--motion-fast) ease',
  flexShrink: 0,
}

const chipTile: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  flexShrink: 0,
  background: 'var(--surface-base)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-secondary)',
  // §4.c.1.b: clip the object-URL <img> to the tile's rounded box.
  overflow: 'hidden',
}

const chipThumb: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: 'var(--radius-md)',
  display: 'block',
}

const chipLabel: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 'var(--text-sm)',
  fontWeight: 400,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const chipSeq: React.CSSProperties = {
  color: 'var(--text-muted)',
}

const chipRemove: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  flexShrink: 0,
  padding: 0,
  border: 'none',
  borderRadius: '9999px',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  transition: 'background var(--motion-fast) ease, color var(--motion-fast) ease',
}
