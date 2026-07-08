import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import type { Project, Message, Phase } from '../lib/types'
import { useWorkspace } from '../store/workspace'
import type { Pane } from '../store/workspace'
import PhaseBreadcrumb from '../components/workspace/PhaseBreadcrumb'
import LeftSidebar from '../components/workspace/LeftSidebar'
import MainPanel from '../components/workspace/main/MainPanel'
import StatusBar from '../components/workspace/StatusBar'
import ActivityBar, { type ActivityIcon } from '../components/workspace/ActivityBar'
import ChatPanel from '../components/workspace/ChatPanel'
import SessionHealthBanner from '../components/workspace/SessionHealthBanner'
import PrdtHookInstallBanner from '../components/workspace/PrdtHookInstallBanner'
import RestartSessionModal from '../components/workspace/RestartSessionModal'
import PendingPromotionDrain from '../components/workspace/PendingPromotionDrain'
import QuickOpenPalette from '../components/workspace/QuickOpenPalette'
import ColumnResizeHandle from '../components/workspace/ColumnResizeHandle'
import { usePoChat } from '../store/poChat'
import { useTicketScan } from '../lib/useTicketScan'
import { bucketTicketsByPhase, isPrdtPoState, getActiveStageIndex, bridgePrdtVersion, STAGE_DEFS } from '../lib/phase-mapping'
import DeployConfirmModal from '../components/workspace/DeployConfirmModal'
import BaseDirtyModal from '../components/workspace/BaseDirtyModal'
import { useResizeLayout } from './workspace/shell/useResizeLayout'
import { useKeyboardShortcuts } from './workspace/shell/useKeyboardShortcuts'
import { useIpcSubscriptions } from './workspace/shell/useIpcSubscriptions'
import { useAutoSurfaceArtifacts } from './workspace/shell/useAutoSurfaceArtifacts'
import { grid, breadcrumbArea, sidebarResizeArea, chatResizeArea, artifactToastStyle } from './workspace/shell/styles'
import { buildQuickOpenItems, prdCandidatePaths, resolvePrdPath, type ArtifactEntry } from './workspace/shell/helpers'
import {
  ACTIVITY_BAR_WIDTH, RESIZE_HANDLE_WIDTH,
  SIDEBAR_MIN_WIDTH, CENTER_MIN_LAYOUT, PO_CHAT_MIN_WIDTH,
} from './workspace/shell/constants'

// T-PATCH-085 QA fix: sum of column minimums → below this the scroll wrapper
// triggers overflowX instead of visually crushing the grid columns.
// = ACTIVITY_BAR_WIDTH(48) + SIDEBAR_MIN_WIDTH(200) + RESIZE_HANDLE_WIDTH(4)
// + CENTER_MIN_LAYOUT(320) + RESIZE_HANDLE_WIDTH(4) + PO_CHAT_MIN_WIDTH(280) = 856
const SHELL_MIN_WIDTH =
  ACTIVITY_BAR_WIDTH + SIDEBAR_MIN_WIDTH + RESIZE_HANDLE_WIDTH +
  CENTER_MIN_LAYOUT + RESIZE_HANDLE_WIDTH + PO_CHAT_MIN_WIDTH

interface Props {
  project: Project
  onBack: () => void
}

// ── HeaderSearchBar ───────────────────────────────────────────────────────────

interface HeaderSearchBarProps {
  onClick: () => void
}

function HeaderSearchBar({ onClick }: HeaderSearchBarProps) {
  const { t } = useTranslation()
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t('workspace.quickOpen.ariaLabel')}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick()
      }}
      style={headerSearchBarStyle}
    >
      <Search size={14} color="currentColor" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, color: '#707070' }}>
        {t('workspace.quickOpen.searchHint')}
      </span>
      <kbd style={headerKbdStyle}>⌘P</kbd>
    </div>
  )
}

const headerSearchBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  maxWidth: 420,
  margin: '4px auto',
  background: '#1A1A1A',
  border: '1px solid #1F1F1F',
  borderRadius: 4,
  padding: '6px 10px',
  color: '#707070',
  cursor: 'text',
}

const headerKbdStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 10,
  color: '#A0A0A0',
  border: '1px solid #2A2A2A',
  borderRadius: 2,
  padding: '1px 4px',
  lineHeight: 1.5,
  background: '#141414',
}

// T-PATCH-013 B3: a "fresh" workspace = single empty leaf, no tabs anywhere.
// Used to tell a rehydrated pane tree (has tabs) from the initial empty state,
// so a cmd-R reload for the same project does not get treated as a switch.
function isEmptyPaneTree(root: Pane): boolean {
  if (root.type === 'leaf') return root.tabs.length === 0
  return isEmptyPaneTree(root.children[0]) && isEmptyPaneTree(root.children[1])
}

// ── WorkspaceShell ────────────────────────────────────────────────────────────

export default function WorkspaceShell({ project, onBack }: Props) {
  const { t } = useTranslation()
  const phase = useWorkspace((s) => s.phase)
  const setProject = useWorkspace((s) => s.setProject)
  const setPoState = useWorkspace((s) => s.setPoState)
  const setPoStateError = useWorkspace((s) => s.setPoStateError)
  const openTab = useWorkspace((s) => s.openTab)
  const closeTab = useWorkspace((s) => s.closeTab)
  const closePane = useWorkspace((s) => s.closePane)
  const splitRight = useWorkspace((s) => s.splitRight)
  const splitDown = useWorkspace((s) => s.splitDown)
  const addNewTab = useWorkspace((s) => s.addNewTab)
  const setActiveTab = useWorkspace((s) => s.setActiveTab)
  const messages = useWorkspace((s) => s.messages)
  const appendMessage = useWorkspace((s) => s.appendMessage)
  const streaming = useWorkspace((s) => s.streaming)
  const statusBarVisible = useWorkspace((s) => s.statusBarVisible)
  const setStatusBarVisible = useWorkspace((s) => s.setStatusBarVisible)

  const [activeIcon, setActiveIcon] = useState<ActivityIcon>('project')
  const [drainVisible, setDrainVisible] = useState(true)
  const [quickOpenVisible, setQuickOpenVisible] = useState(false)
  const [quickOpenFiles, setQuickOpenFiles] = useState<Array<{ path: string; ext: string }>>([])

  // ── New index sources (T-015 A6; tab/mcp dropped in T-PATCH-174) ──────────
  const [quickOpenArtifacts, setQuickOpenArtifacts] = useState<ArtifactEntry[]>([])

  const restartModalOpen = usePoChat((s) => s.restartModalOpen)
  const setRestartModalOpen = usePoChat((s) => s.setRestartModalOpen)

  const { shellRef, sidebarWidth, poChatWidth, activeResizeHandle, startResize } = useResizeLayout()
  useKeyboardShortcuts({ closeTab, closePane, splitRight, splitDown, addNewTab, setActiveTab })
  const { deployModalOpen, deployModalPayload, baseDirtyModal, artifactToast,
    setDeployModalOpen, setDeployModalPayload, setBaseDirtyModal } =
    useIpcSubscriptions(openTab, appendMessage, t, project.projectDir)

  const { tickets: scannedTickets } = useTicketScan(project.projectDir)

  const poStateVersion = useWorkspace((s) => s.poState?.current_version ?? null)
  // T-PATCH-175: full po-state for Quick Open prd-path resolution + version list.
  const poState = useWorkspace((s) => s.poState)
  // T-291 (adapter A8): prdt project → render the 4-stage breadcrumb + suppress the
  // legacy 5-phase institutions (gate marker, phase counters, promotion drain). A
  // legacy po-state has current_phase (never stage), so isPrdt is false and every
  // branch below falls through to the untouched legacy path.
  const isPrdt = isPrdtPoState(poState)
  // prdt uses a flat `version` string; legacy uses `current_version`.
  const displayVersion = isPrdt ? (poState?.version ?? null) : poStateVersion
  // T-PATCH-203: live close_gate slice → PhaseBreadcrumb boundary gate marker.
  // Absent (non-P3 / pre-hook) → undefined → marker graceful pass-fallback (AC-6).
  const closeGate = useWorkspace((s) => s.poState?.close_gate ?? null)
  // T-PATCH-203 follow-up §1: live pending_gate → "engaged" decision for the gate
  // marker (only show once the PO is asking to cross the boundary, vs. dormant P3).
  const pendingGate = useWorkspace((s) => s.poState?.pending_gate ?? null)

  // T-PATCH-096 §4.b: per-phase (done/total) counts, current-version scoped,
  // bucketed by ticket type → phase. Passed to PhaseBreadcrumb (presentational).
  const phaseCounts = useMemo(
    () => bucketTicketsByPhase(scannedTickets, poStateVersion),
    [scannedTickets, poStateVersion],
  )

  useAutoSurfaceArtifacts({
    projectDir: project.projectDir,
    currentVersion: poStateVersion,
    tickets: scannedTickets,
  })

  // T-PATCH-010 #3: track whether this render is a project switch so the
  // current-version tab opens after poState loads (switch only, not icon-click).
  const prevProjectDirRef = useRef<string | null>(null)
  const pendingSwitchTabRef = useRef(false)

  // ── T-PATCH-269 #14: resolved PRD path from the watcher payload (the file that
  // ACTUALLY exists, resolved in main via the shared candidate set). null = no PRD
  // yet (= not ready). This is BOTH the auto-nav gate AND the exact path #14 opens,
  // so the gate and the opened tab can never disagree (FIX-2). Seeded by the one-shot
  // read + updated by every watcher push. Layout #11 keys off current_version, not this.
  const [prdPath, setPrdPath] = useState<string | null>(null)
  // Edge-detect latch so PRD auto-nav fires ONCE per version (when the version is
  // non-null AND its PRD exists) — never on every watcher tick (no focus-steal).
  const autoNavDoneForVersionRef = useRef<string | null>(null)

  useEffect(() => {
    const prevDir = prevProjectDirRef.current
    prevProjectDirRef.current = project.projectDir

    // T-PATCH-013 B3: distinguish a genuine project switch from a cmd-R reload
    // rehydrate for the SAME project. On first mount after reload, prevDir is
    // null; if the rehydrated workspace state (sessionStorage) already belongs to
    // this projectDir AND has restored panes, this is a rehydrate — NOT a switch.
    // We must not reset panes nor auto-open a duplicate current-version tab (AC-5),
    // nor force the ActivityBar icon (B2 guard).
    const rehydrated = useWorkspace.getState()
    const isRehydrateSameProject =
      prevDir === null &&
      rehydrated.persistedProjectDir === project.projectDir &&
      !isEmptyPaneTree(rehydrated.panes)

    const isSwitch = prevDir !== project.projectDir && !isRehydrateSameProject
    if (isSwitch) {
      pendingSwitchTabRef.current = true
      // T-PATCH-269 #14: reset the auto-nav latch + prdPath on a real switch so the
      // new project re-evaluates from scratch (avoids a shared "v1" id suppressing it).
      autoNavDoneForVersionRef.current = null
      setPrdPath(null)
      // T-PATCH-013 B2: re-assert the ActivityBar 'project' icon on a real switch,
      // regardless of which icon was active before. Skipped on reload-rehydrate.
      setActiveIcon('project')
    }
    setProject(project)
  }, [project, setProject])

  useEffect(() => {
    // T-PATCH-213: browser-dev-mode (no preload bridge) → api undefined. Guard the
    // property deref so the WorkspaceShell boot path is a clean no-op (poState null)
    // instead of throwing into the ErrorBoundary.
    const api = (window as any).api
    if (!api) { setPoState(null); return }
    api.readPoState(project.projectDir)
      .then((s: unknown) => {
        // T-PATCH-167: IPC returns { ok:false, error:'parse' } when po-state.json
        // exists but is corrupt/unparseable. Surface as an explicit error instead
        // of treating it like a fresh/empty project (which masqueraded as "v1 대기 중").
        if (s && typeof s === 'object' && (s as any).ok === false && (s as any).error === 'parse') {
          setPoStateError('parse')
          pendingSwitchTabRef.current = false
          return
        }
        setPoState(s as any)
        // T-306: read version-keyed fields off the BRIDGED shape (prdt flat
        // `version` mirrored into `current_version`) — the same view the store now
        // holds after setPoState. Legacy states pass through by reference.
        const bridged = bridgePrdtVersion(s as any)
        // T-PATCH-269 #14: seed prdPath from the one-shot read so a project opened
        // while ALREADY at a ready version auto-navs on first mount (the watcher only
        // pushes on CHANGE, so it would otherwise never fire for the initial state).
        // FIX-2: probe the SAME shared candidate set as main (anchor → PRD.md →
        // versions/<v>.md) in precedence order and seed the FIRST that exists — so the
        // seed gate and the opened path agree exactly with the watcher path.
        const cv0 = bridged?.current_version
        if (cv0) {
          const candidates = prdCandidatePaths(bridged, project.projectDir)
          ;(async () => {
            for (const cand of candidates) {
              try {
                const content = await api.artifactsReadFile?.(project.projectDir, cand)
                if (content != null) { setPrdPath(cand); return }
              } catch { /* try next candidate */ }
            }
            setPrdPath(null)
          })()
        } else {
          setPrdPath(null)
        }
        // T-PATCH-010 #3: on project switch, open the new project's current-version
        // tab once after poState loads. Clear the flag so repeated setPoState calls
        // (live updates) don't re-open the tab.
        if (pendingSwitchTabRef.current) {
          pendingSwitchTabRef.current = false
          const cv = bridged?.current_version
          if (cv) {
            useWorkspace.getState().openTab(
              `ticket-review:${cv}`,
              'ticket-review',
              { versionFilter: cv },
              cv,
            )
          }
        }
      })
      .catch(() => setPoState(null))
  }, [project.projectDir, setPoState, setPoStateError])

  // ── T-PATCH-269 #15: live po-state watcher subscription ──────────────────────
  // Arm the main-process fs.watch on projectDir change; subscribe to the debounced
  // `state:poStateChanged` push. Pushes are routed through the SAME setPoState path
  // as the one-shot read above (so phase/version/breadcrumb stay in sync), and the
  // payload's prdPath (resolved in main via the shared candidate set) feeds the #14
  // auto-nav. Re-arms on projectDir change; tears down on unmount.
  useEffect(() => {
    const api = (window as any).api
    if (!api?.watchPoState) return
    api.watchPoState(project.projectDir)
    // T-PATCH-280: arm the docs/ fs-watch alongside the po-state watch (idempotent
    // per projectDir, main-side). The 'docs:changed' push it produces is consumed
    // by each open MarkdownViewer so an open doc tab auto-reloads on disk change
    // (no app restart). Tears down with the project's window-all-closed (stopDocsWatch).
    api.watchDocs?.(project.projectDir)
    const off = api.onPoStateChanged?.((payload: { projectDir: string; state: unknown; prdReady: boolean; prdPath: string | null }) => {
      // Guard against a stale push from a prior projectDir (re-arm race).
      if (payload.projectDir !== project.projectDir) return
      const s = payload.state
      if (s && typeof s === 'object' && (s as any).ok === false && (s as any).error === 'parse') {
        setPoStateError('parse')
        return
      }
      setPoState(s as any)
      setPrdPath(payload.prdPath)
    })
    return () => {
      if (typeof off === 'function') off()
      api.unwatchPoState?.()
    }
  }, [project.projectDir, setPoState, setPoStateError])

  // ── T-PATCH-269 #14: PRD auto-nav (edge-detected, per-version latch) ──────────
  // Fires ONCE per version once current_version is non-null AND its PRD exists
  // (prdPath != null). Enters the version (ticket-review tab) + opens & focuses the
  // PRD markdown tab. FIX-2: opens the EXACT prdPath that the gate resolved (a file
  // that actually exists), so the gate and the opened tab can never disagree.
  // The latch (autoNavDoneForVersionRef) keyed on version id prevents a re-fire on
  // every watcher tick — so no focus-steal regression. If the user later closes the
  // PRD tab it is NOT re-opened (latched per version). Coexists with manual nav.
  // Latch is cleared when version goes null (closed/never-set) so a re-open re-fires.
  useEffect(() => {
    const version = poStateVersion
    if (!version) {
      autoNavDoneForVersionRef.current = null
      return
    }
    if (!prdPath) return
    if (autoNavDoneForVersionRef.current === version) return
    autoNavDoneForVersionRef.current = version

    const prdName = prdPath.split('/').pop() ?? 'PRD.md'
    // Enter the version (ticket-review tab — same tab the project-switch flow opens),
    // then open + focus the PRD markdown tab as the visible top result (scene 2).
    openTab(`ticket-review:${version}`, 'ticket-review', { versionFilter: version }, version)
    openTab(`markdown:${prdPath}`, 'markdown', { path: prdPath }, prdName)
  }, [poStateVersion, prdPath, project.projectDir, openTab])

  useEffect(() => { if (!streaming) setDrainVisible(true) }, [streaming])

  // T-PATCH-091 R4: seed statusBarVisible from persisted IPC value on mount.
  // Empty deps [] — runs once per shell mount; ensures the persisted pref is
  // applied before the first render that reads statusBarVisible from the store.
  useEffect(() => {
    ;(async () => {
      try {
        const v = await (window as any).api?.getStatusBarVisible?.()
        if (typeof v === 'boolean') setStatusBarVisible(v)
      } catch { /* IPC unavailable in browser dev mode */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onQuickOpen = () => setQuickOpenVisible((v) => !v)
    window.addEventListener('productune:quick-open', onQuickOpen)
    return () => window.removeEventListener('productune:quick-open', onQuickOpen)
  }, [])

  // File list
  useEffect(() => {
    if (!quickOpenVisible) { setQuickOpenFiles([]); return }
    const api = (window as any).api
    if (!api?.listProjectFiles) return
    api.listProjectFiles(project.projectDir)
      .then((files: Array<{ path: string; ext: string }>) => setQuickOpenFiles(files))
      .catch(() => setQuickOpenFiles([]))
  }, [quickOpenVisible, project.projectDir])

  // Artifacts
  useEffect(() => {
    if (!quickOpenVisible) { setQuickOpenArtifacts([]); return }
    const api = (window as any).api
    const version = useWorkspace.getState().poState?.current_version ?? null
    api?.artifactsListScoped?.(project.projectDir, version)
      .then((entries: ArtifactEntry[]) => setQuickOpenArtifacts(entries))
      .catch(() => setQuickOpenArtifacts([]))
  }, [quickOpenVisible, project.projectDir])

  useEffect(() => {
    // T-PATCH-213: api?.-guard the deref so browser-dev-mode mount is a no-op.
    const api = (window as any).api
    const offNew = api?.onMenuNewProject?.(() => onBack())
    return () => { offNew?.() }
  }, [onBack])

  const onSelectActivity = (icon: ActivityIcon) => {
    setActiveIcon(icon)
    if (icon === 'tickets') {
      const cv = useWorkspace.getState().poState?.current_version
      cv ? openTab(`ticket-review:${cv}`, 'ticket-review', { versionFilter: cv }, cv)
         : openTab('ticket-review:board', 'ticket-review', undefined, 'Tickets')
    }
  }

  const handleRetry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    const api = (window as any).api
    api.poSendMessage?.({ projectDir: project.projectDir, text: lastUser.text,
      persona: 'prdt-po', resume: useWorkspace.getState().claudeSessionId })
  }

  // ── T-PATCH-276 (#22): clickable phase pills → open the phase's doc in a main tab.
  // PRD is the minimum mapping: open the resolved PRD markdown tab (reusing the SAME
  // openTab('markdown:…') path as the #14 auto-nav). Prefer the watcher-resolved
  // prdPath (a file known to exist); fall back to the best-guess resolver so the
  // click still works before the watcher has populated prdPath. Other phases have no
  // single canonical doc yet → not in clickablePhases (render as plain pills).
  const clickablePhases = useMemo<ReadonlySet<Phase>>(() => new Set<Phase>(['PRD']), [])

  const handlePhaseClick = (p: Phase) => {
    if (p !== 'PRD') return
    const resolved = prdPath ?? resolvePrdPath(useWorkspace.getState().poState, project.projectDir).path
    if (!resolved) return
    const prdName = resolved.split('/').pop() ?? 'PRD.md'
    openTab(`markdown:${resolved}`, 'markdown', { path: resolved }, prdName)
  }

  // T-304: legacy-only path — `.productune/logs/po-session.log` has no prdt
  // equivalent (.prdt/ carries turns.jsonl + po-state.json, no human-readable
  // session log). isPrdt gates the caller (SessionHealthBanner's onViewLog
  // prop below) so this never opens for a prdt project; kept legacy-only and
  // byte-identical here rather than branching on a path that can't resolve.
  const handleViewLog = () =>
    openTab('terminal:po-log', 'terminal', { logPath: `${project.projectDir}/.productune/logs/po-session.log` }, 'PO Log')

  const quickOpenItems = buildQuickOpenItems(
    quickOpenFiles,
    scannedTickets,
    quickOpenArtifacts,
    project.projectDir,
    openTab,
    poState,
  )

  // T-PATCH-275 (#18 correction): the shell is ALWAYS the full 4-region layout — no
  // chat-only collapse. The empty-state (no version yet) is handled INSIDE MainPanel
  // (it renders WelcomePanel), so the ActivityBar/Sidebar/StatusBar/chat all stay put
  // and the layout never restructures on version create — only MainPanel's content
  // swaps WelcomePanel ↔ pane tree.
  const dynamicGrid: React.CSSProperties = {
    ...grid,
    // T-PATCH-085 QA fix: minWidth = sum of column minimums (856 px).
    // Forces the grid element to be at least 856 px wide so that:
    //   (a) shellRef.getBoundingClientRect().width never reports < 856 → clamp
    //       functions always see enough space to protect sidebar at 200 px floor.
    //   (b) when the viewport is < 856 px, the grid overflows its scroll-wrapper
    //       and overflowX:auto on the wrapper shows a horizontal scrollbar instead
    //       of visually crushing the sidebar column.
    minWidth: SHELL_MIN_WIDTH,
    gridTemplateAreas: `
      "activity sidebar sidebarResize breadcrumb chatResize chat"
      "activity sidebar sidebarResize center     chatResize chat"
      "activity sidebar sidebarResize status     chatResize chat"
    `,
    gridTemplateColumns: `${ACTIVITY_BAR_WIDTH}px ${sidebarWidth}px ${RESIZE_HANDLE_WIDTH}px minmax(0, 1fr) ${RESIZE_HANDLE_WIDTH}px ${poChatWidth}px`,
    // T-PATCH-091 R4: collapse status row to 0 when hidden. StatusBar is wrapped
    // in overflow:hidden so it clips cleanly at 0 height with no dangling empty cell.
    // T-PATCH-173: status row 28→34px to fit the restored inline reset label.
    gridTemplateRows: statusBarVisible ? 'auto 1fr 34px' : 'auto 1fr 0px',
  }

  return (
    // Scroll wrapper: constrained to viewport width, lets the grid overflow
    // horizontally at very small windows (<856 px) → scrollbar instead of crush.
    <div style={shellScrollWrapper}>
      <div ref={shellRef} style={dynamicGrid}>
      <ActivityBar active={activeIcon} onSelect={onSelectActivity} />
      <LeftSidebar project={project} activeIcon={activeIcon} />
      <div style={sidebarResizeArea}>
        <ColumnResizeHandle active={activeResizeHandle === 'sidebar'} ariaLabel="Resize left sidebar"
          onMouseDown={(event) => startResize('sidebar', event)} />
      </div>

      <div style={breadcrumbArea}>
        {/* T-015 A6: always-visible inline header search bar */}
        <HeaderSearchBar onClick={() => setQuickOpenVisible(true)} />
        <SessionHealthBanner onRestartSession={() => setRestartModalOpen(true)}
          onRetry={handleRetry} onViewLog={isPrdt ? undefined : handleViewLog} />
        {/* T-305: prdt-hook install nudge — A6's installPrdtHooks had no call
            site until now. prdt projects only; no-ops to null once installed
            or dismissed for the session. */}
        {isPrdt && <PrdtHookInstallBanner projectDir={project.projectDir} />}
        {/* T-PATCH-096: prepend version label before the phase breadcrumb.
            T-291 (adapter A8): prdt → 4-stage strip (no gate marker / counters /
            clickable pills); legacy → the untouched 5-phase breadcrumb. */}
        {isPrdt ? (
          <PhaseBreadcrumb phase={phase} version={displayVersion}
            stages={STAGE_DEFS} activeStageIndex={getActiveStageIndex(poState)} />
        ) : (
          <PhaseBreadcrumb phase={phase} version={poStateVersion} phaseCounts={phaseCounts} closeGate={closeGate} pendingGate={pendingGate}
            onPhaseClick={handlePhaseClick} clickablePhases={clickablePhases} />
        )}
        {/* T-291 (adapter A8): promotion drain (+ its mechanical-write IPC) is a
            legacy institution — prdt promotes via wiki, so it never mounts here
            (no drain/mechanical-write IPC fired). */}
        {!isPrdt && drainVisible && project && (
          <PendingPromotionDrain projectDir={project.projectDir}
            claudeSessionId={useWorkspace.getState().claudeSessionId}
            onDone={() => setDrainVisible(false)} />
        )}
      </div>

      <MainPanel />
      {/* T-PATCH-091 R4: clip StatusBar to 0 height when the status row collapses
          to 0px — no dangling empty grid cell or visible bar remnant.
          T-PATCH-186: only clip while collapsed. When the bar is visible we need
          overflow:visible so RunSegment's upward drop-up (bottom:28, i.e. above
          this 34px cell) can escape instead of being clipped invisible. */}
      <div style={{ gridArea: 'status', overflow: statusBarVisible ? 'visible' : 'hidden' }}>
        <StatusBar onOpenHealthBanner={() => setRestartModalOpen(true)} />
      </div>
      <div style={chatResizeArea}>
        <ColumnResizeHandle active={activeResizeHandle === 'chat'} ariaLabel="Resize PO chat"
          onMouseDown={(event) => startResize('chat', event)} />
      </div>

      <ChatPanel />

      {restartModalOpen && <RestartSessionModal onClose={() => setRestartModalOpen(false)} />}

      {deployModalOpen && deployModalPayload && (
        <DeployConfirmModal
          tickets={deployModalPayload.tickets} gitRef={deployModalPayload.gitRef}
          project={deployModalPayload.project} projectDir={deployModalPayload.projectDir}
          owner={deployModalPayload.owner} repo={deployModalPayload.repo}
          branchName={deployModalPayload.branchName} ticketId={deployModalPayload.ticketId}
          ticketTitle={deployModalPayload.ticketTitle} ticketAcceptance={deployModalPayload.ticketAcceptance}
          vercelProject={deployModalPayload.vercelProject}
          onClose={() => { setDeployModalOpen(false); setDeployModalPayload(null) }}
        />
      )}

      {baseDirtyModal && (
        <BaseDirtyModal projectDir={baseDirtyModal.projectDir} ticketId={baseDirtyModal.ticketId}
          slug={baseDirtyModal.slug} type={baseDirtyModal.type}
          onClose={() => setBaseDirtyModal(null)} onSuccess={() => setBaseDirtyModal(null)} />
      )}

      {quickOpenVisible && (
        <QuickOpenPalette
          items={quickOpenItems}
          onClose={() => setQuickOpenVisible(false)}
          onPick={(item) => { item.open(); setQuickOpenVisible(false) }}
        />
      )}

      {artifactToast && <div style={artifactToastStyle}>{artifactToast}</div>}
      </div>
      {/* T-PATCH-254: QuitGuardToast moved to App top level so the guidance
          toast appears on every screen (HomeView/onboarding/workspace), not
          just the workspace. Single app-level instance owns the IPC subscription. */}
    </div>
  )
}

// Scroll wrapper that sits between the flex viewport and the grid element.
// Must be a flex container so the grid's flex:1 fills it. At window < 856 px
// the grid (minWidth:856) overflows this wrapper → overflowX:auto shows the
// horizontal scrollbar without affecting the vertical layout.
const shellScrollWrapper: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  overflowX: 'auto',
  overflowY: 'hidden',
  background: '#0F0F0F', // match grid background so scrollbar gutter is themed
}
