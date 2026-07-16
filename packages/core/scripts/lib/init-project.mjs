// @ts-check
/**
 * packages/core/scripts/lib/init-project.mjs
 *
 * Single-source project initializer — shared by CLI (bash `productune init`)
 * and GUI (packages/core/src/init.ts thin wrapper).
 *
 * Plain node ESM — no build step required. CLI invokes directly:
 *   node <path>/init-project.mjs --slug <s> --project-dir <abs> \
 *     [--core-root <abs>] [--skip-doctrine] [--stamp-schema-v false]
 *
 * GUI delegates via thin TS wrapper (src/init.ts) which imports the functions
 * directly. The .d.mts companion file provides tsc types.
 *
 * T-PATCH-117 AC-1..AC-8: unified init, parity-safe, T-PATCH-112 stamp policy
 * preserved.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

// ── Path helpers ──────────────────────────────────────────────────────────────

/**
 * Absolute path to packages/core/ — derived from this file's location
 * (scripts/lib/init-project.mjs → ../../ → packages/core/).
 * CLI can override via --core-root to survive asar/bundle path confusion.
 *
 * @param {string | undefined} coreRootOverride
 * @returns {string}
 */
function resolveCoreRoot(coreRootOverride) {
  if (coreRootOverride && fs.existsSync(coreRootOverride)) {
    return coreRootOverride
  }
  // import.meta.url → file:///…/packages/core/scripts/lib/init-project.mjs
  const selfDir = fileURLToPath(new /* @vite-ignore */ URL('.', import.meta.url))
  const derived = path.resolve(selfDir, '../../')
  if (fs.existsSync(derived)) return derived
  // 2nd fallback: ~/.productune (deployed install without source)
  return path.join(os.homedir(), '.productune')
}

// ── Settings.local.json hygiene ───────────────────────────────────────────────

/** @type {RegExp} */
const FOREIGN_USER_RE = /^[A-Za-z]+\(\/{1,2}Users\/([^/)]+)\//

/**
 * Default .claude/settings.local.json template.
 * @param {string} projectDir
 * @returns {object}
 */
function defaultClaudeSettings(projectDir) {
  return {
    permissions: {
      allow: [
        `Read(${projectDir}/**)`,
        `Write(${projectDir}/**)`,
        `Edit(${projectDir}/**)`,
        'Bash(npm *)',
        'Bash(pnpm *)',
        'Bash(git *)',
        'Bash(node *)',
        'Bash(python3 *)',
        'Bash(jq *)',
        'Bash(claude *)',
        'Bash(codex *)',
      ],
    },
  }
}

/**
 * Ensure .productune/po.lock, .productune/logs/, and .claude/settings.local.json
 * are all present in .gitignore (union block, idempotent).
 *
 * T-PATCH-117 AC-3: union gitignore = GUI old entry (.claude/settings.local.json)
 * PLUS CLI old entries (.productune/po.lock + .productune/logs/).
 *
 * @param {string} projectDir
 */
function ensureGitignoreEntries(projectDir) {
  const gitignorePath = path.join(projectDir, '.gitignore')

  /** @type {string[]} */
  const required = [
    '.productune/po.lock',
    '.productune/logs/',
    // T-027: token-cost archive runtime state. turns.jsonl is append-only and
    // grows unbounded (rotation is a follow-up); .cost-main-gate.json is the
    // ephemeral per-session high-watermark dedup tracker. Neither is an artifact.
    '.productune/turns.jsonl',
    '.productune/.cost-main-gate.json',
    '.claude/settings.local.json',
  ]

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, required.join('\n') + '\n')
    return
  }

  let content = fs.readFileSync(gitignorePath, 'utf-8')
  const lines = content.split('\n')
  const missing = required.filter(entry => !lines.some(l => l.trim() === entry))
  if (missing.length === 0) return

  const suffix = content.endsWith('\n') ? '' : '\n'
  content = content + suffix + missing.join('\n') + '\n'
  fs.writeFileSync(gitignorePath, content)
}

/**
 * Idempotent: write/repair .claude/settings.local.json.
 * Foreign-user paths → backup + replace. Absent → write default.
 * Own-user customization → preserve.
 * Also ensures union gitignore block (AC-3).
 *
 * @param {string} projectDir
 */
export function bootstrapClaudeSettings(projectDir) {
  const claudeDir = path.join(projectDir, '.claude')
  const settingsPath = path.join(claudeDir, 'settings.local.json')
  const currentUser = process.env['USER'] ?? os.userInfo().username

  fs.mkdirSync(claudeDir, { recursive: true })

  if (fs.existsSync(settingsPath)) {
    /** @type {any} */
    let parsed = null
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      // Corrupt — replace below
    }

    let hasForeign = false
    if (parsed) {
      const allow = /** @type {unknown[]} */ (parsed?.permissions?.allow ?? [])
      for (const entry of allow) {
        if (typeof entry !== 'string') continue
        const m = FOREIGN_USER_RE.exec(entry)
        if (m && m[1] !== currentUser) { hasForeign = true; break }
      }
      if (!hasForeign) {
        ensureGitignoreEntries(projectDir)
        return
      }
    }

    // Foreign or corrupt — backup + replace
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(claudeDir, `settings.local.json.legacy-${ts}.json`)
    fs.copyFileSync(settingsPath, backupPath)
    fs.writeFileSync(settingsPath, JSON.stringify(defaultClaudeSettings(projectDir), null, 2))
  } else {
    fs.writeFileSync(settingsPath, JSON.stringify(defaultClaudeSettings(projectDir), null, 2))
  }

  ensureGitignoreEntries(projectDir)
}

// ── Persona memory bootstrap ──────────────────────────────────────────────────

/**
 * @param {string} persona
 * @returns {string}
 */
function habitShell(persona) {
  const Cap = persona.charAt(0).toUpperCase() + persona.slice(1)
  return `# ${Cap} project habit\n\nPer-repo curated rules / prefs / decisions distilled. Tier 1 project memory.\n\n## Entries\n`
}

/** @type {string[]} */
const PERSONA_MEMORY_DIRS = [
  'docs/po',
  'docs/designer',
  'docs/developer',
  'docs/qa',
]

/**
 * Write a file only when absent (no-overwrite, idempotent).
 * @param {string} filePath
 * @param {string} contents
 */
function ensureFile(filePath, contents) {
  if (fs.existsSync(filePath)) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

/**
 * Ensure dir exists + seed .gitkeep so empty dirs are git-tracked.
 * @param {string} absDir
 */
function ensureDir(absDir) {
  fs.mkdirSync(absDir, { recursive: true })
  ensureFile(path.join(absDir, '.gitkeep'), '')
}

/** @type {RegExp} */
const VERSION_ID_RE = /^v\d+(\.\d+)?$/

/**
 * Scaffold the doctrine-aligned project skeleton (idempotent, no-overwrite).
 *
 * Always written (only when absent):
 *   Tier-1 habit shells, persona bookshelf seeds, turns/ log dir, backlog.md,
 *   docs/prd/PRD.md, docs/prd/versions/, docs/designer/archive/, briefs/.
 *
 * Conditionally written (only on valid initialVersionId):
 *   docs/artifacts/<v>/manifest.json, docs/tickets/<v>/.gitkeep.
 *
 * Written (absent-only, T-PATCH-141): .productune/po-state.json — canonical empty v2 seed.
 * init is now the deterministic po-state generator; existing files are never clobbered.
 *
 * @param {string} projectDir
 * @param {string | undefined} [initialVersionId]
 */
export function bootstrapPersonaMemory(projectDir, initialVersionId) {
  for (const dir of PERSONA_MEMORY_DIRS) {
    const abs = path.join(projectDir, dir)
    fs.mkdirSync(abs, { recursive: true })
    const persona = path.basename(dir)
    ensureFile(path.join(abs, 'habit.md'), habitShell(persona))
  }

  ensureFile(
    path.join(projectDir, 'docs/qa/bookshelf/fail-patterns.md'),
    '# QA fail patterns\n\n' +
    'Per-Version log of QA fail loops. Read by Designer at Phase 1 PRD authoring.\n' +
    '`- (YYYY-MM-DD) <version> · <ticket-id> · <area-tag> · loops=<N> · final=<resolved|blocked|abandoned> · note: <one-line>`.\n' +
    'Appended mechanically by PO from QA `fail_event` output.\n\n## Entries\n',
  )
  ensureFile(
    path.join(projectDir, 'docs/developer/bookshelf/project-notes.md'),
    '# Developer project notes\n\n' +
    'Non-obvious findings (build / IPC / OS quirks / tool footguns). Skim at fresh-ticket start.\n' +
    '`- (YYYY-MM-DD) [T-NNN] <area-tag> · <note>`. Route via promotion gate.\n\n## Entries\n',
  )
  ensureFile(
    path.join(projectDir, 'docs/designer/bookshelf/decisions.md'),
    '# Designer decisions\n\n' +
    'Non-trivial design choices. Skim before re-deciding the same topic.\n' +
    '`- (YYYY-MM-DD) [T-NNN] <area-tag> · <decision>`. Route via promotion gate.\n\n## Entries\n',
  )
  ensureFile(
    path.join(projectDir, 'docs/designer/feature-history.md'),
    '# Feature history\n\n' +
    'Per-Version log of feature decisions / scope choices / deferrals.\n' +
    'Read at Phase 1 PRD authoring; appended by Designer at Phase 5 Version close.\n' +
    '`- (YYYY-MM-DD) <version> · <area-tag> · <decision-type> · note: <one-line>`.\n' +
    'decision-type ∈ `shipped | deferred | dropped | scope-change`.\n\n## Entries\n',
  )

  // T-PATCH-141: init is now the canonical po-state generator (absent-only, never clobbers).
  // Canonical empty v2 seed — lifecycle fields (current_phase, versions, etc.) added later
  // by PO / delegation hooks. recent_turns omitted from seed: active v2 field written lazily
  // by post-delegate-state-write.sh on first delegation. past_tickets omitted: legacy v1 field.
  ensureFile(
    path.join(projectDir, '.productune', 'po-state.json'),
    JSON.stringify({ schema_version: 2, current_task: null }, null, 2) + '\n',
  )

  const turnsDir = path.join(projectDir, '.productune', 'turns')
  fs.mkdirSync(turnsDir, { recursive: true })
  ensureFile(
    path.join(turnsDir, 'README.md'),
    '# turn activity log\n\n' +
    'T-027: token-cost capture writes the implemented archive to a single\n' +
    '`.productune/turns.jsonl` (sibling of po-state.json), gitignored + append-only.\n' +
    'One line per turn:\n' +
    '`{ ts, scope, persona, task_slug, ticket_id, version, turn_index, model, usage{in,out,cache}, cost_usd, cost_basis, session_id, ... }`.\n' +
    '  - scope="subagent": per-turn token+cost (post-delegate-state-write hook).\n' +
    '  - scope="main": per-statusline-refresh cumulative USD, delta-gated (statusline hook).\n' +
    'Read it via `productune cost --by version|persona|model` or the GUI CostArchivePanel.\n' +
    'This `turns/` dir is the legacy per-task-file spec (unimplemented); see turns.jsonl.\n',
  )

  ensureFile(
    path.join(projectDir, 'docs/backlog.md'),
    '# Backlog\n\n' +
    '다음 버전 후보. PO 가 P5 close 또는 사용자 요청 시 append.\n' +
    '`- (YYYY-MM-DD) <area-tag> · <one-line>`\n\n## Entries\n',
  )
  ensureFile(
    path.join(projectDir, 'docs/prd/PRD.md'),
    '# PRD\n\n' +
    '단일 SoT. P1 에서 Designer 가 clarity-loop 로 작성한다(`lifecycle/p1-prd.md`).\n' +
    'GUI 는 이 파일을 직접 렌더한다.\n',
  )
  ensureDir(path.join(projectDir, 'docs/prd/versions'))
  ensureDir(path.join(projectDir, 'docs/designer/archive'))
  ensureDir(path.join(projectDir, 'briefs'))

  if (initialVersionId && VERSION_ID_RE.test(initialVersionId)) {
    const v = initialVersionId
    ensureFile(
      path.join(projectDir, 'docs/artifacts', v, 'manifest.json'),
      JSON.stringify({ schema_v: 1, version: v, entries: [] }, null, 2) + '\n',
    )
    ensureDir(path.join(projectDir, 'docs/tickets', v))
  }
}

// ── Trust auto-accept (~/.claude.json) ───────────────────────────────────────
//
// T-PATCH-274 #19a: Claude Code shows a one-time "trust this folder?" dialog the
// first time a project dir is opened. Until accepted, permissions / hooks /
// doctrine injection do NOT fully apply, so a freshly-init'd project on a new
// machine comes up untrusted and pdt-po loses its doctrine. We pre-accept trust
// for the project dir by setting
//   ~/.claude.json :: projects[realpath(absProjectDir)].hasTrustDialogAccepted = true
// mirroring the atomic read/write patterns in packages/gui/electron/ipc/mcp.ts
// (readClaudeJson `et()` reader / writeClaudeJson `an()` writer). The key is
// realpath-normalized like resolveLocalMcpServers/mcp.ts so it matches the cwd
// Claude Code launches in (symlink / case / trailing-sep safe).

/**
 * Read ~/.claude.json. Never throws — returns {} on missing/corrupt.
 * Mirrors mcp.ts readClaudeJson (`et()`).
 * @returns {Record<string, any>}
 */
function readClaudeJsonSafe() {
  const p = path.join(os.homedir(), '.claude.json')
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) }
  catch { return {} }
}

/**
 * Atomic write to ~/.claude.json — tmp + renameSync, mode 0600.
 * Mirrors mcp.ts writeClaudeJson (`an()`). CAUTION: this is Claude Code's own
 * state file — only ever call after readClaudeJsonSafe() so all other keys are
 * preserved (read-modify-write).
 * @param {Record<string, any>} data
 */
function writeClaudeJsonAtomic(data) {
  const p = path.join(os.homedir(), '.claude.json')
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, p)
}

/**
 * Idempotently set projects[realpath(absProjectDir)].hasTrustDialogAccepted=true
 * in ~/.claude.json so the project opens trusted (permissions + hooks + doctrine
 * apply on first launch). Preserves ALL other keys + any existing per-project
 * fields. Makes a one-time ~/.claude.json.bak.<ts> backup if none exists yet.
 * Never throws — trust auto-accept is best-effort and must never block init/launch.
 *
 * @param {string} projectDir
 */
export function setTrustAccepted(projectDir) {
  try {
    const absProjectDir = path.resolve(projectDir)
    // realpath-normalize the key (symlink/case/trailing-sep) like mcp.ts does so
    // it matches the exact cwd Claude Code keys projects[] by. Fall back to the
    // plain absolute path if realpath fails (dir not yet on disk, perms, etc.).
    let key = absProjectDir
    try { key = fs.realpathSync(absProjectDir) } catch { /* keep absProjectDir */ }

    const claudeJsonPath = path.join(os.homedir(), '.claude.json')

    // One-time backup before the first mutation (only when the file exists and no
    // backup has been made yet). Idempotent: skip if any *.bak.* sibling exists.
    if (fs.existsSync(claudeJsonPath)) {
      let hasBackup = false
      try {
        const dir = path.dirname(claudeJsonPath)
        hasBackup = fs.readdirSync(dir).some(n => n.startsWith('.claude.json.bak.'))
      } catch { /* readdir failed — fall through, attempt a backup */ }
      if (!hasBackup) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        try { fs.copyFileSync(claudeJsonPath, `${claudeJsonPath}.bak.${ts}`) }
        catch { /* backup best-effort */ }
      }
    }

    const data = readClaudeJsonSafe()
    if (!data.projects || typeof data.projects !== 'object') data.projects = {}
    const existing =
      (data.projects[key] && typeof data.projects[key] === 'object')
        ? data.projects[key]
        : {}

    // Idempotent: no-op write avoidance when already accepted + key present.
    if (existing.hasTrustDialogAccepted === true) return

    data.projects[key] = { ...existing, hasTrustDialogAccepted: true }
    writeClaudeJsonAtomic(data)
  } catch {
    // Never throw — trust auto-accept is best-effort.
  }
}

// ── User-global doctrine bootstrap ───────────────────────────────────────────

/**
 * SHA-256 hex of a file.
 * @param {string} filePath
 * @returns {string}
 */
function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

/**
 * Walk a directory recursively, returning all .md file paths.
 * @param {string} root
 * @returns {string[]}
 */
function walkMdRecursive(root) {
  /** @type {string[]} */
  const results = []
  if (!fs.existsSync(root)) return results
  const stack = [root]
  while (stack.length > 0) {
    const dir = /** @type {string} */ (stack.pop())
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(full)
      }
    }
  }
  return results
}

/**
 * Copy a single doctrine file src → dest with hash-compare / backup logic.
 * @param {string} src
 * @param {string} dest
 * @param {'silent'|'installed'|'updated'} state
 * @returns {'silent'|'installed'|'updated'}
 */
function copyDoctrineFile(src, dest, state) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    return state === 'updated' ? 'updated' : 'installed'
  }
  if (sha256(src) === sha256(dest)) return state
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  fs.copyFileSync(dest, `${dest}.bak.${ts}`)
  fs.copyFileSync(src, dest)
  return 'updated'
}

/**
 * Idempotently install/update user-global doctrine files under ~/.productune/doctrine/.
 *
 * - doctrine/**\/*.md : per-file hash compare; backup + update on mismatch.
 * - productune.env    : seed-only (MY_PO_ENGINE=claude — install.sh canonical key).
 *
 * AC-6: env seed key unified to MY_PO_ENGINE=claude (was engine=claude drift in TS).
 *
 * @param {string} coreRoot  absolute path to packages/core/
 */
export function bootstrapUserGlobalDoctrine(coreRoot) {
  const PRODUCTUNE_HOME = path.join(os.homedir(), '.productune')
  const DOCTRINE_HOME = path.join(PRODUCTUNE_HOME, 'doctrine')
  const DOCTRINE_SRC = path.join(coreRoot, 'doctrine')

  fs.mkdirSync(PRODUCTUNE_HOME, { recursive: true })
  fs.mkdirSync(DOCTRINE_HOME, { recursive: true })

  /** @type {'silent'|'installed'|'updated'} */
  let traceState = 'silent'

  if (fs.existsSync(DOCTRINE_SRC)) {
    for (const srcFile of walkMdRecursive(DOCTRINE_SRC)) {
      const relPath = path.relative(DOCTRINE_SRC, srcFile)
      const destFile = path.join(DOCTRINE_HOME, relPath)
      traceState = copyDoctrineFile(srcFile, destFile, traceState)
    }
  }

  // ── productune.env: seed-only — MY_PO_ENGINE=claude (install.sh canonical) ──
  // AC-6: unified key. seed-only = never overwrite existing file.
  const envDest = path.join(PRODUCTUNE_HOME, 'productune.env')
  if (!fs.existsSync(envDest)) {
    fs.writeFileSync(envDest, 'MY_PO_ENGINE=claude\n')
    if (traceState === 'silent') traceState = 'installed'
  }

  if (traceState === 'updated') {
    process.stderr.write(
      '[init] 시스템 파일을 최신 버전으로 업데이트했습니다. (기존 파일 .bak 백업됨)\n',
    )
  } else if (traceState === 'installed') {
    process.stderr.write('[init] 시스템 파일 설치 완료\n')
  }
}

// ── Migration schema_v derive ─────────────────────────────────────────────────

/**
 * Fallback latest migration id — hard-coded safety net.
 * GUARD: core test asserts this equals the actual max id in migrations/.
 * Bump this constant when adding a new migration file.
 *
 * @type {number}
 */
export const FALLBACK_LATEST_SCHEMA_V = 4

/**
 * Derive the latest migration id by scanning *.md files.
 *
 * Resolution order:
 *  1. <coreRoot>/migrations/ — src-adjacent
 *  2. ~/.productune/migrations/ — install.sh mirror
 *  3. FALLBACK_LATEST_SCHEMA_V
 *
 * @param {string} [coreRoot]
 * @returns {number}
 */
export function latestSchemaV(coreRoot) {
  const dirs = [
    ...(coreRoot ? [path.join(coreRoot, 'migrations')] : []),
    path.join(os.homedir(), '.productune', 'migrations'),
  ]

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    let max = 0
    let found = false
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.md')) continue
        const m = /^(\d{4})/.exec(name)
        if (m) {
          const n = parseInt(m[1], 10)
          if (n > max) max = n
          found = true
        }
      }
    } catch { continue }
    if (found) return max
  }

  return FALLBACK_LATEST_SCHEMA_V
}

// ── Ancestor walk-up detection (T-PATCH-135) ────────────────────────────────────
//
// SINGLE SOURCE OF TRUTH for the bounded ancestor walk-up shared by CLI
// (bash `productune init` shells out to `node init-project.mjs --find-ancestor …`)
// and GUI (electron ipc/project.ts findAncestorProductuneRoot reuses the same
// constants + rules). AC-8 parity: identical stop conditions + nearest-wins rule.

/**
 * Max ancestor levels to climb before giving up. Defends against pathologically
 * deep paths / symlink loops. SoT — GUI mirrors this constant.
 * @type {number}
 */
export const ANCESTOR_WALK_MAX_DEPTH = 16

/**
 * Classify a single directory as a productune root, WITHOUT any writes.
 * Mirrors the GUI detectProductuneLayout self-* logic but collapses to a
 * boolean-ish kind for the walk-up (only self-current / self-healable count
 * as "a project root here"; self-legacy is treated as a root too since the
 * migration flow can adopt it — consistent with descendant-scan inclusion).
 *
 * @param {string} dir
 * @returns {{ isRoot: boolean, kind?: 'self-current'|'self-healable'|'self-legacy' }}
 */
export function classifyProductuneDir(dir) {
  const productuneDir = path.join(dir, '.productune')
  let hasDot = false
  try { hasDot = fs.existsSync(productuneDir) } catch { return { isRoot: false } }
  if (!hasDot) return { isRoot: false }

  // config.json present + parseable → self-current.
  try {
    const configPath = path.join(productuneDir, 'config.json')
    if (fs.existsSync(configPath)) {
      JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return { isRoot: true, kind: 'self-current' }
    }
  } catch { /* corrupt config — fall through to evidence probes */ }

  // self-healable evidence: turns/ OR po-state.json(schema_version>=1).
  try {
    if (fs.existsSync(path.join(productuneDir, 'turns'))) {
      return { isRoot: true, kind: 'self-healable' }
    }
    const poStatePath = path.join(productuneDir, 'po-state.json')
    if (fs.existsSync(poStatePath)) {
      const parsed = JSON.parse(fs.readFileSync(poStatePath, 'utf-8'))
      if (typeof parsed?.schema_version === 'number' && parsed.schema_version >= 1) {
        return { isRoot: true, kind: 'self-healable' }
      }
    }
  } catch { /* unparseable — not healable evidence */ }

  // legacy traces: po-state.json / briefs/ / po.lock.
  try {
    if (
      fs.existsSync(path.join(productuneDir, 'po-state.json')) ||
      fs.existsSync(path.join(productuneDir, 'briefs')) ||
      fs.existsSync(path.join(productuneDir, 'po.lock'))
    ) {
      return { isRoot: true, kind: 'self-legacy' }
    }
  } catch { /* perms — treat as not a root */ }

  return { isRoot: false }
}

/**
 * Bounded ancestor walk-up. Starts at the PARENT of `startDir` (start dir
 * itself is EXCLUDED — self-* detection handles that) and climbs toward fs
 * root, stopping at the FIRST (nearest/innermost) productune root.
 *
 * Stop conditions (all bounded — never throws):
 *   - fs root reached,
 *   - user home (os.homedir()) reached — home itself IS checked, but we never
 *     climb above it,
 *   - ANCESTOR_WALK_MAX_DEPTH levels climbed,
 *   - any fs/permission/symlink error → return not-found (no throw).
 *
 * @param {string} startDir absolute path of the directory the user is acting on
 * @returns {{ found: boolean, rootDir?: string, kind?: string, distance?: number }}
 */
export function findAncestorProductuneRoot(startDir) {
  let current
  let home
  let fsRoot
  try {
    current = path.resolve(startDir)
    home = path.resolve(os.homedir())
    fsRoot = path.parse(current).root
  } catch {
    return { found: false }
  }

  // Never start the walk above home (we still inspect home itself if it's an
  // ancestor of startDir, but a startDir outside the home subtree should not
  // climb past its own fs root either — both guarded by the loop below).
  let dir = current
  for (let depth = 1; depth <= ANCESTOR_WALK_MAX_DEPTH; depth++) {
    let parent
    try {
      parent = path.dirname(dir)
    } catch {
      return { found: false }
    }
    // dirname is a fixpoint at fs root ("/" → "/").
    if (parent === dir) return { found: false }
    dir = parent

    let result
    try {
      result = classifyProductuneDir(dir)
    } catch {
      return { found: false }
    }
    if (result.isRoot) {
      return { found: true, rootDir: dir, kind: result.kind, distance: depth }
    }

    // home boundary: home itself was just inspected above; do not climb past it.
    if (dir === home) return { found: false }
    // fs root inspected → stop.
    if (dir === fsRoot) return { found: false }
  }
  return { found: false }
}

// ── Project init ──────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ProjectConfig
 * @property {string} slug
 * @property {string} created_at
 * @property {string} version
 * @property {number} [schema_v]
 * @property {string} [initial_version]
 * @property {Record<string, any>} [surfaces]
 */

/**
 * @typedef {Object} InitOptions
 * @property {string} slug
 * @property {string} projectDir
 * @property {string} [initialVersionId]
 * @property {boolean} [skipDoctrine]
 * @property {boolean} [stampSchemaV]  default true
 * @property {string} [coreRoot]       explicit packages/core/ path (CLI injects this)
 */

/**
 * Initialize (or idempotently re-initialize) a productune project.
 *
 * T-PATCH-112 stamp policy preserved:
 *   A) config exists + parses OK → preserve schema_v as-is.
 *   B) config absent + stampSchemaV !== false → fresh; stamp schema_v = latestSchemaV().
 *   C) config absent + stampSchemaV === false → legacy migrate; omit schema_v.
 *   D) config corrupt → fresh treat but omit schema_v (safe side: let migration re-eval).
 *
 * Written (absent-only, via bootstrapPersonaMemory, T-PATCH-141): .productune/po-state.json
 * with canonical empty v2 shape. Existing files are never clobbered (re-init safe).
 *
 * @param {InitOptions} opts
 * @returns {ProjectConfig}
 */
export function initProject(opts) {
  const coreRoot = opts.coreRoot ?? resolveCoreRoot(undefined)
  const dotDir = path.join(opts.projectDir, '.productune')
  const configPath = path.join(dotDir, 'config.json')

  if (!fs.existsSync(dotDir)) {
    fs.mkdirSync(dotDir, { recursive: true })
  }

  /** @type {Partial<ProjectConfig>} */
  let existing = {}
  let configWasAbsent = false
  let configWasCorrupt = false

  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch {
      configWasCorrupt = true
    }
  } else {
    configWasAbsent = true
  }
  void configWasCorrupt

  const shouldStamp = configWasAbsent && opts.stampSchemaV !== false
  /** @type {{ schema_v?: number }} */
  const schemaVEntry =
    existing.schema_v !== undefined
      ? { schema_v: existing.schema_v }
      : shouldStamp
        ? { schema_v: latestSchemaV(coreRoot) }
        : {}

  // T-365: field-preserving merge — re-init must never drop fields it doesn't
  // own (e.g. `meta.allowlist`, the meta-split boundary written by
  // meta-git.ts writeMetaAllowlist). Spread existing first, then overlay only
  // owned keys; the from-scratch rebuild here silently lost meta config.
  /** @type {ProjectConfig} */
  const config = {
    ...existing,
    slug: existing.slug ?? opts.slug,
    created_at: existing.created_at ?? new Date().toISOString(),
    version: '0.4.0',
    ...schemaVEntry,
    ...(opts.initialVersionId ? { initial_version: opts.initialVersionId } : {}),
  }

  // Atomic write (tmp + rename) — same contract as writeMetaAllowlist.
  const configTmp = configPath + '.tmp'
  fs.writeFileSync(configTmp, JSON.stringify(config, null, 2))
  fs.renameSync(configTmp, configPath)
  bootstrapPersonaMemory(opts.projectDir, config.initial_version)
  bootstrapClaudeSettings(opts.projectDir)
  // T-PATCH-274 #19a: pre-accept Claude Code's trust dialog for this project dir
  // so permissions + hooks + doctrine apply on first launch (new-machine case).
  // Best-effort (never throws) — must not block init.
  setTrustAccepted(opts.projectDir)
  if (!opts.skipDoctrine) bootstrapUserGlobalDoctrine(coreRoot)
  return config
}

// ── CLI entry (when executed directly: node init-project.mjs ...) ────────────

/**
 * Parse argv and run initProject.
 * Exit codes: 0 = success, 1 = error.
 */
function runCli() {
  const args = process.argv.slice(2)

  // ── Ancestor walk-up query mode (T-PATCH-135) ──────────────────────────────
  // `node init-project.mjs --find-ancestor <startDir>` — used by bash CLI to
  // share the SoT walk-up algorithm. Prints `found\t<rootDir>\t<kind>\t<distance>`
  // on a single line and exits 0 when found, prints `notfound` + exits 0 when
  // not found (never non-zero — bash treats absence as "no ancestor"). Errors in
  // arg parsing exit 2.
  // ── Trust-accept-only mode (T-PATCH-274 #19a launch self-heal) ─────────────
  // `node init-project.mjs --trust-accept <projectDir>` — sets the trust flag in
  // ~/.claude.json for an already-init'd project on each launch so it self-heals
  // on a new machine without re-running full init. Idempotent, never throws,
  // always exits 0 (must never block launch).
  if (args[0] === '--trust-accept') {
    const dir = args[1] ?? ''
    if (dir) {
      try { setTrustAccepted(dir) } catch { /* best-effort */ }
    }
    process.exit(0)
  }

  if (args[0] === '--find-ancestor') {
    const startDir = args[1] ?? ''
    if (!startDir) {
      process.stderr.write('[init-project] --find-ancestor requires <startDir>\n')
      process.exit(2)
    }
    const r = findAncestorProductuneRoot(startDir)
    if (r.found) {
      process.stdout.write(`found\t${r.rootDir}\t${r.kind ?? ''}\t${r.distance ?? ''}\n`)
    } else {
      process.stdout.write('notfound\n')
    }
    process.exit(0)
  }

  let slug = ''
  let projectDir = ''
  let coreRoot = ''
  let skipDoctrine = false
  let stampSchemaV = true

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--slug') { slug = args[++i] ?? ''; continue }
    if (a === '--project-dir') { projectDir = args[++i] ?? ''; continue }
    if (a === '--core-root') { coreRoot = args[++i] ?? ''; continue }
    if (a === '--skip-doctrine') { skipDoctrine = true; continue }
    if (a === '--stamp-schema-v') {
      const next = args[++i] ?? ''
      stampSchemaV = next !== 'false'
      continue
    }
    process.stderr.write(`[init-project] unknown arg: ${a}\n`)
    process.exit(1)
  }

  if (!slug) {
    process.stderr.write('[init-project] --slug is required\n')
    process.exit(1)
  }
  if (!projectDir) {
    process.stderr.write('[init-project] --project-dir is required\n')
    process.exit(1)
  }

  try {
    const resolvedCoreRoot = coreRoot ? resolveCoreRoot(coreRoot) : resolveCoreRoot(undefined)
    initProject({ slug, projectDir, skipDoctrine, stampSchemaV, coreRoot: resolvedCoreRoot })
    process.stdout.write(`created: .productune/config.json (${slug})\n`)
  } catch (/** @type {any} */ err) {
    process.stderr.write(`[init-project] error: ${err?.message ?? String(err)}\n`)
    process.exit(1)
  }
}

// Only run CLI logic when this file is the direct entry point.
const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
)
if (isMain) {
  runCli()
}
