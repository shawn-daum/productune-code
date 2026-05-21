import type { Pane, LeafPaneNode, TabType } from '../../../store/workspace'
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

const FILE_EXT_WHITELIST = new Set(['.md', '.json', '.html', '.txt'])
const PERSONAS = ['pdt-po', 'pdt-designer', 'pdt-developer', 'pdt-qa', 'pdt-wiki-keeper']

/** Build Quick Open palette items from files + tickets + personas. */
export function buildQuickOpenItems(
  quickOpenFiles: Array<{ path: string; ext: string }>,
  scannedTickets: Ticket[],
  projectDir: string,
  openTab: (tabId: string, type: TabType, meta?: Record<string, unknown>, label?: string) => void,
): QuickOpenItem[] {
  const items: QuickOpenItem[] = []

  for (const f of quickOpenFiles) {
    if (!FILE_EXT_WHITELIST.has(f.ext)) continue
    const name = fileBasename(f.path)
    const relPath = f.path.startsWith(projectDir)
      ? f.path.slice(projectDir.length).replace(/^\//, '')
      : f.path
    const priority = f.ext === '.md' ? (name.toLowerCase().includes('prd') ? 80 : 60) : 50
    items.push({ id: `file:${f.path}`, source: 'file', label: name, sublabel: relPath, priority,
      open: () => openTab(`markdown:${f.path}`, 'markdown', { path: f.path }, name) })
  }

  for (const tk of scannedTickets) {
    const isClosed = tk.status === 'done' || tk.status === 'abandoned'
    const sublabel = [tk.version ?? '', tk.status].filter(Boolean).join(' · ')
    items.push({ id: `ticket:${tk.ticket_id}`, source: 'ticket',
      label: tk.ticket_id + (tk.title ? ` — ${tk.title}` : ''), sublabel,
      priority: isClosed ? 40 : 70,
      open: () => openTab(`ticket-review:${tk.ticket_id}`, 'ticket-review', { ticketId: tk.ticket_id }, tk.ticket_id) })
  }

  for (const slug of PERSONAS) {
    items.push({ id: `persona:${slug}`, source: 'persona', label: slug, sublabel: 'persona', priority: 30,
      open: () => openTab(`persona-def:${slug}`, 'persona-def', { personaSlug: slug }, slug) })
  }

  return items
}
