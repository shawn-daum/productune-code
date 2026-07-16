/**
 * VersionHistoryView — Main pane tab body for "버전 히스토리" (T-P4-023).
 * Sub-components + data hook extracted to ./versionHistory/* (T-P4-156).
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVersionHistory } from './versionHistory/useVersionHistory'
import { useWorkspace } from '../store/workspace'
import PrdSection from '../components/workspace/PrdSection'
import TicketCard, { type TicketArtifactEntry } from './versionHistory/TicketCard'
import EmptyState from './versionHistory/EmptyState'
import FilterToolbar from './versionHistory/FilterToolbar'
import RichDeployCard, { DeployLoadingSkeleton } from './versionHistory/RichDeployCard'
import MetaTrackCard from './versionHistory/MetaTrackCard'
import { viewWrap, headerWrap, headerTitle, headerSubtitle, cardListWrap, prdWrap } from './versionHistory/styles'

const EMPTY_ARTIFACT_MAP = new Map<string, TicketArtifactEntry[]>()

export default function VersionHistoryView() {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const {
    selectedVersionId, versionLabel, subtitle,
    filter, dispatch, defaultFrom, defaultTo,
    allCards, deployLoading, metaCommits, metaByTicket,
  } = useVersionHistory()

  // ── Ticket → artifacts map (T-PATCH-121) ───────────────────────────────────
  // One artifacts:listScoped load per selected version; manifest `meta.ticket`
  // (SoT: docs/artifacts/<v>/manifest.json) links entries to ticket cards.
  // Unassigned pseudo-version has no artifacts dir → skip. Errors → empty map
  // (badge absence over noise).
  const [artifactsByTicket, setArtifactsByTicket] =
    useState<Map<string, TicketArtifactEntry[]>>(EMPTY_ARTIFACT_MAP)

  useEffect(() => {
    const projectDir = project?.projectDir
    if (!projectDir || !selectedVersionId || selectedVersionId === '__unassigned__') {
      setArtifactsByTicket(EMPTY_ARTIFACT_MAP)
      return
    }
    let cancelled = false
    const api = (window as any).api
    if (!api?.artifactsListScoped) return
    api
      .artifactsListScoped(projectDir, selectedVersionId)
      .then((entries: TicketArtifactEntry[]) => {
        if (cancelled) return
        const map = new Map<string, TicketArtifactEntry[]>()
        for (const entry of entries ?? []) {
          const ticketId = entry.meta?.ticket
          if (!ticketId) continue
          const list = map.get(ticketId)
          if (list) list.push(entry)
          else map.set(ticketId, [entry])
        }
        setArtifactsByTicket(map)
      })
      .catch(() => {
        if (!cancelled) setArtifactsByTicket(EMPTY_ARTIFACT_MAP)
      })
    return () => { cancelled = true }
  }, [project?.projectDir, selectedVersionId])

  if (!selectedVersionId) {
    return <EmptyState message={t('workspace.versionHistory.empty')} />
  }

  return (
    <div style={viewWrap}>
      <div style={headerWrap}>
        <div style={headerTitle}>{t('workspace.versionHistory.title')} — {versionLabel}</div>
        <div style={headerSubtitle}>{subtitle}</div>
      </div>

      {/* PRD row — closed version opens its docs/prd/versions/<v>.md snapshot,
          current version opens the live master (same UI as VersionDetailView) */}
      <div style={prdWrap}>
        <PrdSection versionId={selectedVersionId} />
      </div>

      <FilterToolbar filter={filter} dispatch={dispatch} defaultFrom={defaultFrom} defaultTo={defaultTo} />

      <div style={cardListWrap}>
        {deployLoading && <DeployLoadingSkeleton />}
        {allCards.length === 0 && !deployLoading && (
          <EmptyState message={t('workspace.versionHistory.noActivity')} />
        )}
        {allCards.map((item) =>
          item.kind === 'ticket' ? (
            <TicketCard
              key={item.key}
              ticket={item.ticket}
              commits={metaByTicket.get(item.ticket.ticket_id) ?? []}
              artifacts={artifactsByTicket.get(item.ticket.ticket_id)}
            />
          ) : (
            <RichDeployCard key={item.key} deploy={item.deploy} />
          ),
        )}
        {/* Meta track (T-367) — full meta commit timeline, identical to `prdt meta log` */}
        <MetaTrackCard commits={metaCommits} />
      </div>
    </div>
  )
}
