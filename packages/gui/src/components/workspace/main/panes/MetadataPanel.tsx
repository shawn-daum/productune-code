/**
 * MetadataPanel — T-PATCH-179
 *
 * Renders the parsed YAML frontmatter of a markdown DOCUMENT as a styled card
 * above the body. Lives at the document layer (used only by MarkdownViewer);
 * MdRenderer (shared by chat bubbles) is deliberately untouched.
 *
 * Layout (per Designer spec):
 *   1. optional title header (the `title` field, emphasized)
 *   2. badge row — status / state / qa_status as health-colored pills,
 *      each risk_flags entry as a warn pill
 *   3. 2-col key→value grid for the remaining priority scalars
 *   4. a "show more" toggle revealing all non-priority keys (collapsed default)
 *
 * Tokens only — every hex below comes from md-recipes.css :root (mirrored as px
 * literals to match this file's inline-style convention, same as MarkdownViewer
 * already does for roBadge/lineCapBadge).
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'

// Priority fields, in fixed display order. Only those actually present render.
const SHOWN_FIELDS = [
  'title',
  'status',
  'state',
  'version',
  'phase',
  'type',
  'assignee',
  'slug',
  'round',
  'risk_flags',
  'ambiguity_score',
  'confidence',
  'estimated_complexity',
  'qa_status',
] as const

// Fields surfaced as badges (not grid rows). title is the header; risk_flags
// fan out into one warn pill each.
const BADGE_FIELDS = new Set(['status', 'state', 'qa_status'])

// Health-tone classification for status-like badges.
type Tone = 'success' | 'error' | 'neutral'
function toneFor(value: string): Tone {
  const v = value.trim().toLowerCase()
  if (v === 'done' || v === 'pass') return 'success'
  if (v === 'blocked' || v === 'fail' || v === 'error') return 'error'
  return 'neutral'
}

// Split an inline list value ("[auth, PII]" / "auth, PII") into flags. The
// parser keeps risk_flags raw; the smart split happens here.
function splitFlags(raw: string): string[] {
  if (!raw) return []
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '')
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

interface MetadataPanelProps {
  data: Record<string, string>
}

export default function MetadataPanel({ data }: MetadataPanelProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const { gridFields, collapsedFields, flags, title } = useMemo(() => {
    const shownSet = new Set<string>(SHOWN_FIELDS)
    // Priority scalars destined for the grid (present, not badge/title/flags).
    const grid = SHOWN_FIELDS.filter(
      (k) =>
        k !== 'title' &&
        k !== 'risk_flags' &&
        !BADGE_FIELDS.has(k) &&
        k in data &&
        data[k]!.trim() !== '',
    )
    // Everything not in the priority whitelist → collapsed group (future-proof).
    const collapsed = Object.keys(data).filter(
      (k) => !shownSet.has(k) && data[k]!.trim() !== '',
    )
    return {
      gridFields: grid,
      collapsedFields: collapsed,
      flags: splitFlags(data['risk_flags'] ?? ''),
      title: (data['title'] ?? '').trim(),
    }
  }, [data])

  // Present, non-empty status-like badges in fixed order.
  const statusBadges = (['status', 'state', 'qa_status'] as const).filter(
    (k) => k in data && data[k]!.trim() !== '',
  )

  const hasBadgeRow = statusBadges.length > 0 || flags.length > 0
  const hasGrid = gridFields.length > 0
  const hasCollapsed = collapsedFields.length > 0

  // Defensive: if nothing renders, render nothing (no empty box).
  if (!title && !hasBadgeRow && !hasGrid && !hasCollapsed) return null

  return (
    <div style={panel}>
      {title && <div style={titleText}>{title}</div>}

      {hasBadgeRow && (
        <div style={badgeRow}>
          {statusBadges.map((k) => {
            const tone = toneFor(data[k]!)
            return (
              <span key={k} style={badgeForTone(tone)}>
                {data[k]!.trim()}
              </span>
            )
          })}
          {flags.map((flag, i) => (
            <span key={`flag-${i}`} style={warnBadge}>
              {flag}
            </span>
          ))}
        </div>
      )}

      {hasGrid && (
        <div style={grid}>
          {gridFields.map((k) => (
            <Row key={k} k={k} v={data[k]!.trim()} />
          ))}
        </div>
      )}

      {hasCollapsed && (
        <>
          {expanded && (
            <div style={{ ...grid, marginTop: 8 }}>
              {collapsedFields.map((k) => (
                <Row key={k} k={k} v={data[k]!.trim()} />
              ))}
            </div>
          )}
          <button style={toggleBtn} onClick={() => setExpanded((e) => !e)}>
            <ChevronRight
              size={10}
              style={{
                color: '#707070',
                flexShrink: 0,
                transform: expanded ? 'rotate(90deg)' : 'none',
                transition: 'transform 120ms ease',
              }}
            />
            <span>
              {expanded
                ? t('workspace.mdViewer.collapse')
                : t('workspace.mdViewer.showMore', { count: collapsedFields.length })}
            </span>
          </button>
        </>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span style={keyCell}>{k}</span>
      <span style={valCell}>{v}</span>
    </>
  )
}

// ── Styles (tokens mirrored as px literals — md-recipes.css :root) ──────────────

const panel: React.CSSProperties = {
  background: '#141414', // --surface-panel
  border: '1px solid #1F1F1F', // --border-default
  borderRadius: 6, // --radius-lg
  padding: '12px 16px', // --space-3 / --space-4
  marginBottom: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const titleText: React.CSSProperties = {
  fontSize: 15, // --text-md-plus
  fontWeight: 600, // --weight-semibold
  color: '#F0F0F0', // --text-emphasis
  lineHeight: 1.35,
}

const badgeRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
}

// Base pill — mirrors MarkdownViewer's roBadge convention.
const badgeBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 10, // --text-xs
  padding: '1px 6px',
  border: '1px solid #1F1F1F', // --border-default
  borderRadius: 20, // --radius-pill
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

function badgeForTone(tone: Tone): React.CSSProperties {
  if (tone === 'success') {
    return { ...badgeBase, color: '#34D399', borderColor: '#1C3A30' } // --health-success
  }
  if (tone === 'error') {
    return { ...badgeBase, color: '#EF4444', borderColor: '#3A1C1C' } // --health-error
  }
  return { ...badgeBase, color: '#A0A0A0' } // --text-muted, neutral border
}

// Warn pill — same tone as MarkdownViewer's lineCapBadgeOver.
const warnBadge: React.CSSProperties = {
  ...badgeBase,
  color: '#E0A030',
  borderColor: '#3A2E12',
}

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  rowGap: 4, // --space-1
  columnGap: 12, // --space-3
  alignItems: 'baseline',
}

const keyCell: React.CSSProperties = {
  color: '#707070', // --text-faint
  fontFamily: 'ui-monospace, "SF Mono", "Menlo", "Consolas", monospace', // --font-mono
  fontSize: 10, // --text-xs
}

const valCell: React.CSSProperties = {
  color: '#C8C8CC', // --text-secondary
  fontSize: 12, // --text-sm
  wordBreak: 'break-word',
}

const toggleBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  alignSelf: 'flex-start',
  background: 'transparent',
  border: 'none',
  padding: 0,
  marginTop: 2,
  cursor: 'pointer',
  color: '#707070', // --text-faint
  fontFamily: 'inherit',
  fontSize: 10, // --text-xs
}
