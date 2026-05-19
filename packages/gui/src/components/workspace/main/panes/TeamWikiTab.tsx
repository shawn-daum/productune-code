/**
 * TeamWikiTab — main pane for team-wiki tab type (T-P4-099).
 *
 * Replaces the inline WikiRow list that was in TeamPanel sidebar.
 * Shows wiki/memory rows with click → markdown tab (or relevant tab).
 * Promotion pending badge on the candidates row.
 *
 * personaKey (T-P4-140): when provided via paneProps, shows a persona-scoped
 * header + filtered rows relevant to that persona. No personaKey → aggregated view.
 */

import { useTranslation } from 'react-i18next'
import { FileText, BrainCircuit, BookOpen, Brain, Settings2, Pin } from 'lucide-react'
import { useWorkspace } from '../../../../store/workspace'
import type { TabType } from '../../../../store/workspace'

// ── Wiki backend types ────────────────────────────────────────────────────────

// Backend as stored in poState (wiki config)
type WikiBackend = 'fs' | 'graphiti' | 'keeper'

// Backend scope key from sidebar sub-row (T-P4-140 amend)
type SidebarBackend = 'fs' | 'userMemory' | 'projectState' | 'promo'

function wikiBackendFromState(poState: unknown): WikiBackend | null {
  const raw = (poState as any)?.wiki?.backend
  if (raw === 'fs' || raw === 'graphiti' || raw === 'keeper') return raw
  return null
}

// ── WikiRow sub-component ─────────────────────────────────────────────────────

interface WikiRowProps {
  icon: React.ReactElement
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
      <span style={wikiIconWrap}>{icon}</span>
      <span style={wikiLabel}>{label}</span>
      {badge && <span style={wikiBadge}>{badge}</span>}
    </button>
  )
}

type PersonaKey = 'po' | 'designer' | 'dev' | 'qa'

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  props?: Record<string, unknown>
}

export default function TeamWikiTab({ props: paneProps }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const poState = useWorkspace((s) => s.poState)

  const personaKey = paneProps?.personaKey as PersonaKey | undefined
  const backend = paneProps?.backend as SidebarBackend | undefined

  const wikiBackend = wikiBackendFromState(poState)
  const wikiBackendLabel = wikiBackend
    ? t(`workspace.team.wiki.backend.${wikiBackend}`)
    : t('workspace.team.wiki.backend.fs')

  const pendingPromos = poState?.pending_promotions?.filter((p) => p.status === 'pending') ?? []
  const promoCount = pendingPromos.length

  // ── Shared rows (reused in both views) ──
  const rowUserMemory = (
    <WikiRow
      key="user-memory"
      icon={<Brain size={14} color="#808080" />}
      label={t('workspace.team.wiki.userMemory')}
      onClick={() =>
        openTab('user-memory', 'markdown', {
          path: '~/.productune/po-memory.md',
          title: 'User Memory',
        })
      }
    />
  )
  const rowProjectState = (
    <WikiRow
      key="project-state"
      icon={<Settings2 size={14} color="#808080" />}
      label={t('workspace.team.wiki.projectState')}
      onClick={() =>
        openTab('project-state', 'markdown', {
          path: '.productune/po-state.json',
          title: 'Project State',
        })
      }
    />
  )
  const rowPromo = (
    <WikiRow
      key="promo"
      icon={<Pin size={14} color="#808080" />}
      label={t('workspace.team.wiki.promotionCandidates')}
      badge={promoCount > 0 ? <span style={promoWarnBadge}>{promoCount}</span> : null}
      onClick={() =>
        openTab('project-state', 'markdown', {
          path: '.productune/po-state.json',
          title: 'Promotions',
        })
      }
    />
  )

  // ── Backend-scoped view (sidebar sub-row click, T-P4-140 amend) ──
  if (backend) {
    const scopedRow: React.ReactNode = (() => {
      switch (backend) {
        case 'fs':
          return (
            <WikiRow
              key="wiki-fs"
              icon={
                wikiBackend === 'graphiti' ? <BrainCircuit size={14} color="#808080" /> :
                wikiBackend === 'keeper'   ? <BookOpen size={14} color="#808080" /> :
                                             <FileText size={14} color="#808080" />
              }
              label={`Wiki: ${wikiBackendLabel}`}
            />
          )
        case 'userMemory':  return rowUserMemory
        case 'projectState': return rowProjectState
        case 'promo':       return rowPromo
      }
    })()
    return (
      <div style={wrap}>
        <div style={listWrap}>{scopedRow}</div>
      </div>
    )
  }

  // ── Persona-scoped view (간단 filter) ──
  if (personaKey) {
    const scopedRows: React.ReactNode[] = (() => {
      switch (personaKey) {
        case 'po':       return [rowUserMemory, rowProjectState, rowPromo]
        case 'designer': return [rowProjectState, rowPromo]
        case 'dev':      return [rowProjectState, rowPromo]
        case 'qa':       return [rowProjectState]
      }
    })()
    return (
      <div style={wrap}>
        <div style={personaHeader}>
          <span style={personaHeaderText}>{t(`workspace.team.wiki.role.${personaKey}`)}</span>
        </div>
        <div style={listWrap}>{scopedRows}</div>
      </div>
    )
  }

  // ── Aggregated view (no personaKey) ──
  return (
    <div style={wrap}>
      <div style={listWrap}>

        {/* Row 1: Wiki backend (read-only label) */}
        <WikiRow
          icon={
            wikiBackend === 'graphiti' ? <BrainCircuit size={14} color="#808080" /> :
            wikiBackend === 'keeper'   ? <BookOpen size={14} color="#808080" /> :
                                         <FileText size={14} color="#808080" />
          }
          label={`Wiki: ${wikiBackendLabel}`}
        />

        {rowUserMemory}
        {rowProjectState}
        {rowPromo}

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

const wikiIconWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
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

const personaHeader: React.CSSProperties = {
  padding: '10px 16px 6px',
  borderBottom: '1px solid #1E1E1E',
}

const personaHeaderText: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#4a4a4a',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  userSelect: 'none',
}
