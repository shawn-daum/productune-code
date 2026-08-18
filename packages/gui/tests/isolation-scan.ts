/**
 * isolation-scan.ts — T-442 F-A. The static half of the isolation rule.
 *
 * The runtime chokepoint in `isolation-enforcer.ts` is what makes an
 * unsandboxed launch IMPOSSIBLE. This scan is not that; it is the early,
 * readable failure that names the offending line and points at the harness,
 * so an author sees a rule violation instead of a stack trace from a wrapped
 * function three layers down.
 *
 * The previous version of this scan was the round-2 FAIL. Its file set was
 * `readdirSync(tests/).filter(f => f.endsWith('.spec.ts'))`. Playwright's
 * default testMatch is `**​/*.@(spec|test).?(c|m)[jt]s?(x)`, so the scan covered
 * a strict subset of the files that actually run. Three properties are fixed
 * here, and each one maps to a bypass QA actually executed:
 *
 *   RECURSIVE  — `tests/sub/evil-subdir.spec.ts` was invisible to readdirSync.
 *   ALL SUFFIXES — `tests/evil-suffix.test.ts` is collected by Playwright and
 *                  was invisible to an `.endsWith('.spec.ts')` filter.
 *   NON-SPEC FILES TOO — `tests/evil-viahelper.spec.ts` was itself clean; the
 *                  banned call lived in `tests/evil-helper.ts`. So the unit of
 *                  scanning is every CODE file under the test root, not the
 *                  set Playwright collects. The collected set is a subset, and
 *                  `isolation.guard.spec.ts` asserts that containment against
 *                  Playwright's own `--list` output rather than trusting this
 *                  file's idea of the glob.
 *
 * WHAT THIS FILE CANNOT DO — measured, and asserted as a test
 *
 * A text scan loses to string assembly. A spec that builds the binary path out
 * of `path.join('Electron.app', 'Contents', 'MacOS', …)` fragments and spawns
 * it through `child_process` contains no matchable literal and never names
 * `_electron`; this scan returns clean on it. `isolation.guard.spec.ts` pins
 * that miss with an explicit assertion so the gap stays visible.
 *
 * That is survivable only because this is NOT the gate. The gate is the runtime
 * chokepoint in `isolation-enforcer.ts`, which sees the call no matter how the
 * arguments were spelled. Treat a clean scan as "nothing obvious", never as
 * "nothing".
 */

import fs from 'fs'
import path from 'path'

/** Playwright's default `testMatch`, as a regex over the file name. */
export const PLAYWRIGHT_TEST_FILE_RE = /\.(spec|test)\.(c|m)?[jt]sx?$/

/** Anything that can hold executable code and therefore a banned call. */
export const CODE_FILE_RE = /\.(c|m)?[jt]sx?$/

/** Directories that can never contain a collected test file. */
const SKIP_DIRS = new Set(['node_modules', 'test-results', 'playwright-report', 'dist', 'dist-electron'])

/**
 * Files allowed to name the banned pattern, keyed by POSIX path relative to the
 * scan root. Basenames are deliberately NOT used: `sub/harness.ts` must not
 * inherit the top-level exemption.
 *
 * This list cannot open a real hole. The runtime enforcer has no exemptions at
 * all — these files are launch-safe because they satisfy it, not because they
 * appear here — and `isolation.guard.spec.ts` pins the list to exactly these
 * four entries, so adding a fifth is a visible edit to an assertion.
 */
export const SCAN_EXEMPT: ReadonlySet<string> = new Set([
  'harness.ts', // the one sanctioned launcher
  'isolation-enforcer.ts', // typed surface over the rules, so it names them
  'isolation-rules.cjs', // T-450: the rules themselves — they ARE the patterns
  'isolation-scan.ts', // this file: the patterns are the search
  'isolation.guard.spec.ts', // asserts on all of the above
])

export interface Offender {
  /** POSIX path relative to the scan root. */
  file: string
  line: number
  text: string
  rule: string
}

interface Rule {
  id: string
  re: RegExp
  why: string
}

const RULES: Rule[] = [
  {
    id: 'electron-launch',
    re: /\b_electron\b|\belectron\s*\.\s*launch\s*\(/,
    why: "Playwright's Electron launcher, called outside tests/harness.ts",
  },
  {
    id: 'dynamic-playwright-require',
    // RUNTIME dynamic access only. TypeScript's `import('@playwright/test').Locator`
    // is a type operator, erased at compile time and common in type annotations
    // (smoke.spec.ts:32 uses it) — flagging it would be a false positive, and a
    // rule that cries wolf is a rule someone deletes.
    //
    // This is a narrow net on purpose: any dynamic handle still has to name
    // `_electron` to reach the launcher, which rule 1 catches on its own line,
    // and the runtime enforcer blocks the call whatever it was reached through.
    re: /require\s*\(\s*['"]@playwright\/test['"]\s*\)|await\s+import\s*\(\s*['"]@playwright\/test['"]\s*\)/,
    why: 'dynamic access to @playwright/test, which dodges an import-based read of this file',
  },
  {
    id: 'hardcoded-main-entry',
    re: /dist-electron[/\\]main\.js/,
    why: 'the app entry hardcoded instead of MAIN from tests/harness.ts',
  },
  {
    id: 'app-binary-spawn',
    re: /\.app[/\\]Contents[/\\]MacOS[/\\]/,
    why: 'a macOS app bundle executable, i.e. booting the app around the harness',
  },
]

/** Every code file under `root`, recursively. POSIX-relative paths, sorted. */
export function listCodeFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue
        walk(full)
      } else if (e.isFile() && CODE_FILE_RE.test(e.name)) {
        out.push(path.relative(root, full).split(path.sep).join('/'))
      }
    }
  }
  walk(root)
  return out.sort()
}

/** The subset of `listCodeFiles` that Playwright's default testMatch collects. */
export function listCollectableTestFiles(root: string): string[] {
  return listCodeFiles(root).filter((f) => PLAYWRIGHT_TEST_FILE_RE.test(path.basename(f)))
}

/** Every banned line under `root`, excluding `exempt` (POSIX-relative paths). */
export function scanForUnsanctionedLaunch(
  root: string,
  exempt: ReadonlySet<string> = SCAN_EXEMPT,
): Offender[] {
  const offenders: Offender[] = []
  for (const rel of listCodeFiles(root)) {
    if (exempt.has(rel)) continue
    const src = fs.readFileSync(path.join(root, rel), 'utf-8')
    src.split('\n').forEach((line, i) => {
      for (const rule of RULES) {
        if (rule.re.test(line)) {
          offenders.push({ file: rel, line: i + 1, text: line.trim(), rule: `${rule.id}: ${rule.why}` })
          break
        }
      }
    })
  }
  return offenders
}

export function formatOffenders(offenders: Offender[]): string {
  return offenders.map((o) => `  ${o.file}:${o.line}  [${o.rule}]\n      ${o.text}`).join('\n')
}
