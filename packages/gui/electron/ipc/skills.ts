import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'

// ── Types ─────────────────────────────────────────────────────────────────────

type SkillPersona = 'po' | 'designer' | 'dev' | 'qa'

/**
 * Skill layer classification (T-018 / v0.5 B2).
 * Mirrors SkillLayer in src/lib/types.ts — keep in sync.
 */
type SkillLayer = 'explicit' | 'auto' | 'unused'

interface SkillEntry {
  id: string
  name: string
  description: string
  personas: SkillPersona[]
  filePath: string
  layer: SkillLayer
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recursively collect all *.md files under a root directory. */
function collectMdFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      collectMdFiles(fullPath, out)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(fullPath)
    }
  }
  return out
}

/** Parse YAML frontmatter from a markdown string using regex only. */
function parseSkillFrontmatter(content: string): Record<string, string | string[]> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const block = match[1]
  const result: Record<string, string | string[]> = {}
  for (const line of block.split('\n')) {
    const m = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    const raw = m[2].trim()
    // YAML inline array: [a, b, c] or ['a', 'b']
    if (raw.startsWith('[')) {
      const inner = raw.slice(1, raw.lastIndexOf(']'))
      result[key] = inner
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    } else {
      result[key] = raw.replace(/^['"]|['"]$/g, '')
    }
  }
  return result
}

/** Infer personas from file path when frontmatter `personas:` is absent. */
function inferPersonasFromPath(filePath: string): SkillPersona[] {
  if (filePath.includes('mattpocock/skills/productivity/')) return ['po', 'designer', 'dev', 'qa']
  if (filePath.includes('mattpocock/skills/engineering/')) return ['dev']
  if (filePath.includes('mattpocock/skills/deprecated/')) return []
  if (filePath.includes('mattpocock/skills/misc/')) return ['dev']
  if (filePath.includes('mattpocock/skills/personal/')) return []
  // ── phuryn pm-* overrides (T-P4-143 · 2026-05-20 · OQ-c resolution) ───────
  // ── T-018 (2026-06-02): pm-toolkit added; pm-marketing-growth reclassified unused ──
  // pm-toolkit: general writing/doc utility tools → po only
  if (filePath.includes('phuryn/pm-toolkit/')) return ['po']
  // pm-data-analytics: domain-irrelevant → unused (skill layer = unused)
  if (filePath.includes('phuryn/pm-data-analytics/')) return []
  // pm-marketing-growth: domain-irrelevant → unused (skill layer = unused)
  if (filePath.includes('phuryn/pm-marketing-growth/')) return []
  // Groups entirely po-only
  if (filePath.includes('phuryn/pm-execution/')) return ['po']
  // pm-market-research: 5 skills po-only; customer-journey-map + user-personas → default below
  if (filePath.includes('phuryn/pm-market-research/skills/competitor-analysis/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/market-segments/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/market-sizing/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/sentiment-analysis/')) return ['po']
  if (filePath.includes('phuryn/pm-market-research/skills/user-segmentation/')) return ['po']
  // pm-go-to-market: ideal-customer-profile po-only; gtm-strategy → default below
  if (filePath.includes('phuryn/pm-go-to-market/skills/ideal-customer-profile/')) return ['po']
  // Default phuryn fallback: po+designer
  // (covers: pm-discovery, pm-product-strategy,
  //  pm-market-research/{customer-journey-map,user-personas}, pm-go-to-market/gtm-strategy)
  if (filePath.includes('phuryn/pm-')) return ['po', 'designer']
  return []
}

/**
 * Path substrings that mark a skill as domain-irrelevant for this project.
 *
 * Mirrors PRODUCTUNE_IRRELEVANT_CATEGORIES in setup-skills.sh plus the
 * mattpocock categories whose inferPersonasFromPath explicitly returns []:
 *   - phuryn/pm-data-analytics  — analytics tooling, domain-irrelevant
 *   - phuryn/pm-marketing-growth — marketing/growth, domain-irrelevant
 *   - mattpocock/skills/deprecated — deliberately retired skills
 *   - mattpocock/skills/personal   — personal/non-project skills
 *
 * Keep in sync with PRODUCTUNE_IRRELEVANT_CATEGORIES in setup-skills.sh.
 */
const SKIP_LIST = [
  'phuryn/pm-data-analytics',
  'phuryn/pm-marketing-growth',
  'mattpocock/skills/deprecated',
  'mattpocock/skills/personal',
  'mattpocock/skills/in-progress',
] as const

/**
 * Classify a skill into Layer 1/2/unused per doctrine (common/bookshelf/skills.md).
 *
 * Deterministic order (T-018 fix round 1 — 2026-06-02):
 *  1. personas.length >= 1  → 'explicit'  (Layer 1: pinned to ≥1 persona)
 *  2. filePath matches SKIP_LIST entry → 'unused'  (domain-irrelevant / retired)
 *  3. otherwise             → 'auto'      (Layer 2: installed, not pinned, not skipped)
 *
 * This correctly separates "deliberately skipped" (unused) from
 * "installed but not persona-pinned" (auto). Vendored anthropic/* skills and
 * any other unpinned-but-available skills now resolve to Layer 2 auto.
 */
function classifyLayer(personas: SkillPersona[], filePath: string): SkillLayer {
  if (personas.length >= 1) return 'explicit'
  if (SKIP_LIST.some((pattern) => filePath.includes(pattern))) return 'unused'
  return 'auto'
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  ipcMain.handle('skills:list', (): SkillEntry[] => {
    const skillsRoot = path.join(os.homedir(), '.claude', 'skills')
    if (!fs.existsSync(skillsRoot)) return []

    const files = collectMdFiles(skillsRoot)
    const entries: SkillEntry[] = []

    for (const filePath of files) {
      // Skip template scaffolds — they are not real skills.
      if (filePath.includes('/template/')) continue

      let content: string
      try {
        content = fs.readFileSync(filePath, 'utf-8')
      } catch {
        continue
      }

      const fm = parseSkillFrontmatter(content)

      // Skip supplementary docs — only skill entry files carry both name + description.
      const fmName = (fm.name as string | undefined)?.trim()
      const fmDescription = (fm.description as string | undefined)?.trim()
      if (!fmName || !fmDescription) continue

      const id = filePath.slice(skillsRoot.length + 1).replace(/\\/g, '/')

      const name = fmName
      const description = fmDescription

      let personas: SkillPersona[]
      if (fm.personas) {
        const raw = fm.personas
        const arr: string[] = Array.isArray(raw)
          ? raw
          : String(raw).split(',').map((s) => s.trim()).filter(Boolean)
        personas = arr.filter((p): p is SkillPersona =>
          p === 'po' || p === 'designer' || p === 'dev' || p === 'qa'
        )
      } else {
        personas = inferPersonasFromPath(filePath)
      }

      const layer: SkillLayer = classifyLayer(personas, filePath)
      entries.push({ id, name, description, personas, filePath, layer })
    }

    return entries
  })
}
