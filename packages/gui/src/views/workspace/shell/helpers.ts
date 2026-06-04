import type { Pane, LeafPaneNode, Tab, TabType } from '../../../store/workspace'
import { useWorkspace } from '../../../store/workspace'
import type { Ticket } from '../../../lib/types'
import type { QuickOpenItem } from '../../../components/workspace/QuickOpenPalette'
import {
  SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH,
  PO_CHAT_MIN_WIDTH, PO_CHAT_MAX_WIDTH,
  ACTIVITY_BAR_WIDTH, RESIZE_HANDLE_WIDTH, CENTER_MIN_WIDTH,
} from './constants'

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

export function clampSidebarWidth(
  requestedWidth: number,
  shellWidth: number,
  poChatWidth: number,
  chatPanelVisible: boolean,
): number {
  const availableMax = shellWidth
    - ACTIVITY_BAR_WIDTH
    - RESIZE_HANDLE_WIDTH
    - CENTER_MIN_WIDTH
    - (chatPanelVisible ? RESIZE_HANDLE_WIDTH + poChatWidth : 0)

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
    - CENTER_MIN_WIDTH

  return clampPanelWidth(requestedWidth, PO_CHAT_MIN_WIDTH, PO_CHAT_MAX_WIDTH, availableMax)
}

export function clampPanelWidth(requestedWidth: number, min: number, max: number, availableMax: number): number {
  const boundedMax = Math.min(max, availableMax)
  if (boundedMax <= 0) return 0
  if (boundedMax < min) return clamp(requestedWidth, 0, boundedMax)
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
  source: 'productune' | 'local' | 'project'
  connected?: boolean
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
  return 'artifact-mermaid'
}

function extToBadge(ext: string): string {
  if (ext === '.html') return 'html'
  if (ext === '.md') return 'md'
  return 'mmd'
}

/** Build Quick Open palette items from files + tickets + tabs + MCP + artifacts + personas. */
export function buildQuickOpenItems(
  quickOpenFiles: Array<{ path: string; ext: string }>,
  scannedTickets: Ticket[],
  openTabs: Tab[],
  mcpServers: McpServerEntry[],
  artifactEntries: ArtifactEntry[],
  projectDir: string,
  openTab: (tabId: string, type: TabType, meta?: Record<string, unknown>, label?: string) => void,
): QuickOpenItem[] {
  const items: QuickOpenItem[] = []

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
      id: `ticket:${tk.ticket_id}`,
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
          `ticket-detail:${tk.ticket_id}`,
          'ticket-detail',
          { ticketId: tk.ticket_id },
          tk.ticket_id,
        ),
    })
  }

  // ── Tab items ──
  for (const tab of openTabs) {
    items.push({
      id: `tab:${tab.id}`,
      source: 'tab',
      category: 'tabs',
      label: tab.title,
      sublabel: tab.type,
      meta: { typeBadge: 'open' },
      priority: 65,
      open: () => {
        const s = useWorkspace.getState()
        const ownerPaneId = findPaneOwningTab(s.panes, tab.id)
        if (ownerPaneId) {
          s.setActiveTab(ownerPaneId, tab.id)
        } else {
          // tab was closed — re-open with its last known type/props
          openTab(tab.id, tab.type, tab.props, tab.title)
        }
      },
    })
  }

  // ── MCP server items ──
  for (const server of mcpServers) {
    items.push({
      id: `mcp:${server.name}`,
      source: 'mcp',
      category: 'mcp',
      label: server.name,
      sublabel: server.connected ? 'connected' : 'disconnected',
      meta: { connectionDot: server.connected ? 'on' : 'off' },
      priority: 50,
      open: () =>
        openTab('mcp-servers', 'mcp-servers', { serverId: server.name }, 'MCP Servers'),
    })
  }

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
    // Full id (pdt-developer) → PersonaPresence dot key (dev). PersonaDefTab is
    // keyed by the full `pdt-*` id, so we pass `persona: slug` (the id) directly.
    const bare = slug.replace('pdt-', '')
    const dotKey: 'po' | 'designer' | 'dev' | 'qa' = bare === 'developer' ? 'dev' : (bare as 'po' | 'designer' | 'qa')
    items.push({
      id: `persona:${slug}`,
      source: 'persona',
      category: 'personas',
      label: slug,
      sublabel: 'persona',
      meta: { personaDot: dotKey },
      priority: 30,
      open: () => openTab(`persona-def:${slug}`, 'persona-def', { persona: slug }, slug),
    })
  }

  return items
}
