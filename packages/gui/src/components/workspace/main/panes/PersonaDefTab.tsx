import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { PERSONA_COLORS } from '../../../../store/personaPresence'
import type { PersonaId } from '../../../../store/personaPresence'
import { useWorkspace } from '../../../../store/workspace'
import { FileText, ChevronRight as ChevRight } from 'lucide-react'
import MarkdownViewer, {
  type DoctrineOnSave,
  type MarkdownLoadResult,
} from './MarkdownViewer'

// ── Static persona metadata (T-P4-044 dispatch target, Phase 4 preview-only) ─

type PersonaKey = PersonaId

interface PersonaMeta {
  id: string
  key: PersonaKey
  initial: string
  nameKey: string
  roleKey: string
  permissionMode: string
  mcpServers?: string[]
}

// modelSummary removed (T-PATCH-024): there is no fixed per-persona model —
// routing.md scores task complexity (L1–L7) and picks model × effort per task.
// The detail view shows that dynamic hint instead (see modelHint below).
const PERSONA_META: Record<string, PersonaMeta> = {
  'pdt-po': {
    id: 'pdt-po', key: 'po', initial: 'P',
    nameKey: 'workspace.team.persona.po.name',
    roleKey: 'workspace.team.persona.po.role',
    permissionMode: 'acceptEdits',
    mcpServers: [],
  },
  'pdt-designer': {
    id: 'pdt-designer', key: 'designer', initial: 'D',
    nameKey: 'workspace.team.persona.designer.name',
    roleKey: 'workspace.team.persona.designer.role',
    permissionMode: 'bypassPermissions',
    mcpServers: ['graphiti'],
  },
  'pdt-developer': {
    id: 'pdt-developer', key: 'dev', initial: 'D',
    nameKey: 'workspace.team.persona.developer.name',
    roleKey: 'workspace.team.persona.developer.role',
    permissionMode: 'bypassPermissions',
    mcpServers: ['graphiti'],
  },
  'pdt-qa': {
    id: 'pdt-qa', key: 'qa', initial: 'Q',
    nameKey: 'workspace.team.persona.qa.name',
    roleKey: 'workspace.team.persona.qa.role',
    permissionMode: 'bypassPermissions',
    mcpServers: [],
  },
}

// ── Long-term memory file config per persona ──────────────────────────────────

// Tier-2 long-term memory (4-tier doctrine model): ~/.productune/<persona>/habit.md.
// Note the persona key→dir split: the PersonaKey 'dev' maps to the 'developer' dir.
// `dir` is the doctrine IPC's persona dir-name (PERSONA_DIRS in electron/ipc/doctrine.ts)
// and `relName` the in-tier path — both feed the `doctrine-file` tab so these rows
// open in DoctrineFileTab (rendered Preview via MdRenderer + edit), not the raw viewer.
const LT_MEMORY: Record<string, { path: string; dir: string; relName: string; tabId: string; title: string }[]> = {
  po:       [{ path: '~/.productune/po/habit.md',        dir: 'po',        relName: 'habit.md', tabId: 'lt-memory-po',        title: 'PO Memory (habit.md)' }],
  designer: [{ path: '~/.productune/designer/habit.md',  dir: 'designer',  relName: 'habit.md', tabId: 'lt-memory-designer',  title: 'Designer Memory (habit.md)' }],
  dev:      [{ path: '~/.productune/developer/habit.md', dir: 'developer', relName: 'habit.md', tabId: 'lt-memory-developer', title: 'Developer Memory (habit.md)' }],
  qa:       [{ path: '~/.productune/qa/habit.md',        dir: 'qa',        relName: 'habit.md', tabId: 'lt-memory-qa',        title: 'QA Memory (habit.md)' }],
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

  // personaId derivation: both open paths (search palette + TeamPanel row) now pass
  // the canonical full `pdt-*` id via the `persona` prop. T-PATCH-014 unified this.
  const personaId = (props?.persona as string) ?? ''

  const sourcePath = (props?.sourcePath as string) ?? `~/.claude/agents/${personaId}.md`
  const meta = PERSONA_META[personaId] ?? null

  // Persona-spec viewer seam (T-PATCH-031): the spec (~/.claude/agents/<id>.md)
  // now renders through the shared MarkdownViewer primitive (Preview default +
  // raw Edit toggle + Save), consistent with the doctrine-file viewer. The
  // persona IPC carries no mtime, so we expose mtimeMs:null — MarkdownViewer's
  // conflict pre-check is a no-op when the snapshot mtime is null.
  const loadSpec = useCallback((): Promise<MarkdownLoadResult> => {
    const api = (window as any).api
    const read = api.readPersonaSpec?.(personaId)
    if (!read) return Promise.resolve({ ok: false, error: 'read failed' })
    return Promise.resolve(read).then((res: any) =>
      res?.ok
        ? { ok: true, content: res.content ?? '', mtimeMs: null }
        : { ok: false, error: res?.error ?? 'read failed' },
    )
  }, [personaId])

  const saveSpec = useCallback<DoctrineOnSave>(
    (_p, content) => {
      const api = (window as any).api
      const write = api.writePersonaSpec?.(personaId, content)
      if (!write) return Promise.resolve({ ok: false, error: 'write failed' })
      return Promise.resolve(write).then((res: any) =>
        res?.ok ? { ok: true } : { ok: false, error: res?.error ?? 'write failed' },
      )
    },
    [personaId],
  )

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
      </div>

      {/* Model × effort is decided dynamically per task by routing (no fixed
          per-persona model) — show that as an honest hint, not a flat fact. */}
      <div style={modelHint}>{t('workspace.team.personaDef.modelHint')}</div>

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

      {/* Persona spec — editable, rendered via the shared MarkdownViewer
          primitive (T-PATCH-031): Preview default + raw Edit toggle + Save,
          consistent with the doctrine-file viewer. */}
      <div style={specHeaderRow}>
        <span style={sectionSubHdrInline}>{t('workspace.team.personaDef.specHeader')}</span>
      </div>
      <div style={specViewerWrap}>
        <MarkdownViewer
          key={personaId}
          load={loadSpec}
          absPath={sourcePath}
          relName={sourcePath}
          editable={true}
          onSave={saveSpec}
          emptyCrumb="persona"
        />
      </div>
      <div style={specHint}>{t('workspace.team.personaDef.specSaved')}</div>

      {/* Long-term memory */}
      <div style={sectionSubHdr}>LONG-TERM MEMORY</div>
      {ltRows.length === 0 && <div style={memoryEmpty}>—</div>}
      {ltRows.map((cfg) => (
        <button
          key={cfg.tabId}
          style={memoryRow}
          onClick={() => openTabFn(cfg.tabId, 'doctrine-file', { tier: 2, persona: cfg.dir, absPath: cfg.path, relName: cfg.relName, editable: true }, cfg.title)}
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

const modelHint: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  lineHeight: 1.5,
  marginBottom: 16,
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

// The persona-spec MarkdownViewer is a flex column that fills its own height;
// give it a bounded, framed box inside the scrolling detail pane so its internal
// Preview/Edit body scrolls independently rather than stretching the page.
const specViewerWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: 360,
  border: '1px solid #1E1E1E',
  borderRadius: 6,
  overflow: 'hidden',
  marginBottom: 6,
}

const specHint: React.CSSProperties = {
  fontSize: 11,
  color: '#606060',
  fontStyle: 'italic',
  padding: '2px 0',
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
