/**
 * packages/core/src/init.ts — thin wrapper
 *
 * T-PATCH-117: single-source init. All implementation lives in
 * packages/core/scripts/lib/init-project.mjs.
 *
 * This file:
 *  - Re-exports TypeScript interfaces (SurfaceConfig, ProjectConfig, InitOptions).
 *  - Wraps each exported function so GUI call-sites (packages/gui/electron/ipc/project.ts)
 *    remain completely unchanged — same import path, same zero-arg signatures.
 *  - Forwards latestSchemaV / FALLBACK_LATEST_SCHEMA_V for schema-v-guard.mjs.
 *
 * T-PATCH-112 stamp policy (cases A/B/C/D) is preserved inside init-project.mjs.
 */

import { fileURLToPath } from 'url'
import path from 'path'
import os from 'os'

// ── Derive packages/core/ root from this file's location ─────────────────────
// dist/init.js lives at packages/core/dist/init.js → ../../ = packages/core/
// src/init.ts  lives at packages/core/src/init.ts  → ../   = packages/core/
// Both resolve to the same packages/core/ directory.
//
// Bundle-safety (T-PATCH-117 qa-fix-2): when vite-plugin-electron inlines this
// module into the CJS electron main, import.meta.url becomes a
// "data:text/javascript;base64,..." virtual URL — fileURLToPath rejects any
// non-file: scheme with ERR_INVALID_URL_SCHEME and crashes at load.
// Fix: validate scheme first; fall back to __dirname (available in CJS bundles)
// then null; null propagates into the existing resolveCoreRoot fallback chain
// (existsSync checks → ~/.productune) without throwing.
function _deriveCoreRoot(): string | null {
  try {
    const u = import.meta.url
    if (typeof u === 'string' && u.startsWith('file:')) {
      return path.resolve(fileURLToPath(new URL('.', u)), '..')
    }
  } catch { /* ignore */ }
  // CJS bundle: __dirname is injected by the bundler
  if (typeof __dirname !== 'undefined') return path.resolve(__dirname, '..')
  return null
}
const _coreRoot = _deriveCoreRoot()

// ── Import implementation from shared .mjs SoT ───────────────────────────────

import {
  initProject as _initProject,
  bootstrapClaudeSettings as _bootstrapClaudeSettings,
  bootstrapPersonaMemory as _bootstrapPersonaMemory,
  bootstrapUserGlobalDoctrine as _bootstrapUserGlobalDoctrine,
  latestSchemaV as _latestSchemaV,
  FALLBACK_LATEST_SCHEMA_V as _FALLBACK_LATEST_SCHEMA_V,
} from '../scripts/lib/init-project.mjs'

// ── Re-export types ───────────────────────────────────────────────────────────

export type { SurfaceConfig, ProjectConfig, InitOptions } from '../scripts/lib/init-project.mjs'

// ── Forwarded constants ───────────────────────────────────────────────────────

/**
 * Fallback latest migration id — hard-coded safety net.
 * schema-v-guard.mjs imports this via dist/init.js to validate against migrations dir.
 */
export const FALLBACK_LATEST_SCHEMA_V: number = _FALLBACK_LATEST_SCHEMA_V

// ── Forwarded functions ───────────────────────────────────────────────────────

/**
 * Derive the latest migration id by scanning *.md files in the migrations dir.
 * Resolution: packages/core/migrations/ → ~/.productune/migrations/ → FALLBACK.
 */
export function latestSchemaV(): number {
  return _latestSchemaV(_coreRoot ?? undefined)
}

/**
 * Initialize or idempotently re-initialize a productune project.
 * T-PATCH-112 stamp policy preserved. T-PATCH-117: delegates to shared .mjs SoT.
 */
export function initProject(opts: import('../scripts/lib/init-project.mjs').InitOptions): import('../scripts/lib/init-project.mjs').ProjectConfig {
  return _initProject({ ...opts, coreRoot: opts.coreRoot ?? _coreRoot ?? undefined })
}

/**
 * Write/repair .claude/settings.local.json + union gitignore entries (AC-3).
 */
export function bootstrapClaudeSettings(projectDir: string): void {
  _bootstrapClaudeSettings(projectDir)
}

/**
 * Scaffold the doctrine-aligned project skeleton (idempotent, no-overwrite).
 */
export function bootstrapPersonaMemory(projectDir: string, initialVersionId?: string): void {
  _bootstrapPersonaMemory(projectDir, initialVersionId)
}

/**
 * Idempotently install/update user-global doctrine files under ~/.productune/doctrine/.
 * AC-6: env seed key = MY_PO_ENGINE=claude (unified with install.sh; was engine=claude drift).
 * GUI calls this with no args — coreRoot is derived from this file's location.
 * null _coreRoot falls back to ~/.productune inside bootstrapUserGlobalDoctrine.
 */
export function bootstrapUserGlobalDoctrine(): void {
  // bootstrapUserGlobalDoctrine requires a string coreRoot; when _coreRoot is null
  // (data: URL bundle context) fall back to ~/.productune which install.sh populates.
  _bootstrapUserGlobalDoctrine(_coreRoot ?? path.join(os.homedir(), '.productune'))
}
