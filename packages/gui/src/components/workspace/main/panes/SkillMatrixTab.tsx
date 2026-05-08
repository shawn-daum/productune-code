import { useRef, useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PERSONA_COLORS } from '../../../../store/personaPresence'

// ── Static skill catalog ──────────────────────────────────────────────────────

type PersonaCol = 'po' | 'designer' | 'dev' | 'qa'

interface SkillRow {
  id: string
  description: string
  personas: PersonaCol[]
}

const PERSONA_COLS: PersonaCol[] = ['po', 'designer', 'dev', 'qa']
const PERSONA_INITIALS: Record<PersonaCol, string> = { po: 'P', designer: 'D', dev: 'D', qa: 'Q' }

const SKILL_CATALOG: SkillRow[] = [
  { id: 'mattpocock/tdd',                         description: 'Test-driven development',                   personas: ['dev'] },
  { id: 'mattpocock/design-an-interface',          description: 'Interface design prompting',                personas: ['designer'] },
  { id: 'mattpocock/code-review',                  description: 'Code review workflow',                      personas: ['dev'] },
  { id: 'pm-product-discovery/interview-script',   description: 'User interview script generation',          personas: ['po', 'designer'] },
  { id: 'pm-prd-clarity-loop',                     description: 'PRD clarity loop iteration',                personas: ['po', 'designer'] },
  { id: 'triage-issue',                            description: 'Debug triage process',                      personas: ['dev'] },
  { id: 'request-refactor-plan',                   description: 'Refactor planning prompt',                  personas: ['dev'] },
  { id: 'improve-codebase-architecture',           description: 'Architecture improvement prompt',           personas: ['dev'] },
  { id: 'qa-suite-runner',                         description: 'Test suite execution & reporting',          personas: ['qa'] },
  { id: 'to-prd',                                  description: 'Brief → PRD conversion',                    personas: ['po'] },
  { id: 'setup-pre-commit',                        description: 'Pre-commit hook setup',                     personas: ['dev'] },
  { id: 'git-guardrails-claude-code',              description: 'Git safety guardrails',                     personas: ['dev'] },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  props?: Record<string, unknown>
}

export default function SkillMatrixTab({ props }: Props) {
  const { t } = useTranslation()
  const focusRow = props?.focusRow as string | undefined

  const [search, setSearch] = useState('')
  const [personaFilter, setPersonaFilter] = useState<Set<PersonaCol>>(new Set())
  const [assignedOnly, setAssignedOnly] = useState(false)
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())

  const filteredSkills = useMemo(() => {
    return SKILL_CATALOG.filter((skill) => {
      if (search && !skill.id.toLowerCase().includes(search.toLowerCase())) return false
      if (assignedOnly && skill.personas.length === 0) return false
      if (personaFilter.size > 0 && !([...personaFilter].some((p) => skill.personas.includes(p)))) return false
      return true
    })
  }, [search, personaFilter, assignedOnly])

  // Scroll to focus row on mount/props change
  useEffect(() => {
    if (!focusRow) return
    const el = rowRefs.current.get(focusRow)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusRow])

  const togglePersona = (p: PersonaCol) => {
    setPersonaFilter((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  return (
    <div style={wrap}>
      {/* Toolbar */}
      <div style={toolbar}>
        <input
          style={searchInput}
          type="text"
          placeholder={t('workspace.team.skillMatrix.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          spellCheck={false}
        />
        <div style={filterArea}>
          {PERSONA_COLS.map((p) => (
            <button
              key={p}
              style={personaChipStyle(personaFilter.has(p), PERSONA_COLORS[p])}
              onClick={() => togglePersona(p)}
              title={p}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PERSONA_COLORS[p], display: 'inline-block', flexShrink: 0 }} />
              {p}
            </button>
          ))}
          <button
            style={assignedChipStyle(assignedOnly)}
            onClick={() => setAssignedOnly((v) => !v)}
          >
            {t('workspace.team.skillMatrix.filterAssigned')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr style={headerRow}>
              <th style={thSkill}>Skill</th>
              {PERSONA_COLS.map((p) => (
                <th key={p} style={thPersona}>
                  <span style={{ ...personaDot, background: PERSONA_COLORS[p] }} />
                  {PERSONA_INITIALS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredSkills.map((skill) => {
              const isFocus = skill.id === focusRow
              return (
                <tr
                  key={skill.id}
                  ref={(el) => { if (el) rowRefs.current.set(skill.id, el); else rowRefs.current.delete(skill.id) }}
                  style={isFocus ? trFocus : tr}
                >
                  <td style={tdSkill}>
                    <span style={skillId}>{skill.id}</span>
                    <span style={skillDesc}>{skill.description}</span>
                  </td>
                  {PERSONA_COLS.map((p) => (
                    <td key={p} style={tdCheck}>
                      {skill.personas.includes(p) ? (
                        <span style={{ color: PERSONA_COLORS[p], fontSize: 13 }}>✓</span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={addSkillCell}>
                <span style={addSkillDisabled}>{t('workspace.team.skillMatrix.addSkill')}</span>
                <span style={addSkillPhase5}> — Phase 5</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  background: '#0F0F0F',
}

const toolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderBottom: '1px solid #1E1E1E',
  flexShrink: 0,
  flexWrap: 'wrap',
}

const searchInput: React.CSSProperties = {
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#E0E0E0',
  fontSize: 12,
  padding: '3px 8px',
  outline: 'none',
  width: 200,
  fontFamily: 'inherit',
}

const filterArea: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
}

function personaChipStyle(active: boolean, color: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontFamily: 'monospace',
    padding: '2px 7px',
    borderRadius: 10,
    border: `1px solid ${active ? color : '#2A2A2A'}`,
    background: active ? `${color}22` : 'transparent',
    color: active ? color : '#707070',
    cursor: 'pointer',
    userSelect: 'none',
  }
}

function assignedChipStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 10,
    border: `1px solid ${active ? '#60A5FA' : '#2A2A2A'}`,
    background: active ? '#1A2540' : 'transparent',
    color: active ? '#60A5FA' : '#707070',
    cursor: 'pointer',
    userSelect: 'none',
    fontFamily: 'inherit',
  }
}

const tableWrap: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'auto',
}

const table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
}

const headerRow: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  background: '#141414',
  zIndex: 1,
}

const thSkill: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 12px',
  fontSize: 10,
  fontWeight: 600,
  color: '#505050',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  borderBottom: '1px solid #1E1E1E',
}

const thPersona: React.CSSProperties = {
  width: 40,
  textAlign: 'center',
  padding: '6px 4px',
  fontSize: 10,
  fontWeight: 600,
  color: '#505050',
  letterSpacing: '0.07em',
  borderBottom: '1px solid #1E1E1E',
}

const personaDot: React.CSSProperties = {
  display: 'block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  margin: '0 auto 2px',
}

const tr: React.CSSProperties = {
  borderBottom: '1px solid #1A1A1A',
}

const trFocus: React.CSSProperties = {
  background: '#1f3a5f',
  borderBottom: '1px solid #1A1A1A',
}

const tdSkill: React.CSSProperties = {
  padding: '5px 12px',
  verticalAlign: 'middle',
}

const skillId: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 11,
  color: '#D0D0D0',
  marginRight: 8,
}

const skillDesc: React.CSSProperties = {
  fontSize: 10,
  color: '#505050',
}

const tdCheck: React.CSSProperties = {
  width: 40,
  textAlign: 'center',
  padding: '5px 4px',
  verticalAlign: 'middle',
}

const addSkillCell: React.CSSProperties = {
  padding: '10px 12px',
  borderTop: '1px solid #1E1E1E',
}

const addSkillDisabled: React.CSSProperties = {
  fontSize: 11,
  color: '#3A3A3A',
  fontFamily: 'monospace',
}

const addSkillPhase5: React.CSSProperties = {
  fontSize: 10,
  color: '#2A2A2A',
}
