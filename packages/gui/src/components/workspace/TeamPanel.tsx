import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { PoState } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'
import { PERSONA_COLORS } from '../../store/personaPresence'

// ── Static persona definitions ───────────────────────────────────────────────

type PersonaKey = 'po' | 'designer' | 'dev' | 'qa'

interface PersonaDef {
  key: PersonaKey
  id: 'pdt-po' | 'pdt-designer' | 'pdt-developer' | 'pdt-qa'
  initial: string
  nameKey: string
  roleKey: string
  modelSummary: string
}

const PERSONAS: PersonaDef[] = [
  { key: 'po',       id: 'pdt-po',        initial: 'P', nameKey: 'workspace.team.persona.po.name',       roleKey: 'workspace.team.persona.po.role',       modelSummary: 'sonnet / medium' },
  { key: 'designer', id: 'pdt-designer',   initial: 'D', nameKey: 'workspace.team.persona.designer.name',  roleKey: 'workspace.team.persona.designer.role',  modelSummary: 'opus / xhigh'   },
  { key: 'dev',      id: 'pdt-developer',  initial: 'D', nameKey: 'workspace.team.persona.developer.name', roleKey: 'workspace.team.persona.developer.role', modelSummary: 'sonnet / high'  },
  { key: 'qa',       id: 'pdt-qa',         initial: 'Q', nameKey: 'workspace.team.persona.qa.name',        roleKey: 'workspace.team.persona.qa.role',        modelSummary: 'haiku / low'    },
]

// ── Skills total (static — SkillMatrixTab owns the SoT data) ─────────────────

const SKILLS_TOTAL = 11

// ── Wiki backend ─────────────────────────────────────────────────────────────

type WikiBackend = 'fs' | 'graphiti' | 'keeper'

function wikiBackendFromState(poState: PoState | null): WikiBackend | null {
  const raw = (poState as any)?.wiki?.backend
  if (raw === 'fs' || raw === 'graphiti' || raw === 'keeper') return raw
  return null
}

// ── Collapsible section ───────────────────────────────────────────────────────

interface SectionProps {
  title: string
  storageKey: string
  children: React.ReactNode
  right?: React.ReactNode
}

function Section({ title, storageKey, children, right }: SectionProps) {
  const lsKey = `workspace.team.collapsed.${storageKey}`
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(lsKey) === 'true' } catch { return false }
  })

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem(lsKey, String(next)) } catch {}
      return next
    })
  }

  return (
    <div style={sectionWrap}>
      <button style={secHdrBtn} onClick={toggle} aria-expanded={!collapsed}>
        <span style={secChevron}>{collapsed ? '▶' : '▼'}</span>
        <span style={secHdrText}>{title}</span>
        {right && <span style={secHdrRight}>{right}</span>}
      </button>
      {!collapsed && <div>{children}</div>}
    </div>
  )
}

// ── Persona row ───────────────────────────────────────────────────────────────

interface PersonaRowProps {
  def: PersonaDef
  isActive: boolean
  onClick: () => void
}

function PersonaRow({ def, isActive, onClick }: PersonaRowProps) {
  const { t } = useTranslation()
  const color = PERSONA_COLORS[def.key]

  return (
    <button
      style={personaRowStyle}
      onClick={onClick}
      title={`${def.id} — click to open definition`}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      {/* Avatar */}
      <span style={{ ...avatarStyle, background: color }}>
        {def.initial}
        {isActive && <span style={activeDot} title={t('workspace.team.activeDot.tooltip', { seconds: '<60' })} />}
      </span>

      {/* Name + role */}
      <span style={personaInfo}>
        <span style={personaName}>{t(def.nameKey)}</span>
        <span style={personaRole}>{t(def.roleKey)}</span>
      </span>

      {/* Model/effort */}
      <span style={personaModel}>{def.modelSummary}</span>
    </button>
  )
}

// ── Wiki / Memory section rows ────────────────────────────────────────────────

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
      onMouseEnter={(e) => { if (onClick) (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A' }}
      onMouseLeave={(e) => { if (onClick) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      <span style={wikiIcon}>{icon}</span>
      <span style={wikiLabel}>{label}</span>
      {badge && <span style={wikiBadge}>{badge}</span>}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  poState: PoState | null
}

export default function TeamPanel({ poState }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const [now, setNow] = useState(Date.now())

  // Refresh active dot every 15s
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [])

  // Persona active: last_seen in persona_session_meta < 60s
  const personaSessionMeta = (poState as any)?.current_task?.persona_session_meta ?? {}
  function isPersonaActive(id: string): boolean {
    const meta = personaSessionMeta[id]
    if (!meta?.last_seen) return false
    const diff = (now - new Date(meta.last_seen).getTime()) / 1000
    return diff < 60
  }

  const handlePersonaClick = (def: PersonaDef) => {
    openTab(
      `persona-def:${def.id}`,
      'persona-def',
      { persona: def.id, sourcePath: `~/.claude/agents/${def.id}.md` },
    )
  }

  const handleMatrixClick = () => {
    openTab('skill-matrix', 'skill-matrix', {})
  }

  // Wiki
  const wikiBackend = wikiBackendFromState(poState)
  const wikiBackendLabel = wikiBackend
    ? t(`workspace.team.wiki.backend.${wikiBackend}`)
    : t('workspace.team.wiki.backend.fs')

  // Promotions
  const pendingPromos = poState?.pending_promotions?.filter((p) => p.status === 'pending') ?? []
  const promoCount = pendingPromos.length

  return (
    <div style={panelWrap}>
      {/* ── Personas section ── */}
      <Section title={t('workspace.team.section.personas')} storageKey="personas">
        {PERSONAS.map((def) => (
          <PersonaRow
            key={def.id}
            def={def}
            isActive={isPersonaActive(def.id)}
            onClick={() => handlePersonaClick(def)}
          />
        ))}
      </Section>

      {/* ── Skills nav row ── */}
      <div style={sectionWrap}>
        <button
          style={skillsNavBtn}
          onClick={handleMatrixClick}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          title={t('workspace.team.section.skillsLink')}
        >
          <span style={secHdrText}>{t('workspace.team.section.skills')}</span>
          <span style={skillsNavLabel}>{t('workspace.team.section.skillsLink')}</span>
          <span style={skillsNavBadge}>
            {t('workspace.team.section.skillsCount', { count: SKILLS_TOTAL })}
          </span>
        </button>
      </div>

      {/* ── Wiki / Memory section ── */}
      <Section title={t('workspace.team.section.wikiMemory')} storageKey="wiki">
        <WikiRow
          icon={wikiBackend === 'graphiti' ? '\u{1F9E0}' : wikiBackend === 'keeper' ? '\u{1F4DA}' : '\u{1F5C4}'}
          label={`Wiki: ${wikiBackendLabel}`}
        />
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
      </Section>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelWrap: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
}

const sectionWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  borderBottom: '1px solid #1E1E1E',
}

const secHdrBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '5px 8px 3px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: '#4a4a4a',
  textAlign: 'left',
  gap: 4,
}

const secChevron: React.CSSProperties = {
  fontSize: 8,
  color: '#4a4a4a',
  flexShrink: 0,
}

const secHdrText: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#4a4a4a',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  userSelect: 'none',
  flex: 1,
}

const secHdrRight: React.CSSProperties = {
  marginLeft: 'auto',
}

// Persona row

const personaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: 28,
  padding: '0 8px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  gap: 6,
  textAlign: 'left',
  transition: 'background 0.1s',
}

const avatarStyle: React.CSSProperties = {
  position: 'relative',
  width: 24,
  height: 24,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 700,
  color: '#fff',
  flexShrink: 0,
}

const activeDot: React.CSSProperties = {
  position: 'absolute',
  bottom: -1,
  right: -1,
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: '#22C55E',
  border: '1px solid #141414',
}

const personaInfo: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
}

const personaName: React.CSSProperties = {
  fontSize: 12,
  color: '#F0F0F0',
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const personaRole: React.CSSProperties = {
  fontSize: 10,
  color: '#707070',
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const personaModel: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#505050',
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

// Skills nav row

const skillsNavBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '5px 8px 3px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  gap: 4,
  textAlign: 'left',
  transition: 'background 0.1s',
}

const skillsNavLabel: React.CSSProperties = {
  fontSize: 10,
  fontFamily: 'monospace',
  color: '#60A5FA',
  flexShrink: 0,
}

const skillsNavBadge: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#505050',
  marginLeft: 4,
  flexShrink: 0,
}

// Wiki row

function wikiRowStyle(clickable: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: 28,
    padding: '0 8px',
    background: 'transparent',
    border: 'none',
    cursor: clickable ? 'pointer' : 'default',
    gap: 6,
    textAlign: 'left',
    transition: 'background 0.1s',
  }
}

const wikiIcon: React.CSSProperties = {
  fontSize: 12,
  flexShrink: 0,
}

const wikiLabel: React.CSSProperties = {
  fontSize: 11,
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
