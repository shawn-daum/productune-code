/**
 * Type declarations for scripts/lib/init-project.mjs
 * Consumed by packages/core/src/init.ts (thin wrapper) via tsc.
 * T-PATCH-117: hand-written to avoid adding allowJs/checkJs to core tsconfig.
 */

export interface SurfaceConfig {
  type: string
  build: string
  build_dev?: string
  smoke: string | null
  smoke_driver: string
}

export interface ProjectConfig {
  slug: string
  created_at: string
  version: string
  schema_v?: number
  initial_version?: string
  surfaces?: Record<string, SurfaceConfig>
}

export interface InitOptions {
  slug: string
  projectDir: string
  initialVersionId?: string
  skipDoctrine?: boolean
  /**
   * Whether to stamp schema_v on fresh init. Default true.
   * Pass false for project:migrateLegacy (T-PATCH-112 stamp policy).
   */
  stampSchemaV?: boolean
  /** Explicit packages/core/ path — CLI injects this; GUI omits (auto-derived). */
  coreRoot?: string
}

/** Fallback latest migration id (hard-coded safety net). */
export declare const FALLBACK_LATEST_SCHEMA_V: number

/**
 * Derive the latest migration id from migrations/*.md files.
 * @param coreRoot - absolute path to packages/core/ (optional; auto-derived if absent)
 */
export declare function latestSchemaV(coreRoot?: string): number

/** Initialize or idempotently re-initialize a productune project. */
export declare function initProject(opts: InitOptions): ProjectConfig

/** Write/repair .claude/settings.local.json + union gitignore entries. */
export declare function bootstrapClaudeSettings(projectDir: string): void

/** Scaffold persona memory skeleton (idempotent, no-overwrite). */
export declare function bootstrapPersonaMemory(projectDir: string, initialVersionId?: string): void

/**
 * Idempotently install/update user-global doctrine files.
 * @param coreRoot - absolute path to packages/core/
 */
export declare function bootstrapUserGlobalDoctrine(coreRoot: string): void
