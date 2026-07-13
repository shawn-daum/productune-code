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
 * number. The session stream's top-level assistant message DOES carry the real
 * running id (e.g. "claude-opus-4-8") — po-runner's extractPoModel forwards it
 * over `po:model-id` (poEvents.ts) into `realModelId` below, best-effort and
 * per-session (cleared on restart, since a new session's real id is unknown
 * until its first assistant line arrives). `poModelLabel()` prefers it; when
 * absent (pre-first-token, or a legacy/non-prdt project that never subscribes),
 * it falls back to the capitalized alias — never an invented version.
 */

import { create } from 'zustand'

export const PO_MODEL_OPTIONS = ['opus', 'sonnet', 'fable'] as const
export type PoModel = (typeof PO_MODEL_OPTIONS)[number]

/** GUI's declared default PO model — what unset (inherit) resolves to for display. */
export const DEFAULT_PO_MODEL: PoModel = 'opus'

interface PoModelState {
  /** Configured `gui_model` (null = unset/inherit). Resolve with DEFAULT_PO_MODEL for display. */
  model: PoModel | null
  /** Whether the open project supports the override (prdt project). */
  supported: boolean
  /**
   * T-335: the PO's real running model id for the CURRENT session (e.g.
   * "claude-opus-4-8"), captured from the stream via po:model-id. null before
   * the first assistant line of a session arrives, and reset to null on every
   * session restart (setRealModelId(null)) — a fresh session's id is unknown
   * until its own first line, so a stale prior id must not linger.
   */
  realModelId: string | null
  /** (Re)load from `.prdt/config.json` via IPC. No-op in browser/dev (no window.api). */
  load: (projectDir: string) => Promise<void>
  /** Optimistic local set after a persist (switcher / FreshComposer). */
  setModel: (model: PoModel | null) => void
  /** T-335: record (or clear, on restart) the live-captured real model id. */
  setRealModelId: (id: string | null) => void
}

export const usePoModel = create<PoModelState>((set) => ({
  model: null,
  supported: false,
  realModelId: null,
  load: async (projectDir: string) => {
    // T-335: a project switch means a different (or not-yet-started) session —
    // the previous project's captured real model id must not bleed into this
    // one's label. PersonaPresenceBar/ChatPanel both call load() on projectDir
    // change, so this is the single choke point for that reset.
    set({ realModelId: null })
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
  setRealModelId: (id) => set({ realModelId: id }),
}))

/** Resolve the display model (never null) — unset falls back to the GUI default. */
export function resolvePoModel(model: PoModel | null): PoModel {
  return model ?? DEFAULT_PO_MODEL
}

// ── T-335: human-readable labels ─────────────────────────────────────────────

/**
 * Human-readable model label from a real model id or a bare alias.
 *
 * Real ids on the session/sidechain stream look like `claude-<family>-<v>` or
 * `claude-<family>-<v1>-<v2>` (e.g. `claude-sonnet-5`, `claude-opus-4-8`),
 * optionally with a bracketed deployment suffix (`claude-opus-4-8[1m]` — the
 * same suffix electron/ipc/costArchive.ts's normalizeModelId strips for price
 * lookups). Family → Title Case; the numeric segments after the family join
 * with '.' (['4','8'] → '4.8', ['5'] → '5') — "Opus 4.8", "Sonnet 5".
 *
 * A bare alias (PO_MODEL_OPTIONS: "opus"/"sonnet"/"fable" — all the FreshComposer
 * selector, the switcher's option list, and a pre-first-token PO label ever
 * have) carries no knowable version — this renders just the capitalized family,
 * never an invented number ("Opus", not "Opus 4.8").
 *
 * Anything else unparseable (an unrecognized shape) renders as-is (trimmed)
 * rather than guessing — the label must never be blank/broken (T-335 AC).
 */
export function formatModelLabel(idOrAlias: string): string {
  const cleaned = idOrAlias.replace(/\[.*\]$/, '').trim()
  if (!cleaned) return idOrAlias
  const m = /^claude-([a-z]+)((?:-\d+)+)$/i.exec(cleaned)
  if (m) {
    const family = titleCase(m[1])
    const version = m[2].split('-').filter(Boolean).join('.')
    return version ? `${family} ${version}` : family
  }
  if (/^[a-z]+$/i.test(cleaned)) return titleCase(cleaned)
  return cleaned
}

function titleCase(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s
}

/**
 * The PO's display label: prefers the live-captured real model id
 * (formatModelLabel'd, e.g. "Opus 4.8"); falls back to the capitalized
 * configured alias ("Opus") when no real id has been captured yet for this
 * session (pre-first-token, or a project where the stream subscription never
 * fires) — graceful, per T-335's "don't invent a version" requirement.
 */
export function poModelLabel(state: { model: PoModel | null; realModelId: string | null }): string {
  if (state.realModelId) return formatModelLabel(state.realModelId)
  return formatModelLabel(resolvePoModel(state.model))
}
