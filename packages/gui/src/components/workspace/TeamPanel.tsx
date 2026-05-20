/**
 * TeamPanel — Team sidebar (T-P4-099 restructure, T-P4-145 bug fix).
 *
 * Layout:
 *  1. Personas section — plain title "페르소나" + PersonaRow × 4 inline (no collapse toggle)
 *     Each PersonaRow click → persona-def:<key> tab (T-P4-145 Bug 5)
 *  2. Skills nav row — click → skill-matrix main tab (T-P4-098)
 *  3. MCP Servers nav row
 *
 * 위키 메모리 section removed (T-P4-145 Bug 6): memory content absorbed into PersonaDefTab sections.
 * Sidebar = nav only.
 */

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
  { key: 'po',       id: 'pdt-po',        initial: 'P', nameKey: 'workspace.team.persona.po.name',       roleKey: 'workspace.team.persona.po.role',       modelSummary: 'opus / xhigh'   },
  { key: 'designer', id: 'pdt-designer',   initial: 'D', nameKey: 'workspace.team.persona.designer.name',  roleKey: 'workspace.team.persona.designer.role',  modelSummary: 'opus / xhigh'   },
  { key: 'dev',      id: 'pdt-developer',  initial: 'D', nameKey: 'workspace.team.persona.developer.name', roleKey: 'workspace.team.persona.developer.role', modelSummary: 'sonnet / high'  },
  { key: 'qa',       id: 'pdt-qa',         initial: 'Q', nameKey: 'workspace.team.persona.qa.name',        roleKey: 'workspace.team.persona.qa.role',        modelSummary: 'haiku / low'    },
]

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

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  poState: PoState | null
}

export default function TeamPanel({ poState }: Props) {
  const { t } = useTranslation()
  const openTab = useWorkspace((s) => s.openTab)
  const [now, setNow] = useState(Date.now())

  // Dynamic skills count
  const [skillsTotal, setSkillsTotal] = useState<number | null>(null)

  useEffect(() => {
    ;(window as any).api.listSkills()
      .then((entries: unknown[]) => setSkillsTotal(entries.length))
      .catch(() => setSkillsTotal(null))
  }, [])

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

  // Persona row click → persona-def tab, distinct tabId per persona (T-P4-145)
  const handlePersonaClick = (def: PersonaDef) => {
    openTab(
      `persona-def:${def.key}`,
      'persona-def',
      { personaKey: def.key },
      t(def.nameKey),
    )
  }

  const handleMatrixClick = () => {
    openTab('skill-matrix', 'skill-matrix', {})
  }

  const handleMcpClick = () => {
    openTab('mcp-servers', 'mcp-servers', {})
  }

  return (
    <div style={panelWrap}>

      {/* ── Personas section — plain title + inline list (no collapse) ── */}
      <div style={sectionWrap}>
        <div style={plainSecHdr}>
          <span style={secHdrText}>{t('workspace.team.section.personas')}</span>
        </div>
        {PERSONAS.map((def) => (
          <PersonaRow
            key={def.id}
            def={def}
            isActive={isPersonaActive(def.id)}
            onClick={() => handlePersonaClick(def)}
          />
        ))}
      </div>

      {/* ── Skills nav row ── */}
      <div style={sectionWrap}>
        <button
          style={navRowBtn}
          onClick={handleMatrixClick}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          title={t('workspace.team.section.skillsLink')}
        >
          <span style={navRowLabel}>{t('workspace.team.section.skills')}</span>
          <span style={navRowBadge}>
            {skillsTotal !== null
              ? t('workspace.team.section.skillsCount', { count: skillsTotal })
              : <span style={{ color: '#3A3A3A' }}>?</span>}
          </span>
        </button>
      </div>

      {/* ── MCP Servers nav row ── */}
      <div style={sectionWrap}>
        <button
          style={navRowBtn}
          onClick={handleMcpClick}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          title={t('workspace.team.section.mcpLink')}
        >
          <span style={navRowLabel}>{t('workspace.team.section.mcpServers')}</span>
        </button>
      </div>

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

// Plain (non-clickable) section title for Personas
const plainSecHdr: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '5px 8px 3px',
  gap: 4,
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

// Nav row button (Skills + Wiki·Memory)
const navRowBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '6px 8px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  gap: 5,
  textAlign: 'left',
  transition: 'background 0.1s',
}

const navRowLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#C0C0C0',
  flex: 1,
  userSelect: 'none',
}

const navRowBadge: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#505050',
  flexShrink: 0,
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


