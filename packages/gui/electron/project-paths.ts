/**
 * project-paths.ts — the SINGLE source of truth for a project's on-disk state
 * layout (T-284 / adapter A1).
 *
 * Two project kinds are supported side-by-side (dual-mode adapter):
 *   - 'prdt'       → state lives under `<projectDir>/.prdt/`      (v1 / prdt)
 *   - 'productune' → state lives under `<projectDir>/.productune/` (legacy)
 *
 * Every electron-main path that used to hardcode the `.productune` directory
 * string now routes through here. The kind is detected from disk per projectDir:
 * a `.prdt/` directory wins (prdt project); otherwise we fall back to the legacy
 * `.productune` layout, so a legacy project's behavior is byte-for-byte unchanged.
 *
 * This is the branch point the rest of the adapter series (A2–A8) builds on —
 * keep path knowledge HERE, never re-scatter directory literals into call sites.
 */

import path from 'path'
import fs from 'fs'

/** The two supported project state-directory layouts. */
export type ProjectKind = 'prdt' | 'productune'

/** State-directory basename for each project kind. */
export const STATE_DIR_NAME: Record<ProjectKind, string> = {
  prdt: '.prdt',
  productune: '.productune',
}

/**
 * Detect a project's kind from its on-disk state directory.
 *
 * A `.prdt/` directory present → 'prdt'. Otherwise → 'productune' (legacy),
 * which is also the default for a fresh/absent directory so project creation and
 * legacy opens keep resolving `.productune` exactly as before.
 *
 * Best-effort: any fs error resolves to the legacy default (never throws).
 */
export function detectProjectKind(projectDir: string): ProjectKind {
  try {
    if (fs.existsSync(path.join(projectDir, STATE_DIR_NAME.prdt))) return 'prdt'
  } catch {
    /* fall through to legacy default */
  }
  return 'productune'
}

/** Absolute path to the project's state directory (`.prdt` or `.productune`). */
export function stateDir(projectDir: string): string {
  return path.join(projectDir, STATE_DIR_NAME[detectProjectKind(projectDir)])
}

/** Absolute path to a file/subpath inside the project's state directory. */
export function stateFile(projectDir: string, ...segments: string[]): string {
  return path.join(stateDir(projectDir), ...segments)
}

// ── Named convenience helpers for the most-used state files ────────────────────

export const poStatePath = (projectDir: string): string => stateFile(projectDir, 'po-state.json')
export const configPath = (projectDir: string): string => stateFile(projectDir, 'config.json')
export const chatJsonPath = (projectDir: string): string => stateFile(projectDir, 'chat.json')
export const onboardingPath = (projectDir: string): string => stateFile(projectDir, 'onboarding.json')
export const turnsJsonlPath = (projectDir: string): string => stateFile(projectDir, 'turns.jsonl')
