import { useRef, useEffect } from 'react'
import { useWorkspace } from '../../../store/workspace'
import { findLeafByIdLocal } from './helpers'
import { CHORD_TIMEOUT_MS } from './constants'

interface KeyboardShortcutsParams {
  closeTab: (paneId: string, tabId: string) => void
  closePane: (paneId: string) => void
  splitRight: (paneId: string) => void
  splitDown: (paneId: string) => void
  addNewTab: (paneId: string) => void
  setActiveTab: (paneId: string, tabId: string) => void
}

export function useKeyboardShortcuts(params: KeyboardShortcutsParams): void {
  const { closeTab, closePane, splitRight, splitDown, addNewTab, setActiveTab } = params
  const chordRef = useRef<{ kind: 'cmd-k'; timer: number } | null>(null)

  useEffect(() => {
    const isModifier = (e: KeyboardEvent) => e.metaKey || e.ctrlKey
    const targetIsEditable = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return false
      const tag = t.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || (t as HTMLElement).isContentEditable
    }

    const clearChord = () => {
      if (chordRef.current) {
        window.clearTimeout(chordRef.current.timer)
        chordRef.current = null
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isModifier(e)) return
      if (targetIsEditable(e) && e.key !== 'w' && e.key !== '\\') {
        if (!(e.key === 'p' || e.key === 'k' || e.key.toLowerCase() === 't')) return
        if (targetIsEditable(e)) return
      }
      const key = e.key.toLowerCase()

      // Chord pending — Cmd+K then Cmd+\ → split down
      if (chordRef.current?.kind === 'cmd-k') {
        if (key === '\\') {
          e.preventDefault()
          const { activePaneId } = useWorkspace.getState()
          splitDown(activePaneId)
          clearChord()
          return
        }
        clearChord()
      }

      if (key === 'w') {
        e.preventDefault()
        const s = useWorkspace.getState()
        const leaf = findLeafByIdLocal(s.panes, s.activePaneId)
        if (leaf && leaf.tabs.length > 0 && leaf.activeTabId) {
          closeTab(s.activePaneId, leaf.activeTabId)
        } else {
          closePane(s.activePaneId)
        }
        return
      }
      if (key === '\\') {
        e.preventDefault()
        const { activePaneId } = useWorkspace.getState()
        splitRight(activePaneId)
        return
      }
      // T-PATCH-196: guard !e.shiftKey so ⌘⇧T (reopen) does NOT also fire
      // addNewTab here. Without the guard, key='T'.toLowerCase()==='t' matches
      // both ⌘T and ⌘⇧T, causing a spurious blank tab to open on reopen.
      // ⌘⇧T reopen is handled exclusively via the menu:reopen-tab IPC path below.
      if (key === 't' && !e.shiftKey) {
        e.preventDefault()
        const { activePaneId } = useWorkspace.getState()
        addNewTab(activePaneId)
        return
      }
      if (key === 'k') {
        e.preventDefault()
        clearChord()
        const timer = window.setTimeout(clearChord, CHORD_TIMEOUT_MS)
        chordRef.current = { kind: 'cmd-k', timer }
        return
      }
      if (key === 'p') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('productune:quick-open'))
        return
      }

      // cmd+1 ~ cmd+9: jump to Nth tab in active leaf
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= 9) {
        e.preventDefault()
        const s = useWorkspace.getState()
        const leaf = findLeafByIdLocal(s.panes, s.activePaneId)
        if (leaf && leaf.tabs.length >= n) {
          setActiveTab(s.activePaneId, leaf.tabs[n - 1].id)
        }
        // no-op if leaf has fewer than n tabs
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearChord()
    }
  }, [closeTab, closePane, splitRight, splitDown, addNewTab, setActiveTab])

  // T-PATCH-066 R4: menu accelerator IPC subscriptions.
  // Menu accelerators fire window-wide even when focus is inside the sandboxed
  // OOPIF iframe — the proven mechanism (same path as cmd+F / menu:find).
  // before-input-event path removed; each channel calls the SAME action as the
  // keydown handler above. Editable-focus guard mirrors the keyboard path.
  //
  // T-PATCH-196 (STRIKE-2 fix): app-level nav shortcuts (⌘⇧T reopen, ⌃Tab cycle,
  // ⌘[/⌘] nav) are NOT text-editing keys and MUST fire even when the URL bar
  // <input> has focus. The old broad isEditable() guard was over-broad — it
  // treated "URL input is focused" the same as "user is typing text", which is
  // wrong: a focused input is just the active element; it doesn't mean the
  // shortcut should be suppressed.
  //
  // Guard policy after this fix:
  //   • Text-editing-sensitive shortcuts (⌘T new tab, ⌘W close, ⌘\ split,
  //     ⌘P quick-open, ⌘K chord, ⌘1-9 goto-tab): keep isEditable() guard —
  //     these would interrupt or confuse text editing if fired mid-type.
  //   • ⌘⇧T reopen: NO guard — pure tab management, harmless during typing.
  //   • ⌃Tab / ⌃⇧Tab cycle: guard on IME composition ONLY (composingRef).
  //     The isEditable() guard was added to prevent ⌃Tab from interfering with
  //     Korean/CJK IME mid-composition (keyCode 229 / isComposing). But a merely-
  //     focused input is not mid-composition; we track actual composition via
  //     compositionstart / compositionend events on the window.
  useEffect(() => {
    const api = (window as any).api
    if (!api) return

    // Track active IME composition — only used by onMenuCycleTab guard.
    // compositionstart fires when the user begins a CJK/Korean syllable;
    // compositionend fires when they commit or cancel it. We must not cycle
    // tabs mid-syllable (the ⌃Tab key is part of the IME selection UI then).
    const composingRef = { current: false }
    const onCompositionStart = () => { composingRef.current = true }
    const onCompositionEnd   = () => { composingRef.current = false }
    window.addEventListener('compositionstart', onCompositionStart)
    window.addEventListener('compositionend',   onCompositionEnd)

    const isEditable = (): boolean => {
      const ae = document.activeElement
      return !!(
        ae &&
        ((ae as HTMLElement).tagName === 'INPUT' ||
          (ae as HTMLElement).tagName === 'TEXTAREA' ||
          (ae as HTMLElement).isContentEditable)
      )
    }

    const subs: Array<(() => void) | undefined> = []

    if (api.onMenuNewTab) {
      subs.push(
        api.onMenuNewTab(() => {
          if (isEditable()) return
          const { activePaneId } = useWorkspace.getState()
          addNewTab(activePaneId)
        }),
      )
    }

    if (api.onMenuCloseTab) {
      subs.push(
        api.onMenuCloseTab(() => {
          if (isEditable()) return
          const s = useWorkspace.getState()
          const leaf = findLeafByIdLocal(s.panes, s.activePaneId)
          if (leaf && leaf.tabs.length > 0 && leaf.activeTabId) {
            closeTab(s.activePaneId, leaf.activeTabId)
          } else {
            closePane(s.activePaneId)
          }
        }),
      )
    }

    if (api.onMenuSplitRight) {
      subs.push(
        api.onMenuSplitRight(() => {
          if (isEditable()) return
          const { activePaneId } = useWorkspace.getState()
          splitRight(activePaneId)
        }),
      )
    }

    if (api.onMenuQuickOpen) {
      subs.push(
        api.onMenuQuickOpen(() => {
          if (isEditable()) return
          window.dispatchEvent(new CustomEvent('productune:quick-open'))
        }),
      )
    }

    if (api.onMenuGotoTab) {
      subs.push(
        api.onMenuGotoTab((index: number) => {
          if (isEditable()) return
          const s = useWorkspace.getState()
          const leaf = findLeafByIdLocal(s.panes, s.activePaneId)
          if (leaf && leaf.tabs.length >= index) {
            setActiveTab(s.activePaneId, leaf.tabs[index - 1].id)
          }
        }),
      )
    }

    // T-PATCH-196: ⌘⇧T — reopen last closed browser tab.
    // NO isEditable() guard: reopen is pure tab management; it must work even
    // when the URL bar <input> has focus. A user may have just typed a URL,
    // pressed Enter, then immediately want to reopen a previous tab.
    if (api.onMenuReopenTab) {
      subs.push(
        api.onMenuReopenTab(() => {
          useWorkspace.getState().reopenLastClosedTab()
        }),
      )
    }

    // T-PATCH-196: ⌃Tab / ⌃⇧Tab — cycle next/prev tab in active pane.
    // Guard: IME composition ONLY (composingRef). Do NOT guard on isEditable()
    // — the URL bar being focused is not a reason to suppress tab cycling.
    // Only suppress when the user is mid-IME-syllable (composingRef.current),
    // because ⌃Tab is part of the Korean/CJK candidate-selection UI then.
    if (api.onMenuCycleTab) {
      subs.push(
        api.onMenuCycleTab((dir: 1 | -1) => {
          if (composingRef.current) return
          const s = useWorkspace.getState()
          const leaf = findLeafByIdLocal(s.panes, s.activePaneId)
          if (!leaf || leaf.tabs.length <= 1) return
          const currentIdx = leaf.activeTabId
            ? leaf.tabs.findIndex((t) => t.id === leaf.activeTabId)
            : 0
          const nextIdx = (currentIdx + dir + leaf.tabs.length) % leaf.tabs.length
          setActiveTab(s.activePaneId, leaf.tabs[nextIdx].id)
        }),
      )
    }

    return () => {
      window.removeEventListener('compositionstart', onCompositionStart)
      window.removeEventListener('compositionend',   onCompositionEnd)
      subs.forEach((fn) => fn?.())
    }
  }, [closeTab, closePane, splitRight, addNewTab, setActiveTab])
}
