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
  /** (Re)load from `.prdt/config.json` via IPC. No-op in browser/dev (no window.api). */
  load: (projectDir: string) => Promise<void>
  /** Optimistic local set after a persist (switcher / FreshComposer). */
  setModel: (model: PoModel | null) => void
}

export const usePoModel = create<PoModelState>((set) => ({
  model: null,
  supported: false,
  load: async (projectDir: string) => {
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
}))

/** Resolve the display model (never null) — unset falls back to the GUI default. */
export function resolvePoModel(model: PoModel | null): PoModel {
  return model ?? DEFAULT_PO_MODEL
}
