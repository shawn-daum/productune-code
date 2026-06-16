/**
 * store/trayBridge.ts — renderer→main tray sync (T-PATCH-177).
 *
 * The personaPresence store is the SoT for "which persona is working" and
 * useWorkspace.streaming is the SoT for "is a PO turn in progress". The menu-bar
 * Tray lives in the main process and knows neither, so this thin bridge:
 *   1. subscribes to both stores,
 *   2. computes the derived TrayStatePayload via the personaPresence selectors
 *      (single source of the sort/idle logic — no duplication),
 *   3. dedupes (only push when the payload actually changed), and
 *   4. pushes to main over window.api.trayUpdate.
 *
 * waiting = all personas idle AND streaming === false. streaming false + all
 * idle means it is the user's turn to type (PO turn ended) → red-dot badge.
 *
 * initTrayBridge() is called once from App's mount effect and returns a teardown
 * that unsubscribes both stores. Browser dev mode (no window.api) is a no-op.
 */

import { usePersonaPresence, selectActivePersona, selectAllIdle, type PersonaId } from './personaPresence'
import { useWorkspace } from './workspace'

interface TrayStatePayload {
  activePersona: PersonaId | null
  waiting: boolean
}

function computePayload(): TrayStatePayload {
  const { entries } = usePersonaPresence.getState()
  const streaming = useWorkspace.getState().streaming
  const activePersona = selectActivePersona(entries)
  const waiting = activePersona === null && selectAllIdle(entries) && !streaming
  return { activePersona, waiting }
}

let lastKey: string | null = null

function pushIfChanged(): void {
  const api = (window as any).api
  if (!api?.trayUpdate) return // browser dev mode — no IPC bridge
  const payload = computePayload()
  const key = `${payload.activePersona ?? '-'}|${payload.waiting ? 'w' : '-'}`
  if (key === lastKey) return // dedupe — identical to the last push
  lastKey = key
  try {
    api.trayUpdate(payload)
  } catch {
    /* IPC unavailable mid-teardown — ignore */
  }
}

/**
 * Wire the two store subscriptions and push the initial snapshot. Returns a
 * teardown that unsubscribes both. Idempotent-safe to call once per App mount.
 */
export function initTrayBridge(): () => void {
  // Reset dedupe so a remount (HMR / StrictMode) re-emits the current state once.
  lastKey = null
  const unsubPresence = usePersonaPresence.subscribe(pushIfChanged)
  const unsubWorkspace = useWorkspace.subscribe(pushIfChanged)
  // Emit the current state immediately so the tray reflects reality at boot.
  pushIfChanged()
  return () => {
    unsubPresence()
    unsubWorkspace()
  }
}
