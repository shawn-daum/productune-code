import type { Pane, LeafPaneNode, Tab, TabType } from '../../../store/workspace'
import { useWorkspace } from '../../../store/workspace'
import type { Ticket, Message, PromotionPayload, PoState } from '../../../lib/types'
import type { QuickOpenItem } from '../../../components/workspace/QuickOpenPalette'
import { personaIdFromAgentType } from '../../../store/personaPresence'
import { isPrdtPoState } from '../../../lib/phase-mapping'
import {
  SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH,
  PO_CHAT_MIN_WIDTH, PO_CHAT_MAX_WIDTH,
  ACTIVITY_BAR_WIDTH, RESIZE_HANDLE_WIDTH, CENTER_MIN_LAYOUT,
} from './constants'

/**
 * Canonical ticket-detail tab id, namespaced by (version, id) to avoid
 * cross-version ticket_id collisions (T-PATCH-111). When `version` is
 * truthy the id is `ticket-detail:<version>/<id>`; otherwise it falls back
 * to the legacy `ticket-detail:<id>` so version-less/legacy tickets behave
 * exactly as before. All three openTab call sites (QuickOpen, Version
 * History TicketCard, Ticket Dashboard) MUST use this helper so the same
 * (version, id) dedup-focuses to the same tab regardless of entry point.
 */
export function ticketDetailTabId(version: string | null | undefined, id: string): string {
  return version ? `ticket-detail:${version}/${id}` : `ticket-detail:${id}`
}

export function readStoredWidth(key: string, defaultWidth: number, min: number, max: number): number {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return defaultWidth
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      return defaultWidth
    }
    return parsed
  } catch {
    return defaultWidth
  }
}

export function persistWidth(key: string, width: number): void {
  try {
    window.localStorage.setItem(key, String(Math.round(width)))
  } catch {
    // ignore storage failures
  }
}

// T-026: chat is always visible — chat budget is always deducted.
// T-PATCH-085: use CENTER_MIN_LAYOUT (320) here, not CENTER_MIN_WIDTH (480).
// This lowers the sidebar-protection threshold from 1016 px → 856 px.
export function clampSidebarWidth(
  requestedWidth: number,
  shellWidth: number,
  poChatWidth: number,
): number {
  const availableMax = shellWidth
    - ACTIVITY_BAR_WIDTH
    - RESIZE_HANDLE_WIDTH
    - CENTER_MIN_LAYOUT        // was CENTER_MIN_WIDTH (480) — T-PATCH-085
    - RESIZE_HANDLE_WIDTH
    - poChatWidth

  return clampPanelWidth(requestedWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, availableMax)
}

export function clampPoChatWidth(
  requestedWidth: number,
  shellWidth: number,
  sidebarWidth: number,
): number {
  const availableMax = shellWidth
    - ACTIVITY_BAR_WIDTH
    - RESIZE_HANDLE_WIDTH
    - sidebarWidth
    - RESIZE_HANDLE_WIDTH
    - CENTER_MIN_LAYOUT        // was CENTER_MIN_WIDTH (480) — T-PATCH-085

  return clampPanelWidth(requestedWidth, PO_CHAT_MIN_WIDTH, PO_CHAT_MAX_WIDTH, availableMax)
}

export function clampPanelWidth(requestedWidth: number, min: number, max: number, availableMax: number): number {
  const boundedMax = Math.min(max, availableMax)
  if (boundedMax <= 0) return 0
  // T-PATCH-085 QA fix: hard floor — return min when space is tight.
  // The shell grid's minWidth ensures the container never reports < sum-of-mins,
  // so this path only fires at truly extreme sizes (<856 px window) where the
  // scroll wrapper (overflowX:auto) kicks in instead of visual column crush.
  if (boundedMax < min) return min
  return clamp(requestedWidth, min, boundedMax)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function fileBasename(p: string): string {
  return p.split('/').pop() ?? p
}

export function findLeafByIdLocal(root: Pane, paneId: string): LeafPaneNode | null {
  if (root.type === 'leaf') return root.paneId === paneId ? root : null
  return findLeafByIdLocal(root.children[0], paneId) ?? findLeafByIdLocal(root.children[1], paneId)
}

/**
 * Decide whether a changed file should auto-open and which tab type to use.
 * Returns null to skip (src/**, scripts/**, lock files).
 */
export function artifactOpenType(filePath: string): 'markdown' | 'qa-result' | null {
  if (/^docs\/(design|tickets|qa)\/.*\.md$/.test(filePath)) return 'markdown'
  if (/\.(spec|test)\.ts$/.test(filePath)) return 'qa-result'
  return null
}

/**
 * Collect all open tabs from the pane tree into a flat array.
 */
export function collectAllTabs(root: Pane): Tab[] {
  const tabs: Tab[] = []
  function walk(node: Pane): void {
    if (node.type === 'leaf') {
      tabs.push(...node.tabs)
    } else {
      walk(node.children[0])
      walk(node.children[1])
    }
  }
  walk(root)
  return tabs
}

/**
 * Find the paneId of the leaf that contains the given tabId.
 * Returns null if not found.
 */
export function findPaneOwningTab(root: Pane, tabId: string): string | null {
  if (root.type === 'leaf') {
    return root.tabs.some((t) => t.id === tabId) ? root.paneId : null
  }
  return findPaneOwningTab(root.children[0], tabId) ?? findPaneOwningTab(root.children[1], tabId)
}

// ── Types for new index sources ────────────────────────────────────────────────

export interface McpServerEntry {
  name: string
  config: {
    type?: 'stdio' | 'sse' | 'http'
    command?: string
    args?: string[]
    url?: string
    env?: Record<string, string>
  }
  source: 'productune' | 'local' | 'project' | 'managed' | 'plugin'
  connected?: boolean
  editable: boolean
}

export interface ArtifactEntry {
  relPath: string
  absPath: string
  ext: string
  scopeGroup: 'prd' | 'artifacts' | 'designer'
}

// ── Constants ──────────────────────────────────────────────────────────────────

const FILE_EXT_WHITELIST = new Set(['.md', '.json', '.html', '.txt'])
// Canonical 4 productune persona ids (single source for the palette).
// `pdt-wiki-keeper` was abolished in the doctrine redesign (T-017) — do not add it back.
const PERSONAS = ['pdt-po', 'pdt-designer', 'pdt-developer', 'pdt-qa'] as const

// Ext → TabType for artifacts
function extToTabType(ext: string): TabType {
  if (ext === '.html') return 'browser'
  if (ext === '.md') return 'artifact-md'
  if (ext === '.json') return 'artifact-json'
  return 'artifact-mermaid'
}

function extToBadge(ext: string): string {
  if (ext === '.html') return 'html'
  if (ext === '.md') return 'md'
  if (ext === '.json') return 'json'
  return 'mmd'
}

// ── T-PATCH-110: DEV-ONLY promotion card 렌더 확인용 ─────────────────────────────
// Builds a volatile 'promotion-candidate' Message that mirrors the shape produced by
// poEvents.ts `poOnPromotionCandidate` (kind/role/status/payload). Used only by the
// dev QuickOpen commands below so the classic PromotionCard (origin 'auto') and the
// PromotionQuestionCard (origin 'user-requested') can be rendered on demand without a
// backend emit. No IPC/persist — see makeSamplePromotionMessage's call site.
function makeSamplePromotionMessage(origin: 'auto' | 'user-requested'): Message {
  const payload: PromotionPayload = {
    candidateSummary: 'QA smoke 실행 전 dev server 준비 상태를 항상 확인한다',
    targetTier: 'global',
    sourceTicketId: 'T-PATCH-110',
    rationale: '여러 프로젝트에서 반복된 패턴 — global habit 으로 승격 검토',
    origin,
  }
  return {
    id: `dev-promo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: 'assistant',
    kind: 'promotion-candidate',
    text: '',
    status: 'done',
    payload,
    created_at: new Date().toISOString(),
  }
}

/**
 * T-PATCH-269 FIX-2: the SHARED PRD candidate set (absolute paths, precedence
 * order) — the renderer twin of main's `prdCandidatePaths` (electron/ipc/state.ts).
 * The #14 one-shot seed resolves through THIS list (probe + first-exists) so the
 * auto-nav gate and the opened path agree: anchor → master PRD.md → versions/<v>.md.
 * Returns [] when there's no current_version.
 */
export function prdCandidatePaths(poState: PoState | null, projectDir: string): string[] {
  // T-306: prdt keeps ONE living PRD at docs/prd/PRD.md — no prd_anchor, no
  // per-version snapshots (docs/prd/versions/ does not exist). Single candidate.
  if (isPrdtPoState(poState)) return [`${projectDir}/docs/prd/PRD.md`]
  const currentVersionId = poState?.current_version
  if (!currentVersionId) return []
  const out: string[] = []
  const currentVersion = poState?.versions?.find((v) => v.id === currentVersionId)
  const anchor = currentVersion?.prd_anchor?.trim()
  if (anchor) {
    out.push(anchor.startsWith('/') ? anchor : `${projectDir}/${anchor.replace(/^\.?\//, '')}`)
  }
  out.push(`${projectDir}/docs/prd/PRD.md`)
  out.push(`${projectDir}/docs/prd/versions/${currentVersionId}.md`)
  return out
}

/**
 * Resolve the PRD document path for the Cmd+P `prd` command (T-PATCH-175).
 * Source precedence: the current version's `prd_anchor` (po-state) → fallback
 * `docs/prd/PRD.md`. Relative anchors are resolved against `projectDir`; an
 * already-absolute anchor (leading `/`) is passed through unchanged. The
 * returned `source` tells the caller which branch fired (for self-check/notes).
 */
export function resolvePrdPath(
  poState: PoState | null,
  projectDir: string,
): { path: string; source: 'prd_anchor' | 'fallback' } {
  const currentVersion = poState?.versions?.find((v) => v.id === poState?.current_version)
  const anchor = currentVersion?.prd_anchor?.trim()
  if (anchor) {
    const path = anchor.startsWith('/') ? anchor : `${projectDir}/${anchor.replace(/^\.?\//, '')}`
    return { path, source: 'prd_anchor' }
  }
  return { path: `${projectDir}/docs/prd/PRD.md`, source: 'fallback' }
}

/** Build Quick Open palette items from files + tickets + artifacts + personas + prd + versions. */
export function buildQuickOpenItems(
  quickOpenFiles: Array<{ path: string; ext: string }>,
  scannedTickets: Ticket[],
  artifactEntries: ArtifactEntry[],
  projectDir: string,
  openTab: (tabId: string, type: TabType, meta?: Record<string, unknown>, label?: string) => void,
  poState: PoState | null,
): QuickOpenItem[] {
  const items: QuickOpenItem[] = []

  // ── PRD command (T-PATCH-175) — opens the current-version PRD in the markdown ──
  // viewer. Single item, high priority, surfaced by typing `prd`. Reuses the same
  // `markdown:<path>` openTab pattern as file items so it dedup-focuses identically.
  {
    const { path: prdPath } = resolvePrdPath(poState, projectDir)
    const prdName = fileBasename(prdPath)
    items.push({
      id: `prd:${prdPath}`,
      source: 'prd',
      category: 'prd',
      label: 'PRD',
      sublabel: prdName,
      priority: 90,
      open: () => openTab(`markdown:${prdPath}`, 'markdown', { path: prdPath }, prdName),
    })
  }

  // ── Version items (T-PATCH-175, `v:` prefix) ──
  // Selecting the current version focuses the current project workspace
  // (`ticket-review:<cv>` — same tab the project-switch flow opens). A past
  // version opens its VersionDetailView (`version-detail:<id>`), matching the
  // VersionsPanel routing so both entry points dedup-focus the same tab.
  {
    const currentVersionId = poState?.current_version
    for (const v of poState?.versions ?? []) {
      const isCurrent = v.id === currentVersionId
      items.push({
        id: `version:${v.id}`,
        source: 'version',
        category: 'versions',
        label: v.id,
        sublabel: isCurrent ? 'current' : (v.ended_at ? v.ended_at.slice(0, 10) : 'past'),
        priority: isCurrent ? 85 : 65,
        open: () =>
          isCurrent
            ? openTab(`ticket-review:${v.id}`, 'ticket-review', { versionFilter: v.id }, v.id)
            : openTab(`version-detail:${v.id}`, 'version-detail', { versionId: v.id }, v.id),
      })
    }
  }

  // ── File items (no headline category — stays as 'file' source, non-sectioned) ──
  for (const f of quickOpenFiles) {
    if (!FILE_EXT_WHITELIST.has(f.ext)) continue
    const name = fileBasename(f.path)
    const relPath = f.path.startsWith(projectDir)
      ? f.path.slice(projectDir.length).replace(/^\//, '')
      : f.path
    const priority = f.ext === '.md' ? (name.toLowerCase().includes('prd') ? 80 : 60) : 50
    items.push({
      id: `file:${f.path}`,
      source: 'file',
      label: name,
      sublabel: relPath,
      priority,
      open: () => openTab(`markdown:${f.path}`, 'markdown', { path: f.path }, name),
    })
  }

  // ── Ticket items ──
  for (const tk of scannedTickets) {
    const isClosed = tk.status === 'done' || tk.status === 'abandoned'
    const sublabel = [tk.version ?? '', tk.status].filter(Boolean).join(' · ')
    items.push({
      // Item id namespaced by version so the same ticket_id in two versions
      // yields distinct React keys (T-PATCH-111). '∅' marks version-less.
      id: `ticket:${tk.version ?? '∅'}/${tk.ticket_id}`,
      source: 'ticket',
      category: 'tickets',
      label: tk.ticket_id + (tk.title ? ` — ${tk.title}` : ''),
      sublabel,
      meta: {
        statusPill: tk.status,
      },
      priority: isClosed ? 40 : 70,
      open: () =>
        openTab(
          ticketDetailTabId(tk.version, tk.ticket_id),
          'ticket-detail',
          { ticketId: tk.ticket_id, version: tk.version ?? null },
          tk.ticket_id,
        ),
    })
  }

  // ── Tab / MCP items removed (T-PATCH-174) — tab:/s:/mcp: Cmd+P commands dropped. ──

  // ── Artifact items ──
  for (const entry of artifactEntries) {
    const tabType = extToTabType(entry.ext)
    const badge = extToBadge(entry.ext)
    const name = entry.relPath.split('/').pop() ?? entry.relPath
    items.push({
      id: `artifact:${entry.relPath}`,
      source: 'artifact',
      category: 'artifacts',
      label: name,
      sublabel: entry.relPath,
      meta: { typeBadge: badge },
      priority: 55,
      open: () => {
        const props =
          tabType === 'browser'
            ? { url: `file://${entry.absPath}` }
            : {
                absPath: entry.absPath,
                relPath: entry.relPath,
                projectDir: entry.absPath.replace(`/${entry.relPath}`, ''),
              }
        openTab(`artifact:${entry.relPath}`, tabType, props, name)
      },
    })
  }

  // ── Persona items ──
  for (const slug of PERSONAS) {
    // Full id (pdt-developer) → PersonaPresence dot key (dev) via the T-148 single
    // source. PersonaDefTab is keyed by the full `pdt-*` id, so we pass `persona: slug`
    // (the id) directly. slug ∈ PERSONAS (all known pdt-* ids) so lookup never misses;
    // guard the null branch only for type-safety.
    const dotKey = personaIdFromAgentType(slug)
    if (!dotKey) continue
    items.push({
      id: `persona:${slug}`,
      source: 'persona',
      category: 'personas',
      label: slug,
      sublabel: 'persona',
      meta: { personaDot: dotKey },
      priority: 30,
      // Title omitted: defaultTitle('persona-def') is the single canonical source
      // (localized persona name) so this coalesces 1:1 with the Team-panel open
      // path and the deduped tab shows one stable name. T-PATCH-035.
      open: () => openTab(`persona-def:${slug}`, 'persona-def', { persona: slug }),
    })
  }

  // ── T-PATCH-110: DEV-ONLY promotion card 렌더 확인용. 제거 시 이 블록만 삭제. ──
  // import.meta.env.DEV 가드 → prod 번들에선 dead-code 로 제거되어 노출 0 (A4).
  // "Dev:" label prefix 로 dev 빌드 내에서도 명확히 구분. priority 10 → personas(30)
  // 아래, QuickOpen 하단에 위치(A5). append 만 하고 resolve IPC 는 미연동 — approve/
  // reject(또는 question) 인터랙션은 외형/분기 확인용이며 실제 commit 은 안 됨(A6).
  // 휘발성: appendMessage(store) 만 호출, api.chatAppendMessage 안 함 → reload 시 사라짐.
  if (import.meta.env.DEV) {
    items.push({
      id: 'dev:promo-auto',
      source: 'artifact',
      category: 'artifacts',
      label: 'Dev: sample promotion card (auto)',
      sublabel: 'classic PromotionCard · origin: auto',
      priority: 10,
      open: () => useWorkspace.getState().appendMessage(makeSamplePromotionMessage('auto')),
    })
    items.push({
      id: 'dev:promo-user',
      source: 'artifact',
      category: 'artifacts',
      label: 'Dev: sample promotion card (user-requested)',
      sublabel: 'PromotionQuestionCard · origin: user-requested',
      priority: 10,
      open: () => useWorkspace.getState().appendMessage(makeSamplePromotionMessage('user-requested')),
    })
  }

  return items
}
