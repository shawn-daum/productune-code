/**
 * TeamWikiTab — main pane for team-wiki tab type (T-P4-099).
 *
 * Replaces the inline WikiRow list that was in TeamPanel sidebar.
 * Shows 4 wiki/memory rows with click → markdown tab (or relevant tab).
 * Promotion pending badge on the candidates row.
 */

import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../../../store/workspace'

// ── Wiki backend helper ───────────────────────────────────────────────────────

type WikiBackend = 'fs' | 'graphiti' | 'keeper'

function wikiBackendFromState(poState: unknown): WikiBackend | null {
  const raw = (poState as any)?.wiki?.backend
  if (raw === 'fs' || raw === 'graphiti' || raw === 'keeper') return raw
  return null
}

// ── WikiRow sub-component ─────────────────────────────────────────────────────

interface WikiRowProps {
  icon: string
  label: string
  badge?: React.ReactNode
  onClick?: () => void
}

function WikiRow({ icon, label, badge, onClick }: WikiRowProps) {
  return (
    <button
      style={wikiRowStyle(!!onClick)}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A'
      }}
      onMouseLeave={(e) => {
        if (onClick) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
      }}
    >
      <span style={wikiIcon}>{icon}</span>
      <span style={wikiLabel}>{label}</span>
      {badge && <span style={wikiBadge}>{badge}</span>}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  props?: Record<string, unknown>
}

export default function TeamWikiTab(_: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const poState = useWorkspace((s) => s.poState)

  const wikiBackend = wikiBackendFromState(poState)
  const wikiBackendLabel = wikiBackend
    ? t(`workspace.team.wiki.backend.${wikiBackend}`)
    : t('workspace.team.wiki.backend.fs')

  const pendingPromos = poState?.pending_promotions?.filter((p) => p.status === 'pending') ?? []
  const promoCount = pendingPromos.length

  return (
    <div style={wrap}>
      <div style={listWrap}>

        {/* Row 1: Wiki backend (read-only label) */}
        <WikiRow
          icon={wikiBackend === 'graphiti' ? '\u{1F9E0}' : wikiBackend === 'keeper' ? '\u{1F4DA}' : '\u{1F5C4}'}
          label={`Wiki: ${wikiBackendLabel}`}
        />

        {/* Row 2: User memory */}
        <WikiRow
          icon="\u{1F9E0}"
          label={t('workspace.team.wiki.userMemory')}
          onClick={() =>
            openTab('user-memory', 'markdown', {
              path: '~/.productune/po-memory.md',
              title: 'User Memory',
            })
          }
        />

        {/* Row 3: Project state */}
        <WikiRow
          icon="⚙️"
          label={t('workspace.team.wiki.projectState')}
          onClick={() =>
            openTab('project-state', 'markdown', {
              path: '.productune/po-state.json',
              title: 'Project State',
            })
          }
        />

        {/* Row 4: Promotion candidates */}
        <WikiRow
          icon="\u{1F4CC}"
          label={t('workspace.team.wiki.promotionCandidates')}
          badge={
            promoCount > 0 ? (
              <span style={promoWarnBadge}>{promoCount}</span>
            ) : null
          }
          onClick={() =>
            openTab('project-state', 'markdown', {
              path: '.productune/po-state.json',
              title: 'Promotions',
            })
          }
        />

      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-base, #0F0F0F)',
  overflowY: 'auto',
}

const listWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '8px 0',
}

function wikiRowStyle(clickable: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: 36,
    padding: '0 16px',
    background: 'transparent',
    border: 'none',
    cursor: clickable ? 'pointer' : 'default',
    gap: 10,
    textAlign: 'left',
    transition: 'background 0.1s',
  }
}

const wikiIcon: React.CSSProperties = {
  fontSize: 14,
  flexShrink: 0,
}

const wikiLabel: React.CSSProperties = {
  fontSize: 13,
  color: '#C0C0C0',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const wikiBadge: React.CSSProperties = {
  flexShrink: 0,
}

const promoWarnBadge: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#E07B39',
  background: '#1A0E05',
  border: '1px solid #E07B3950',
  borderRadius: 3,
  padding: '0 4px',
}
