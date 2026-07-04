/**
 * project-kind.ts — core-side SoT for a project's on-disk state-directory kind
 * (T-284 QA-HIGH fix).
 *
 * `packages/gui/electron/project-paths.ts` (adapter A1) introduced dual-mode
 * detection (`.prdt` vs legacy `.productune`) for the GUI's own direct file
 * access. But three `@productune/core` modules — `state/pending-promotions.ts`,
 * `git-workflow/rules.ts`, `git-workflow/worktree.ts` — hardcode the legacy
 * `.productune` directory internally and are unreachable from the GUI layer's
 * detection (core cannot import from gui: that would invert the package
 * dependency). Left as-is, every one of A1's prdt-aware call sites that
 * delegates to these core functions (e.g. state.ts's promotion handlers) still
 * writes into a shadow `.productune/` tree inside a `.prdt` project.
 *
 * This module is core's OWN copy of the same detection contract (kept in
 * lockstep with project-paths.ts's semantics: `.prdt` present wins; missing/
 * fs-error/only-`.productune` all fall back to the legacy default so existing
 * `.productune` projects are byte-for-byte unaffected). It is intentionally
 * package-local — core must not depend on gui.
 */

import fs from 'fs'
import path from 'path'

export type ProjectKind = 'prdt' | 'productune'

export const STATE_DIR_NAME: Record<ProjectKind, string> = {
  prdt: '.prdt',
  productune: '.productune',
}

/**
 * Detect a project's kind from its on-disk state directory.
 * A `.prdt/` directory present → 'prdt'. Otherwise → 'productune' (legacy),
 * which is also the default for a fresh/absent directory. Best-effort: any fs
 * error resolves to the legacy default (never throws).
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
