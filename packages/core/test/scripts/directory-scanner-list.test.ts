/**
 * T-1268 — the directory-scanner list is declared in ONE place and kept honest here.
 *
 * `prdt track land` runs a package's relevant tests (changed tests, importers, tests naming a changed
 * file). A test that reads a SOURCE directory by listing it (readdir / walk / glob) is reached by none
 * of those: changing a file in that directory lands green, or with no test at all. So a land whose diff
 * touches a package ALWAYS runs that package's directory-scanner tests, read from
 * `packages/core/config/directory-scanners.json` (`tests`), plus the package's own extra test steps.
 *
 * This file is the self-test of that list: it detects, by grepping every test file, a directory read whose
 * argument is a source directory, and fails when such a file is neither listed (`tests`) nor reviewed as a
 * non-scanner (`exempt`, with the reason: it lists a sandbox it built, not the repo's source).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CORE_ROOT = path.resolve(HERE, '..', '..')
const PKGS = path.resolve(CORE_ROOT, '..')
const LIST_FILE = path.join(CORE_ROOT, 'config', 'directory-scanners.json')

type Entry = { scans: string[]; tests: string[]; exempt: Record<string, string> }
const LIST: { packages: Record<string, Entry> } = JSON.parse(fs.readFileSync(LIST_FILE, 'utf8'))

// vitest's own `include` per package (a spec outside it never runs here)
const TEST_FILE: Record<string, RegExp> = {
  'packages/core': /^test\/.*\.test\.tsx?$/,
  'packages/gui': /^(electron|shared|src|scripts)\/.*\.test\.tsx?$/,
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkFiles(p, out)
    else out.push(p)
  }
  return out
}

function testFiles(pkgRel: string): string[] {
  const root = path.join(PKGS, '..', pkgRel)
  return walkFiles(root)
    .map((f) => path.relative(root, f).split(path.sep).join('/'))
    .filter((f) => TEST_FILE[pkgRel].test(f))
    .sort()
}

// A call that lists a directory: the fs readers and the walkers/scanners tests write around them.
const READ_CALL = /\b(readdirSync|readdir|opendirSync|globSync|glob|[A-Za-z]*(?:walk|Walk|scanDir|scanRepo|listRec)[A-Za-z]*)\s*\(/g
// What makes a directory argument a SOURCE directory: a package-root constant, or a source-dir segment.
const SOURCE_ARG = /\b(CORE_ROOT|PKGS|REPO_ROOT|PKG_ROOT|PACKAGE_ROOT|SRC|HOOKS|AGENTS|ANNEX_DIR|REGISTER_DIR|REAL_DISCIPLINE|GUI_ELECTRON)\b|['"`/](src|scripts|migrations|hooks|agents|contracts|register|discipline|electron|shared)['"`/]|'\.\.\/(src|scripts|migrations)'|migrationsDir/

/** The first argument of the call whose `(` is at `open`: up to the first top-level `,` or the closing `)`. */
function firstArg(text: string, open: number): string {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) return text.slice(open + 1, i)
    } else if (c === ',' && depth === 1) return text.slice(open + 1, i)
  }
  return text.slice(open + 1)
}

/** True when `text` lists a source directory: some read call's first argument (an identifier is followed
 *  one assignment back) matches SOURCE_ARG. A walker's own definition and its recursion are not call sites
 *  of a source dir — their argument is a parameter. */
export function readsSourceDir(text: string): boolean {
  for (const m of text.matchAll(READ_CALL)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 9), m.index)
    if (/function\s+$/.test(before)) continue
    const arg = firstArg(text, (m.index ?? 0) + m[0].length - 1).trim()
    let probe = arg
    const id = /^[A-Za-z_$][\w$]*$/.exec(arg)
    if (id) {
      const rhs = new RegExp(`(?:const|let|var)\\s+${id[0].replace(/\$/g, '\\$')}\\s*=\\s*([^\\n]+)`).exec(text)
      if (rhs) probe = `${arg} ${rhs[1]}`
    }
    if (SOURCE_ARG.test(probe)) return true
  }
  return false
}

describe('T-1268: the directory-scanner list', () => {
  test('the detector sees a source-dir read and ignores a sandbox listing', () => {
    expect(readsSourceDir("const SRC = path.resolve(__dirname, '..', 'src')\nwalk(SRC)")).toBe(true)
    expect(readsSourceDir("for (const n of fs.readdirSync(path.join(CORE_ROOT, 'scripts'))) {}")).toBe(true)
    expect(readsSourceDir("const migrationsDir = path.resolve(__dirname, '../migrations')\nfs.readdirSync(migrationsDir)")).toBe(true)
    expect(readsSourceDir('expect(fs.readdirSync(outside)).toEqual([])')).toBe(false)
    expect(readsSourceDir("function walk(dir) { for (const e of fs.readdirSync(dir)) walk(p) }")).toBe(false)
    expect(readsSourceDir("fs.readdirSync(path.join(proj, 'docs', 'tickets'))")).toBe(false)
  })

  test('the file is one JSON object keyed by vitest package, every entry well-formed', () => {
    expect(Object.keys(LIST.packages).sort()).toEqual(['packages/core', 'packages/gui'])
    for (const [pkg, e] of Object.entries(LIST.packages)) {
      expect(Array.isArray(e.scans) && e.scans.includes(pkg), `${pkg}: scans must include the package itself`).toBe(true)
      expect(Array.isArray(e.tests), `${pkg}: tests`).toBe(true)
      expect(typeof e.exempt === 'object' && e.exempt !== null, `${pkg}: exempt`).toBe(true)
      for (const [t, why] of Object.entries(e.exempt)) expect(why.length, `${pkg}: exempt ${t} needs a reason`).toBeGreaterThan(10)
    }
  })

  for (const pkg of ['packages/core', 'packages/gui']) {
    describe(pkg, () => {
      const files = testFiles(pkg)
      const root = path.join(PKGS, '..', pkg)
      const e = LIST.packages[pkg]

      test('every test file that lists a source directory is declared (tests) or reviewed as a non-scanner (exempt)', () => {
        const found = files.filter((f) => readsSourceDir(fs.readFileSync(path.join(root, f), 'utf8')))
        const undeclared = found.filter((f) => !e.tests.includes(f) && !(f in e.exempt))
        expect(undeclared, `add each to ${path.relative(PKGS, LIST_FILE)} → ${pkg}: "tests" if it scans a source dir, "exempt" (with the reason) if it lists a sandbox`).toEqual([])
      })

      test('every declared test exists, and nothing is both declared and exempt', () => {
        expect(e.tests.filter((t) => !files.includes(t)), 'listed test file missing').toEqual([])
        expect(Object.keys(e.exempt).filter((t) => !files.includes(t)), 'exempt test file missing').toEqual([])
        expect(e.tests.filter((t) => t in e.exempt)).toEqual([])
      })

      test('an exempt file still reads a source-looking dir — one that no longer does is removed from exempt', () => {
        const stale = Object.keys(e.exempt).filter((f) => files.includes(f) && !readsSourceDir(fs.readFileSync(path.join(root, f), 'utf8')))
        expect(stale).toEqual([])
      })
    })
  }

  test('every scanned path exists', () => {
    for (const e of Object.values(LIST.packages)) for (const s of e.scans) expect(fs.existsSync(path.join(PKGS, '..', s)), s).toBe(true)
  })
})
