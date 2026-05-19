import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

export interface ProjectConfig {
  slug: string
  created_at: string
  version: string
  /** First version id hint for PO — validated against ^v\d+(\.\d+)?$ at creation */
  initial_version?: string
}

export interface InitOptions {
  slug: string
  projectDir: string
  /** Optional: initial version id hint (validated by caller). Written to config.json as initial_version. */
  initialVersionId?: string
  /** Skip user-global doctrine install (escape hatch for CI / custom doctrine environments). */
  skipDoctrine?: boolean
}

// ── settings.local.json hygiene ───────────────────────────────────────────────

/** Regex to detect an absolute /Users/<username>/ path in a permission entry. */
const FOREIGN_USER_RE = /^[A-Za-z]+\(\/{1,2}Users\/([^/)]+)\//

/**
 * Default settings.local.json template.
 * Uses absolute projectDir paths — relative `./**` glob not confirmed working in claude code
 * permission engine (open question — see design doc §6).
 */
function defaultClaudeSettings(projectDir: string): object {
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
 * Ensure .claude/settings.local.json is hygiene-correct for the current user.
 *
 * - If file exists: scan permissions.allow for foreign-user absolute paths.
 *   Foreign detected → backup as legacy-<timestamp>.json + write default template.
 *   Own user only → no-op (preserve customization).
 * - If file absent: write default template.
 * - Idempotent: default template already present → skip.
 * - Also ensures .gitignore contains `.claude/settings.local.json`.
 */
export function bootstrapClaudeSettings(projectDir: string): void {
  const claudeDir = path.join(projectDir, '.claude')
  const settingsPath = path.join(claudeDir, 'settings.local.json')
  const currentUser = process.env['USER'] ?? os.userInfo().username

  fs.mkdirSync(claudeDir, { recursive: true })

  if (fs.existsSync(settingsPath)) {
    let parsed: any
    try {
      parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      // Corrupt file — replace with default
      parsed = null
    }

    let hasForeign = false
    if (parsed) {
      const allow: unknown[] = parsed?.permissions?.allow ?? []
      for (const entry of allow) {
        if (typeof entry !== 'string') continue
        const m = FOREIGN_USER_RE.exec(entry)
        if (m && m[1] !== currentUser) {
          hasForeign = true
          break
        }
      }

      // If no foreign and parsed is valid → preserve owner's customization.
      // Still ensure .gitignore entry (idempotent).
      if (!hasForeign) {
        ensureGitignoreEntry(projectDir)
        return
      }
    }

    // Foreign detected (or corrupt) — backup then replace
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(claudeDir, `settings.local.json.legacy-${ts}.json`)
    fs.copyFileSync(settingsPath, backupPath)
    fs.writeFileSync(settingsPath, JSON.stringify(defaultClaudeSettings(projectDir), null, 2))
  } else {
    fs.writeFileSync(settingsPath, JSON.stringify(defaultClaudeSettings(projectDir), null, 2))
  }

  ensureGitignoreEntry(projectDir)
}

/** Ensure .gitignore has a `.claude/settings.local.json` line. Idempotent. */
function ensureGitignoreEntry(projectDir: string): void {
  const gitignorePath = path.join(projectDir, '.gitignore')
  const entry = '.claude/settings.local.json'

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${entry}\n`)
    return
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8')
  const lines = content.split('\n')
  if (lines.some(l => l.trim() === entry)) return

  // Append — ensure newline before entry
  const newContent = content.endsWith('\n') ? `${content}${entry}\n` : `${content}\n${entry}\n`
  fs.writeFileSync(gitignorePath, newContent)
}

const PERSONA_MEMORY_DIRS: Array<{ dir: string; readme: string }> = [
  {
    dir: 'docs/designer',
    readme:
      '# pdt-designer project memory\n\n' +
      '`decisions.md` — non-trivial design decisions, one dated line each (PO appends on user approval).\n' +
      'Round-scoped work-notes (`R<n>-<slug>.md`) — richer per-task artifacts (PO writes on user approval).\n',
  },
  {
    dir: 'docs/developer',
    readme:
      '# pdt-developer project memory\n\n' +
      '`project-notes.md` — non-obvious project facts (build/test/quirks), one dated line each (PO appends on user approval).\n' +
      'Round-scoped work-notes (`R<n>-<slug>.md`) — richer per-task artifacts (PO writes on user approval).\n',
  },
  {
    dir: 'docs/qa',
    readme:
      '# pdt-qa project memory\n\n' +
      '`project-notes.md` — flakes, missing cmds, env quirks, one dated line each (PO appends on user approval).\n' +
      'Round-scoped work-notes (`R<n>-<slug>.md`) — richer per-task artifacts (PO writes on user approval).\n',
  },
]

function ensureFile(filePath: string, contents: string) {
  if (fs.existsSync(filePath)) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

export function bootstrapPersonaMemory(projectDir: string) {
  for (const { dir, readme } of PERSONA_MEMORY_DIRS) {
    const abs = path.join(projectDir, dir)
    fs.mkdirSync(abs, { recursive: true })
    ensureFile(path.join(abs, 'README.md'), readme)
  }
  // Structured operational logs — Version-tagged, append-only.
  ensureFile(
    path.join(projectDir, 'docs/qa/fail-patterns.md'),
    '# QA fail patterns\n\n' +
      'Per-Version log of QA fail loops. Read by Designer at Phase 1 PRD authoring\n' +
      '(Test ticket trigger #3: same area-tag ≥3 累累 fail → emit `stage:test` ticket).\n\n' +
      '## Schema\n\n' +
      '- (YYYY-MM-DD) <version> · <ticket-id> · <area-tag> · loops=<N> · final=<resolved|blocked|abandoned> · note: <one-line>\n\n' +
      'area-tag = `<feature>/<sub-area>` (e.g. `auth/login-modal`).\n' +
      'Appended by PO mechanically from QA\'s `fail_event` output. No manual edits.\n\n' +
      '## Entries\n\n',
  )
  ensureFile(
    path.join(projectDir, 'docs/designer/feature-history.md'),
    '# Feature history\n\n' +
      'Per-Version log of feature decisions / scope choices / deferrals.\n' +
      'Read at Phase 1 PRD authoring; appended by Designer at Phase 5 Version close.\n\n' +
      '## Schema\n\n' +
      '- (YYYY-MM-DD) <version> · <area-tag> · <decision-type> · note: <one-line>\n\n' +
      'decision-type ∈ `shipped | deferred | dropped | scope-change`.\n' +
      'area-tag = `<feature>/<sub-area>` (matches QA convention).\n\n' +
      '## Entries\n\n',
  )
  const turnsDir = path.join(projectDir, '.productune', 'turns')
  fs.mkdirSync(turnsDir, { recursive: true })
  ensureFile(
    path.join(turnsDir, 'README.md'),
    '# turn activity log\n\n' +
      'Per-task JSONL files (`<task-slug>.jsonl`). One line per persona invocation:\n' +
      '`{ ts, persona, task_slug, ticket_id, version, turn_index, input_meta, wiki_consult, output_full, promotion_outcome }`.\n' +
      'Written by PO. Raw truth; `.productune/po-state.json` is the summary.\n',
  )
}

// ── user-global doctrine bootstrap ───────────────────────────────────────────

/** Absolute path to the bundled `po/` directory (packages/core/po/). */
const DOCTRINE_SRC = fileURLToPath(new URL('../po', import.meta.url))

/** SHA-256 hex digest of a file. */
function sha256(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

type DoctrineTraceState = 'silent' | 'installed' | 'updated'

/**
 * Copy a single doctrine file from src → dest with hash-compare / backup logic.
 * Returns the (potentially escalated) trace state.
 */
function copyDoctrineFile(
  src: string,
  dest: string,
  state: DoctrineTraceState,
): DoctrineTraceState {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    return state === 'updated' ? 'updated' : 'installed'
  }
  if (sha256(src) === sha256(dest)) return state // identical — skip
  // Hash mismatch → backup + update
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  fs.copyFileSync(dest, `${dest}.bak.${ts}`)
  fs.copyFileSync(src, dest)
  return 'updated'
}

/**
 * Walk a directory recursively, returning all `.md` file paths.
 * Includes sub-dirs (e.g. `_formats/`, `_details/`) — T-P4-126 doctrine sub-file split.
 */
function walkMdRecursive(root: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(root)) return results
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
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
 * Idempotently install/update user-global PO doctrine files under ~/.productune/.
 *
 * Behaviour:
 * - po-instructions.md       : hash compare; backup + update on mismatch.
 * - po-memory.md             : seed-only (never overwrite — user long-term memory).
 * - sections/**\/*.md        : per-file hash compare; backup + update on mismatch.
 *                              Recursive (T-P4-126: sections/_formats/ + sections/_details/
 *                              sub-files picked up automatically).
 * - productune.env           : seed-only (engine=claude default).
 *
 * Stderr trace (once at end):
 * - Any update (hash mismatch) → "업데이트했습니다" message.
 * - Fresh install only           → "설치 완료" message.
 * - All skipped (idempotent)     → silent.
 *
 * @note Electron IPC path only. CLI (`productune init`) path uses
 *       packages/core/scripts/lib/bootstrap-doctrine.sh.
 */
export function bootstrapUserGlobalDoctrine(): void {
  const PRODUCTUNE_HOME = path.join(os.homedir(), '.productune')
  const SECTIONS_HOME = path.join(PRODUCTUNE_HOME, 'sections')

  fs.mkdirSync(PRODUCTUNE_HOME, { recursive: true })
  fs.mkdirSync(SECTIONS_HOME, { recursive: true })

  let traceState: DoctrineTraceState = 'silent'

  // ── po-instructions.md — hash compare + backup + update ──
  const instrSrc = path.join(DOCTRINE_SRC, 'po-instructions.md')
  const instrDest = path.join(PRODUCTUNE_HOME, 'po-instructions.md')
  if (fs.existsSync(instrSrc)) {
    traceState = copyDoctrineFile(instrSrc, instrDest, traceState)
  }

  // ── po-memory.md — seed only (never overwrite — user long-term memory) ──
  const memDest = path.join(PRODUCTUNE_HOME, 'po-memory.md')
  if (!fs.existsSync(memDest)) {
    const memSrc = path.join(DOCTRINE_SRC, 'po-memory.md.template')
    if (fs.existsSync(memSrc)) {
      fs.copyFileSync(memSrc, memDest)
      if (traceState === 'silent') traceState = 'installed'
    }
  }

  // ── sections/**\/*.md — recursive hash compare + backup + update ──
  // T-P4-126: walk sections/ recursively so _formats/ + _details/ sub-files install too.
  const sectionsDir = path.join(DOCTRINE_SRC, 'sections')
  if (fs.existsSync(sectionsDir)) {
    for (const srcFile of walkMdRecursive(sectionsDir)) {
      const relPath = path.relative(sectionsDir, srcFile)
      const destFile = path.join(SECTIONS_HOME, relPath)
      traceState = copyDoctrineFile(srcFile, destFile, traceState)
    }
  }

  // ── productune.env — seed only ──
  const envDest = path.join(PRODUCTUNE_HOME, 'productune.env')
  if (!fs.existsSync(envDest)) {
    fs.writeFileSync(envDest, 'engine=claude\n')
    if (traceState === 'silent') traceState = 'installed'
  }

  // ── stderr trace (1 line; silent on idempotent re-run) ──
  if (traceState === 'updated') {
    process.stderr.write(
      '[init] 시스템 파일을 최신 버전으로 업데이트했습니다. (기존 파일 .bak 백업됨)\n',
    )
  } else if (traceState === 'installed') {
    process.stderr.write('[init] 시스템 파일 설치 완료\n')
  }
}

// ── project init ──────────────────────────────────────────────────────────────

export function initProject(opts: InitOptions): ProjectConfig {
  const dotDir = path.join(opts.projectDir, '.productune')
  const configPath = path.join(dotDir, 'config.json')

  if (!fs.existsSync(dotDir)) {
    fs.mkdirSync(dotDir, { recursive: true })
  }

  let existing: Partial<ProjectConfig> = {}
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch {
      // corrupt config — start fresh
    }
  }

  const config: ProjectConfig = {
    slug: existing.slug ?? opts.slug,
    created_at: existing.created_at ?? new Date().toISOString(),
    version: '0.4.0',
    ...(opts.initialVersionId ? { initial_version: opts.initialVersionId } : {}),
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  bootstrapPersonaMemory(opts.projectDir)
  bootstrapClaudeSettings(opts.projectDir)
  if (!opts.skipDoctrine) bootstrapUserGlobalDoctrine()
  return config
}
