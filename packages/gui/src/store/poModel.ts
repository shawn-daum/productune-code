/**
 * poModel — shared renderer store for the PO session model (T-334).
 *
 * The PO session model lives in `.prdt/config.json` `gui_model` (T-310) and is
 * applied at spawn by po-runner. Before T-334 it was only reachable via a deep
 * Settings panel, so the GUI could silently inherit whatever model the CLI last
 * used. This store surfaces the current PO model to the composer + presence bar
 * and backs the PO-only model switcher.
 *
 * Semantics: `model === null` means the config key is unset (spawn inherits the
 * CLI default). The GUI's *declared* default is opus, so display/switcher resolve
 * `model ?? DEFAULT_PO_MODEL`. FreshComposer and the switcher always persist an
 * explicit model, so any session started/switched through the GUI carries a real
 * `gui_model` — the null (inherit) case only survives for pre-T-334 projects.
 *
 * Mirrors the model allowlist in electron/po-session-config.ts + GeneralSettings
 * (kept in lockstep by hand — main/renderer are separate bundles; the enum is too
 * small to justify a shared cross-boundary module, per the T-310 note).
 *
 * T-335 — human-readable labels with a version number:
 * `gui_model`/PO_MODEL_OPTIONS are ALIASES ("opus"/"sonnet"/"fable") — the CLI
 * arg, not a specific dot-version, so alone they can never carry a version
 * number. The session stream's top-level lines (system init `model`, assistant
 * `message.model`) DO carry the real running id (e.g.
 * "claude-opus-4-5-20251101") — po-runner forwards it over `po:model-id`
 * (poEvents.ts) into `realModelId` below, best-effort and per-session (cleared
 * on restart, since a new session's real id is unknown until its first line).
 * `poModelLabel()` prefers it; when absent, it falls back to BUNDLED_DEFAULT_ID
 * (T-342 below) — never the bare alias.
 *
 * T-338 — label format v2:
 *   - narrow surfaces (sprite chips, send badge): `formatModelLabel` → "Sonnet 5"
 *   - wide surfaces (switcher modal, FreshComposer/Settings selectors):
 *     `formatModelLabelWide` → "Claude Sonnet 5"
 *   - real ids carry a trailing YYYYMMDD build stamp (probe-confirmed:
 *     `claude-haiku-4-5-20251001`) which is stripped — it is not a version.
 *   - alias option lists resolve through `observedByAlias` (real ids seen live
 *     this app run) via `poModelOptionLabel`; an unobserved alias degraded to
 *     "Claude Opus" (superseded by T-342 below — now degrades to the bundled
 *     default instead).
 *
 * T-342 — user rejected T-338's observed-only honesty tradeoff: an unobserved
 * option showing versionless "Claude Sonnet" read as broken, not honest. Policy
 * flips to "always show a version":
 *   - `BUNDLED_DEFAULT_ID` ships a build-time alias→real-id guess (from the
 *     newest id per family known at build time — currently sourced from
 *     packages/core/config/model-prices.json's newest sonnet/opus entries and
 *     this app's own running id for fable/sonnet-5). `poModelOptionLabel` /
 *     `poModelLabel` fall back to it instead of the bare alias.
 *   - `observedByAlias` still WINS when populated (live fact > bundled guess).
 *   - `observedByAlias` is now localStorage-persisted (zustand persist,
 *     machine-level key, not project-scoped — see store below) so a single
 *     real-id observation self-corrects a stale bundled default permanently,
 *     surviving app restarts. This is the drift safety net for (1): the
 *     bundled guess can go stale, but one live observation fixes the label for
 *     good on this machine.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const PO_MODEL_OPTIONS = ['opus', 'sonnet', 'fable'] as const
export type PoModel = (typeof PO_MODEL_OPTIONS)[number]

/** GUI's declared default PO model — what unset (inherit) resolves to for display. */
export const DEFAULT_PO_MODEL: PoModel = 'opus'

/**
 * T-342: build-time bundled default real-id per alias — used ONLY as a
 * fallback when no live observation exists yet for that alias. A best-effort
 * snapshot, not a live lookup; it WILL go stale over time, which is fine — a
 * single live observation (`observedByAlias`) always overrides it and, once
 * persisted, corrects the label permanently on this machine (see file header).
 * Never leave an alias unmapped here: the whole point of T-342 is that every
 * option shows a version from first run, with no "unversioned" fallback left.
 */
export const BUNDLED_DEFAULT_ID: Record<PoModel, string> = {
  opus: 'claude-opus-4-8',
  sonnet: 'claude-sonnet-5',
  fable: 'claude-fable-5',
}

interface PoModelState {
  /** Configured `gui_model` (null = unset/inherit). Resolve with DEFAULT_PO_MODEL for display. */
  model: PoModel | null
  /** Whether the open project supports the override (prdt project). */
  supported: boolean
  /**
   * T-335: the PO's real running model id for the CURRENT session (e.g.
   * "claude-opus-4-8"), captured from the stream via po:model-id. null before
   * the session's first model-bearing line (system init / assistant) arrives,
   * and reset to null on every session restart (setRealModelId(null)) — a
   * fresh session's id is unknown until its own first line, so a stale prior
   * id must not linger.
   */
  realModelId: string | null
  /**
   * T-338: alias → last OBSERVED real id (e.g. opus → "claude-opus-4-8").
   * Populated whenever a real id streams by (PO's own via setRealModelId,
   * workers' via recordObservedId) whose parsed family IS one of the alias
   * options. This is the honest alias→version resolution the switcher /
   * FreshComposer option lists use: an observed id is a fact about what this
   * machine's CLI runs for that family — never an invented version. Survives
   * session restarts and project switches (machine-level fact, not
   * session-level state — T-342: also localStorage-persisted, see the
   * `persist()` wrapper below, so it survives full app restarts too); an
   * alias never observed stays absent here and callers fall back to
   * BUNDLED_DEFAULT_ID (T-342) instead of a bare/versionless alias.
   */
  observedByAlias: Partial<Record<PoModel, string>>
  /**
   * T-338: which projectDir the store last loaded for. load() only clears
   * realModelId when this CHANGES — a same-project re-load (ChatPanel /
   * PersonaPresenceBar remount, e.g. after a tab/view switch) must NOT wipe
   * the live session's captured id. Unconditional clearing here was the
   * renderer-side path that dropped the version mid-session (T-338 bug #2).
   */
  loadedProjectDir: string | null
  /** (Re)load from `.prdt/config.json` via IPC. No-op in browser/dev (no window.api). */
  load: (projectDir: string) => Promise<void>
  /** Optimistic local set after a persist (switcher / FreshComposer). */
  setModel: (model: PoModel | null) => void
  /** T-335: record (or clear, on restart) the live-captured real model id. */
  setRealModelId: (id: string | null) => void
  /** T-338: record an observed real id (worker stream etc.) into observedByAlias only. */
  recordObservedId: (id: string) => void
}

export const usePoModel = create<PoModelState>()(
  persist(
    (set, get) => ({
  model: null,
  supported: false,
  realModelId: null,
  observedByAlias: {},
  loadedProjectDir: null,
  load: async (projectDir: string) => {
    // T-335/T-338: a PROJECT SWITCH means a different (or not-yet-started)
    // session — the previous project's captured real model id must not bleed
    // into this one's label. A same-project re-load (component remount) keeps
    // it: the session is still live and its id is still true. observedByAlias
    // is machine-level (what this CLI resolves an alias to) and survives both.
    if (get().loadedProjectDir !== projectDir) {
      set({ realModelId: null, loadedProjectDir: projectDir })
    }
    try {
      const cfg = await (window as any).api?.getPoSessionConfig?.(projectDir)
      if (cfg) {
        const m = cfg.model
        set({
          model: (PO_MODEL_OPTIONS as readonly string[]).includes(m) ? (m as PoModel) : null,
          supported: !!cfg.supported,
        })
      }
    } catch {
      /* IPC unavailable (browser dev / tests) — leave defaults. */
    }
  },
  setModel: (model) => set({ model }),
  setRealModelId: (id) => {
    set({ realModelId: id })
    // A live-captured PO id is also an observation for its alias family.
    if (id) get().recordObservedId(id)
  },
  recordObservedId: (id) => {
    const family = parseModelId(id)?.family.toLowerCase()
    if (family && (PO_MODEL_OPTIONS as readonly string[]).includes(family)) {
      set((s) => ({ observedByAlias: { ...s.observedByAlias, [family]: id } }))
    }
  },
    }),
    {
      // T-342: machine-level key (no projectDir scoping — an observed alias→id
      // fact is true for every project this CLI install runs, per the T-338
      // docstring above). Only `observedByAlias` is persisted: `model` /
      // `supported` come from `.prdt/config.json` per project (load()),
      // `realModelId` / `loadedProjectDir` are session-scoped and must NOT
      // survive a restart (T-335's "unknown until the session's own first
      // line" guarantee) — persisting them would reintroduce a stale-id bug.
      name: 'pdt:po-model-observed',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ observedByAlias: state.observedByAlias }),
    },
  ),
)

/** Resolve the display model (never null) — unset falls back to the GUI default. */
export function resolvePoModel(model: PoModel | null): PoModel {
  return model ?? DEFAULT_PO_MODEL
}

// ── T-335/T-338: human-readable labels ───────────────────────────────────────

/**
 * Parse a real model id into { family, version }. Handles (probe-confirmed
 * shapes, 2026-07-13):
 *   - family-first:  claude-opus-4-8, claude-sonnet-5,
 *                    claude-haiku-4-5-20251001 (trailing YYYYMMDD build stamp)
 *   - legacy version-first: claude-3-5-sonnet-20241022
 * A trailing all-digit segment of 6+ digits is a date/build stamp, not a
 * version — dropped. `version` may be '' (id carried only a date stamp).
 * Returns null for anything else (bare aliases, garbage) — callers decide the
 * fallback; no version is ever invented.
 */
function parseModelId(id: string): { family: string; version: string } | null {
  const cleaned = id.replace(/\[.*\]$/, '').trim()
  // family-first: claude-<family>(-<digits>)+
  let m = /^claude-([a-z]+)((?:-\d+)+)$/i.exec(cleaned)
  if (m) return { family: m[1], version: joinVersionSegments(m[2]) }
  // legacy version-first: claude-<digits>(-<digits>)*-<family>[-<datestamp>]
  m = /^claude-((?:\d+-)+)([a-z]+)(?:-\d{6,})?$/i.exec(cleaned)
  if (m) return { family: m[2], version: joinVersionSegments(m[1]) }
  return null
}

/** '-4-5-20251001' → '4.5' (date-stamp segments of 6+ digits dropped). */
function joinVersionSegments(segs: string): string {
  const parts = segs.split('-').filter(Boolean)
  while (parts.length > 0 && /^\d{6,}$/.test(parts[parts.length - 1])) parts.pop()
  return parts.join('.')
}

/**
 * SHORT human-readable model label (narrow surfaces: sprite chips, send-button
 * badge) from a real model id or a bare alias.
 *
 *   - real id  → "Family V[.v]"  ("Opus 4.8", "Sonnet 5"; date stamp stripped)
 *   - alias    → capitalized family only ("Opus") — no knowable version, never
 *     an invented number
 *   - unparseable → rendered as-is (trimmed): the label must never be
 *     blank/broken (T-335 AC), and guessing would be dishonest.
 */
export function formatModelLabel(idOrAlias: string): string {
  const cleaned = idOrAlias.replace(/\[.*\]$/, '').trim()
  if (!cleaned) return idOrAlias
  const parsed = parseModelId(cleaned)
  if (parsed) {
    const family = titleCase(parsed.family)
    return parsed.version ? `${family} ${parsed.version}` : family
  }
  if (/^[a-z]+$/i.test(cleaned)) return titleCase(cleaned)
  return cleaned
}

/**
 * WIDE human-readable model label (wide surfaces: switcher modal options,
 * FreshComposer / Settings selectors) — "Claude " + the short form, but ONLY
 * when the value honestly parses (real id or bare alias). An unparseable raw
 * value renders as-is — never "Claude <garbage>".
 */
export function formatModelLabelWide(idOrAlias: string): string {
  const cleaned = idOrAlias.replace(/\[.*\]$/, '').trim()
  if (!cleaned) return idOrAlias
  if (parseModelId(cleaned) || /^[a-z]+$/i.test(cleaned)) {
    return `Claude ${formatModelLabel(cleaned)}`
  }
  return cleaned
}

/**
 * T-338/T-342: wide option-list label for an ALIAS, resolved through the
 * observed alias→id map first (a live fact, always wins), falling back to the
 * bundled build-time default (T-342: always show a version, even unobserved)
 * instead of the bare alias — "Claude Opus 4.8" either way, never the
 * versionless "Claude Opus" T-338 shipped.
 */
export function poModelOptionLabel(
  alias: PoModel,
  observedByAlias: Partial<Record<PoModel, string>>,
): string {
  return formatModelLabelWide(observedByAlias[alias] ?? BUNDLED_DEFAULT_ID[alias])
}

function titleCase(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s
}

/**
 * The PO's display label (SHORT form — chip/badge): prefers the live-captured
 * real model id (formatModelLabel'd, e.g. "Opus 4.8"); falls back to the
 * BUNDLED_DEFAULT_ID for the configured alias (T-342: "Opus 4.8", not the
 * bare "Opus") when no real id has been captured yet for this session
 * (pre-first-line, or a project where the stream subscription never fires).
 */
export function poModelLabel(state: { model: PoModel | null; realModelId: string | null }): string {
  if (state.realModelId) return formatModelLabel(state.realModelId)
  return formatModelLabel(BUNDLED_DEFAULT_ID[resolvePoModel(state.model)])
}
