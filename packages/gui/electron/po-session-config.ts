/**
 * po-session-config.ts — GUI model/effort override for prdt PO sessions (T-310).
 *
 * legacy T-PATCH-286 (v0.6, never committed) staged `gui_model`/`gui_effort` keys
 * in `.productune/config.json` but never wired them into the actual claude spawn
 * (only UI display plumbing landed — see docs/archive/v06-tpatch-284-286-reference.patch,
 * reference-only). This is the v1.1 from-scratch re-implementation: config source is
 * ALWAYS `.prdt/config.json` (T-284/A1 `configPath`), and the feature is scoped to
 * prdt projects only — a legacy `.productune` project never reads or writes these
 * keys (T-285 adapter posture: additive registration, not a shared surface).
 *
 * Unset (absent key / null / '') means "inherit" — po-runner adds no `--model` /
 * `--effort` flag, so the claude CLI's own default applies, byte-identical to the
 * pre-T-310 spawn behavior.
 */

import fs from 'fs'
import { configPath, detectProjectKind } from './project-paths'

// ── Allowed values (T-310: "select-level" config — no free-text model/effort) ──
//
// Kept as a small fixed allowlist per the ticket's explicit anti-overdesign note.
// Mirrored in the renderer's <select> options (PoSessionSettings.tsx) — the two
// lists must stay in lockstep by hand (no shared runtime import: main/renderer
// are separate bundles and this enum is too small to justify a shared module).
export const PO_SESSION_MODEL_OPTIONS = ['opus', 'sonnet', 'fable'] as const
export type PoSessionModel = (typeof PO_SESSION_MODEL_OPTIONS)[number]

// Literal CLI `--effort` vocabulary (live-confirmed via `claude --help`, 2026-07-06).
export const PO_SESSION_EFFORT_OPTIONS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type PoSessionEffort = (typeof PO_SESSION_EFFORT_OPTIONS)[number]

/** Resolved override — both fields optional/absent mean "inherit". */
export interface PoSessionOverride {
  model?: PoSessionModel
  effort?: PoSessionEffort
}

/** Renderer-facing shape: `supported` gates whether the Settings UI section renders. */
export interface PoSessionConfig {
  supported: boolean
  model: PoSessionModel | null
  effort: PoSessionEffort | null
}

function isModel(v: unknown): v is PoSessionModel {
  return typeof v === 'string' && (PO_SESSION_MODEL_OPTIONS as readonly string[]).includes(v)
}

function isEffort(v: unknown): v is PoSessionEffort {
  return typeof v === 'string' && (PO_SESSION_EFFORT_OPTIONS as readonly string[]).includes(v)
}

/** Read+parse config.json; `{}` on any absence/corruption (never throws). */
function readConfigRaw(projectDir: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(configPath(projectDir), 'utf-8'))
  } catch {
    return {}
  }
}

/**
 * Read the resolved model/effort override for a PO spawn. Used by po-runner's
 * spawnClaude. Legacy (`.productune`) projects always resolve to `{}` (inherit) —
 * never read the legacy config path for these keys.
 */
export function getPoSessionOverride(projectDir: string): PoSessionOverride {
  if (detectProjectKind(projectDir) !== 'prdt') return {}
  const cfg = readConfigRaw(projectDir)
  const out: PoSessionOverride = {}
  if (isModel(cfg.gui_model)) out.model = cfg.gui_model
  if (isEffort(cfg.gui_effort)) out.effort = cfg.gui_effort
  return out
}

/** Read the renderer-facing config (adds the `supported` gate). */
export function getPoSessionConfig(projectDir: string): PoSessionConfig {
  const supported = detectProjectKind(projectDir) === 'prdt'
  if (!supported) return { supported, model: null, effort: null }
  const override = getPoSessionOverride(projectDir)
  return { supported, model: override.model ?? null, effort: override.effort ?? null }
}

/**
 * Persist a model/effort override into `.prdt/config.json`. jq-style merge —
 * reads the full config, sets/deletes ONLY `gui_model`/`gui_effort`, writes the
 * whole object back atomically (tmp + rename). Every other key (slug, surfaces,
 * schema_v, …) passes through untouched. `null` (or an out-of-allowlist value)
 * clears the key → "inherit".
 *
 * Refuses (no write) for a non-prdt project or a project with no config.json yet
 * (config.json is expected to already exist — written by initProject at project
 * creation; this function never creates one from scratch).
 */
export function setPoSessionOverride(
  projectDir: string,
  next: { model?: string | null; effort?: string | null },
): { ok: boolean; error?: string } {
  if (detectProjectKind(projectDir) !== 'prdt') {
    return { ok: false, error: 'not-a-prdt-project' }
  }
  const cfgPath = configPath(projectDir)
  if (!fs.existsSync(cfgPath)) {
    return { ok: false, error: 'config-missing' }
  }
  try {
    const cfg = readConfigRaw(projectDir)

    if (next.model === undefined) {
      // omitted → leave existing value untouched
    } else if (next.model === null || next.model === '' || !isModel(next.model)) {
      delete cfg.gui_model
    } else {
      cfg.gui_model = next.model
    }

    if (next.effort === undefined) {
      // omitted → leave existing value untouched
    } else if (next.effort === null || next.effort === '' || !isEffort(next.effort)) {
      delete cfg.gui_effort
    } else {
      cfg.gui_effort = next.effort
    }

    const tmp = cfgPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o644 })
    fs.renameSync(tmp, cfgPath)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'write failed' }
  }
}
