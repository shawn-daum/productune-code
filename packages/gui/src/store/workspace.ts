import { create } from 'zustand'
import type { Project, Phase, PoState, Message } from '../lib/types'
import { PHASE_NAMES } from '../lib/types'

// ── Pane tree types (T-P4-046) ──────────────────────────────────────────────

export type TabType =
  | 'markdown'
  | 'version-detail'
  | 'ticket-review'
  | 'design-gate'
  | 'qa-result'
  | 'persona-def'
  | 'env-view'
  | 'skill-matrix'
  | 'preview'
  | 'terminal'
  | 'browser'

export interface Tab {
  id: string
  type: TabType
  title: string
  props?: Record<string, unknown>
}

export interface LeafPaneNode {
  type: 'leaf'
  paneId: string
  tabs: Tab[]
  activeTabId: string | null
}

export interface BoxPaneNode {
  type: 'hbox' | 'vbox'
  children: [Pane, Pane]
  ratio: number  // 0..1; left/top child fraction
}

export type Pane = LeafPaneNode | BoxPaneNode

export type DragHint =
  | null
  | { kind: 'tab-before'; paneId: string; tabId: string }
  | { kind: 'tab-after'; paneId: string; tabId: string }
  | { kind: 'bar-end'; paneId: string }
  | { kind: 'pane-zone'; paneId: string; zone: 'top' | 'right' | 'bottom' | 'left' | 'center' }

export type DropTarget =
  | { kind: 'tab-before' | 'tab-after'; paneId: string; refTabId: string }
  | { kind: 'bar-end'; paneId: string }
  | { kind: 'pane-zone'; paneId: string; zone: 'top' | 'right' | 'bottom' | 'left' | 'center' }

interface WorkspaceState {
  project: Project | null
  poState: PoState | null
  phase: Phase
  selectedVersionId: string | null

  // ── PO session slice ────────────────────────────────────
  messages: Message[]
  claudeSessionId: string | null
  streaming: boolean

  // ── Pane tree slice (T-P4-046) ─────────────────────────
  panes: Pane
  activePaneId: string
  nextPaneSeq: number
  dragHint: DragHint

  setProject: (p: Project | null) => void
  setPoState: (s: PoState | null) => void
  setSelectedVersionId: (id: string | null) => void
  setMessages: (messages: Message[]) => void
  appendMessage: (message: Message) => void
  appendToLastMessage: (textChunk: string) => void
  setClaudeSessionId: (id: string | null) => void
  setStreaming: (streaming: boolean) => void
  resetSession: () => void

  // pane tree ops
  openTab: (tabId: string, type: TabType, props?: Record<string, unknown>, title?: string) => void
  addNewTab: (paneId: string) => void
  closeTab: (paneId: string, tabId: string) => void
  setActiveTab: (paneId: string, tabId: string) => void
  setActivePane: (paneId: string) => void
  splitRight: (paneId: string) => void
  splitDown: (paneId: string) => void
  closePane: (paneId: string) => void
  moveTab: (fromPaneId: string, tabId: string, target: DropTarget) => void
  setPaneRatio: (path: number[], ratio: number) => void
  setDragHint: (hint: DragHint) => void
}

function derivePhase(poState: PoState | null): Phase {
  const num = poState?.current_phase
  if (typeof num === 'number' && num in PHASE_NAMES) return PHASE_NAMES[num]
  return 'PRD'
}

function makeEmptyLeaf(paneId: string): LeafPaneNode {
  return { type: 'leaf', paneId, tabs: [], activeTabId: null }
}

// ── Pane tree pure helpers ──────────────────────────────────────────────────

function findLeaf(root: Pane, paneId: string): LeafPaneNode | null {
  if (root.type === 'leaf') return root.paneId === paneId ? root : null
  return findLeaf(root.children[0], paneId) ?? findLeaf(root.children[1], paneId)
}

function collectLeafIds(root: Pane, out: string[] = []): string[] {
  if (root.type === 'leaf') {
    out.push(root.paneId)
    return out
  }
  collectLeafIds(root.children[0], out)
  collectLeafIds(root.children[1], out)
  return out
}

function firstLeaf(root: Pane): LeafPaneNode {
  if (root.type === 'leaf') return root
  return firstLeaf(root.children[0])
}

/** Map every leaf in the tree via fn; structurally clones boxes. */
function mapLeaves(root: Pane, fn: (l: LeafPaneNode) => Pane): Pane {
  if (root.type === 'leaf') return fn(root)
  const left = mapLeaves(root.children[0], fn)
  const right = mapLeaves(root.children[1], fn)
  if (left === root.children[0] && right === root.children[1]) return root
  return { ...root, children: [left, right] }
}

/** Replace the pane matching paneId via fn (returning new pane). */
function replaceLeaf(root: Pane, paneId: string, fn: (l: LeafPaneNode) => Pane): Pane {
  if (root.type === 'leaf') {
    return root.paneId === paneId ? fn(root) : root
  }
  const left = replaceLeaf(root.children[0], paneId, fn)
  const right = replaceLeaf(root.children[1], paneId, fn)
  if (left === root.children[0] && right === root.children[1]) return root
  return { ...root, children: [left, right] }
}

/**
 * Remove the leaf with paneId; collapse parent box (the sibling becomes the
 * parent's slot). Returns the new tree and the tabs that were on the removed
 * leaf (caller decides where to merge them — usually into the adjacent leaf).
 *
 * If the root is the leaf being removed, returns null tree (caller resets).
 */
function removeLeaf(root: Pane, paneId: string): { tree: Pane | null; removedTabs: Tab[]; removedActive: string | null; siblingLeafId: string | null } {
  if (root.type === 'leaf') {
    if (root.paneId === paneId) return { tree: null, removedTabs: root.tabs, removedActive: root.activeTabId, siblingLeafId: null }
    return { tree: root, removedTabs: [], removedActive: null, siblingLeafId: null }
  }
  // Direct child match → return sibling
  const [c0, c1] = root.children
  if (c0.type === 'leaf' && c0.paneId === paneId) {
    return { tree: c1, removedTabs: c0.tabs, removedActive: c0.activeTabId, siblingLeafId: firstLeaf(c1).paneId }
  }
  if (c1.type === 'leaf' && c1.paneId === paneId) {
    return { tree: c0, removedTabs: c1.tabs, removedActive: c1.activeTabId, siblingLeafId: firstLeaf(c0).paneId }
  }
  // Recurse
  const r0 = removeLeaf(c0, paneId)
  if (r0.tree !== c0) {
    if (r0.tree === null) {
      // shouldn't happen — child was a box, now null only if recursive removed it entirely
      return { tree: c1, removedTabs: r0.removedTabs, removedActive: r0.removedActive, siblingLeafId: firstLeaf(c1).paneId }
    }
    return { tree: { ...root, children: [r0.tree, c1] }, removedTabs: r0.removedTabs, removedActive: r0.removedActive, siblingLeafId: r0.siblingLeafId }
  }
  const r1 = removeLeaf(c1, paneId)
  if (r1.tree !== c1) {
    if (r1.tree === null) {
      return { tree: c0, removedTabs: r1.removedTabs, removedActive: r1.removedActive, siblingLeafId: firstLeaf(c0).paneId }
    }
    return { tree: { ...root, children: [c0, r1.tree] }, removedTabs: r1.removedTabs, removedActive: r1.removedActive, siblingLeafId: r1.siblingLeafId }
  }
  return { tree: root, removedTabs: [], removedActive: null, siblingLeafId: null }
}

/** Append to leaf's tabs with dedupe (id collision → activate existing). */
function appendTabToLeaf(leaf: LeafPaneNode, tab: Tab): LeafPaneNode {
  const existing = leaf.tabs.find((t) => t.id === tab.id)
  if (existing) return { ...leaf, activeTabId: existing.id }
  return { ...leaf, tabs: [...leaf.tabs, tab], activeTabId: tab.id }
}

function setRatioAtPath(root: Pane, path: number[], ratio: number): Pane {
  if (path.length === 0) {
    if (root.type === 'leaf') return root
    return { ...root, ratio }
  }
  if (root.type === 'leaf') return root
  const [head, ...rest] = path
  const idx = head === 0 ? 0 : 1
  const replaced = setRatioAtPath(root.children[idx], rest, ratio)
  if (replaced === root.children[idx]) return root
  const children: [Pane, Pane] = idx === 0 ? [replaced, root.children[1]] : [root.children[0], replaced]
  return { ...root, children }
}

// Path used by ResizeHandle: returns the path from root to a *box* whose ratio
// directly controls a given leaf's split. Used by ResizeHandle component when
// it computes a path at render time. We don't store paths; we walk on demand.

// ── Store ───────────────────────────────────────────────────────────────────

const INIT_PANE_ID = 'pane-1'

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  project: null,
  poState: null,
  phase: 'PRD',
  selectedVersionId: null,
  messages: [],
  claudeSessionId: null,
  streaming: false,

  panes: makeEmptyLeaf(INIT_PANE_ID),
  activePaneId: INIT_PANE_ID,
  nextPaneSeq: 2,
  dragHint: null,

  setProject: (project) => set({ project }),

  setPoState: (poState) => {
    set({ poState, phase: derivePhase(poState) })
  },

  setSelectedVersionId: (selectedVersionId) => set({ selectedVersionId }),

  setMessages: (messages) => set({ messages }),

  appendMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),

  appendToLastMessage: (textChunk) =>
    set((s) => {
      if (s.messages.length === 0) return s
      const last = s.messages[s.messages.length - 1]
      const updated = { ...last, text: last.text + textChunk }
      return { messages: [...s.messages.slice(0, -1), updated] }
    }),

  setClaudeSessionId: (claudeSessionId) => set({ claudeSessionId }),

  setStreaming: (streaming) => set({ streaming }),

  resetSession: () => set({ messages: [], claudeSessionId: null, streaming: false }),

  // ── pane tree ops ──────────────────────────────────────────────────────────

  openTab: (tabId, type, props, title) => {
    set((s) => {
      // dedupe globally — if any pane already has this tab id, focus it instead.
      const leafIds = collectLeafIds(s.panes)
      for (const pid of leafIds) {
        const leaf = findLeaf(s.panes, pid)
        if (leaf && leaf.tabs.some((t) => t.id === tabId)) {
          return {
            ...s,
            activePaneId: pid,
            panes: replaceLeaf(s.panes, pid, (l) => ({ ...l, activeTabId: tabId })),
          }
        }
      }
      const targetPaneId = leafIds.includes(s.activePaneId) ? s.activePaneId : leafIds[0]
      const newTab: Tab = { id: tabId, type, title: title ?? defaultTitle(type, props), props }
      return {
        ...s,
        panes: replaceLeaf(s.panes, targetPaneId, (l) => appendTabToLeaf(l, newTab)),
        activePaneId: targetPaneId,
      }
    })
  },

  addNewTab: (paneId) => {
    set((s) => {
      const tabId = `new-tab:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const newTab: Tab = { id: tabId, type: 'markdown', title: 'Untitled' }
      const targetPaneId = collectLeafIds(s.panes).includes(paneId) ? paneId : s.activePaneId
      return {
        ...s,
        panes: replaceLeaf(s.panes, targetPaneId, (l) => appendTabToLeaf(l, newTab)),
        activePaneId: targetPaneId,
      }
    })
  },

  closeTab: (paneId, tabId) => {
    set((s) => ({
      ...s,
      panes: replaceLeaf(s.panes, paneId, (l) => {
        const idx = l.tabs.findIndex((t) => t.id === tabId)
        if (idx < 0) return l
        const tabs = l.tabs.filter((t) => t.id !== tabId)
        let activeTabId: string | null = l.activeTabId
        if (l.activeTabId === tabId) {
          activeTabId = tabs.length > 0 ? tabs[Math.min(idx, tabs.length - 1)].id : null
        }
        return { ...l, tabs, activeTabId }
      }),
    }))
  },

  setActiveTab: (paneId, tabId) => {
    set((s) => ({
      ...s,
      activePaneId: paneId,
      panes: replaceLeaf(s.panes, paneId, (l) => ({ ...l, activeTabId: tabId })),
    }))
  },

  setActivePane: (paneId) => set({ activePaneId: paneId }),

  splitRight: (paneId) => {
    set((s) => {
      const newId = `pane-${s.nextPaneSeq}`
      return {
        ...s,
        nextPaneSeq: s.nextPaneSeq + 1,
        panes: replaceLeaf(s.panes, paneId, (l) => ({
          type: 'hbox',
          ratio: 0.5,
          children: [l, makeEmptyLeaf(newId)],
        })),
        activePaneId: newId,
      }
    })
  },

  splitDown: (paneId) => {
    set((s) => {
      const newId = `pane-${s.nextPaneSeq}`
      return {
        ...s,
        nextPaneSeq: s.nextPaneSeq + 1,
        panes: replaceLeaf(s.panes, paneId, (l) => ({
          type: 'vbox',
          ratio: 0.5,
          children: [l, makeEmptyLeaf(newId)],
        })),
        activePaneId: newId,
      }
    })
  },

  closePane: (paneId) => {
    set((s) => {
      const removed = removeLeaf(s.panes, paneId)
      // Edge: only one pane existed → reset to fresh init
      if (!removed.tree) {
        const fresh = makeEmptyLeaf(`pane-${s.nextPaneSeq}`)
        return {
          ...s,
          panes: fresh,
          activePaneId: fresh.paneId,
          nextPaneSeq: s.nextPaneSeq + 1,
        }
      }
      // Merge removed tabs into sibling leaf if any
      let tree = removed.tree
      let nextActive = s.activePaneId === paneId ? removed.siblingLeafId ?? firstLeaf(tree).paneId : s.activePaneId
      if (removed.removedTabs.length > 0 && removed.siblingLeafId) {
        tree = replaceLeaf(tree, removed.siblingLeafId, (l) => {
          let merged = l
          for (const t of removed.removedTabs) merged = appendTabToLeaf(merged, t)
          if (removed.removedActive) merged = { ...merged, activeTabId: removed.removedActive }
          return merged
        })
      }
      // ensure activePaneId still exists
      if (!collectLeafIds(tree).includes(nextActive)) nextActive = firstLeaf(tree).paneId
      return { ...s, panes: tree, activePaneId: nextActive }
    })
  },

  moveTab: (fromPaneId, tabId, target) => {
    set((s) => {
      const fromLeaf = findLeaf(s.panes, fromPaneId)
      if (!fromLeaf) return s
      const movingTab = fromLeaf.tabs.find((t) => t.id === tabId)
      if (!movingTab) return s

      // Helper: remove tab from origin leaf
      const removeFromOrigin = (root: Pane): Pane =>
        replaceLeaf(root, fromPaneId, (l) => {
          const tabs = l.tabs.filter((t) => t.id !== tabId)
          let activeTabId: string | null = l.activeTabId
          if (l.activeTabId === tabId) {
            const idx = l.tabs.findIndex((t) => t.id === tabId)
            activeTabId = tabs.length > 0 ? tabs[Math.min(idx, tabs.length - 1)].id : null
          }
          return { ...l, tabs, activeTabId }
        })

      let tree = s.panes

      if (target.kind === 'tab-before' || target.kind === 'tab-after') {
        // No-op: dropping onto self-position in same pane
        if (target.paneId === fromPaneId && target.refTabId === tabId) return s
        tree = removeFromOrigin(tree)
        tree = replaceLeaf(tree, target.paneId, (l) => {
          const refIdx = l.tabs.findIndex((t) => t.id === target.refTabId)
          if (refIdx < 0) return appendTabToLeaf(l, movingTab)
          const insertIdx = target.kind === 'tab-before' ? refIdx : refIdx + 1
          const tabs = [...l.tabs.slice(0, insertIdx), movingTab, ...l.tabs.slice(insertIdx)]
          return { ...l, tabs, activeTabId: movingTab.id }
        })
        return { ...s, panes: tree, activePaneId: target.paneId, dragHint: null }
      }

      if (target.kind === 'bar-end') {
        if (target.paneId === fromPaneId) {
          // move to end of same pane
          tree = replaceLeaf(tree, fromPaneId, (l) => {
            const tabs = [...l.tabs.filter((t) => t.id !== tabId), movingTab]
            return { ...l, tabs, activeTabId: movingTab.id }
          })
        } else {
          tree = removeFromOrigin(tree)
          tree = replaceLeaf(tree, target.paneId, (l) => appendTabToLeaf(l, movingTab))
        }
        return { ...s, panes: tree, activePaneId: target.paneId, dragHint: null }
      }

      // pane-zone
      if (target.kind !== 'pane-zone') return s  // exhaustiveness narrow
      const { paneId: targetPaneId, zone } = target
      if (zone === 'center') {
        if (targetPaneId === fromPaneId) return { ...s, dragHint: null }
        tree = removeFromOrigin(tree)
        tree = replaceLeaf(tree, targetPaneId, (l) => appendTabToLeaf(l, movingTab))
        return { ...s, panes: tree, activePaneId: targetPaneId, dragHint: null }
      }

      // edge zones — split target pane and move tab into the new pane
      const newId = `pane-${s.nextPaneSeq}`
      const nextSeq = s.nextPaneSeq + 1
      // Remove from origin first; if origin == target leaf, removing cleans the
      // tab off, but the leaf is then split — and the tab is added to the new
      // pane. If origin is a different leaf, this works straightforwardly.
      tree = removeFromOrigin(tree)
      // Re-locate target leaf in case removeFromOrigin collapsed it (only
      // possible if origin had been emptied, but we don't auto-collapse leaves;
      // they can stay empty). So target should still be present.
      const targetStillPresent = !!findLeaf(tree, targetPaneId)
      if (!targetStillPresent) return s
      const newLeaf: LeafPaneNode = { type: 'leaf', paneId: newId, tabs: [movingTab], activeTabId: movingTab.id }
      tree = replaceLeaf(tree, targetPaneId, (l) => {
        const axis = zone === 'top' || zone === 'bottom' ? 'vbox' : 'hbox'
        const insertFirst = zone === 'top' || zone === 'left'
        const children: [Pane, Pane] = insertFirst ? [newLeaf, l] : [l, newLeaf]
        return { type: axis, ratio: 0.5, children }
      })
      return { ...s, panes: tree, activePaneId: newId, nextPaneSeq: nextSeq, dragHint: null }
    })
  },

  setPaneRatio: (path, ratio) => {
    const clamped = Math.min(0.95, Math.max(0.05, ratio))
    set((s) => ({ ...s, panes: setRatioAtPath(s.panes, path, clamped) }))
  },

  setDragHint: (dragHint) => set({ dragHint }),
}))

function defaultTitle(type: TabType, props?: Record<string, unknown>): string {
  switch (type) {
    case 'markdown':       return (props?.title as string) ?? 'Markdown'
    case 'version-detail': return (props?.versionId as string) ?? 'Version'
    case 'ticket-review':  return (props?.ticketId as string) ?? 'Tickets'
    case 'design-gate':    return 'Design Gate'
    case 'qa-result':      return 'QA'
    case 'persona-def':    return (props?.persona as string) ?? 'Persona'
    case 'env-view':       return (props?.layer as string) ?? 'Env'
    case 'skill-matrix':   return 'Skills'
    case 'preview':        return 'Preview'
    case 'terminal':       return 'Terminal'
    case 'browser':        return 'Browser'
    default:               return type
  }
}

// ── Exposed pure helpers (used by components) ──────────────────────────────

export const paneTreeUtil = {
  findLeaf,
  collectLeafIds,
  firstLeaf,
}
