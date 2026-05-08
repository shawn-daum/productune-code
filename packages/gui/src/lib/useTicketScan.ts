/**
 * useTicketScan — fs-scan ticket md files as the canonical ticket list.
 *
 * v2 doctrine sub-f: po-state.json `past_tickets[]` is removed. Ticket md
 * (`docs/tickets/<version>/T-NNN.md`) = single source of truth. GUI consumers
 * (`VersionDetailView`, `TicketDashboardView`) call this hook instead of
 * reading `poState.past_tickets`.
 *
 * Implementation note: scan is performed in the main process via the
 * `scanTickets` IPC. fs-watch on `docs/tickets/**` invalidates the cache;
 * 500 ms debounce avoids flicker during PO mechanical sed bursts.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import type { Ticket } from './types'

interface State {
  tickets: Ticket[]
  loading: boolean
  error: string | null
}

export function useTicketScan(projectDir: string | null): {
  tickets: Ticket[]
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const [state, setState] = useState<State>({ tickets: [], loading: false, error: null })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doScan = useCallback(async () => {
    if (!projectDir) {
      setState({ tickets: [], loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const api = (window as any).api
      if (!api?.scanTickets) {
        // IPC not available (older preload) — return empty silently.
        setState({ tickets: [], loading: false, error: null })
        return
      }
      const tickets: Ticket[] = await api.scanTickets(projectDir)
      // Tolerate v1 shape (`stage` field) by aliasing into `type`.
      const normalized = tickets.map((t) => ({
        ...t,
        type: t.type ?? t.stage,
      }))
      setState({ tickets: normalized, loading: false, error: null })
    } catch (e: any) {
      setState({ tickets: [], loading: false, error: e?.message ?? 'scan failed' })
    }
  }, [projectDir])

  const refresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(doScan, 0)
  }, [doScan])

  // Initial + projectDir change scan.
  useEffect(() => {
    doScan()
  }, [doScan])

  // Subscribe to fs-watcher events (debounce 500ms per sub-f §8 OQ-5).
  useEffect(() => {
    const api = (window as any).api
    if (!api?.onTicketsChanged || !projectDir) return
    const unsub = api.onTicketsChanged((dir: string) => {
      if (dir !== projectDir) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(doScan, 500)
    })
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      unsub?.()
    }
  }, [doScan, projectDir])

  return { tickets: state.tickets, loading: state.loading, error: state.error, refresh }
}
