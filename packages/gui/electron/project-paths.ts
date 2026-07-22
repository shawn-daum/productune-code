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
 *
 * T-317 code-review #1: detection + code-root resolution (STATE_DIR_NAME /
 * detectProjectKind / stateDir / codeDirName / codeRoot / isPhysicallySplit /
 * CODE_DIR_DEFAULT) used to be a second, independently-maintained copy of
 * core's `state/project-kind.ts` — the gui-vs-core reverse-import concern that
 * justified the duplication doesn't hold (gui already depends on
 * @productune/core; core cannot depend on gui, but the reverse is fine and
 * already wired everywhere else in electron/). Re-exported from core below;
 * only the gui-specific `stateFile`/named-file helpers stay local.
 */

import path from 'path'
import {
  STATE_DIR_NAME,
  detectProjectKind,
  stateDir,
  CODE_DIR_DEFAULT,
  codeDirName,
  codeRoot,
  isPhysicallySplit,
} from '@productune/core'
import type { ProjectKind } from '@productune/core'

export { STATE_DIR_NAME, detectProjectKind, stateDir, CODE_DIR_DEFAULT, codeDirName, codeRoot, isPhysicallySplit }
export type { ProjectKind }

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
