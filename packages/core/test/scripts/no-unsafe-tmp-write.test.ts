/**
 * no-unsafe-tmp-write.test.ts — T-656 ratchet.
 *
 * The class this closes: a writer builds a FIXED `<path>.tmp` name (string
 * concatenation, or `Path.with_suffix('.tmp')` / `Path.with_name(x + '.tmp')`,
 * or a shell redirect onto a literal `foo.tmp`) and opens it with a plain
 * write call — `fs.writeFileSync`, `open(tmp, 'w')`, `> "$X.tmp"` — none of
 * which refuse an existing symlink there. `renameSync`/`os.replace`/`mv` then
 * consumes the symlink with no trace. The safe shape (T-647 precedent,
 * `docs/wiki/fact--symlink-safe-writes.md`) opens that SAME fixed name with
 * `O_EXCL` (Node's `'wx'` flag, Python's `os.O_EXCL`) or sidesteps the fixed
 * name entirely with `mktemp`/a randomized suffix.
 *
 * Three rounds (T-567 → security pass F1 → T-647) each closed one instance
 * and left siblings standing — the failure mode this ratchet targets is
 * "safe primitive written next to the unsafe one, instance by instance,
 * with nothing that remembers." So: this test greps the shipped surfaces for
 * the fixed-name-without-O_EXCL shape and asserts the match set equals a
 * DECLARED allowlist below — any new site fails the build by name and line
 * the moment it appears, with no memory required. Today's allowlist is the
 * plan for what's left (CLI 11 sites, `packages/core/scripts/prdt` — later
 * slice; GUI and install.sh were closed in T-656 slice C, see Outcome).
 *
 * Detection is line + local-context heuristic, not an AST — good enough to
 * catch the actual recurring idiom (verified against every site the manual
 * sweep in the T-656 ticket Outcome found) without chasing full parsers for
 * three languages. A site is flagged only when no safety marker (`O_EXCL`,
 * `'wx'`/`"wx"`, `mktemp`) appears within a small window around the match —
 * that is what lets `packages/core/src/fs/atomic-write.ts` (the helper
 * itself, T-656) and the already-fixed hooks (T-647's `atomic_write`, still
 * built as `tmp = path + ".tmp"` followed a few lines later by `O_CREAT |
 * O_EXCL`) score as SAFE rather than as new violations.
 *
 * Judgment call worth recording here (see T-656 ticket Outcome for the full
 * line): `packages/gui/electron/chat-store.ts`'s `atomicWrite()` builds its
 * temp name as `` `.tmp-${Date.now()}-${Math.random()...}` `` — randomized,
 * not a fixed suffix built by concatenation — so it does not match either
 * detection shape below, by construction rather than by exclusion list. That
 * is deliberate: a name an attacker cannot predict in advance cannot be
 * pre-planted as a symlink, so it is not an instance of the class this
 * ratchet closes, and forcing it onto the same pattern would blur a real
 * difference in risk grade.
 */

import fs from 'fs'
import path from 'path'
import { describe, test } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const REPO_ROOT = path.resolve(CORE_ROOT, '..', '..')
const GUI_ELECTRON = path.join(REPO_ROOT, 'packages', 'gui', 'electron')

interface Site {
  /** repo-relative, forward-slash path */
  file: string
  line: number
  excerpt: string
}

// A fixed fs `.tmp` suffix name is always built the same handful of ways:
//   TS/JS/Python string concat:  X + '.tmp'   /   X + ".tmp"
//   Python pathlib:              X.with_suffix(".tmp")
// (`X.with_name(y + ".tmp")` is already caught by the concat regex, since the
// literal text `+ ".tmp"` still appears inside the call.)
const CONCAT_RE = /[+]\s*["'`]\.tmp["'`]/
const WITH_SUFFIX_RE = /\.with_suffix\(\s*["']\.tmp["']\s*\)/
// Shell: a redirect writing onto a literal, non-randomized `*.tmp` path.
const SHELL_REDIRECT_RE = />\s*["'][^"'\n]*\.tmp["']/

// Any of these within the local context window marks the match as already
// symlink-safe: O_EXCL (Python/POSIX), Node's 'wx' open flag, or mktemp
// (sidesteps the fixed name entirely).
const SAFETY_MARKER_RE = /O_EXCL|(['"])wx\1|mktemp/

const CONTEXT_BEFORE = 3
const CONTEXT_AFTER = 12

type Kind = 'ts-py' | 'sh'

function isCandidateLine(line: string, kind: Kind): boolean {
  if (CONCAT_RE.test(line) || WITH_SUFFIX_RE.test(line)) return true
  if (kind === 'sh' && SHELL_REDIRECT_RE.test(line)) return true
  return false
}

function scanText(text: string, relPath: string, kind: Kind): Site[] {
  const lines = text.split('\n')
  const sites: Site[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!isCandidateLine(lines[i], kind)) continue
    const windowStart = Math.max(0, i - CONTEXT_BEFORE)
    const windowEnd = Math.min(lines.length, i + CONTEXT_AFTER + 1)
    const windowText = lines.slice(windowStart, windowEnd).join('\n')
    if (SAFETY_MARKER_RE.test(windowText)) continue
    sites.push({ file: relPath, line: i + 1, excerpt: lines[i].trim() })
  }
  return sites
}

function relToRepo(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/')
}

function scanFile(absPath: string, kind: Kind): Site[] {
  let text: string
  try {
    text = fs.readFileSync(absPath, 'utf8')
  } catch {
    return []
  }
  return scanText(text, relToRepo(absPath), kind)
}

function walk(dir: string, exts: string[], excludeTestFiles: boolean): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      // test-fixtures/: pinned pre-fix source snapshots (T-656 slice C) — verbatim
      // copies of vulnerable code kept ON PURPOSE for symlink-attack regression
      // tests to run against; scanning them here would flag known, already-fixed
      // history as a live violation.
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git' || e.name === 'test-fixtures') continue
      out.push(...walk(p, exts, excludeTestFiles))
    } else if (e.isFile()) {
      if (!exts.some((ext) => e.name.endsWith(ext))) continue
      if (excludeTestFiles && /\.test\.tsx?$/.test(e.name)) continue
      out.push(p)
    }
  }
  return out
}

function scanDir(dir: string, exts: string[], kind: Kind): Site[] {
  return walk(dir, exts, true).flatMap((f) => scanFile(f, kind))
}

// ── The declared allowlist ───────────────────────────────────────────────────
//
// Every entry here is a KNOWN, reviewed, not-yet-fixed site — never a blanket
// exemption for a file or directory. Shrinking this list is how a fix lands;
// growing it silently (instead of via a reviewed diff) is exactly what this
// ratchet exists to make impossible. `file:line` — one per site.
const ALLOWLIST: string[] = [
  // packages/core/scripts/prdt (Python CLI) — CLOSED (T-656 slice B): all 11
  // former sites (799/1431/1547/1982/3415/3581/6564/7041/8287/8406/9244) now
  // route through `atomic_write_text()` (defined right after `read_json` in
  // scripts/prdt), the CLI-side counterpart of `atomic_write` in
  // prdt-post-dispatch.sh (T-647). See no-unsafe-tmp-write-cli.test.ts for
  // the pinned-fixture symlink-attack regression per site.
  // packages/gui/electron and install.sh:191 — fixed in T-656 slice C
  // (atomicWriteFileSync from packages/core/src/fs/atomic-write.ts for the
  // GUI writers; mktemp, matching install.sh's own :279 convention, for the
  // register migration). Shrunk from this allowlist accordingly.
]

describe('no unsafe fixed-name .tmp write appears without O_EXCL (T-656 ratchet)', () => {
  test('scanned surfaces match exactly the declared allowlist', () => {
    const found: Site[] = [
      ...scanDir(path.join(CORE_ROOT, 'src'), ['.ts'], 'ts-py'),
      ...scanDir(path.join(CORE_ROOT, 'scripts', 'hooks'), ['.sh'], 'sh'),
      ...scanFile(path.join(CORE_ROOT, 'scripts', 'prdt'), 'ts-py'),
      ...scanFile(path.join(CORE_ROOT, 'scripts', 'install.sh'), 'sh'),
      ...scanDir(GUI_ELECTRON, ['.ts'], 'ts-py'),
    ]

    const byKey = new Map<string, Site>()
    for (const s of found) byKey.set(`${s.file}:${s.line}`, s)
    const foundKeys = [...byKey.keys()].sort()
    const allowSorted = [...new Set(ALLOWLIST)].sort()

    const newSites = foundKeys.filter((k) => !allowSorted.includes(k))
    const staleEntries = allowSorted.filter((k) => !foundKeys.includes(k))

    if (newSites.length > 0 || staleEntries.length > 0) {
      const lines: string[] = []
      if (newSites.length > 0) {
        lines.push('New unsafe-tmp-write site(s) not on the allowlist (fix them with')
        lines.push('atomicWriteFileSync from packages/core/src/fs/atomic-write.ts, or add')
        lines.push('them to ALLOWLIST above with a one-word reason):')
        for (const k of newSites) {
          const s = byKey.get(k)!
          lines.push(`  ${k}  ${s.excerpt}`)
        }
      }
      if (staleEntries.length > 0) {
        lines.push('Allowlist entr(y/ies) no longer found by the scan — the site was fixed')
        lines.push('(or moved); shrink ALLOWLIST to match:')
        for (const k of staleEntries) lines.push(`  ${k}`)
      }
      throw new Error(lines.join('\n'))
    }
  })
})
