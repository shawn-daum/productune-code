/**
 * VersionHistoryView — Main pane tab body for "버전 히스토리" (T-P4-023).
 * Sub-components + data hook extracted to ./versionHistory/* (T-P4-156).
 */

import { useTranslation } from 'react-i18next'
import { useVersionHistory } from './versionHistory/useVersionHistory'
import PrdSection from '../components/workspace/PrdSection'
import TicketCard from './versionHistory/TicketCard'
import EmptyState from './versionHistory/EmptyState'
import FilterToolbar from './versionHistory/FilterToolbar'
import RichDeployCard, { DeployLoadingSkeleton } from './versionHistory/RichDeployCard'
import { viewWrap, headerWrap, headerTitle, headerSubtitle, cardListWrap } from './versionHistory/styles'

export default function VersionHistoryView() {
  const { t } = useTranslation()
  const {
    selectedVersionId, versionLabel, subtitle,
    filter, dispatch, defaultFrom, defaultTo,
    allCards, deployLoading,
  } = useVersionHistory()

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
      <PrdSection versionId={selectedVersionId} />

      <FilterToolbar filter={filter} dispatch={dispatch} defaultFrom={defaultFrom} defaultTo={defaultTo} />

      <div style={cardListWrap}>
        {deployLoading && <DeployLoadingSkeleton />}
        {allCards.length === 0 && !deployLoading && (
          <EmptyState message={t('workspace.versionHistory.noActivity')} />
        )}
        {allCards.map((item) =>
          item.kind === 'ticket' ? (
            <TicketCard key={item.key} ticket={item.ticket} commits={[]} />
          ) : (
            <RichDeployCard key={item.key} deploy={item.deploy} />
          ),
        )}
      </div>
    </div>
  )
}
