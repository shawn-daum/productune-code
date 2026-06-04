import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { PERSONA_COLORS } from '../../../../store/personaPresence'
import type { PersonaId } from '../../../../store/personaPresence'
import { useWorkspace } from '../../../../store/workspace'
import { FileText, ChevronRight as ChevRight, Pencil, Save, X } from 'lucide-react'

// ── Static persona metadata (T-P4-044 dispatch target, Phase 4 preview-only) ─

type PersonaKey = PersonaId

interface PersonaMeta {
  id: string
  key: PersonaKey
  initial: string
  nameKey: string
  roleKey: string
  modelSummary: string
  permissionMode: string
  mcpServers?: string[]
}

const PERSONA_META: Record<string, PersonaMeta> = {
  'pdt-po': {
    id: 'pdt-po', key: 'po', initial: 'P',
    nameKey: 'workspace.team.persona.po.name',
    roleKey: 'workspace.team.persona.po.role',
    modelSummary: 'opus / xhigh',
    permissionMode: 'acceptEdits',
    mcpServers: [],
  },
  'pdt-designer': {
    id: 'pdt-designer', key: 'designer', initial: 'D',
    nameKey: 'workspace.team.persona.designer.name',
    roleKey: 'workspace.team.persona.designer.role',
    modelSummary: 'opus / xhigh',
    permissionMode: 'bypassPermissions',
    mcpServers: ['graphiti'],
  },
  'pdt-developer': {
    id: 'pdt-developer', key: 'dev', initial: 'D',
    nameKey: 'workspace.team.persona.developer.name',
    roleKey: 'workspace.team.persona.developer.role',
    modelSummary: 'sonnet / high',
    permissionMode: 'bypassPermissions',
    mcpServers: ['graphiti'],
  },
  'pdt-qa': {
    id: 'pdt-qa', key: 'qa', initial: 'Q',
    nameKey: 'workspace.team.persona.qa.name',
    roleKey: 'workspace.team.persona.qa.role',
    modelSummary: 'haiku / low',
    permissionMode: 'bypassPermissions',
    mcpServers: [],
  },
}

// ── Long-term memory file config per persona ──────────────────────────────────

// Tier-2 long-term memory (4-tier doctrine model): ~/.productune/<persona>/habit.md.
// Note the persona key→dir split: the PersonaKey 'dev' maps to the 'developer' dir.
const LT_MEMORY: Record<string, { path: string; tabId: string; title: string }[]> = {
  po:       [{ path: '~/.productune/po/habit.md',        tabId: 'lt-memory-po',        title: 'PO Memory (habit.md)' }],
  designer: [{ path: '~/.productune/designer/habit.md',  tabId: 'lt-memory-designer',  title: 'Designer Memory (habit.md)' }],
  dev:      [{ path: '~/.productune/developer/habit.md', tabId: 'lt-memory-developer', title: 'Developer Memory (habit.md)' }],
  qa:       [{ path: '~/.productune/qa/habit.md',        tabId: 'lt-memory-qa',        title: 'QA Memory (habit.md)' }],
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  props?: Record<string, unknown>
}

export default function PersonaDefTab({ props }: Props) {
  const { t } = useTranslation()

  // Store bindings — before any early return (Rules of Hooks)
  const poState   = useWorkspace((s) => s.poState)
  const openTabFn = useWorkspace((s) => s.openTab)

  // Persona-spec editor state (v0.5 B1 / T-017) — hooks before early return.
  const [specEditing, setSpecEditing] = useState(false)
  const [specDraft, setSpecDraft] = useState('')
  const [specLoading, setSpecLoading] = useState(false)
  const [specSaving, setSpecSaving] = useState(false)
  const [specError, setSpecError] = useState<string | null>(null)
  const [specSaved, setSpecSaved] = useState(false)

  // personaId derivation: both open paths (search palette + TeamPanel row) now pass
  // the canonical full `pdt-*` id via the `persona` prop. T-PATCH-014 unified this.
  const personaId = (props?.persona as string) ?? ''

  const sourcePath = (props?.sourcePath as string) ?? `~/.claude/agents/${personaId}.md`
  const meta = PERSONA_META[personaId] ?? null

  const handleEditSpec = useCallback(async () => {
    setSpecError(null)
    setSpecSaved(false)
    setSpecLoading(true)
    try {
      const api = (window as any).api
      const res = await api.readPersonaSpec?.(personaId)
      if (res?.ok) {
        setSpecDraft(res.content ?? '')
        setSpecEditing(true)
      } else {
        setSpecError(res?.error ?? 'read failed')
      }
    } catch (e: any) {
      setSpecError(e?.message ?? 'read failed')
    } finally {
      setSpecLoading(false)
    }
  }, [personaId])

  const handleSaveSpec = useCallback(async () => {
    setSpecSaving(true)
    setSpecError(null)
    try {
      const api = (window as any).api
      const res = await api.writePersonaSpec?.(personaId, specDraft)
      if (res?.ok) {
        setSpecEditing(false)
        setSpecSaved(true)
        setTimeout(() => setSpecSaved(false), 2000)
      } else {
        setSpecError(res?.error ?? 'write failed')
      }
    } catch (e: any) {
      setSpecError(e?.message ?? 'write failed')
    } finally {
      setSpecSaving(false)
    }
  }, [personaId, specDraft])

  const handleCancelSpec = useCallback(() => {
    setSpecEditing(false)
    setSpecDraft('')
    setSpecError(null)
  }, [])

  if (!meta) {
    return (
      <div style={errorWrap}>
        <div style={errorText}>Unknown persona: {personaId}</div>
      </div>
    )
  }

  const color = PERSONA_COLORS[meta.key]

  // Long-term memory rows for this persona
  const ltRows = LT_MEMORY[meta.key] ?? []

  // Project memory derived from poState
  const currentVersion = poState?.current_version ?? '—'
  const ct = poState?.current_task
  const activeTask = ct?.assignee_persona === meta.id
    ? (ct?.ticket_id ?? '—')
    : '—'
  const promoCount = (poState?.pending_promotions ?? [])
    .filter((p) => (p as any).persona === meta.id && p.status === 'pending').length
  const lastSeen: string =
    ((poState as any)?.current_task?.persona_session_meta?.[meta.id]?.last_seen as string | undefined)
      ?.slice(0, 10) ?? '—'

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={header}>
        <div style={{ ...avatar, background: color }}>
          {meta.initial}
        </div>
        <div style={headerInfo}>
          <div style={personaName}>{t(meta.nameKey)}</div>
          <div style={personaRole}>{t(meta.roleKey)}</div>
        </div>
        <div style={headerRight}>
          <div style={modelBadge}>{meta.modelSummary}</div>
        </div>
      </div>

      {/* Metadata */}
      <div style={metaSection}>
        <div style={metaRow}>
          <span style={metaLabel}>id</span>
          <span style={metaValue}>{meta.id}</span>
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>permissionMode</span>
          <span style={metaValue}>{meta.permissionMode}</span>
        </div>
        {meta.mcpServers && meta.mcpServers.length > 0 && (
          <div style={metaRow}>
            <span style={metaLabel}>mcpServers</span>
            <span style={metaValue}>{meta.mcpServers.join(', ')}</span>
          </div>
        )}
        <div style={metaRow}>
          <span style={metaLabel}>source</span>
          <span style={{ ...metaValue, fontFamily: 'monospace', fontSize: 10 }}>{sourcePath}</span>
        </div>
      </div>

      {/* Persona spec — editable (v0.5 B1 / T-017) */}
      <div style={specHeaderRow}>
        <span style={sectionSubHdrInline}>{t('workspace.personaDef.specHeader')}</span>
        {!specEditing ? (
          <button
            style={specActionBtn}
            onClick={handleEditSpec}
            disabled={specLoading}
            title={t('workspace.personaDef.specEdit')}
          >
            <Pencil size={11} color="#909090" />
            <span>{specLoading ? t('common.loading') : t('workspace.personaDef.specEdit')}</span>
          </button>
        ) : (
          <div style={specBtnGroup}>
            <button style={specActionBtn} onClick={handleSaveSpec} disabled={specSaving}>
              <Save size={11} color="#34D399" />
              <span>{specSaving ? t('common.loading') : t('workspace.personaDef.specSave')}</span>
            </button>
            <button style={specActionBtn} onClick={handleCancelSpec} disabled={specSaving}>
              <X size={11} color="#909090" />
              <span>{t('common.cancel')}</span>
            </button>
          </div>
        )}
      </div>
      {specEditing ? (
        <textarea
          style={specTextarea}
          value={specDraft}
          onChange={(e) => setSpecDraft(e.target.value)}
          spellCheck={false}
          autoFocus
        />
      ) : (
        <div style={specHint}>
          {t('workspace.personaDef.specHint', { path: sourcePath })}
        </div>
      )}
      {specError && <div style={specErrorText}>{specError}</div>}
      {specSaved && <div style={specSavedText}>{t('workspace.personaDef.specSaved')}</div>}

      {/* Long-term memory */}
      <div style={sectionSubHdr}>LONG-TERM MEMORY</div>
      {ltRows.length === 0 && <div style={memoryEmpty}>—</div>}
      {ltRows.map((cfg) => (
        <button
          key={cfg.tabId}
          style={memoryRow}
          onClick={() => openTabFn(cfg.tabId, 'markdown', { path: cfg.path, title: cfg.title }, cfg.title)}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <FileText size={13} color="#505050" />
          <span style={memoryRowPath}>{cfg.path}</span>
          <ChevRight size={12} color="#505050" style={{ marginLeft: 'auto', flexShrink: 0 }} />
        </button>
      ))}

      {/* Project memory */}
      <div style={sectionSubHdr}>PROJECT MEMORY</div>
      <div style={metaSection}>
        <div style={metaRow}>
          <span style={metaLabel}>current version</span>
          <span style={metaValue}>{currentVersion}</span>
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>active task</span>
          <span style={metaValue}>{activeTask}</span>
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>promo pending</span>
          <span style={metaValue}>{promoCount}</span>
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>last seen</span>
          <span style={metaValue}>{lastSeen}</span>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  background: '#0F0F0F',
  padding: 20,
  overflowY: 'auto',
}

const errorWrap: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const errorText: React.CSSProperties = {
  fontSize: 12,
  color: '#E04040',
  fontFamily: 'monospace',
}

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 20,
  paddingBottom: 16,
  borderBottom: '1px solid #1E1E1E',
}

const avatar: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 700,
  color: '#fff',
  flexShrink: 0,
}

const headerInfo: React.CSSProperties = {
  flex: 1,
}

const personaName: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: '#F0F0F0',
}

const personaRole: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  marginTop: 2,
}

const headerRight: React.CSSProperties = {
  flexShrink: 0,
}

const modelBadge: React.CSSProperties = {
  fontSize: 9,
  fontFamily: 'monospace',
  color: '#A0A0A0',
  background: '#1A1A1A',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  padding: '2px 6px',
}

const metaSection: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 20,
}

const metaRow: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
}

const metaLabel: React.CSSProperties = {
  fontSize: 10,
  fontFamily: 'monospace',
  color: '#505050',
  width: 120,
  flexShrink: 0,
}

const metaValue: React.CSSProperties = {
  fontSize: 11,
  color: '#C0C0C0',
}

const sectionSubHdr: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#3A3A3A',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  borderTop: '1px solid #1E1E1E',
  padding: '10px 0 6px',
  marginTop: 4,
}

const specHeaderRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderTop: '1px solid #1E1E1E',
  padding: '10px 0 6px',
  marginTop: 4,
}

const sectionSubHdrInline: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#3A3A3A',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

const specBtnGroup: React.CSSProperties = {
  display: 'flex',
  gap: 6,
}

const specActionBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'transparent',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#A0A0A0',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 10,
  padding: '2px 8px',
}

const specTextarea: React.CSSProperties = {
  background: '#0A0A0A',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  color: '#E0E0E0',
  fontFamily: 'monospace',
  fontSize: 11,
  lineHeight: 1.5,
  minHeight: 240,
  outline: 'none',
  padding: '8px 10px',
  resize: 'vertical',
  width: '100%',
}

const specHint: React.CSSProperties = {
  fontSize: 11,
  color: '#606060',
  fontStyle: 'italic',
  padding: '2px 0',
}

const specErrorText: React.CSSProperties = {
  fontSize: 11,
  color: '#E04040',
  marginTop: 4,
}

const specSavedText: React.CSSProperties = {
  fontSize: 11,
  color: '#34D399',
  marginTop: 4,
}

const memoryRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 0',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
}

const memoryRowPath: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'monospace',
  color: '#707070',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const memoryEmpty: React.CSSProperties = {
  fontSize: 11,
  color: '#3A3A3A',
  padding: '4px 0',
  fontStyle: 'italic',
}
