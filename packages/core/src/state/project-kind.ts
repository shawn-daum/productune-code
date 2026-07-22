/**
 * project-kind.ts — core-side SoT for a project's on-disk state-directory kind
 * (T-284 QA-HIGH fix).
 *
 * Originally added because three `@productune/core` modules —
 * `state/pending-promotions.ts`, `git-workflow/rules.ts`,
 * `git-workflow/worktree.ts` — hardcode the legacy `.productune` directory
 * internally and are unreachable from the GUI layer's own (then-separate)
 * detection (core cannot import from gui: that would invert the package
 * dependency).
 *
 * T-317 code-review #1: this is now the ONLY implementation — `@productune/gui`
 * (which already depends on `@productune/core`; the dependency only inverts
 * the other direction) re-exports these from `electron/project-paths.ts`
 * instead of keeping its own byte-for-byte copy. Package-local semantics
 * unchanged: `.prdt` present wins; missing/fs-error/only-`.productune` all
 * fall back to the legacy default so existing `.productune` projects are
 * byte-for-byte unaffected.
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

// ── Code root resolution (PRD §v1.3 설계 결정 4) ────────────────────────────────
//
// v1.2 assumed one root: projectRoot == codeRoot == metaRoot. v1.3 introduces a
// PHYSICAL split — code lives under `<projectRoot>/<code.dir>` while meta
// (`docs/`·`.prdt/`·`briefs/`) stays at the project root (the meta git work-tree
// is unchanged, so meta path STRINGS like `docs/prd/PRD.md` are stable). This is
// the SINGLE resolution point every surface shares (CLI · hook · GUI):
//   - projectRoot / metaRoot = where `.prdt/` (or legacy `.productune/`) lives.
//   - codeRoot = `<projectRoot>/<config.code.dir>`, or projectRoot itself when
//     `code.dir` is absent (LEGACY layout — a repo not yet physically split
//     keeps working unchanged, the hard back-compat requirement).
//
// THE CONTRACT (T-317 #1: gui/electron/project-paths.ts now re-exports this
// module rather than replicating it — only the python `scripts/prdt` still
// needs its own port, a separate language that can't import this file
// directly; keep that one in lockstep by hand):
//   1. code.dir is read from `<stateDir>/config.json` at `code.dir` (a string).
//   2. Missing / empty / unreadable config → null → codeRoot falls back to
//      projectRoot (legacy). Never throws.
//   3. Meta git ops (git-dir under `<stateDir>/meta.git`, work-tree = projectRoot)
//      anchor at projectRoot. CODE git ops (`.git`, worktree add, hooks) anchor
//      at codeRoot. Confusing the two commits to the wrong repo — the whole
//      reason this lives in one function.

/** Default code sub-directory name for a fresh physical split (PRD §v1.3). */
export const CODE_DIR_DEFAULT = 'code'

/**
 * The configured code sub-directory (`config.code.dir`), or null when absent —
 * null == legacy layout (code root IS the project root). Best-effort: a missing
 * or corrupt config resolves to null (never throws).
 */
export function codeDirName(projectDir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(stateDir(projectDir), 'config.json'), 'utf-8')
    const cfg = JSON.parse(raw)
    const dir = cfg?.code?.dir
    if (typeof dir === 'string' && dir.trim()) return dir.trim()
  } catch {
    /* missing / corrupt / no code.dir → legacy */
  }
  return null
}

/**
 * Absolute code repo root. `<projectRoot>/<code.dir>` when physically split,
 * else the project root itself (legacy fallback). This is the anchor for ALL
 * code git operations.
 */
export function codeRoot(projectDir: string): string {
  const dir = codeDirName(projectDir)
  return dir ? path.join(projectDir, dir) : projectDir
}

/**
 * True when the project is physically split (code.dir configured). Drives the
 * meta-staging strategy: when split, the code `.gitignore` no longer sits at the
 * project root, so meta commits use a plain `git add` instead of the legacy
 * ignore-immune staging (PRD §v1.3 설계 결정 4).
 */
export function isPhysicallySplit(projectDir: string): boolean {
  return codeDirName(projectDir) !== null
}
