/**
 * CostArchivePanel — read-only token-cost archive view (T-027, GUI slice).
 *
 * Reads per-project token cost from turns.jsonl (dual-mode path — `.prdt/` for
 * prdt projects, legacy `.productune/` otherwise — resolved in main via
 * project-paths.ts, adapter A1) through the main-process `cost:aggregate` IPC,
 * and renders a grouped table (by version / persona / model). Subscribes to
 * `productune:cost-update` (onCostUpdate) to re-fetch when the sibling shell
 * hooks append new turns.
 *
 * Costs are client-side estimates — see the disclaimer line. Aggregation lives
 * in main (matches the CLI): subagent lines sum per-turn; main lines are
 * session-cumulative (max per session_id, then summed).
 *
 * T-290 (adapter A7): prdt turns.jsonl rows may carry `cost_source`. A row/group
 * whose contributing lines include any `cost_source:"estimated"` shows the
 * `estimatedBadge` pill next to its cost value ("estimated" ≠ real invoice,
 * distinct from the always-on disclaimer footer below). `"reported"` / absent →
 * no badge.
 *
 * Design: matches VersionsPanel / TeamPanel tone (dark, muted labels, monospace
 * numerics). No new design language introduced.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import EstimatedBadge from '../shared/EstimatedBadge'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CostGroup {
  key: string
  turns: number
  cost_usd: number
  hasEstimated: boolean
}

interface AggregateResult {
  ok: boolean
  groups: CostGroup[]
  totalTurns: number
  totalCostUsd: number
  hasEstimated: boolean
  error?: string
}

interface PivotUsage {
  in: number
  out: number
  cache: number
}

interface PivotRow {
  persona: string
  model: string
  scope: 'subagent' | 'main'
  turns: number
  usage: PivotUsage | null
  cost_usd: number
  hasEstimated: boolean
}

interface PivotResult {
  ok: boolean
  rows: PivotRow[]
  subagentUsage: PivotUsage
  totalTurns: number
  totalCostUsd: number
  hasEstimated: boolean
  error?: string
}

interface Props {
  projectDir: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCost(n: number): string {
  // 4 decimals, $ prefix. Guard non-finite (defensive).
  const safe = Number.isFinite(n) ? n : 0
  return `$${safe.toFixed(4)}`
}

// T-313: the local EstBadge/estBadge duplicate moved to the shared, design-
// system §8.2-conformant `<EstimatedBadge>` (components/shared/EstimatedBadge)
// — also used by UsageBar's prdt cost display.

function fmtTok(n: number): string {
  const safe = Number.isFinite(n) ? n : 0
  if (safe >= 1000) return `${(safe / 1000).toFixed(1)}k`
  return String(Math.round(safe))
}

type TFn = (key: string) => string

/**
 * Nested persona×model render: persona group header (label only on first model
 * row) → model sub-rows → persona subtotal → grand TOTAL. main rows show token
 * cells as '—' (no breakdown); TOTAL token cells = subagent-only subtotals.
 */
function renderPivot(pivot: PivotResult | null, rows: PivotRow[], t: TFn) {
  // Group contiguous rows by persona (rows arrive persona-sorted from main).
  const groups: PivotRow[][] = []
  let cur: PivotRow[] = []
  let curPersona: string | null = null
  for (const r of rows) {
    if (r.persona !== curPersona) {
      if (cur.length) groups.push(cur)
      cur = []
      curPersona = r.persona
    }
    cur.push(r)
  }
  if (cur.length) groups.push(cur)

  const dash = t('costArchive.tokenNaMain')
  const mainNote = t('costArchive.tokenNaMainNote')

  return (
    <div style={tableWrap}>
      {/* Header row */}
      <div style={headRow}>
        <span style={pColPersonaHead}>{t('costArchive.byPersona')}</span>
        <span style={pColModelHead}>{t('costArchive.byModel')}</span>
        <span style={pColTokHead}>{t('costArchive.colTurns')}</span>
        <span style={pColTokHead}>{t('costArchive.colIn')}</span>
        <span style={pColTokHead}>{t('costArchive.colOut')}</span>
        <span style={pColTokHead}>{t('costArchive.colCache')}</span>
        <span style={pColCostHead}>{t('costArchive.colCost')}</span>
      </div>

      {groups.map((grp) => {
        const persona = grp[0].persona
        const subTurns = grp.reduce((a, r) => a + r.turns, 0)
        const subCost = grp.reduce((a, r) => a + r.cost_usd, 0)
        const subEstimated = grp.some((r) => r.hasEstimated)
        return (
          <div key={persona}>
            {grp.map((r, i) => {
              const isMain = r.scope === 'main'
              const label = isMain ? `${r.persona} (main)` : r.persona
              return (
                <div key={`${r.persona}|${r.model}|${r.scope}`} style={bodyRow}>
                  <span style={pColPersona} title={label}>{i === 0 ? label : ''}</span>
                  <span style={pColModel} title={r.model}>{r.model}</span>
                  <span style={pColTok}>{r.turns}</span>
                  <span style={pColTok} title={isMain ? mainNote : undefined}>{r.usage ? fmtTok(r.usage.in) : dash}</span>
                  <span style={pColTok} title={isMain ? mainNote : undefined}>{r.usage ? fmtTok(r.usage.out) : dash}</span>
                  <span style={pColTok} title={isMain ? mainNote : undefined}>{r.usage ? fmtTok(r.usage.cache) : dash}</span>
                  <span style={pColCost}>{fmtCost(r.cost_usd)}<EstimatedBadge show={r.hasEstimated} /></span>
                </div>
              )
            })}
            {/* persona subtotal */}
            <div style={subtotalRow}>
              <span style={pColPersonaSub}>{t('costArchive.subtotal')}</span>
              <span style={pColModel} />
              <span style={pColTokSub}>{subTurns}</span>
              <span style={pColTokSub} />
              <span style={pColTokSub} />
              <span style={pColTokSub} />
              <span style={pColCostSub}>{fmtCost(subCost)}<EstimatedBadge show={subEstimated} /></span>
            </div>
          </div>
        )
      })}

      {/* Grand total — token cells = subagent-only (main excluded). */}
      <div style={totalRow}>
        <span style={pColPersonaTotal}>{t('costArchive.total')}</span>
        <span style={pColModel} />
        <span style={pColTokTotal}>{pivot?.totalTurns ?? 0}</span>
        <span style={pColTokTotal}>{pivot ? fmtTok(pivot.subagentUsage.in) : 0}</span>
        <span style={pColTokTotal}>{pivot ? fmtTok(pivot.subagentUsage.out) : 0}</span>
        <span style={pColTokTotal}>{pivot ? fmtTok(pivot.subagentUsage.cache) : 0}</span>
        <span style={pColCostTotal}>{fmtCost(pivot?.totalCostUsd ?? 0)}<EstimatedBadge show={!!pivot?.hasEstimated} /></span>
      </div>
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function CostArchivePanel({ projectDir }: Props) {
  const { t } = useTranslation()
  const [result, setResult] = useState<AggregateResult | null>(null)
  const [pivot, setPivot] = useState<PivotResult | null>(null)

  const fetchAgg = useCallback(() => {
    const api = (window as any).api
    if (!api || !projectDir) return
    // Always fetch both sources — persona×model pivot (top) + version groups (bottom).
    if (api.costAggregatePivot) {
      api
        .costAggregatePivot(projectDir)
        .then((res: PivotResult) => setPivot(res))
        .catch(() =>
          setPivot({ ok: false, rows: [], subagentUsage: { in: 0, out: 0, cache: 0 }, totalTurns: 0, totalCostUsd: 0, hasEstimated: false }),
        )
    }
    if (api.costAggregate) {
      api
        .costAggregate(projectDir, 'version')
        .then((res: AggregateResult) => setResult(res))
        .catch(() => setResult({ ok: false, groups: [], totalTurns: 0, totalCostUsd: 0, hasEstimated: false }))
    }
  }, [projectDir])

  // Fetch on mount + whenever project changes.
  useEffect(() => {
    fetchAgg()
  }, [fetchAgg])

  // Arm the watch for this project + re-fetch on push (debounced in main).
  useEffect(() => {
    const api = (window as any).api
    if (!api || !projectDir) return
    api.costWatch?.(projectDir)
    if (!api.onCostUpdate) return
    const unsub = api.onCostUpdate((payload: { projectDir: string }) => {
      // Only react to our own project's updates.
      if (payload?.projectDir === projectDir) fetchAgg()
    })
    return unsub
  }, [projectDir, fetchAgg])

  const groups = result?.groups ?? []
  const pivotRows = pivot?.rows ?? []
  const pivotEmpty = !pivot || (pivot.ok && pivotRows.length === 0)
  const versionEmpty = !result || (result.ok && groups.length === 0)

  return (
    <div style={panel}>
      <div style={titleRow}>{t('costArchive.title')}</div>

      {/* persona×model pivot (top) */}
      <div style={sectionLabel}>{t('costArchive.byPersonaModel')}</div>
      {pivotEmpty ? (
        <div style={emptyHint}>{t('costArchive.empty')}</div>
      ) : (
        renderPivot(pivot, pivotRows, t)
      )}

      {/* version groups (bottom) — same scroll view */}
      <div style={{ ...sectionLabel, marginTop: 22 }}>{t('costArchive.byVersion')}</div>
      {versionEmpty ? (
        <div style={emptyHint}>{t('costArchive.empty')}</div>
      ) : (
        <div style={tableWrap}>
          {/* Header row */}
          <div style={headRow}>
            <span style={colKeyHead}>{t('costArchive.byVersion')}</span>
            <span style={colNumHead}>{t('costArchive.colTurns')}</span>
            <span style={colNumHead}>{t('costArchive.colCost')}</span>
          </div>

          {groups.map((g) => (
            <div key={g.key} style={bodyRow}>
              <span style={colKey} title={g.key}>{g.key}</span>
              <span style={colNum}>{g.turns}</span>
              <span style={colNum}>{fmtCost(g.cost_usd)}<EstimatedBadge show={g.hasEstimated} /></span>
            </div>
          ))}

          {/* Total row */}
          <div style={totalRow}>
            <span style={colKeyTotal}>{t('costArchive.total')}</span>
            <span style={colNumTotal}>{result?.totalTurns ?? 0}</span>
            <span style={colNumTotal}>{fmtCost(result?.totalCostUsd ?? 0)}<EstimatedBadge show={!!result?.hasEstimated} /></span>
          </div>
        </div>
      )}

      {/* Disclaimers */}
      <div style={disclaimer}>{t('costArchive.estimateDisclaimer')}</div>
      <div style={disclaimer}>{t('costArchive.mainSessionNote')}</div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const panel: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  padding: '14px 12px 12px',
  overflowY: 'auto',
}

const titleRow: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#505050',
  fontWeight: 600,
  marginBottom: 10,
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#505050',
  fontWeight: 600,
  marginBottom: 8,
}

const tableWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid #1A1A1A',
  borderRadius: 6,
  overflow: 'hidden',
}

const rowBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  gap: 12,
}

const headRow: React.CSSProperties = {
  ...rowBase,
  background: '#0F0F0F',
  borderBottom: '1px solid #1A1A1A',
}

const bodyRow: React.CSSProperties = {
  ...rowBase,
  borderBottom: '1px solid #141414',
}

const totalRow: React.CSSProperties = {
  ...rowBase,
  background: '#0F0F0F',
  borderTop: '1px solid #1A1A1A',
}

const colKeyHead: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#606060',
  fontWeight: 700,
}

const colNumHead: React.CSSProperties = {
  // T-290 (A7): widened 72→100 to fit the estimatedBadge pill next to the cost
  // value without wrapping (also used by the Turns column — harmless extra
  // right-padding there).
  width: 100,
  flexShrink: 0,
  textAlign: 'right',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#606060',
  fontWeight: 700,
}

const colKey: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 12,
  color: '#F0F0F0',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const colNum: React.CSSProperties = {
  width: 100,
  flexShrink: 0,
  textAlign: 'right',
  fontSize: 11,
  fontFamily: 'monospace',
  color: '#C0C0C0',
}

const colKeyTotal: React.CSSProperties = {
  ...colKey,
  fontWeight: 700,
  color: '#A0A0A0',
}

const colNumTotal: React.CSSProperties = {
  ...colNum,
  fontWeight: 700,
  color: '#F0F0F0',
}

const emptyHint: React.CSSProperties = {
  fontSize: 11,
  color: '#3A3A3A',
  padding: '8px 0',
}

const disclaimer: React.CSSProperties = {
  fontSize: 10,
  color: '#505050',
  fontStyle: 'italic',
  lineHeight: 1.4,
  marginTop: 8,
}

// ── Pivot (persona×model) columns ───────────────────────────────────────────────
// Wider main-pane host (T-028 R1 relocation) gives room for 7 columns. persona/
// model flex; turns/in/out/cache fixed; cost wider for $0.0000.

const subtotalRow: React.CSSProperties = {
  ...rowBase,
  background: '#0C0C0C',
  borderBottom: '1px solid #141414',
}

const pColPersonaHead: React.CSSProperties = {
  ...colKeyHead,
  flex: 1.4,
}

const pColModelHead: React.CSSProperties = {
  ...colKeyHead,
  flex: 1.2,
}

const pColTokHead: React.CSSProperties = {
  ...colNumHead,
  width: 56,
}

const pColCostHead: React.CSSProperties = {
  ...colNumHead,
  width: 112, // T-290 (A7): wider than the base 100 — pivot cost cells wrap $0.0000 + badge
}

const pColPersona: React.CSSProperties = {
  ...colKey,
  flex: 1.4,
}

const pColModel: React.CSSProperties = {
  ...colKey,
  flex: 1.2,
  color: '#C0C0C0',
}

const pColTok: React.CSSProperties = {
  ...colNum,
  width: 56,
}

const pColCost: React.CSSProperties = {
  ...colNum,
  width: 112, // T-290 (A7): matches pColCostHead — room for $0.0000 + estimatedBadge
}

const pColPersonaSub: React.CSSProperties = {
  ...pColPersona,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#707070',
  fontWeight: 700,
}

const pColTokSub: React.CSSProperties = {
  ...pColTok,
  color: '#909090',
}

const pColCostSub: React.CSSProperties = {
  ...pColCost,
  fontWeight: 700,
  color: '#D0D0D0',
}

const pColPersonaTotal: React.CSSProperties = {
  ...pColPersona,
  fontWeight: 700,
  color: '#A0A0A0',
}

const pColTokTotal: React.CSSProperties = {
  ...pColTok,
  fontWeight: 700,
  color: '#F0F0F0',
}

const pColCostTotal: React.CSSProperties = {
  ...pColCost,
  fontWeight: 700,
  color: '#F0F0F0',
}
