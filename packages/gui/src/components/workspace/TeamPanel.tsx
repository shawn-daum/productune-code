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

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown, Lock, Pencil } from 'lucide-react'
import type { PoState } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'
import { PERSONA_COLORS } from '../../store/personaPresence'

// ── Static persona definitions ───────────────────────────────────────────────

type PersonaKey = 'po' | 'designer' | 'dev' | 'qa'

// Runtime persona-key → doctrine directory name. The doctrine:listTiers IPC
// (T-PATCH-019) keys off the *directory* name and only whitelists `developer`
// (not `dev`); the landed preload + ipc explicitly document the caller as the
// owner of this key→dir mapping. AC-7 of T-PATCH-021 frames the IPC as the
// mapping owner, but the shipped T-019 does NOT map — so the single source of
// truth lives here, kept to one line. (Divergence noted to PO.)
const PERSONA_DIR: Record<PersonaKey, string> = {
  po: 'po',
  designer: 'designer',
  dev: 'developer',
  qa: 'qa',
}

interface PersonaDef {
  key: PersonaKey
  id: 'pdt-po' | 'pdt-designer' | 'pdt-developer' | 'pdt-qa'
  initial: string
  nameKey: string
  roleKey: string
}

// modelSummary intentionally removed (T-PATCH-024): routing.md decides model ×
// effort dynamically per task complexity (L1–L7); there is no fixed per-persona
// model, so the old flat row label was doctrinally false.
const PERSONAS: PersonaDef[] = [
  { key: 'po',       id: 'pdt-po',        initial: 'P', nameKey: 'workspace.team.persona.po.name',       roleKey: 'workspace.team.persona.po.role'       },
  { key: 'designer', id: 'pdt-designer',   initial: 'D', nameKey: 'workspace.team.persona.designer.name',  roleKey: 'workspace.team.persona.designer.role'  },
  { key: 'dev',      id: 'pdt-developer',  initial: 'D', nameKey: 'workspace.team.persona.developer.name', roleKey: 'workspace.team.persona.developer.role' },
  { key: 'qa',       id: 'pdt-qa',         initial: 'Q', nameKey: 'workspace.team.persona.qa.name',        roleKey: 'workspace.team.persona.qa.role'        },
]

// ── Persona row ───────────────────────────────────────────────────────────────

interface PersonaRowProps {
  def: PersonaDef
  isActive: boolean
  expanded: boolean
  onClick: () => void
  onToggle: () => void
}

function PersonaRow({ def, isActive, expanded, onClick, onToggle }: PersonaRowProps) {
  const { t } = useTranslation()
  const color = PERSONA_COLORS[def.key]
  const Chevron = expanded ? ChevronDown : ChevronRight

  // The chevron is a distinct hit-target (not a nested <button>, which is
  // invalid HTML) — a <span role="button"> that stops propagation so the row's
  // main click still routes to persona-def (AC-9).
  const handleChevron = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggle()
  }

  return (
    <div
      style={personaRowStyle}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      title={`${def.id} — click to open definition`}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#1A1A1A' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      {/* Expand/collapse chevron — toggles the tier tree only (AC-1, AC-9) */}
      <span
        style={chevronHit}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={handleChevron}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle() } }}
        title={expanded ? 'Collapse tiers' : 'Expand tiers'}
      >
        <Chevron size={13} strokeWidth={2} color="#707070" />
      </span>

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
    </div>
  )
}

// ── Per-persona doctrine tier tree (T-PATCH-021) ──────────────────────────────
// Owns its own expand/fetch/cache state so TeamPanel stays lean. Mounted only
// while the persona is expanded; fetches once on first mount and caches in
// local state (AC-2). Re-collapse unmounts it; the parent keeps the expanded
// flag, but to honor "re-expand does not refetch" we keep this mounted (hidden)
// once it has been opened — see TeamPanel.openOnce tracking.

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

type TreeState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; tiers: DoctrineTierGroup[] }

const TIER_LABEL_KEY: Record<Tier, string> = {
  0: 'workspace.doctrine.tierT0',
  1: 'workspace.doctrine.tierT1',
  2: 'workspace.doctrine.tierT2',
}

interface PersonaDoctrineTreeProps {
  personaKey: PersonaKey
  projectDir: string | null
  onOpenFile: (file: DoctrineFileRow) => void
}

function PersonaDoctrineTree({ personaKey, projectDir, onOpenFile }: PersonaDoctrineTreeProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<TreeState>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    const dir = PERSONA_DIR[personaKey]
    ;(window as any).api
      .doctrineListTiers(dir, projectDir ?? '')
      .then((res: ListTiersResult) => {
        if (!alive) return
        if (res?.ok && Array.isArray(res.tiers)) setState({ status: 'done', tiers: res.tiers })
        else setState({ status: 'error' })
      })
      .catch(() => { if (alive) setState({ status: 'error' }) })
    return () => { alive = false }
    // Fetch once per (persona, projectDir). personaKey is fixed for the tree's
    // lifetime; projectDir change (project switch) legitimately refetches.
  }, [personaKey, projectDir])

  if (state.status === 'loading') {
    return <div style={treeWrap}><div style={mutedRow}>{t('common.loading')}</div></div>
  }
  if (state.status === 'error') {
    return <div style={treeWrap}><div style={mutedRow}>{t('workspace.doctrine.loadError')}</div></div>
  }

  return (
    <div style={treeWrap}>
      {state.tiers.map((group, i) => (
        // Hairline divider between tier groups (not before the first) so T0 /
        // T1 / T2 read as three separated sections inside the drawer box
        // (T-PATCH-023). Border color matches the existing #1E1E1E dividers.
        <div key={group.tier} style={i > 0 ? tierGroupDivided : undefined}>
          {/* Tier header: label + lock (T0) / pencil (T1/T2) glyph */}
          <div style={tierHeader}>
            <span style={tierHeaderText}>{t(TIER_LABEL_KEY[group.tier])}</span>
            {group.editable
              ? <Pencil size={11} strokeWidth={2} color="#34D399" />
              : <Lock size={11} strokeWidth={2} color="#707070" />}
          </div>
          <TierFiles group={group} onOpenFile={onOpenFile} />
        </div>
      ))}
    </div>
  )
}

// Files for one tier: habit.md first, then a `bookshelf/` sub-label + indented
// bookshelf entries. Empty tier → muted emptyTier row; missing habit.md →
// muted, non-clickable missingHabit row.
function TierFiles({ group, onOpenFile }: { group: DoctrineTierGroup; onOpenFile: (f: DoctrineFileRow) => void }) {
  const { t } = useTranslation()

  const habit = group.files.find((f) => f.relName === 'habit.md')
  const bookshelf = group.files.filter((f) => f.relName !== 'habit.md')

  // A tier with no habit row and no bookshelf at all (root unresolved, e.g. T1
  // with no open project) renders the emptyTier muted state.
  if (!habit && bookshelf.length === 0) {
    return <div style={mutedRow}>{t('workspace.doctrine.emptyTier')}</div>
  }

  return (
    <>
      {habit && (
        habit.exists
          ? <FileRowBtn file={habit} onOpenFile={onOpenFile} />
          : <div style={mutedRowFile} title={habit.absPath}>{t('workspace.doctrine.missingHabit')}</div>
      )}
      {bookshelf.length > 0 && (
        <>
          <div style={bookshelfLabel}>{t('workspace.doctrine.bookshelfLabel')}</div>
          {bookshelf.map((f) => (
            <FileRowBtn key={f.absPath} file={f} indented onOpenFile={onOpenFile} />
          ))}
        </>
      )}
    </>
  )
}

function FileRowBtn({ file, indented, onOpenFile }: { file: DoctrineFileRow; indented?: boolean; onOpenFile: (f: DoctrineFileRow) => void }) {
  const basename = file.relName.split('/').pop() ?? file.relName
  return (
    <button
      style={indented ? fileRowBtnIndented : fileRowBtn}
      onClick={() => onOpenFile(file)}
      title={file.absPath}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
    >
      <span style={fileRowText}>{basename}</span>
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
  const projectDir = useWorkspace((s) => s.project?.projectDir ?? null)
  const [now, setNow] = useState(Date.now())

  // Per-persona doctrine-tree expand state (AC-1). `expanded` drives visibility;
  // `opened` tracks which trees have ever been mounted so re-expand reuses the
  // already-fetched/cached child instead of refetching (AC-2). The tree stays
  // mounted (hidden) once opened to preserve its internal cache.
  const [expanded, setExpanded] = useState<Set<PersonaKey>>(new Set())
  const [opened, setOpened] = useState<Set<PersonaKey>>(new Set())

  const toggleExpand = useCallback((key: PersonaKey) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setOpened((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))
  }, [])

  // File row click → doctrine-file tab. Stable id keyed by absolute path,
  // matching the T-PATCH-020 prop contract { tier, persona, absPath, relName,
  // projectDir, editable }. projectDir is threaded for the T-019 T1 whitelist.
  const handleOpenDoctrineFile = useCallback((file: DoctrineFileRow) => {
    openTab(
      `doctrine:${file.absPath}`,
      'doctrine-file',
      {
        tier: file.tier,
        persona: file.persona,
        absPath: file.absPath,
        relName: file.relName,
        projectDir: projectDir ?? undefined,
        editable: file.editable,
      },
      file.relName.split('/').pop() ?? file.relName,
    )
  }, [openTab, projectDir])

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

  // Persona row click → persona-def tab. Canonical tab id + prop shape uses the
  // full `pdt-*` id (def.id) so this coalesces with the search-palette open path
  // (helpers.ts: `persona-def:${slug}`, { persona: slug }). T-PATCH-014.
  // Title omitted (T-PATCH-035): defaultTitle('persona-def') is the single
  // canonical source (localized persona name) — both entry points now resolve to
  // the SAME tab title, so the deduped tab no longer flips name by entry point.
  const handlePersonaClick = (def: PersonaDef) => {
    openTab(
      `persona-def:${def.id}`,
      'persona-def',
      { persona: def.id },
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
          <div key={def.id}>
            <PersonaRow
              def={def}
              isActive={isPersonaActive(def.id)}
              expanded={expanded.has(def.key)}
              onClick={() => handlePersonaClick(def)}
              onToggle={() => toggleExpand(def.key)}
            />
            {/* Mounted once opened, hidden (not unmounted) on re-collapse so the
                tree's fetched/cached tiers survive without a refetch (AC-2). */}
            {opened.has(def.key) && (
              <div style={{ display: expanded.has(def.key) ? 'block' : 'none' }}>
                {/* Dark inset "drawer" box visually contains the expanded tier
                    tree, distinguishing it from the persona list around it
                    (T-PATCH-023). Styling only — no behavior change. */}
                <div style={drawerBox}>
                  <PersonaDoctrineTree
                    personaKey={def.key}
                    projectDir={projectDir}
                    onOpenFile={handleOpenDoctrineFile}
                  />
                </div>
              </div>
            )}
          </div>
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

// Nav row button (Skills + MCP)
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

// ── Doctrine tier tree (T-PATCH-021) ──────────────────────────────────────────

const chevronHit: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 24,
  flexShrink: 0,
  cursor: 'pointer',
}

// Dark inset "drawer" that contains the expanded tier tree — a notch darker
// than the panel bg (#141414) with subtle inset padding + rounded corners and a
// hairline border, so the expanded area reads as a contained region (T-PATCH-023).
const drawerBox: React.CSSProperties = {
  background: '#0D0D0D',
  border: '1px solid #1E1E1E',
  borderRadius: 6,
  margin: '2px 8px 6px',
  padding: '2px 0',
}

// Hairline rule separating each tier group from the previous one inside the
// drawer box (T-PATCH-023). Matches the existing #1E1E1E divider tone.
const tierGroupDivided: React.CSSProperties = {
  borderTop: '1px solid #1E1E1E',
  marginTop: 2,
  paddingTop: 2,
}

const treeWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  paddingBottom: 4,
}

const tierHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  // Indent under the persona row (chevron 14 + gap 6 ≈ avatar start).
  padding: '4px 8px 2px 28px',
}

const tierHeaderText: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#606060',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  userSelect: 'none',
  flex: 1,
}

const bookshelfLabel: React.CSSProperties = {
  fontSize: 10,
  color: '#505050',
  padding: '2px 8px 1px 36px',
  userSelect: 'none',
}

const fileRowBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  padding: '3px 8px 3px 36px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background 0.1s',
}

const fileRowBtnIndented: React.CSSProperties = {
  ...fileRowBtn,
  paddingLeft: 48,
}

const fileRowText: React.CSSProperties = {
  fontSize: 11,
  color: '#C0C0C0',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

// Muted nav text per AC-6/AC-8 (#606060, 11px).
const mutedRow: React.CSSProperties = {
  fontSize: 11,
  color: '#606060',
  padding: '3px 8px 3px 28px',
  userSelect: 'none',
}

const mutedRowFile: React.CSSProperties = {
  ...mutedRow,
  paddingLeft: 36,
}


