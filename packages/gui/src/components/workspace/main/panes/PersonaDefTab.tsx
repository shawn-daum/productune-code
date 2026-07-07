import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PERSONA_COLORS } from '../../../../store/personaPresence'
import type { PersonaId } from '../../../../store/personaPresence'
import { useWorkspace } from '../../../../store/workspace'
import { FileText, ChevronRight as ChevRight, ChevronDown, Lock, Pencil } from 'lucide-react'
import MarkdownViewer, {
  type DoctrineOnSave,
  type MarkdownLoadResult,
} from './MarkdownViewer'

// ── Static persona metadata (T-P4-044 dispatch target, Phase 4 preview-only) ─
// T-PATCH-200: `mcpServers` field removed — engine plumbing (MCP) is no longer
// surfaced to the planner anywhere (pane / Team / Settings).

type PersonaKey = PersonaId

interface PersonaMeta {
  id: string
  key: PersonaKey
  initial: string
  nameKey: string
  roleKey: string
  permissionMode: string
}

// Runtime persona-key → doctrine directory name. The doctrine:listTiers IPC
// (T-PATCH-019) keys off the *directory* name and only whitelists `developer`
// (not `dev`); the caller owns the key→dir map. Kept to one line, mirroring the
// same map in TeamPanel.tsx.
const PERSONA_DIR: Record<PersonaKey, string> = {
  po: 'po',
  designer: 'designer',
  dev: 'developer',
  qa: 'qa',
}

// modelSummary removed (T-PATCH-024) AND the dynamic modelHint line removed
// (T-PATCH-200 QA2): there is no fixed per-persona model — routing scores task
// complexity (L1–L7) and picks model × effort per task. Surfacing it here (even
// as a hint) just implied a per-persona model fact, so the pane shows nothing.
// T-319: keyed by the prdt-* agent id (== the ~/.claude/agents/<id>.md spec file
// this pane reads/writes). pdt-* agents were retired in T-293/T-311.
const PERSONA_META: Record<string, PersonaMeta> = {
  'prdt-po': {
    id: 'prdt-po', key: 'po', initial: 'P',
    nameKey: 'workspace.team.persona.po.name',
    roleKey: 'workspace.team.persona.po.role',
    permissionMode: 'acceptEdits',
  },
  'prdt-designer': {
    id: 'prdt-designer', key: 'designer', initial: 'D',
    nameKey: 'workspace.team.persona.designer.name',
    roleKey: 'workspace.team.persona.designer.role',
    permissionMode: 'bypassPermissions',
  },
  'prdt-developer': {
    id: 'prdt-developer', key: 'dev', initial: 'D',
    nameKey: 'workspace.team.persona.developer.name',
    roleKey: 'workspace.team.persona.developer.role',
    permissionMode: 'bypassPermissions',
  },
  'prdt-qa': {
    id: 'prdt-qa', key: 'qa', initial: 'Q',
    nameKey: 'workspace.team.persona.qa.name',
    roleKey: 'workspace.team.persona.qa.role',
    permissionMode: 'bypassPermissions',
  },
}

// ── Doctrine tier model (mirrors TeamPanel's shape) ───────────────────────────

type Tier = 0 | 1 | 2

interface DoctrineFileRow {
  tier: Tier
  persona: string
  role: string
  absPath: string
  relName: string
  editable: boolean
  exists: boolean
  mtimeMs: number | null
  sizeBytes: number | null
}

interface DoctrineTierGroup {
  tier: Tier
  role: string
  root: string
  editable: boolean
  files: DoctrineFileRow[]
}

interface ListTiersResult {
  ok: boolean
  error?: string
  tiers?: DoctrineTierGroup[]
}

type TiersState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; tiers: DoctrineTierGroup[] }

// Human label map for file-reference rows (fallback = filename stem). The raw
// path is NEVER the primary label (AC-2). Keyed by the file basename stem.
const FILE_LABEL_KEY: Record<string, string> = {
  'habit': 'workspace.team.personaDef.fileLabel.habit',
  'calibration-log': 'workspace.team.personaDef.fileLabel.calibrationLog',
  'corrections': 'workspace.team.personaDef.fileLabel.corrections',
  'project-notes': 'workspace.team.personaDef.fileLabel.projectNotes',
  'user-knowledge-state': 'workspace.team.personaDef.fileLabel.userKnowledgeState',
  'doctrine-editing': 'workspace.team.personaDef.fileLabel.doctrineEditing',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  props?: Record<string, unknown>
}

export default function PersonaDefTab({ props }: Props) {
  const { t } = useTranslation()

  // Store bindings — before any early return (Rules of Hooks)
  const poState    = useWorkspace((s) => s.poState)
  const openTabFn  = useWorkspace((s) => s.openTab)
  const projectDir = useWorkspace((s) => s.project?.projectDir ?? null)

  // personaId derivation: both open paths (search palette + TeamPanel row) now pass
  // the canonical full `pdt-*` id via the `persona` prop. T-PATCH-014 unified this.
  const personaId = (props?.persona as string) ?? ''

  const sourcePath = (props?.sourcePath as string) ?? `~/.claude/agents/${personaId}.md`
  const meta = PERSONA_META[personaId] ?? null

  // Advanced section is collapsed by default (AC-1): the memory hierarchy takes
  // the prime position; the 7-line agent spec is tucked away.
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // ── Doctrine tiers (replaces the hardcoded LT_MEMORY map; T-PATCH-200) ───────
  // Fetch via doctrineListTiers, which enumerates habit.md + bookshelf/*.md for
  // each tier (verified: listTiers walks bookshelf via listBookshelf, so
  // relName arrives as `bookshelf/<name>.md` — no explorer:listDir boost needed).
  const [tiersState, setTiersState] = useState<TiersState>({ status: 'loading' })

  useEffect(() => {
    if (!meta) return
    let alive = true
    setTiersState({ status: 'loading' })
    const dir = PERSONA_DIR[meta.key]
    // T-PATCH-213: guard deref — .catch traps only promise rejection.
    const api = (window as any).api
    if (!api?.doctrineListTiers) { setTiersState({ status: 'error' }); return }
    api
      .doctrineListTiers(dir, projectDir ?? '')
      .then((res: ListTiersResult) => {
        if (!alive) return
        if (res?.ok && Array.isArray(res.tiers)) setTiersState({ status: 'done', tiers: res.tiers })
        else setTiersState({ status: 'error' })
      })
      .catch(() => { if (alive) setTiersState({ status: 'error' }) })
    return () => { alive = false }
    // Refetch on persona / project switch.
  }, [meta, projectDir])

  // Persona-spec viewer seam (T-PATCH-031): the spec (~/.claude/agents/<id>.md)
  // renders through the shared MarkdownViewer primitive. The persona IPC carries
  // no mtime, so we expose mtimeMs:null — the conflict pre-check is a no-op.
  const loadSpec = useCallback((): Promise<MarkdownLoadResult> => {
    const api = (window as any).api
    if (!api?.readPersonaSpec) return Promise.resolve({ ok: false, error: 'read failed' }) // T-PATCH-213
    const read = api.readPersonaSpec(personaId)
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

  // ── Header status chip — absorbs the old "PROJECT MEMORY" runtime values ──────
  const ct = poState?.current_task
  const activeTicket = ct?.assignee_persona === meta.id ? (ct?.ticket_id ?? null) : null
  const isWorking = !!activeTicket

  // Tier groups with tier !== 0 (T0 hidden — read-only clutter). Tier 1 = project
  // memory, Tier 2 = long-term memory.
  const tierGroups =
    tiersState.status === 'done'
      ? tiersState.tiers.filter((g) => g.tier !== 0).sort((a, b) => a.tier - b.tier)
      : []

  return (
    <div style={wrap}>
      {/* ── Header — avatar · name · role + status chip ── */}
      <div style={header}>
        <div style={{ ...avatar, background: color }}>
          {meta.initial}
        </div>
        <div style={headerInfo}>
          <div style={personaNameRow}>
            <span style={personaName}>{t(meta.nameKey)}</span>
            <span style={isWorking ? statusChipActive : statusChipIdle}>
              {isWorking
                ? t('workspace.team.personaDef.statusWorking', { ticket: activeTicket })
                : t('workspace.team.personaDef.statusIdle')}
            </span>
          </div>
          <div style={personaRole}>{t(meta.roleKey)}</div>
        </div>
      </div>

      {/* modelHint removed (T-PATCH-200 QA2): no fixed per-persona model exists;
          model × effort is routing-decided per task, so the pane states nothing. */}

      {/* ── Project memory (Tier 1) ── prime position above Advanced ── */}
      <MemoryTier
        tier={1}
        headerKey="workspace.team.personaDef.tier1Header"
        subKey="workspace.team.personaDef.tier1Sub"
        state={tiersState}
        group={tierGroups.find((g) => g.tier === 1) ?? null}
        projectDir={projectDir}
        openTab={openTabFn}
      />

      {/* ── Long-term memory (Tier 2) ── */}
      <MemoryTier
        tier={2}
        headerKey="workspace.team.personaDef.tier2Header"
        subKey="workspace.team.personaDef.tier2Sub"
        state={tiersState}
        group={tierGroups.find((g) => g.tier === 2) ?? null}
        projectDir={projectDir}
        openTab={openTabFn}
      />

      {/* ── Advanced (collapsed by default) — id / permissionMode / source + spec ── */}
      <button
        style={advancedToggle}
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
      >
        {advancedOpen ? <ChevronDown size={12} color="#707070" /> : <ChevRight size={12} color="#707070" />}
        <span style={advancedToggleText}>{t('workspace.team.personaDef.advancedHeader')}</span>
      </button>
      {advancedOpen && (
        <>
          <div style={metaSection}>
            <div style={metaRow}>
              <span style={metaLabel}>id</span>
              <span style={metaValue}>{meta.id}</span>
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>permissionMode</span>
              <span style={metaValue}>{meta.permissionMode}</span>
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>source</span>
              <span style={{ ...metaValue, fontFamily: 'monospace', fontSize: 10 }}>{sourcePath}</span>
            </div>
          </div>

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
        </>
      )}
    </div>
  )
}

// ── MemoryTier section ────────────────────────────────────────────────────────
// One doctrine tier (1 or 2). habit.md → inline editable preview (MarkdownViewer);
// every other file (bookshelf/*.md, etc.) → human-labelled file-reference row
// that opens a doctrine-file tab (which carries the full save-choice/conflict UX
// via DoctrineFileTabHost). Empty habit → "no rules learned yet" state.

interface MemoryTierProps {
  tier: 1 | 2
  headerKey: string
  subKey: string
  state: TiersState
  group: DoctrineTierGroup | null
  projectDir: string | null
  openTab: (id: string, type: any, props?: Record<string, unknown>, title?: string) => void
}

function MemoryTier({ tier, headerKey, subKey, state, group, projectDir, openTab }: MemoryTierProps) {
  const { t } = useTranslation()

  const habit = group?.files.find((f) => f.relName === 'habit.md') ?? null
  const refs = (group?.files ?? []).filter((f) => f.relName !== 'habit.md')

  // habit inline load/save reuse the doctrine IPC directly. Save threads
  // expectedMtimeMs → the main-process mtime conflict guard returns
  // { conflict: true } on drift, which MarkdownViewer surfaces as its inline
  // conflict line (T-PATCH-200 implementation note 2: minimum mtime conflict
  // toast preserved). editable follows the tier's editable flag (note 3).
  const habitEditable = !!(habit?.editable ?? group?.editable ?? false)

  const loadHabit = useCallback((): Promise<MarkdownLoadResult> => {
    const api = (window as any).api
    if (!habit) return Promise.resolve({ ok: true, content: '', mtimeMs: null })
    if (!api?.doctrineReadFile) return Promise.resolve({ ok: false, error: 'read failed' }) // T-PATCH-213
    return Promise.resolve(api.doctrineReadFile(habit.absPath, projectDir ?? undefined)).then((res: any) =>
      res?.ok
        ? { ok: true, content: res.content ?? '', mtimeMs: res.mtimeMs ?? null }
        : { ok: false, error: res?.error ?? 'read failed' },
    )
    // habit.absPath / projectDir are the only inputs.
  }, [habit, projectDir])

  const saveHabit = useCallback<DoctrineOnSave>(
    (_p, content, expectedMtimeMs) => {
      const api = (window as any).api
      if (!habit) return Promise.resolve({ ok: false, error: 'no file' })
      return Promise.resolve(
        api.doctrineWriteFile(habit.absPath, content, expectedMtimeMs, projectDir ?? undefined),
      ).then((res: any) =>
        res?.ok
          ? { ok: true, mtimeMs: res.mtimeMs }
          : res?.conflict
            ? { ok: false, conflict: true }
            : { ok: false, error: res?.error ?? 'write failed' },
      )
    },
    [habit, projectDir],
  )

  const openRef = useCallback((f: DoctrineFileRow) => {
    openTab(
      `doctrine:${f.absPath}`,
      'doctrine-file',
      {
        tier: f.tier,
        persona: f.persona,
        absPath: f.absPath,
        relName: f.relName,
        projectDir: projectDir ?? undefined,
        editable: f.editable,
      },
      refLabel(t, f),
    )
  }, [openTab, projectDir, t])

  return (
    // T-PATCH-200 QA2 (visibility): each tier is a clearly bounded group —
    // a left rail label column (Tier N + memory-scope) + divider on the right.
    // The two columns make the Tier1/Tier2 classification unmistakable.
    <div style={tierSection}>
      {/* Left rail — fixed-width tier label column */}
      <div style={tierRail}>
        <span style={tierRailNum}>{t('workspace.team.personaDef.tierBadge', { tier })}</span>
        <span style={tierRailHeader}>{t(headerKey)}</span>
        <span style={tierRailSub}>{t(subKey)}</span>
      </div>

      {/* Right content column — habit + bookshelf */}
      <div style={tierContent}>
        {state.status === 'loading' && <div style={memoryEmpty}>{t('common.loading')}</div>}
        {state.status === 'error' && <div style={memoryEmpty}>{t('workspace.doctrine.loadError')}</div>}

        {state.status === 'done' && (
          <>
            {/* habit (습관) — comes first, labelled, then the inline preview */}
            <div style={groupSubHdr}>{t('workspace.team.personaDef.habitGroup')}</div>
            {habit && habit.exists ? (
              <div style={habitViewerWrap}>
                <MarkdownViewer
                  key={habit.absPath}
                  load={loadHabit}
                  absPath={habit.absPath}
                  relName={refLabel(t, habit)}
                  editable={habitEditable}
                  onSave={saveHabit}
                  emptyCrumb="habit"
                  stripComments
                />
              </div>
            ) : (
              <div style={memoryEmpty}>{t('workspace.team.personaDef.emptyHabit')}</div>
            )}

            {/* 책장 (bookshelf) — sub-heading groups the file-reference rows so the
                habit → bookshelf hierarchy is legible (T-PATCH-200 QA2). */}
            {refs.length > 0 && (
              <>
                <div style={bookshelfSubHdr}>{t('workspace.team.personaDef.bookshelfGroup')}</div>
                {refs.map((f) => (
                  <button
                    key={f.absPath}
                    style={memoryRow}
                    onClick={() => openRef(f)}
                    title={f.absPath}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <FileText size={13} color="#505050" />
                    <span style={memoryRowLabel}>{refLabel(t, f)}</span>
                    {f.editable
                      ? <Pencil size={11} color="#34D399" style={{ flexShrink: 0 }} />
                      : <Lock size={11} color="#707070" style={{ flexShrink: 0 }} />}
                    <ChevRight size={12} color="#505050" style={{ flexShrink: 0 }} />
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Human label for a doctrine file row: stem → label-map → localized label, else
// the filename stem itself (never the raw absolute path as the primary label).
function refLabel(t: (k: string) => string, f: DoctrineFileRow): string {
  const base = f.relName.split('/').pop() ?? f.relName
  const stem = base.replace(/\.md$/i, '')
  const key = FILE_LABEL_KEY[stem]
  return key ? t(key) : stem
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
  marginBottom: 16,
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
  minWidth: 0,
}

const personaNameRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const personaName: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: '#F0F0F0',
}

const statusChipActive: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#34D399',
  background: '#0A2A1A',
  border: '1px solid #1A3A1A',
  borderRadius: 20,
  padding: '1px 8px',
  whiteSpace: 'nowrap',
}

const statusChipIdle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  color: '#707070',
  background: 'transparent',
  border: '1px solid #1F1F1F',
  borderRadius: 20,
  padding: '1px 8px',
  whiteSpace: 'nowrap',
}

const personaRole: React.CSSProperties = {
  fontSize: 11,
  color: '#707070',
  marginTop: 2,
}

// ── Memory tier group (T-PATCH-200 QA2 visibility) ──────────────────────────
// A tier is a two-column block: a fixed left rail (tier badge + header + scope)
// and the content column (habit + bookshelf). A strong top border + the rail
// label make each tier read as a distinct, classified group.
const tierSection: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'stretch',
  borderTop: '1px solid #262626',
  paddingTop: 14,
  marginBottom: 18,
}

// Left rail — fixed-width label column, divided from the content by a right border.
const tierRail: React.CSSProperties = {
  width: 130,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  borderRight: '1px solid #1E1E1E',
  paddingRight: 14,
}

const tierRailNum: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#34D399',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const tierRailHeader: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#E0E0E0',
  lineHeight: 1.3,
}

const tierRailSub: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  color: '#606060',
  lineHeight: 1.4,
}

const tierContent: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
}

// Sub-heading inside a tier that names a group (Habits / Bookshelf).
const groupSubHdr: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#5A5A5A',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  margin: '2px 0 6px',
}

// Bookshelf sub-heading — extra top margin separates it from the habit preview
// above so the habit → bookshelf hierarchy reads cleanly.
const bookshelfSubHdr: React.CSSProperties = {
  ...groupSubHdr,
  marginTop: 6,
}

const metaSection: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 12,
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

const advancedToggle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  background: 'transparent',
  border: 'none',
  borderTop: '1px solid #1E1E1E',
  padding: '10px 0 8px',
  cursor: 'pointer',
  textAlign: 'left',
}

const advancedToggleText: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#3A3A3A',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

const specHeaderRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px 0 6px',
}

const sectionSubHdrInline: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#3A3A3A',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

// Bounded, framed box so the spec viewer's internal Preview/Edit body scrolls
// independently rather than stretching the page.
const specViewerWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: 360,
  border: '1px solid #1E1E1E',
  borderRadius: 6,
  overflow: 'hidden',
  marginBottom: 6,
}

// Inline habit preview — bounded box (shorter than the spec box; habit is the
// prime content but still scrolls in place rather than stretching the pane).
const habitViewerWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: 300,
  border: '1px solid #1E1E1E',
  borderRadius: 6,
  overflow: 'hidden',
  marginBottom: 8,
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
  padding: '6px 4px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
  borderRadius: 4,
}

const memoryRowLabel: React.CSSProperties = {
  fontSize: 12,
  color: '#C0C0C0',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const memoryEmpty: React.CSSProperties = {
  fontSize: 11,
  color: '#505050',
  padding: '6px 0',
  fontStyle: 'italic',
}
