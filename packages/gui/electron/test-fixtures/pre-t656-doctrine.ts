import { ipcMain } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs'

// ── Doctrine tier filesystem + IPC (v0.5 T-PATCH-019, #7) ────────────────────
// Backs the Persona Tier Editor. Enumerates each persona's 3 doctrine tiers and
// their .md files, reads any of them, and writes Tier-1 / Tier-2 files only —
// Tier-0 writes are rejected HERE in the main process, not just hidden in the UI.
//
// Persona dir whitelist. NOTE the runtime persona-key → directory split: the GUI
// key `dev` maps to the dir `developer`. This IPC takes the **dir name**
// (`developer`); the caller (T-PATCH-020) is responsible for the key→dir mapping.
const PERSONA_DIRS = new Set(['po', 'designer', 'developer', 'qa'])

type Tier = 0 | 1 | 2

/**
 * Expand a leading `~` / `~/` to the user home dir before resolving. The Tier-2
 * memory rows in the Persona Tier Editor carry tilde paths (e.g.
 * `~/.productune/po/habit.md`); `path.resolve` does NOT expand `~`, so without
 * this the containment check below would never match the Tier-2 root.
 */
function expandHome(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/') || p.startsWith('~' + path.sep)) {
    return path.join(os.homedir(), p.slice(2))
  }
  return p
}

const TIER_ROLE: Record<Tier, string> = {
  0: 'doctrine',
  1: 'project',
  2: 'personal',
}

/**
 * Absolute tier root for a (persona, tier) pair, or null if persona is unknown
 * or projectDir is missing (T1 needs the project dir).
 *  - T0 → ~/.productune/doctrine/persona/<p>/   (read-only)
 *  - T1 → <projectDir>/docs/<p>/
 *  - T2 → ~/.productune/<p>/
 */
function tierRoot(persona: string, tier: Tier, projectDir?: string): string | null {
  if (!PERSONA_DIRS.has(persona)) return null
  switch (tier) {
    case 0:
      return path.join(os.homedir(), '.productune', 'doctrine', 'persona', persona)
    case 1:
      if (!projectDir) return null
      return path.join(path.resolve(projectDir), 'docs', persona)
    case 2:
      return path.join(os.homedir(), '.productune', persona)
    default:
      return null
  }
}

/** All T0 roots across personas — used for the read-only containment check. */
function t0Roots(): string[] {
  return [...PERSONA_DIRS].map((p) => tierRoot(p, 0)!)
}

/** Containment: resolved is `root` itself or sits strictly under it. */
function isInside(resolved: string, root: string): boolean {
  return resolved === root || resolved.startsWith(root + path.sep)
}

/**
 * Guard for a *resolved* candidate path. Confirms the path is one of the
 * allowed doctrine files under some per-persona tier root:
 *   - <root>/habit.md            (immediate file under root), or
 *   - <root>/bookshelf/<name>.md (exactly one level under bookshelf/)
 * Rejects `..` traversal (containment check), non-.md, and the T2 excluded
 * runtime-state shapes (*.json, env files, state/**). When { write: true } and
 * the path resolves inside any T0 root, returns a read-only rejection — this is
 * the load-bearing main-process Tier-0 enforcement.
 *
 * projectDir is required to validate T1 paths; without it T1 simply won't match.
 */
function isAllowedDoctrinePath(
  absPath: string,
  opts: { write: boolean; projectDir?: string },
): { ok: boolean; tier?: Tier; persona?: string; error?: string } {
  if (!absPath) return { ok: false, error: 'path is required' }
  const resolved = path.resolve(expandHome(absPath))

  if (path.extname(resolved).toLowerCase() !== '.md') {
    return { ok: false, error: 'only .md files allowed' }
  }

  // Find the (persona, tier, root) this path belongs to via containment.
  for (const persona of PERSONA_DIRS) {
    const tiers: Tier[] = [0, 1, 2]
    for (const tier of tiers) {
      const root = tierRoot(persona, tier, opts.projectDir)
      if (!root) continue
      if (!isInside(resolved, root)) continue

      // Confirm the allowed nesting shape: <root>/habit.md or
      // <root>/bookshelf/<name>.md — nothing deeper, nothing else.
      const rel = path.relative(root, resolved)
      const parts = rel.split(path.sep)
      const isHabit = parts.length === 1 && parts[0] === 'habit.md'
      const isBookshelf =
        parts.length === 2 && parts[0] === 'bookshelf' && parts[1].toLowerCase().endsWith('.md')
      if (!isHabit && !isBookshelf) {
        return { ok: false, error: 'path is not a doctrine file (habit.md | bookshelf/*.md)' }
      }

      // Explicit assertion that T2 runtime-state shapes can never leak. The
      // habit.md | bookshelf/*.md shape above already excludes these, but assert
      // so a future relaxation of the shape check can't silently leak them.
      const lower = resolved.toLowerCase()
      if (
        lower.endsWith('.json') ||
        lower.endsWith('.env') ||
        path.basename(lower) === 'env' ||
        parts[0] === 'state'
      ) {
        return { ok: false, error: 'non-doctrine runtime file rejected' }
      }

      // Tier-0 is read-only — enforced in the main process.
      if (opts.write && tier === 0) {
        return { ok: false, error: 'tier 0 is read-only' }
      }

      return { ok: true, tier, persona }
    }
  }

  return { ok: false, error: 'path outside per-persona doctrine tier roots rejected' }
}

/** List `*.md` files directly under <root>/bookshelf/, sorted; [] if missing. */
function listBookshelf(root: string): string[] {
  const dir = path.join(root, 'bookshelf')
  try {
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.md'))
      .map((d) => d.name)
      .sort()
  } catch {
    return []
  }
}

interface FileRow {
  tier: Tier
  persona: string
  role: string
  absPath: string
  relName: string
  editable: boolean
  exists: boolean
  mtimeMs: number | null
  sizeBytes: number | null
}

/** Stat a path into a (exists, mtimeMs, sizeBytes) triple, tolerant of misses. */
function statRow(absPath: string): { exists: boolean; mtimeMs: number | null; sizeBytes: number | null } {
  try {
    const st = fs.statSync(absPath)
    return { exists: true, mtimeMs: st.mtimeMs, sizeBytes: st.size }
  } catch {
    return { exists: false, mtimeMs: null, sizeBytes: null }
  }
}

function buildFileRow(
  tier: Tier,
  persona: string,
  root: string,
  relName: string,
): FileRow {
  const absPath = path.join(root, relName)
  const { exists, mtimeMs, sizeBytes } = statRow(absPath)
  return {
    tier,
    persona,
    role: TIER_ROLE[tier],
    absPath,
    relName,
    editable: tier !== 0,
    exists,
    mtimeMs,
    sizeBytes,
  }
}

// ── Register ──────────────────────────────────────────────────────────────────

export function register(): void {
  // ── doctrine:listTiers ───────────────────────────────────────────────────────
  ipcMain.handle(
    'doctrine:listTiers',
    (_event, persona: string, projectDir: string) => {
      if (!PERSONA_DIRS.has(persona)) {
        return { ok: false, error: 'unknown persona' }
      }
      try {
        const tiers = ([0, 1, 2] as Tier[]).map((tier) => {
          const root = tierRoot(persona, tier, projectDir)
          const files: FileRow[] = []
          if (root) {
            // habit.md row always present (exists flag drives the "—" empty state).
            files.push(buildFileRow(tier, persona, root, 'habit.md'))
            // bookshelf/*.md — tolerate missing dir (developer/qa T0 have none).
            for (const name of listBookshelf(root)) {
              files.push(buildFileRow(tier, persona, root, path.join('bookshelf', name)))
            }
          }
          return {
            tier,
            role: TIER_ROLE[tier],
            root: root ?? '',
            editable: tier !== 0,
            files,
          }
        })
        return { ok: true, tiers }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'listTiers failed' }
      }
    },
  )

  // ── doctrine:readFile ────────────────────────────────────────────────────────
  ipcMain.handle(
    'doctrine:readFile',
    (_event, absPath: string, projectDir?: string) => {
      const guard = isAllowedDoctrinePath(absPath, { write: false, projectDir })
      if (!guard.ok) return { ok: false, error: guard.error }
      const resolved = path.resolve(expandHome(absPath))
      try {
        if (!fs.existsSync(resolved)) {
          return { ok: true, content: '', exists: false, mtimeMs: null }
        }
        const content = fs.readFileSync(resolved, 'utf-8')
        const mtimeMs = fs.statSync(resolved).mtimeMs
        return { ok: true, content, exists: true, mtimeMs }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'read failed' }
      }
    },
  )

  // ── doctrine:writeFile ───────────────────────────────────────────────────────
  ipcMain.handle(
    'doctrine:writeFile',
    (_event, absPath: string, content: string, expectedMtimeMs?: number | null, projectDir?: string) => {
      const guard = isAllowedDoctrinePath(absPath, { write: true, projectDir })
      if (!guard.ok) return { ok: false, error: guard.error }
      const resolved = path.resolve(expandHome(absPath))
      try {
        // Conflict check: if a stamp was captured at read time and the file
        // exists, reject when the on-disk mtime has drifted (e.g. an agent
        // promotion append) — without writing.
        if (expectedMtimeMs != null && fs.existsSync(resolved)) {
          const currentMtimeMs = fs.statSync(resolved).mtimeMs
          if (currentMtimeMs !== expectedMtimeMs) {
            return { ok: false, error: 'conflict', conflict: true, currentMtimeMs }
          }
        }
        // Atomic write: mkdir -p, write tmp, rename into place.
        fs.mkdirSync(path.dirname(resolved), { recursive: true })
        const tmp = resolved + '.tmp'
        fs.writeFileSync(tmp, content, 'utf-8')
        fs.renameSync(tmp, resolved)
        const mtimeMs = fs.statSync(resolved).mtimeMs
        return { ok: true, mtimeMs }
      } catch (e: any) {
        return { ok: false, error: e?.message ?? 'write failed' }
      }
    },
  )
}
