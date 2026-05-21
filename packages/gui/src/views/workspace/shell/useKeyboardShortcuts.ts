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
}

export function useKeyboardShortcuts(params: KeyboardShortcutsParams): void {
  const { closeTab, closePane, splitRight, splitDown, addNewTab } = params
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
      if (key === 't') {
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
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearChord()
    }
  }, [closeTab, closePane, splitRight, splitDown, addNewTab])
}
