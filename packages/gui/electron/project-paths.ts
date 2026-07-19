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

// ── Code root resolution (PRD §v1.3 설계 결정 4) ────────────────────────────────
//
// GUI-side copy of the SAME contract core owns in
// `packages/core/src/state/project-kind.ts` ("THE CONTRACT" block) and the python
// `packages/core/scripts/prdt` replicates — the three MUST stay in lockstep
// (T-377). v1.2 assumed one root: projectRoot == codeRoot == metaRoot. v1.3
// PHYSICALLY splits them — code lives under `<projectRoot>/<code.dir>` while meta
// (`.prdt/`·`docs/`·`briefs/`) stays at the project root.
//
//   - projectRoot / metaRoot = where `.prdt/` (or legacy `.productune/`) lives.
//     In the GUI this is the `projectDir` every IPC handler already carries — the
//     anchor for META surfaces (state / PRD / tickets / wiki) and recents/installAt.
//   - codeRoot = `<projectRoot>/<code.dir>`, or projectRoot itself when `code.dir`
//     is absent (LEGACY layout, the hard back-compat fallback). This is the anchor
//     for the CODE context: terminal / dev / build spawns and code git ops.
//
// Contract (kept byte-compatible with core's codeDirName/codeRoot/isPhysicallySplit):
//   1. code.dir is read from `<stateDir>/config.json` at `code.dir` (a string).
//   2. Missing / empty / unreadable config → null → codeRoot falls back to
//      projectRoot (legacy). Never throws.

/** Default code sub-directory name for a fresh physical split (PRD §v1.3). */
export const CODE_DIR_DEFAULT = 'code'

/**
 * The configured code sub-directory (`config.code.dir`), or null when absent —
 * null == legacy layout (code root IS the project root). Best-effort: a missing
 * or corrupt config resolves to null (never throws).
 */
export function codeDirName(projectDir: string): string | null {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath(projectDir), 'utf-8'))
    const dir = cfg?.code?.dir
    if (typeof dir === 'string' && dir.trim()) return dir.trim()
  } catch {
    /* missing / corrupt / no code.dir → legacy */
  }
  return null
}

/**
 * Absolute code repo root. `<projectRoot>/<code.dir>` when physically split, else
 * the project root itself (legacy fallback). This is the cwd for terminal / dev /
 * build spawns and the anchor for ALL code git operations.
 */
export function codeRoot(projectDir: string): string {
  const dir = codeDirName(projectDir)
  return dir ? path.join(projectDir, dir) : projectDir
}

/** True when the project is physically split (code.dir configured). */
export function isPhysicallySplit(projectDir: string): boolean {
  return codeDirName(projectDir) !== null
}
