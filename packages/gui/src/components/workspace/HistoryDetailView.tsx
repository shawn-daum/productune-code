/**
 * HistoryDetailView — main-pane detail for a closed version (T-349, spec §2.3).
 *
 * Section order puts the RESULT first (doctrine #7 — user outcome over output):
 *   1. header (version + CLOSED + date)
 *   2. Outcome   (parsed from retro --v<N>.md `## Outcome`)  ← topmost, on purpose
 *   3. PRD       (docs/prd/versions/<v>.md snapshot link, or placeholder)
 *   4. Tickets   (done/dropped/open summary + "open board" link; commit-only note if 0)
 *   5. Artifacts (docs/artifacts/<v>/ flat + archive)
 *   6. Retro     (full retro link — "read more" at the bottom)
 *
 * All data derives from git tag date (passed in) + retro + prd snapshot + ticket
 * scan + artifact scan — nothing hand-maintained.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Target, FileText, CheckSquare, FolderOpen, PencilLine,
  ChevronRight, ChevronDown, Code2, GitGraph, Braces, AlertTriangle,
} from 'lucide-react'
import { useWorkspace } from '../../store/workspace'
import { useTicketScan } from '../../lib/useTicketScan'
import { countTicketStatuses, parseOutcomeBlock } from '../../lib/historyData'

interface ArtifactEntry {
  relPath: string
  absPath: string
  ext: string
  meta?: { ticket: string | null; kind: string; status: string }
}

interface Props {
  versionId: string
  closedDate?: string
}

function basename(p: string): string {
  const seg = p.split('/').filter(Boolean)
  return seg[seg.length - 1] ?? p
}

function artifactIcon(ext: string) {
  if (ext === '.mmd' || ext === '.mermaid') return <GitGraph size={13} strokeWidth={2} />
  if (ext === '.html') return <Code2 size={13} strokeWidth={2} />
  if (ext === '.json') return <Braces size={13} strokeWidth={2} />
  return <FileText size={13} strokeWidth={2} />
}

export default function HistoryDetailView({ versionId, closedDate }: Props) {
  const { t } = useTranslation()
  const project = useWorkspace((s) => s.project)
  const openTab = useWorkspace((s) => s.openTab)
  const projectDir = project?.projectDir ?? null
  const { tickets } = useTicketScan(projectDir)

  const retroRel = `docs/wiki/retro--${versionId}.md`
  const prdRel = `docs/prd/versions/${versionId}.md`

  // undefined = loading, null = absent
  const [outcome, setOutcome] = useState<string | null | undefined>(undefined)
  const [retroExists, setRetroExists] = useState<boolean | undefined>(undefined)
  const [prdExists, setPrdExists] = useState<boolean | undefined>(undefined)
  const [artifacts, setArtifacts] = useState<{ flat: ArtifactEntry[]; archived: ArtifactEntry[] }>({ flat: [], archived: [] })
  const [archiveOpen, setArchiveOpen] = useState(false)

  useEffect(() => {
    if (!projectDir) return
    let cancelled = false
    const api = (window as any).api

    Promise.resolve(api?.artifactsReadFile?.(projectDir, `${projectDir}/${retroRel}`))
      .then((content: string | null | undefined) => {
        if (cancelled) return
        setRetroExists(content != null)
        setOutcome(content == null ? null : parseOutcomeBlock(content))
      })
      .catch(() => { if (!cancelled) { setRetroExists(false); setOutcome(null) } })

    Promise.resolve(api?.artifactsReadFile?.(projectDir, `${projectDir}/${prdRel}`))
      .then((content: string | null | undefined) => { if (!cancelled) setPrdExists(content != null) })
      .catch(() => { if (!cancelled) setPrdExists(false) })

    Promise.resolve(api?.artifactsListVersion?.(projectDir, versionId))
      .then((v: { flat?: ArtifactEntry[]; archived?: ArtifactEntry[] } | undefined) => {
        if (cancelled) return
        setArtifacts({ flat: v?.flat ?? [], archived: v?.archived ?? [] })
      })
      .catch(() => { if (!cancelled) setArtifacts({ flat: [], archived: [] }) })

    return () => { cancelled = true }
  }, [projectDir, versionId, retroRel, prdRel])

  const counts = useMemo(
    () => countTicketStatuses(tickets.filter((tk) => tk.version === versionId).map((tk) => tk.status as string | undefined)),
    [tickets, versionId],
  )

  const openMd = useCallback((relPath: string) => {
    if (!projectDir) return
    openTab(
      `artifact:${relPath}`,
      'artifact-md',
      { absPath: `${projectDir}/${relPath}`, relPath, projectDir },
      basename(relPath),
    )
  }, [openTab, projectDir])

  const openArtifact = useCallback((entry: ArtifactEntry) => {
    if (!projectDir) return
    const tabId = `artifact:${entry.relPath}`
    const title = basename(entry.relPath)
    if (entry.ext === '.html') openTab(tabId, 'preview', { path: entry.absPath, projectDir, relPath: entry.relPath }, title)
    else if (entry.ext === '.mmd' || entry.ext === '.mermaid') openTab(tabId, 'artifact-mermaid', { absPath: entry.absPath, relPath: entry.relPath, projectDir }, title)
    else if (entry.ext === '.json') openTab(tabId, 'artifact-json', { absPath: entry.absPath, relPath: entry.relPath, projectDir }, title)
    else openTab(tabId, 'artifact-md', { absPath: entry.absPath, relPath: entry.relPath, projectDir }, title)
  }, [openTab, projectDir])

  const openBoard = useCallback(() => {
    openTab(`ticket-review:${versionId}`, 'ticket-review', { versionFilter: versionId }, versionId)
  }, [openTab, versionId])

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={header}>
        <span style={vidLarge}>{versionId}</span>
        <span style={closedBadge}>closed</span>
        {closedDate && <span style={dateText}>{closedDate}</span>}
      </div>

      {/* 2. Outcome — topmost (doctrine #7) */}
      <Section icon={<Target size={13} />} title={t('workspace.history.outcomeHeading')}>
        <div style={outcomeCard}>
          {outcome === undefined ? null : outcome ? (
            <div style={outcomeText}>{outcome}</div>
          ) : (
            <div style={outcomePending}>{t('workspace.history.noRetro')}</div>
          )}
        </div>
      </Section>

      {/* 3. PRD snapshot */}
      <Section icon={<FileText size={13} />} title={t('workspace.versionDetail.sectionPrd')}>
        {prdExists === undefined ? null : prdExists ? (
          <LinkRow label={prdRel} onClick={() => openMd(prdRel)} />
        ) : (
          <div style={quietNote}>{t('workspace.versionDetail.prdNone')}</div>
        )}
      </Section>

      {/* 4. Tickets */}
      <Section icon={<CheckSquare size={13} />} title={t('workspace.versionDetail.sectionTickets', { count: counts.total })}>
        {counts.total === 0 ? (
          <div style={quietNote}>{t('workspace.history.noTickets')}</div>
        ) : (
          <>
            <div style={ticketSummary}>
              <span style={tkStat}><b style={{ color: '#34D399' }}>{counts.done}</b> done</span>
              <span style={tkStat}><b style={{ color: '#505050' }}>{counts.dropped}</b> dropped</span>
              {counts.open > 0 && (
                <span style={anomaly}>
                  <AlertTriangle size={12} />
                  {t('workspace.history.openTicketsAnomaly', { count: counts.open })}
                </span>
              )}
            </div>
            <LinkRow label={t('workspace.history.openBoard')} onClick={openBoard} mono={false} />
          </>
        )}
      </Section>

      {/* 5. Artifacts — this version's docs/artifacts/<v>/ */}
      <Section icon={<FolderOpen size={13} />} title="Artifacts">
        {artifacts.flat.length === 0 && artifacts.archived.length === 0 ? (
          <div style={quietNote}>{t('workspace.artifacts.versionEmpty')}</div>
        ) : (
          <div style={artTree}>
            {artifacts.flat.map((e) => (
              <button key={e.relPath} style={artRow} onClick={() => openArtifact(e)} type="button" title={e.relPath}>
                <span style={{ color: '#707070', display: 'flex', flexShrink: 0 }}>{artifactIcon(e.ext)}</span>
                <span style={artName}>{basename(e.relPath)}</span>
              </button>
            ))}
            {artifacts.archived.length > 0 && (
              <>
                <div
                  style={artArchiveHdr}
                  onClick={() => setArchiveOpen((v) => !v)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') setArchiveOpen((v) => !v) }}
                  aria-expanded={archiveOpen}
                >
                  {archiveOpen ? <ChevronDown size={11} strokeWidth={2.5} /> : <ChevronRight size={11} strokeWidth={2.5} />}
                  {t('workspace.artifacts.archiveLabel')} ({artifacts.archived.length})
                </div>
                {archiveOpen && artifacts.archived.map((e) => (
                  <button key={e.relPath} style={{ ...artRow, paddingLeft: 32 }} onClick={() => openArtifact(e)} type="button" title={e.relPath}>
                    <span style={{ color: '#707070', display: 'flex', flexShrink: 0 }}>{artifactIcon(e.ext)}</span>
                    <span style={artName}>{basename(e.relPath)}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </Section>

      {/* 6. Retro — full read, at the bottom */}
      <Section icon={<PencilLine size={13} />} title="Retro">
        {retroExists === undefined ? null : retroExists ? (
          <LinkRow label={t('workspace.history.openRetro')} onClick={() => openMd(retroRel)} mono={false} />
        ) : (
          <div style={quietNote}>{t('workspace.history.noRetro')}</div>
        )}
      </Section>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section style={section}>
      <div style={sectionTitle}>
        <span style={{ display: 'flex' }}>{icon}</span>
        {title}
      </div>
      {children}
    </section>
  )
}

function LinkRow({ label, onClick, mono = true }: { label: string; onClick: () => void; mono?: boolean }) {
  return (
    <button
      style={linkRow}
      onClick={onClick}
      type="button"
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2A2A2A'; (e.currentTarget as HTMLButtonElement).style.background = '#1A1A1A' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1F1F1F'; (e.currentTarget as HTMLButtonElement).style.background = '#141414' }}
    >
      <FileText size={13} style={{ color: '#505050', flexShrink: 0 }} />
      <span style={mono ? linkLabelMono : linkLabel}>{label}</span>
      <span style={linkArrow}>↗</span>
    </button>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const wrap: React.CSSProperties = { flex: 1, background: '#0F0F0F', overflow: 'auto', padding: '24px 30px 40px' }

const header: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 22, paddingBottom: 14,
  borderBottom: '1px solid #1A1A1A',
}
const vidLarge: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: '#F0F0F0' }
const closedBadge: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#34D399', background: 'rgba(52,211,153,0.14)',
  borderRadius: 4, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.05em',
}
const dateText: React.CSSProperties = { fontSize: 12, color: '#707070', fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' }

const section: React.CSSProperties = { marginBottom: 26 }
const sectionTitle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 10px',
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#505050',
}

const outcomeCard: React.CSSProperties = {
  background: '#141414', border: '1px solid #1F1F1F', borderLeft: '3px solid #34D399',
  borderRadius: 6, padding: '16px 18px',
}
const outcomeText: React.CSSProperties = {
  fontSize: 13, color: '#C8C8CC', lineHeight: 1.6, whiteSpace: 'pre-wrap',
  fontFamily: 'inherit', margin: 0,
}
const outcomePending: React.CSSProperties = { fontSize: 13, color: '#505050', fontStyle: 'italic' }

const quietNote: React.CSSProperties = { fontSize: 12, color: '#505050', fontStyle: 'italic', paddingLeft: 2 }

const linkRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#141414',
  border: '1px solid #1F1F1F', borderRadius: 4, fontSize: 12, maxWidth: 520, cursor: 'pointer',
  textAlign: 'left', width: '100%', fontFamily: 'inherit', transition: 'border-color 0.1s, background 0.1s',
}
const linkLabelMono: React.CSSProperties = {
  color: '#A0A0A0', fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 11,
  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const linkLabel: React.CSSProperties = { color: '#C8C8CC', fontSize: 12, flex: 1 }
const linkArrow: React.CSSProperties = { fontSize: 11, color: '#505050', flexShrink: 0 }

const ticketSummary: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }
const tkStat: React.CSSProperties = { fontSize: 12, color: '#707070', display: 'flex', alignItems: 'baseline', gap: 5 }
const anomaly: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#FBBF24',
  background: 'rgba(251,191,36,0.12)', borderRadius: 4, padding: '3px 8px',
}

const artTree: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1 }
const artRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', fontSize: 12, color: '#C8C8CC',
  background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
  fontFamily: 'inherit',
}
const artName: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const artArchiveHdr: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#707070', padding: '5px 10px', cursor: 'pointer', userSelect: 'none',
}
