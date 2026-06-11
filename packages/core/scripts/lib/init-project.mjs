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
 * NOT written (lifecycle-owned): .productune/po-state.json.
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

  const turnsDir = path.join(projectDir, '.productune', 'turns')
  fs.mkdirSync(turnsDir, { recursive: true })
  ensureFile(
    path.join(turnsDir, 'README.md'),
    '# turn activity log\n\n' +
    'Per-task JSONL files (`<task-slug>.jsonl`). One line per persona invocation:\n' +
    '`{ ts, persona, task_slug, ticket_id, version, turn_index, input_meta, output_full, promotion_outcome }`.\n' +
    'Written by PO. Raw truth; `.productune/po-state.json` is the summary.\n',
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
 * NOT written: .productune/po-state.json (lifecycle-owned — AC-5).
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

  /** @type {ProjectConfig} */
  const config = {
    slug: existing.slug ?? opts.slug,
    created_at: existing.created_at ?? new Date().toISOString(),
    version: '0.4.0',
    ...schemaVEntry,
    ...(opts.initialVersionId ? { initial_version: opts.initialVersionId } : {}),
    ...(existing.surfaces ? { surfaces: existing.surfaces } : {}),
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  bootstrapPersonaMemory(opts.projectDir, config.initial_version)
  bootstrapClaudeSettings(opts.projectDir)
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
