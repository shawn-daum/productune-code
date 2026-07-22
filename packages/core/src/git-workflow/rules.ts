import fs from 'fs'
import path from 'path'
import os from 'os'
import { stateDir } from '../state/project-kind'

export interface GitRules {
  /**
   * T-381 canonical: `dev` is the RESIDENCE branch (daily work commits here) and
   * this is a hard rule, so it defaults ON. `dev` is fully pushable — it is NOT
   * in `protectedBranches`. (Pre-T-381 this flag meant "dev is a blocked
   * validation env"; that role is retired — see protectedBranches.)
   */
  useDevBranch: boolean
  useStagingEnv: boolean
  featureBranchPrefix: string
  fixBranchPrefix: string
  /**
   * Derived field — the branches the pre-push hook blocks from direct push.
   * T-381 hard rule: `main` only. `dev` (residence) and `staging` (optional
   * pre-deploy env) are pushable, so they never appear here.
   */
  protectedBranches: string[]
  /**
   * Per-trigger autosave config (v0.5 B1 / T-017). Controls which ticket-md
   * frontmatter changes trigger an autosave commit. Persisted in git-rules.json.
   */
  autosaveTriggers: AutosaveTriggers
}

/**
 * The branches the pre-push hook blocks from direct push. T-381 hard rule:
 * `main` only — `dev` (residence) and `staging` (optional pre-deploy env) are
 * pushable. This is the single source of truth for the protected set, baked into
 * DEFAULT_RULES, enforced by mergeWithDefaults, and returned by
 * getProtectedBranches (the generated hook hard-codes the same `main`).
 */
export const PROTECTED_BRANCHES: readonly string[] = ['main']

const DEFAULT_AUTOSAVE_TRIGGERS: AutosaveTriggers = {
  onStatusChange: true,
  onQaStatusChange: true,
  onQaLoopsChange: true,
  onManual: true,
}

const DEFAULT_RULES: GitRules = {
  // T-381: dev residence is canonical (hard rule) → default ON.
  useDevBranch: true,
  useStagingEnv: false,
  featureBranchPrefix: 'feature',
  fixBranchPrefix: 'fix',
  // Hard rule: main is the only direct-push-blocked branch.
  protectedBranches: [...PROTECTED_BRANCHES],
  autosaveTriggers: { ...DEFAULT_AUTOSAVE_TRIGGERS },
}

const GLOBAL_DEFAULT_PATH = path.join(os.homedir(), '.productune', 'git-rules.default.json')

/** In-memory cache: projectDir → GitRules. Invalidated on saveRules. */
const cache = new Map<string, GitRules>()

function projectRulesPath(projectDir: string): string {
  return path.join(stateDir(projectDir), 'git-rules.json')
}

/**
 * Load rules for a project directory.
 * Priority: project git-rules.json > global default > hard-coded default.
 */
export function loadRules(projectDir: string): GitRules {
  const cached = cache.get(projectDir)
  if (cached) return cached

  const projectPath = projectRulesPath(projectDir)
  if (fs.existsSync(projectPath)) {
    try {
      const raw = fs.readFileSync(projectPath, 'utf-8')
      const parsed = JSON.parse(raw)
      const rules = mergeWithDefaults(parsed)
      cache.set(projectDir, rules)
      return rules
    } catch {
      // fall through to global default
    }
  }

  const global = getDefault()
  cache.set(projectDir, global)
  return global
}

/**
 * Save rules for a specific project (atomic write via tmp + rename).
 * Only affects project-level git-rules.json. Global default is not changed.
 * Invalidates in-memory cache for this projectDir.
 */
export function saveRules(projectDir: string, rules: GitRules): void {
  const rulesPath = projectRulesPath(projectDir)
  const dir = path.dirname(rulesPath)
  fs.mkdirSync(dir, { recursive: true })

  const tmp = rulesPath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(rules, null, 2), { mode: 0o644 })
  fs.renameSync(tmp, rulesPath)

  // Invalidate cache so next loadRules re-reads from fs
  cache.delete(projectDir)
}

/**
 * Get (and auto-create on first run) the global default rules.
 * Reads ~/.productune/git-rules.default.json; creates it with hard-coded defaults if absent.
 */
export function getDefault(): GitRules {
  if (fs.existsSync(GLOBAL_DEFAULT_PATH)) {
    try {
      const raw = fs.readFileSync(GLOBAL_DEFAULT_PATH, 'utf-8')
      const parsed = JSON.parse(raw)
      return mergeWithDefaults(parsed)
    } catch {
      // fall through to create with defaults
    }
  }

  // First-run: auto-create
  const dir = path.dirname(GLOBAL_DEFAULT_PATH)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = GLOBAL_DEFAULT_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(DEFAULT_RULES, null, 2), { mode: 0o644 })
  fs.renameSync(tmp, GLOBAL_DEFAULT_PATH)

  return { ...DEFAULT_RULES }
}

/**
 * The branches the pre-push hook blocks from direct push.
 *
 * T-381 hard rule: `main` only. `dev` is the residence branch — daily work is
 * pushed there, so it must NEVER be blocked (verified in T-381: main push → exit
 * 1, dev push → exit 0). `staging`, when used, is an optional pre-deploy env and
 * is likewise pushable. So this is `['main']` regardless of the other toggles.
 */
export function getProtectedBranches(_rules: GitRules): string[] {
  return [...PROTECTED_BRANCHES]
}

/**
 * The base branch to cut an optional isolation (feat/*) worktree from.
 *
 * T-381: feat/* isolates from the RESIDENCE (`dev`) so it carries the latest
 * daily work; without residence there is no dev, so it cuts from `main`.
 */
export function baseBranch(rules: GitRules): string {
  return rules.useDevBranch ? 'dev' : 'main'
}

// ── Extended API aliases (T-P4-023/T-P4-024 compat) ──────────────────────────

export interface GitRulesSource {
  level: 'project' | 'global' | 'default'
  path?: string
}

export interface GitRulesReadResult {
  rules: GitRules
  /** Alias for rules — worktree.ts uses .merged for readability. */
  merged: GitRules
  source: GitRulesSource
}

export interface AutosaveTriggers {
  onStatusChange: boolean
  onQaStatusChange: boolean
  onQaLoopsChange: boolean
  onManual: boolean
}

/** Alias: readGitRules = loadRules wrapped in GitRulesReadResult shape. */
export function readGitRules(projectDir: string): GitRulesReadResult {
  const projectPath = projectRulesPath(projectDir)
  const rules = loadRules(projectDir)
  if (fs.existsSync(projectPath)) {
    return { rules, merged: rules, source: { level: 'project', path: projectPath } }
  }
  if (fs.existsSync(GLOBAL_DEFAULT_PATH)) {
    return { rules, merged: rules, source: { level: 'global', path: GLOBAL_DEFAULT_PATH } }
  }
  return { rules, merged: rules, source: { level: 'default' } }
}

/** Write (save) git rules for projectDir. Returns the merged rules. */
export function writeGitRules(projectDir: string, partial: Partial<GitRules>): { ok: boolean; merged: GitRules; error?: string } {
  try {
    const current = loadRules(projectDir)
    const merged: GitRules = { ...current, ...partial }
    saveRules(projectDir, merged)
    return { ok: true, merged }
  } catch (err) {
    return { ok: false, merged: loadRules(projectDir), error: err instanceof Error ? err.message : String(err) }
  }
}

/** Reset project git-rules.json to the global/hard default. */
export function resetGitRules(projectDir: string): { ok: boolean; merged: GitRules; error?: string } {
  try {
    const merged = getDefault()
    saveRules(projectDir, merged)
    return { ok: true, merged }
  } catch (err) {
    return { ok: false, merged: getDefault(), error: err instanceof Error ? err.message : String(err) }
  }
}

/** Bootstrap default git-rules.json at project init time. No-op if already present. */
export function bootstrapGitRules(projectDir: string): void {
  const projectPath = projectRulesPath(projectDir)
  if (!fs.existsSync(projectPath)) {
    saveRules(projectDir, getDefault())
  }
}

function mergeAutosaveTriggers(parsed: Partial<AutosaveTriggers> | undefined): AutosaveTriggers {
  const d = DEFAULT_AUTOSAVE_TRIGGERS
  if (!parsed || typeof parsed !== 'object') return { ...d }
  return {
    onStatusChange: typeof parsed.onStatusChange === 'boolean' ? parsed.onStatusChange : d.onStatusChange,
    onQaStatusChange: typeof parsed.onQaStatusChange === 'boolean' ? parsed.onQaStatusChange : d.onQaStatusChange,
    onQaLoopsChange: typeof parsed.onQaLoopsChange === 'boolean' ? parsed.onQaLoopsChange : d.onQaLoopsChange,
    onManual: typeof parsed.onManual === 'boolean' ? parsed.onManual : d.onManual,
  }
}

function mergeWithDefaults(parsed: Partial<GitRules>): GitRules {
  const useDevBranch = typeof parsed.useDevBranch === 'boolean' ? parsed.useDevBranch : DEFAULT_RULES.useDevBranch
  return {
    useDevBranch,
    useStagingEnv: typeof parsed.useStagingEnv === 'boolean' ? parsed.useStagingEnv : DEFAULT_RULES.useStagingEnv,
    featureBranchPrefix: typeof parsed.featureBranchPrefix === 'string' && parsed.featureBranchPrefix.trim()
      ? parsed.featureBranchPrefix.trim()
      : DEFAULT_RULES.featureBranchPrefix,
    fixBranchPrefix: typeof parsed.fixBranchPrefix === 'string' && parsed.fixBranchPrefix.trim()
      ? parsed.fixBranchPrefix.trim()
      : DEFAULT_RULES.fixBranchPrefix,
    // T-381 hard rule: main is the only direct-push-blocked branch (dev is the
    // pushable residence). Any stale ['main','dev'] in a saved file is corrected.
    protectedBranches: [...PROTECTED_BRANCHES],
    autosaveTriggers: mergeAutosaveTriggers(parsed.autosaveTriggers),
  }
}
