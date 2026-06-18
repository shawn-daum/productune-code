/**
 * costArchive — token-cost archive read-path (T-027, GUI slice).
 *
 * Reads a per-project append-only `<projectDir>/.productune/turns.jsonl`
 * (one JSON object per line, written by sibling shell-hook work) and aggregates
 * cost by version / persona / model.
 *
 * AGGREGATION (must match the CLI — T-PATCH-201):
 *  - cumulative lines (cost_basis === 'main_session_cumulative'): cost_usd is a
 *    SESSION-CUMULATIVE + monotonic snapshot the statusline re-writes every PO
 *    turn → per session_id take MAX cost_usd, then sum the maxima. NEVER sum
 *    directly (that is the ≈$31k over-count the patch fixes).
 *  - subagent lines (cost_basis === 'subagent_total'): cost_usd is a per-turn
 *    real cost → SUM directly.
 *  - basis-less legacy lines fall back to scope: scope==='main' → cumulative,
 *    else → summable (keeps older archives correct).
 *  - project total = Σ(subagent_total) + Σ_session(cumulative session max).
 *  - Broken/blank lines are skipped silently; missing/empty file → empty result.
 *
 * IPC:
 *  - invoke  'cost:aggregate' (projectDir, by) → AggregateResult
 *  - invoke  'cost:watch'     (projectDir)     → { ok } — (re)arm a per-project
 *            fs.watch on turns.jsonl; pushes 'productune:cost-update' (debounced).
 *
 * Push channel to renderer: 'productune:cost-update' — payload { projectDir }.
 * The renderer re-fetches via cost:aggregate on receipt (mirrors usageWatch).
 */

import { ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
// Single-source price table (T-PATCH-202). Same JSON the python CLI reads — the
// table lives ONLY in packages/core/config/model-prices.json; vite/esbuild
// inlines it into the electron bundle at build time (resolveJsonModule), so
// there is no runtime file read and no asar-packaging concern.
import modelPrices from '../../../core/config/model-prices.json'

// ── Model → price derivation (T-PATCH-202) ────────────────────────────────────
// Subagent turns.jsonl rows record usage + model only; cost_usd is DERIVED here
// (and identically in the python `productune cost` aggregator) so the price table
// is never duplicated. Unknown model → null (graceful, AC-4).

interface ModelPrice {
  in_per_mtok: number
  out_per_mtok: number
}
const PRICES: Record<string, ModelPrice> = (modelPrices as { prices: Record<string, ModelPrice> }).prices

/**
 * Normalize a transcript/CLI model id to a price-table key: strip a trailing
 * deployment/routing suffix in brackets (e.g. "claude-opus-4-8[1m]" →
 * "claude-opus-4-8"). The base public id is what the price table keys on.
 */
function normalizeModelId(model: string): string {
  return model.replace(/\[.*\]$/, '')
}

// Prompt-caching cost multipliers, relative to the base input rate (T-PATCH-202).
// Source: claude-api skill (prompt-caching economics) — cache reads cost ~0.1×
// the base input price; cache writes (creation) cost 1.25× for the 5-minute TTL.
// turns.jsonl does not distinguish 5-minute vs 1-hour writes, so creation is
// priced at the 5-minute 1.25× (the common/default case).
const CACHE_READ_MULT = 0.1
const CACHE_CREATION_MULT = 1.25

/**
 * Derive USD cost from a token breakdown + model id, applying the accurate
 * Anthropic prompt-caching multipliers (T-PATCH-202):
 *   cost = (input + 0.1×cache_read + 1.25×cache_creation) × in_rate
 *        + output × out_rate
 * Cache reads bill at ~0.1× the input rate; cache writes (creation) at 1.25×
 * (5-minute TTL assumed — turns.jsonl does not separate 1h writes). `usage.cache`
 * is the display-only total; cost uses the split cacheRead / cacheCreation fields.
 * Returns null when the model is unknown to the price table (AC-4 — usage is
 * still recorded upstream).
 */
export function deriveCostUsd(usage: PivotUsage, model: string | null | undefined): number | null {
  if (typeof model !== 'string' || !model) return null
  const price = PRICES[normalizeModelId(model)]
  if (!price) return null
  const inTokens =
    usage.in + CACHE_READ_MULT * usage.cacheRead + CACHE_CREATION_MULT * usage.cacheCreation
  return (inTokens * price.in_per_mtok + usage.out * price.out_per_mtok) / 1_000_000
}

// ── Types ───────────────────────────────────────────────────────────────────

export type CostGroupBy = 'version' | 'persona' | 'model' | 'persona-model'

export interface CostGroup {
  key: string
  turns: number
  cost_usd: number
}

export interface AggregateResult {
  ok: boolean
  groups: CostGroup[]
  totalTurns: number
  totalCostUsd: number
  error?: string
}

/**
 * Token breakdown for a subagent pivot row (main rows carry null).
 * `cache` is the display total (read + creation); `cacheRead` / `cacheCreation`
 * are the split tiers used for cost derivation (different price multipliers).
 */
export interface PivotUsage {
  in: number
  out: number
  cache: number
  cacheRead: number
  cacheCreation: number
}

/** One (persona, model) combination in the persona×model pivot. */
export interface PivotRow {
  persona: string
  model: string
  scope: 'subagent' | 'main'
  turns: number
  /** subagent → token breakdown; main → null (no breakdown, cost only). */
  usage: PivotUsage | null
  cost_usd: number
}

export interface PivotResult {
  ok: boolean
  rows: PivotRow[]
  /** subagent-only token subtotals (main excluded → over-count guard). */
  subagentUsage: PivotUsage
  totalTurns: number
  totalCostUsd: number
  error?: string
}

interface TurnUsage {
  input?: number
  input_tokens?: number
  output?: number
  output_tokens?: number
  cache?: number
  cache_read?: number
  cache_creation?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

interface TurnLine {
  scope?: string
  persona?: string
  version?: string
  model?: string | null
  session_id?: string
  cost_usd?: number
  cost_basis?: string
  usage?: TurnUsage
}

/**
 * Is this line a session-cumulative snapshot (must be deduped per session, not
 * summed)? Prefer the explicit cost_basis tag; fall back to scope for legacy
 * lines that predate the tag. (T-PATCH-201)
 */
function isCumulative(line: TurnLine): boolean {
  if (line.cost_basis === 'main_session_cumulative') return true
  if (line.cost_basis === 'subagent_total') return false
  // basis-less legacy line → infer from scope.
  return line.scope === 'main'
}

/**
 * Cost for one line (T-PATCH-201 + T-PATCH-202).
 *  - An explicit finite cost_usd is authoritative (cumulative/main snapshots, and
 *    any subagent row that already carries a cost).
 *  - Otherwise, for subagent rows, derive from usage × model price. The
 *    transcript-based hook records usage + model but leaves cost_usd null, so the
 *    cost is derived here at aggregation time (single price table, no duplication).
 *  - Anything else (no cost, not derivable) → 0.
 */
function costForLine(line: TurnLine): number {
  if (typeof line.cost_usd === 'number' && Number.isFinite(line.cost_usd)) {
    return line.cost_usd
  }
  if (!isCumulative(line)) {
    const derived = deriveCostUsd(readUsage(line.usage), line.model)
    if (derived !== null) return derived
  }
  return 0
}

// ── Module state ──────────────────────────────────────────────────────────────

let watcher: fs.FSWatcher | null = null
let watchedProjectDir: string | null = null
// Debounce: atomic append + rename can fire several events in quick succession.
// ~300 ms collapses them without noticeable lag.
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the turns.jsonl path inside projectDir/.productune, rejecting any
 * traversal that would escape that directory.
 */
function resolveTurnsPath(projectDir: string): string | null {
  if (!projectDir) return null
  const base = path.resolve(projectDir, '.productune')
  const file = path.resolve(base, 'turns.jsonl')
  // Containment guard — the resolved file must live directly under
  // projectDir/.productune (reject any traversal that escapes the base).
  if (file !== path.join(base, 'turns.jsonl')) return null
  return file
}

/** Pick the group key for a line under the requested dimension. */
function groupKeyFor(line: TurnLine, by: CostGroupBy): string {
  let raw: unknown
  if (by === 'version') raw = line.version
  else if (by === 'persona') raw = line.persona
  else raw = line.model
  if (typeof raw !== 'string' || raw.length === 0) return '(unknown)'
  return raw
}

/**
 * Pure aggregation core (T-PATCH-201): operates on already-parsed lines so it
 * can be unit-tested without the filesystem / Electron. `aggregate` is the thin
 * disk-reading wrapper around it.
 */
export function aggregateLines(lines: TurnLine[], by: CostGroupBy): AggregateResult {
  // Per-group accumulators. For subagent lines we sum cost directly; for
  // cumulative lines we must take MAX per session_id, so track those
  // separately and fold the maxima in at the end.
  interface Acc {
    turns: number
    subagentCost: number
    // session_id → max cumulative cost_usd seen on a main line for this group
    mainSessionMax: Map<string, number>
  }
  const groups = new Map<string, Acc>()

  const ensure = (key: string): Acc => {
    let acc = groups.get(key)
    if (!acc) {
      acc = { turns: 0, subagentCost: 0, mainSessionMax: new Map() }
      groups.set(key, acc)
    }
    return acc
  }

  for (const parsed of lines) {
    if (parsed === null || typeof parsed !== 'object') continue

    const key = groupKeyFor(parsed, by)
    const acc = ensure(key)
    acc.turns += 1

    const cost = costForLine(parsed)

    if (isCumulative(parsed)) {
      // SESSION-CUMULATIVE — keep the max per session_id (only fold in at end).
      // A cumulative line with no session_id can't be deduped; bucket it under a
      // synthetic per-line key so it still counts exactly once.
      const sid = typeof parsed.session_id === 'string' && parsed.session_id
        ? parsed.session_id
        : `__no_session__${acc.mainSessionMax.size}`
      const prev = acc.mainSessionMax.get(sid)
      if (prev === undefined || cost > prev) acc.mainSessionMax.set(sid, cost)
    } else {
      // subagent_total (per-turn real cost) — sum directly.
      acc.subagentCost += cost
    }
  }

  const out: CostGroup[] = []
  let totalTurns = 0
  let totalCostUsd = 0

  for (const [key, acc] of groups) {
    let mainCost = 0
    for (const v of acc.mainSessionMax.values()) mainCost += v
    const cost = acc.subagentCost + mainCost
    out.push({ key, turns: acc.turns, cost_usd: cost })
    totalTurns += acc.turns
    totalCostUsd += cost
  }

  // Stable, useful ordering: highest cost first, then key.
  out.sort((a, b) => b.cost_usd - a.cost_usd || a.key.localeCompare(b.key))

  return { ok: true, groups: out, totalTurns, totalCostUsd }
}

/** Parse a turns.jsonl blob into objects; blank/broken lines skipped silently. */
export function parseTurnsBlob(raw: string): TurnLine[] {
  const out: TurnLine[] = []
  for (const lineRaw of raw.split('\n')) {
    const trimmed = lineRaw.trim()
    if (!trimmed) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (parsed === null || typeof parsed !== 'object') continue
    out.push(parsed as TurnLine)
  }
  return out
}

/**
 * Parse turns.jsonl and aggregate per the rules above.
 * Returns an empty (but ok) result when the file is missing/empty.
 */
function aggregate(projectDir: string, by: CostGroupBy): AggregateResult {
  const file = resolveTurnsPath(projectDir)
  if (!file) {
    return { ok: false, groups: [], totalTurns: 0, totalCostUsd: 0, error: 'invalid projectDir' }
  }

  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch {
    // Missing file (ENOENT) or unreadable → empty aggregation, no crash.
    return { ok: true, groups: [], totalTurns: 0, totalCostUsd: 0 }
  }

  return aggregateLines(parseTurnsBlob(raw), by)
}

/**
 * Read subagent token breakdown from a turn line's `usage` object.
 * context_window is intentionally never read (statusline snapshot, not cumulative).
 */
/** A zeroed PivotUsage (all token tiers at 0). */
function zeroUsage(): PivotUsage {
  return { in: 0, out: 0, cache: 0, cacheRead: 0, cacheCreation: 0 }
}

function readUsage(u: TurnUsage | undefined): PivotUsage {
  if (!u || typeof u !== 'object') return zeroUsage()
  const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : 0
  const tin = num(u.input) + num(u.input_tokens)
  const tout = num(u.output) + num(u.output_tokens)
  // Split cache tiers for cost (read ≈ 0.1×, creation = 1.25×). The generic
  // `cache` field carries no tier, so bucket it as read (the dominant, cheaper
  // tier — the conservative read-heavy assumption for untagged snapshot data).
  const cacheRead = num(u.cache) + num(u.cache_read) + num(u.cache_read_input_tokens)
  const cacheCreation = num(u.cache_creation) + num(u.cache_creation_input_tokens)
  return { in: tin, out: tout, cache: cacheRead + cacheCreation, cacheRead, cacheCreation }
}

/**
 * persona×model pivot aggregation. Mirrors the CLI `--by persona-model`:
 *  - tuple key (persona, model)
 *  - subagent_total rows: turns + token breakdown summed, cost summed
 *  - cumulative (main) rows: cost = per session_id MAX → sum, token = null
 *  - context_window never summed; cumulative rows never carry token totals.
 */
function aggregatePivot(projectDir: string): PivotResult {
  const file = resolveTurnsPath(projectDir)
  if (!file) {
    return {
      ok: false, rows: [], subagentUsage: zeroUsage(),
      totalTurns: 0, totalCostUsd: 0, error: 'invalid projectDir',
    }
  }

  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch {
    return { ok: true, rows: [], subagentUsage: zeroUsage(), totalTurns: 0, totalCostUsd: 0 }
  }

  return aggregatePivotLines(parseTurnsBlob(raw))
}

/** Pure persona×model pivot core (T-PATCH-201) — unit-testable, no filesystem. */
export function aggregatePivotLines(lines: TurnLine[]): PivotResult {
  interface SubAcc { turns: number; cost: number; usage: PivotUsage }
  interface MainAcc { turns: number; sessionMax: Map<string, number> }
  // tuple key flattened as `${persona} ${model}` to avoid separator clashes.
  const sub = new Map<string, SubAcc>()
  const main = new Map<string, MainAcc>()
  const SEP = ' '

  const split = (k: string): [string, string] => {
    const i = k.indexOf(SEP)
    return [k.slice(0, i), k.slice(i + 1)]
  }

  for (const parsed of lines) {
    if (parsed === null || typeof parsed !== 'object') continue

    const persona =
      typeof parsed.persona === 'string' && parsed.persona ? parsed.persona : '(none)'
    const model =
      typeof parsed.model === 'string' && parsed.model ? parsed.model : '(none)'
    const key = persona + SEP + model

    const cost = costForLine(parsed)

    if (isCumulative(parsed)) {
      let acc = main.get(key)
      if (!acc) { acc = { turns: 0, sessionMax: new Map() }; main.set(key, acc) }
      acc.turns += 1
      const sid = typeof parsed.session_id === 'string' && parsed.session_id
        ? parsed.session_id
        : `__no_session__${acc.sessionMax.size}`
      const prev = acc.sessionMax.get(sid)
      if (prev === undefined || cost > prev) acc.sessionMax.set(sid, cost)
    } else {
      let acc = sub.get(key)
      if (!acc) { acc = { turns: 0, cost: 0, usage: zeroUsage() }; sub.set(key, acc) }
      acc.turns += 1
      acc.cost += cost
      const u = readUsage(parsed.usage)
      acc.usage.in += u.in
      acc.usage.out += u.out
      acc.usage.cache += u.cache
      acc.usage.cacheRead += u.cacheRead
      acc.usage.cacheCreation += u.cacheCreation
    }
  }

  const rows: PivotRow[] = []
  const subagentUsage: PivotUsage = zeroUsage()
  let totalTurns = 0
  let totalCostUsd = 0

  for (const [key, acc] of sub) {
    const [persona, model] = split(key)
    rows.push({ persona, model, scope: 'subagent', turns: acc.turns, usage: { ...acc.usage }, cost_usd: acc.cost })
    subagentUsage.in += acc.usage.in
    subagentUsage.out += acc.usage.out
    subagentUsage.cache += acc.usage.cache
    subagentUsage.cacheRead += acc.usage.cacheRead
    subagentUsage.cacheCreation += acc.usage.cacheCreation
    totalTurns += acc.turns
    totalCostUsd += acc.cost
  }
  for (const [key, acc] of main) {
    const [persona, model] = split(key)
    let cost = 0
    for (const v of acc.sessionMax.values()) cost += v
    rows.push({ persona, model, scope: 'main', turns: acc.turns, usage: null, cost_usd: cost })
    totalTurns += acc.turns
    totalCostUsd += cost
  }

  // persona primary (by descending persona-subtotal cost), then model secondary.
  const personaCost = new Map<string, number>()
  for (const r of rows) personaCost.set(r.persona, (personaCost.get(r.persona) ?? 0) + r.cost_usd)
  rows.sort((a, b) =>
    (personaCost.get(b.persona)! - personaCost.get(a.persona)!) ||
    a.persona.localeCompare(b.persona) ||
    (b.cost_usd - a.cost_usd) ||
    a.model.localeCompare(b.model),
  )

  return { ok: true, rows, subagentUsage, totalTurns, totalCostUsd }
}

function broadcast(projectDir: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('productune:cost-update', { projectDir })
    }
  }
}

function onFileChange(projectDir: string): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    broadcast(projectDir)
  }, 300)
}

function stopWatch(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  watcher?.close()
  watcher = null
  watchedProjectDir = null
}

/**
 * (Re)arm a per-project watch on turns.jsonl. Stops any prior watch first.
 * Watches the PARENT dir (.productune) so first-time file creation is caught,
 * mirroring usageWatch's parent-dir + debounce + re-arm-on-error approach.
 */
function startWatch(projectDir: string): { ok: boolean; error?: string } {
  const file = resolveTurnsPath(projectDir)
  if (!file) return { ok: false, error: 'invalid projectDir' }

  // Stop prior watch (per-projectDir: only one active at a time).
  stopWatch()
  watchedProjectDir = projectDir

  const dir = path.dirname(file) // <projectDir>/.productune

  // Ensure the dir exists so we can watch it (sibling work may not have run yet).
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    // Best-effort — still try to watch.
  }

  try {
    watcher = fs.watch(dir, { persistent: false }, (_eventType, filename) => {
      if (filename === 'turns.jsonl') {
        // Capture the projectDir at arm-time so a re-arm can't cross wires.
        if (watchedProjectDir) onFileChange(watchedProjectDir)
      }
    })
    watcher.on('error', () => {
      // Silently close + re-arm after a short delay (same dir).
      const pd = watchedProjectDir
      watcher?.close()
      watcher = null
      if (pd) setTimeout(() => startWatch(pd), 5_000)
    })
  } catch {
    // fs.watch unavailable — feature degrades gracefully (aggregate still works).
    return { ok: true }
  }

  return { ok: true }
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  // Channel: cost:aggregate
  // Args:    projectDir: string, by: 'version' | 'persona' | 'model'
  // Returns: AggregateResult
  ipcMain.handle(
    'cost:aggregate',
    (_event, projectDir: string, by: CostGroupBy): AggregateResult => {
      // Single-dimension only. persona-model has its own (pivot-shaped) channel.
      const dim: 'version' | 'persona' | 'model' =
        by === 'persona' || by === 'model' ? by : 'version'
      return aggregate(projectDir, dim)
    },
  )

  // Channel: cost:aggregatePivot
  // Args:    projectDir: string
  // Returns: PivotResult — persona×model nested aggregation (T-028 R2).
  ipcMain.handle(
    'cost:aggregatePivot',
    (_event, projectDir: string): PivotResult => aggregatePivot(projectDir),
  )

  // Channel: cost:watch
  // Args:    projectDir: string
  // Returns: { ok: boolean; error?: string }
  // Effect:  (re)arms fs.watch on <projectDir>/.productune/turns.jsonl; pushes
  //          'productune:cost-update' (debounced ~300ms) on change.
  ipcMain.handle(
    'cost:watch',
    (_event, projectDir: string): { ok: boolean; error?: string } => {
      return startWatch(projectDir)
    },
  )
}

/** Stop any active cost watch (called on window-all-closed, alongside usageWatch). */
export function stopCostWatch(): void {
  stopWatch()
}
