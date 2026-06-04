import { useRef, useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers, Zap, EyeOff } from 'lucide-react'
import { PERSONA_COLORS } from '../../../../store/personaPresence'
import type { SkillEntry, SkillLayer } from '../../../../lib/types'
import { InfoPopover } from '../../../shared/InfoPopover'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert skill.id to a dot-notation-safe i18n key.
 * e.g. "mattpocock/skills/engineering/tdd/SKILL.md"
 *   → "mattpocock_skills_engineering_tdd_SKILL_md"
 */
function skillIdToI18nKey(id: string): string {
  return id.replace(/[/.\-]/g, '_')
}

// ── Constants ─────────────────────────────────────────────────────────────────

type PersonaCol = 'po' | 'designer' | 'dev' | 'qa'

const PERSONA_COLS: PersonaCol[] = ['po', 'designer', 'dev', 'qa']
const PERSONA_INITIALS: Record<PersonaCol, string> = { po: 'PO', designer: 'Des', dev: 'Dev', qa: 'QA' }

// ── Layer chip ────────────────────────────────────────────────────────────────

const LAYER_ICON: Record<SkillLayer, React.ReactNode> = {
  explicit: <Layers size={9} strokeWidth={2} />,
  auto:     <Zap size={9} strokeWidth={2} />,
  unused:   <EyeOff size={9} strokeWidth={2} />,
}

const LAYER_COLORS: Record<SkillLayer, string> = {
  explicit: '#38BDF8',
  auto:     '#A3E635',
  unused:   '#404040',
}

function SkillLayerChip({ layer, tooltip }: { layer: SkillLayer; tooltip: string }) {
  const color = LAYER_COLORS[layer]
  return (
    <span
      title={tooltip}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 9,
        fontFamily: 'monospace',
        padding: '1px 5px',
        borderRadius: 3,
        border: `1px solid ${color}44`,
        background: `${color}14`,
        color,
        flexShrink: 0,
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      {LAYER_ICON[layer]}
      {layer}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  props?: Record<string, unknown>
}

export default function SkillMatrixTab({ props }: Props) {
  const { t } = useTranslation()
  const focusRow = props?.focusRow as string | undefined

  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [personaFilter, setPersonaFilter] = useState<Set<PersonaCol>>(new Set())
  const [assignedOnly, setAssignedOnly] = useState(false)
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())

  // Initial fetch on mount
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(window as any).api.listSkills().then((entries: SkillEntry[]) => {
      if (!cancelled) {
        setSkills(entries)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setSkills([])
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  // Re-fetch on window focus (detect skills dir changes)
  useEffect(() => {
    const refetch = () => {
      ;(window as any).api.listSkills()
        .then((entries: SkillEntry[]) => setSkills(entries))
        .catch(() => setSkills([]))
    }
    window.addEventListener('focus', refetch)
    return () => window.removeEventListener('focus', refetch)
  }, [])

  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      if (search && !skill.id.toLowerCase().includes(search.toLowerCase()) && !skill.name.toLowerCase().includes(search.toLowerCase())) return false
      if (assignedOnly && skill.personas.length === 0) return false
      if (personaFilter.size > 0 && !([...personaFilter].some((p) => skill.personas.includes(p)))) return false
      return true
    }).sort((a, b) => b.personas.length - a.personas.length || a.name.localeCompare(b.name))
  }, [skills, search, personaFilter, assignedOnly])

  // Scroll to focus row — also runs after loading completes so the row exists
  useEffect(() => {
    if (!focusRow) return
    const el = rowRefs.current.get(focusRow)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusRow, loading])

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

      {/* Loading state */}
      {loading && (
        <div style={loadingPane}>Scanning skills…</div>
      )}

      {/* Empty state */}
      {!loading && skills.length === 0 && (
        <div style={emptyPane}>
          <div style={emptyPrimary}>{t('workspace.team.skillMatrix.emptyPrimary')}</div>
          <div style={emptySecondary}>{t('workspace.team.skillMatrix.emptySecondary')}</div>
        </div>
      )}

      {/* Table */}
      {!loading && skills.length > 0 && (
        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr style={headerRow}>
                <th style={thSkill}>Skill</th>
                <th style={thLayer}>Layer</th>
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
                      <span style={skillIdStyle}>{skill.name}</span>
                      <InfoPopover
                        text={t(`skills.descriptions.${skillIdToI18nKey(skill.id)}`, { defaultValue: skill.description })}
                        ariaLabel={t('workspace.team.skillMatrix.viewDescription')}
                      />
                    </td>
                    <td style={tdLayer}>
                      <SkillLayerChip
                        layer={skill.layer}
                        tooltip={t(`workspace.team.skillMatrix.layerTooltip.${skill.layer}`)}
                      />
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
                <td colSpan={6} style={addSkillCell}>
                  <span style={addSkillDisabled}>{t('workspace.team.skillMatrix.addSkill')}</span>
                  <span style={addSkillPhase5}> — Phase 5</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

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
    border: `1px solid ${active ? '#38BDF8' : '#2A2A2A'}`,
    background: active ? '#0A1828' : 'transparent',
    color: active ? '#38BDF8' : '#707070',
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

const thLayer: React.CSSProperties = {
  width: 80,
  textAlign: 'left',
  padding: '6px 8px',
  fontSize: 10,
  fontWeight: 600,
  color: '#505050',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  borderBottom: '1px solid #1E1E1E',
  whiteSpace: 'nowrap',
}

const thPersona: React.CSSProperties = {
  width: 52,
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

const loadingPane: React.CSSProperties = {
  color: '#505050',
  fontSize: 12,
  padding: '24px 16px',
}

const emptyPane: React.CSSProperties = {
  padding: '24px 16px',
}

const emptyPrimary: React.CSSProperties = {
  fontSize: 12,
  color: '#505050',
  marginBottom: 4,
}

const emptySecondary: React.CSSProperties = {
  fontSize: 11,
  color: '#3A3A3A',
}

const skillIdStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 11,
  color: '#D0D0D0',
  marginRight: 6,
}

const tdLayer: React.CSSProperties = {
  width: 80,
  padding: '5px 8px',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
}

const tdCheck: React.CSSProperties = {
  width: 52,
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

