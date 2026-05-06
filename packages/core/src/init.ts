import fs from 'fs'
import path from 'path'

export interface ProjectConfig {
  slug: string
  created_at: string
  version: string
}

export interface InitOptions {
  slug: string
  projectDir: string
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
      'Per-Version log of QA fail loops. Read by Designer at Phase 2 PRD authoring\n' +
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
      'Read at Phase 2 PRD authoring; appended by Designer at Phase 5 Version close.\n\n' +
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
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  bootstrapPersonaMemory(opts.projectDir)
  return config
}
