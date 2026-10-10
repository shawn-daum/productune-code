/**
 * T-973 — `prdt viewer <path>…` is the PO hand-off command for documents: one
 * paste-ready `[label](file://<jump page>)` per path, the jump page forwarding
 * to `viewer.html#<anchor>` (the scheme `prdt tickets --link` uses). A path the
 * viewer does not carry is printed as `[label](file://<absolute-path>)`.
 * Runs the REAL generator of this checkout in a bare project.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const HAS_GENERATOR = fs.existsSync(path.join(CORE_ROOT, '..', 'gui', 'node_modules'))

function write(root: string, rel: string, text: string) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), text)
}

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t973-'))
  const root = path.join(dir, 'proj')
  write(root, '.prdt/po-state.json', JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
  write(root, 'docs/tickets/v1.0/T-001.md',
    '---\nid: T-001\nslug: first\ntype: impl\nstatus: open\nassignee: developer\ncreated: 2026-09-28\n---\n\n## problem\n\nhello\n')
  write(root, 'docs/wiki/fact--x.md', '---\ntitle: x\ntype: fact\nstatus: live\n---\nbody\n')
  write(root, 'docs/prd/PRD.md', '# PRD\n\n## v1.0\n\ngoal\n')
  write(root, 'docs/features/f.md', '# f\n\nspec\n')
  write(root, 'docs/artifacts/v1.0/notes.md', '# notes\n')
  write(root, 'docs/artifacts/manifest.json', JSON.stringify({ entries: [{ bucket: 'v1.0', path: 'notes.md' }] }))
  const home = path.join(dir, 'home')
  const prdtHome = path.join(dir, 'prdt-home')
  fs.mkdirSync(home)
  fs.mkdirSync(prdtHome)
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, PRDT_HOME: prdtHome }
  return { root: fs.realpathSync(root), env }
}

function viewerLines(p: ReturnType<typeof project>, ...targets: string[]): string[] {
  return execFileSync('python3', [PRDT_CLI, 'viewer', '--no-open', ...targets],
    { cwd: p.root, env: p.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n')
}

const jumpOf = (root: string, name: string) => fs.readFileSync(path.join(root, '.prdt', 'scratch', 'viewer', 'at', name), 'utf8')
const atDir = (root: string) => path.join(root, '.prdt', 'scratch', 'viewer', 'at')

describe.skipIf(!HAS_GENERATOR)('prdt viewer <path> — hand-off links per item kind (T-973)', () => {
  test('PRD (plain and with a #section suffix) → a viewer link at the PRD', () => {
    const p = project()
    const [plain, section] = viewerLines(p, 'docs/prd/PRD.md', 'docs/prd/PRD.md#v1.0')
    for (const line of [plain, section]) {
      expect(line).toMatch(new RegExp(`^\\[docs/prd/PRD\\.md\\]\\(file://${atDir(p.root)}/docs_prd_PRD\\.md-[0-9a-f]{8}\\.html\\)$`))
    }
    expect(jumpOf(p.root, path.basename(plain.replace(/\)$/, '')))).toContain('url=../viewer.html#docs/prd/PRD.md')
  }, 60000)

  test('artifact registered in manifest.json → viewer link keyed by its repo path', () => {
    const p = project()
    const [line] = viewerLines(p, 'docs/artifacts/v1.0/notes.md')
    expect(line).toMatch(new RegExp(`^\\[docs/artifacts/v1\\.0/notes\\.md\\]\\(file://${atDir(p.root)}/.+\\.html\\)$`))
    expect(jumpOf(p.root, path.basename(line.replace(/\)$/, '')))).toContain('url=../viewer.html#docs/artifacts/v1.0/notes.md')
  }, 60000)

  test('wiki page → viewer link keyed by its slug', () => {
    const p = project()
    const [line] = viewerLines(p, 'docs/wiki/fact--x.md')
    expect(line).toBe(`[fact--x](file://${path.join(atDir(p.root), 'fact--x.html')})`)
    expect(jumpOf(p.root, 'fact--x.html')).toContain('url=../viewer.html#fact--x')
  }, 60000)

  test('feature spec → viewer link keyed by its repo path', () => {
    const p = project()
    const [line] = viewerLines(p, 'docs/features/f.md')
    expect(line).toMatch(new RegExp(`^\\[docs/features/f\\.md\\]\\(file://${atDir(p.root)}/.+\\.html\\)$`))
    expect(jumpOf(p.root, path.basename(line.replace(/\)$/, '')))).toContain('url=../viewer.html#docs/features/f.md')
  }, 60000)

  test('a path the viewer does not carry → [label](file://<absolute-path>), never a viewer link', () => {
    const p = project()
    write(p.root, 'docs/artifacts/v1.0/mock.html', '<p>x</p>')
    write(p.root, 'docs/artifacts/v1.0/unsynced.md', '# unsynced\n')
    write(p.root, 'notes/other.md', '# other\n')
    const lines = viewerLines(p, 'docs/artifacts/v1.0/mock.html', 'docs/artifacts/v1.0/unsynced.md', 'notes/other.md')
    expect(lines).toEqual([
      `[docs/artifacts/v1.0/mock.html](file://${path.join(p.root, 'docs/artifacts/v1.0/mock.html')})`,
      `[docs/artifacts/v1.0/unsynced.md](file://${path.join(p.root, 'docs/artifacts/v1.0/unsynced.md')})`,
      `[notes/other.md](file://${path.join(p.root, 'notes/other.md')})`,
    ])
  }, 60000)

  test('several paths in one call → one full link per path, in the order given', () => {
    const p = project()
    const lines = viewerLines(p, 'docs/wiki/fact--x.md', 'docs/prd/PRD.md', 'docs/features/f.md', 'docs/artifacts/v1.0/notes.md')
    expect(lines).toHaveLength(4)
    expect(lines.map((l) => /^\[([^\]]+)\]/.exec(l)![1])).toEqual(
      ['fact--x', 'docs/prd/PRD.md', 'docs/features/f.md', 'docs/artifacts/v1.0/notes.md'])
    for (const l of lines) expect(l).toMatch(new RegExp(`\\(file://${atDir(p.root)}/[^)]+\\.html\\)$`))
  }, 60000)
})
