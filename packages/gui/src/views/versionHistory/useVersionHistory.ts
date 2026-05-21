import { useState, useMemo, useEffect, useReducer, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Ticket } from '../../lib/types'
import { useWorkspace } from '../../store/workspace'
import { useTicketScan } from '../../lib/useTicketScan'
import { filterReducer, loadPersonaFilter } from './filterReducer'
import { ticketDateKey, toDateStr, dateInRange, personaMatchesFilter } from './helpers'
import type { FilterState, FilterAction, FetchedDeployEvent, CardItem } from './types'

export interface VersionHistoryData {
  selectedVersionId: string | null
  versionLabel: string
  subtitle: string
  filter: FilterState
  dispatch: React.Dispatch<FilterAction>
  defaultFrom: string
  defaultTo: string
  allCards: CardItem[]
  deployLoading: boolean
}

export function useVersionHistory(): VersionHistoryData {
  const { t } = useTranslation()
  const selectedVersionId = useWorkspace((s) => s.selectedVersionId)
  const poState = useWorkspace((s) => s.poState)
  const project = useWorkspace((s) => s.project)
  const { tickets } = useTicketScan(project?.projectDir ?? null)

  const [filter, dispatch] = useReducer(filterReducer, undefined, () => ({
    personas: loadPersonaFilter(),
    dateFrom: '',
    dateTo: '',
  }))

  const [deployEvents, setDeployEvents] = useState<FetchedDeployEvent[]>([])
  const [deployLoading, setDeployLoading] = useState(false)
  const lastFetchedVersionRef = useRef<string | null>(null)

  const isUnassigned = selectedVersionId === '__unassigned__'
  const versions = poState?.versions ?? []
  const version = isUnassigned ? null : versions.find((v) => v.id === selectedVersionId)

  const versionLabel = isUnassigned
    ? t('workspace.versionHistory.unassigned.label')
    : (version?.id ?? selectedVersionId ?? '')

  const versionTickets = useMemo(() => {
    if (!selectedVersionId) return []
    if (isUnassigned) return tickets.filter((tk) => !tk.version)
    return tickets.filter((tk) => tk.version === selectedVersionId)
  }, [tickets, selectedVersionId, isUnassigned])

  const defaultFrom = useMemo(() => isUnassigned ? '' : toDateStr(version?.started_at), [version, isUnassigned])
  const defaultTo = useMemo(() => isUnassigned ? '' : toDateStr(version?.ended_at ?? null), [version, isUnassigned])

  useEffect(() => {
    dispatch({ type: 'reset-dates', from: defaultFrom, to: defaultTo })
  }, [selectedVersionId, defaultFrom, defaultTo])

  useEffect(() => {
    if (isUnassigned || !selectedVersionId) {
      setDeployEvents([]); setDeployLoading(false); lastFetchedVersionRef.current = null; return
    }
    if (lastFetchedVersionRef.current === selectedVersionId) return
    lastFetchedVersionRef.current = selectedVersionId

    const projectDir = project?.projectDir ?? ''
    const projectName = project?.slug ?? ''
    if (!projectName) return

    setDeployLoading(true); setDeployEvents([])
    const api = (window as any).api
    const fetchFn = api?.deploy?.fetchEvents ?? api?.fetchDeployEvents
    if (fetchFn) {
      fetchFn({ projectDir, projectName,
        sinceIso: version?.started_at ?? new Date(0).toISOString(),
        untilIso: version?.ended_at ?? new Date().toISOString() })
        .then((res: { ok: boolean; events: FetchedDeployEvent[] }) => { if (res.ok) setDeployEvents(res.events) })
        .catch(() => {})
        .finally(() => setDeployLoading(false))
    } else {
      setDeployLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersionId, isUnassigned])

  const durationLabel = useMemo(() => {
    if (!version?.started_at) return null
    const start = new Date(version.started_at)
    const end = version.ended_at ? new Date(version.ended_at) : new Date()
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
    const diffMs = end.getTime() - start.getTime()
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }, [version])

  const subtitle = t('workspace.versionHistory.subtitle', {
    count: versionTickets.length, deploys: deployEvents.length, duration: durationLabel ?? '—',
  })

  const allCards = useMemo((): CardItem[] => {
    const filtered = versionTickets.filter((tk) =>
      personaMatchesFilter(tk, filter.personas) && dateInRange(ticketDateKey(tk), filter.dateFrom, filter.dateTo)
    )
    const sorted = [...filtered].sort((a, b) => ticketDateKey(b).localeCompare(ticketDateKey(a)))
    return [
      ...sorted.map((ticket) => ({ kind: 'ticket' as const, ticket, key: ticket.ticket_id, date: ticketDateKey(ticket) })),
      ...deployEvents.map((deploy) => ({ kind: 'deploy' as const, deploy, key: deploy.deploymentId, date: deploy.createdAt })),
    ].sort((a, b) => b.date.localeCompare(a.date))
  }, [versionTickets, filter, deployEvents])

  return { selectedVersionId, versionLabel, subtitle, filter, dispatch, defaultFrom, defaultTo, allCards, deployLoading }
}
