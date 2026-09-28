/**
 * T-746 — hand-offs and auto-open open the static viewer at the item.
 *
 * Hook half (prdt-auto-open.sh): a PO Write of a document the viewer shows
 * opens the forwarding page `prdt viewer --no-open` prints (a stub `prdt`
 * here, via PRDT_BIN); no viewer → PRD.md falls back to the file itself, the
 * other documents stay silent; `--open <file>` (the CLI's hand-off mode)
 * honours auto-open=off and is never debounced.
 *
 * CLI half (`prdt tickets --link` / `prdt viewer`): against the REAL
 * generator of this checkout (self-reference), in a bare project that has no
 * code checkout of its own. `open` is always a logging shim — no window.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-auto-open.sh')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const HAS_GENERATOR = fs.existsSync(path.join(CORE_ROOT, '..', 'gui', 'node_modules'))

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

/** fake bin dir (open → log, lsappinfo → one running handler) + a HOME whose
 *  LaunchServices plist maps public.html to that handler, so the warm-handler
 *  rule (T-571) lets a light open through. */
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t746-'))
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  const log = path.join(dir, 'open.log')
  fs.writeFileSync(path.join(bin, 'open'), `#!/usr/bin/env bash\necho "$@" >> "${log}"\n`, { mode: 0o755 })
  fs.writeFileSync(path.join(bin, 'lsappinfo'), '#!/usr/bin/env bash\n[ "$1" = list ] && echo \'  bundleID="com.test.viewer"\'\nexit 0\n', { mode: 0o755 })
  const home = path.join(dir, 'home')
  const ls = path.join(home, 'Library', 'Preferences', 'com.apple.LaunchServices')
  fs.mkdirSync(ls, { recursive: true })
  const src = path.join(dir, 'h.json')
  const utis = ['public.html', 'net.daringfireball.markdown']
  fs.writeFileSync(src, JSON.stringify({ LSHandlers: utis.map((u) => ({ LSHandlerContentType: u, LSHandlerRoleAll: 'com.test.viewer' })) }))
  execFileSync('plutil', ['-convert', 'xml1', '-o', path.join(ls, 'com.apple.launchservices.secure.plist'), src])
  const prdtHome = path.join(dir, 'prdt-home')
  fs.mkdirSync(prdtHome)
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: home, PRDT_HOME: prdtHome }
  delete env.PRDT_GUI_SESSION
  delete env.PRDT_AUTO_OPEN_DEBOUNCE_SECS
  return { dir, log, env, prdtHome }
}

function readLog(log: string): string {
  try { return fs.readFileSync(log, 'utf8').trim() } catch { return '' }
}

/** A project with one ticket and one wiki page. */
function project(dir: string): string {
  const root = path.join(dir, 'proj')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
  fs.mkdirSync(path.join(root, 'docs', 'tickets', 'v1.0'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs', 'tickets', 'v1.0', 'T-001.md'),
    '---\nid: T-001\nslug: first\ntype: impl\nstatus: open\nassignee: developer\ncreated: 2026-09-28\n---\n\n## problem\n\nhello\n')
  fs.mkdirSync(path.join(root, 'docs', 'wiki'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs', 'wiki', 'fact--x.md'), '---\ntitle: x\ntype: fact\nstatus: live\n---\nbody\n')
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'PRD.md'), '# PRD\n')
  return root
}

/** Stub `prdt`: `viewer --no-open <file>` prints a link to a forwarding page
 *  under `.prdt/scratch/viewer/at/` (creating it), or fails when told to. */
function stubPrdt(dir: string, root: string, fail = false): string {
  const jump = path.join(root, '.prdt', 'scratch', 'viewer', 'at', 'stub.html')
  const p = path.join(dir, fail ? 'prdt-fail' : 'prdt-ok')
  fs.writeFileSync(p, fail ? '#!/usr/bin/env bash\nexit 1\n'
    : `#!/usr/bin/env bash\n[ "$1 $2" = "viewer --no-open" ] || exit 2\nmkdir -p "${path.dirname(jump)}"\necho '<!doctype html>' > "${jump}"\necho "[x](file://${jump})"\n`, { mode: 0o755 })
  return p
}

function writeEvent(filePath: string): string {
  return JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: filePath } })
}

describe('hook — viewer-routed documents', () => {
  test.skipIf(!hasJq())('a wiki / feature spec / artifact .md write opens the forwarding page, not the file', () => {
    for (const rel of ['docs/wiki/fact--x.md', 'docs/features/f.md', 'docs/artifacts/v1.0/notes.md', 'docs/prd/PRD.md']) {
      const s = sandbox()
      const root = project(s.dir)
      const file = path.join(root, rel)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, 'x')
      execFileSync('bash', [HOOK], { input: writeEvent(file), env: { ...s.env, PRDT_BIN: stubPrdt(s.dir, root) } })
      expect(readLog(s.log), rel).toBe(path.join(root, '.prdt', 'scratch', 'viewer', 'at', 'stub.html'))
    }
  })

  test.skipIf(!hasJq())('no viewer: PRD.md still opens as the file, a wiki page stays silent', () => {
    const s = sandbox()
    const root = project(s.dir)
    const env = { ...s.env, PRDT_BIN: stubPrdt(s.dir, root, true) }
    execFileSync('bash', [HOOK], { input: writeEvent(path.join(root, 'docs', 'wiki', 'fact--x.md')), env })
    expect(readLog(s.log)).toBe('')
    execFileSync('bash', [HOOK], { input: writeEvent(path.join(root, 'docs', 'prd', 'PRD.md')), env })
    expect(readLog(s.log)).toBe(path.join(root, 'docs', 'prd', 'PRD.md'))
  })

  test.skipIf(!hasJq())('a ticket write and an .html artifact keep their pre-T-746 behavior', () => {
    const s = sandbox()
    const root = project(s.dir)
    const env = { ...s.env, PRDT_BIN: stubPrdt(s.dir, root) }
    execFileSync('bash', [HOOK], { input: writeEvent(path.join(root, 'docs', 'tickets', 'v1.0', 'T-001.md')), env })
    expect(readLog(s.log)).toBe('')
    const html = path.join(root, 'docs', 'artifacts', 'v1.0', 'mock.html')
    fs.mkdirSync(path.dirname(html), { recursive: true })
    fs.writeFileSync(html, '<p>x</p>')
    execFileSync('bash', [HOOK], { input: writeEvent(html), env })
    expect(readLog(s.log)).toBe(html)
  })
})

describe('hook — --open hand-off mode', () => {
  test.skipIf(!hasJq())('opens the given file, twice in a row (no debounce)', () => {
    const s = sandbox()
    const f = path.join(s.dir, 'page.html')
    fs.writeFileSync(f, 'x')
    execFileSync('bash', [HOOK, '--open', f], { env: s.env, input: '' })
    execFileSync('bash', [HOOK, '--open', f], { env: s.env, input: '' })
    expect(readLog(s.log)).toBe(`${f}\n${f}`)
  })

  test.skipIf(!hasJq())('auto-open = off and a GUI session both suppress it', () => {
    const s = sandbox()
    const f = path.join(s.dir, 'page.html')
    fs.writeFileSync(f, 'x')
    execFileSync('bash', [HOOK, '--open', f], { env: { ...s.env, PRDT_GUI_SESSION: '1' }, input: '' })
    fs.writeFileSync(path.join(s.prdtHome, 'auto-open'), 'off\n')
    execFileSync('bash', [HOOK, '--open', f], { env: s.env, input: '' })
    expect(readLog(s.log)).toBe('')
  })
})

describe('CLI — links open the viewer (real generator, project with no code checkout)', () => {
  test.skipIf(!hasJq() || !HAS_GENERATOR)('tickets --link prints a forwarding link to viewer.html#T-001 and opens it; unknown ids unchanged', () => {
    const s = sandbox()
    const root = fs.realpathSync(project(s.dir))
    fs.mkdirSync(path.join(s.prdtHome, 'hooks'))
    fs.copyFileSync(HOOK, path.join(s.prdtHome, 'hooks', 'prdt-auto-open.sh'))
    const out = execFileSync('python3', [PRDT_CLI, 'tickets', '--link', 'T-001', 'T-404'], { cwd: root, env: s.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const jump = path.join(root, '.prdt', 'scratch', 'viewer', 'at', 'T-001.html')
    expect(out).toBe(`[T-001](file://${jump})\nT-404 (not found)\n`)
    expect(fs.readFileSync(jump, 'utf8')).toContain('url=../viewer.html#T-001')
    expect(fs.existsSync(path.join(root, '.prdt', 'scratch', 'viewer', 'viewer.html'))).toBe(true)
    expect(readLog(s.log)).toBe(jump)
  }, 60000)

  test.skipIf(!hasJq() || !HAS_GENERATOR)('viewer --no-open: wiki → slug, PRD → path, .html → the file itself; nothing opened', () => {
    const s = sandbox()
    const root = fs.realpathSync(project(s.dir))
    const html = path.join(root, 'docs', 'artifacts', 'v1.0', 'mock.html')
    fs.mkdirSync(path.dirname(html), { recursive: true })
    fs.writeFileSync(html, '<p>x</p>')
    const out = execFileSync('python3', [PRDT_CLI, 'viewer', '--no-open', 'docs/wiki/fact--x.md', 'docs/prd/PRD.md', html],
      { cwd: root, env: s.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n')
    const at = path.join(root, '.prdt', 'scratch', 'viewer', 'at')
    expect(out[0]).toBe(`[fact--x](file://${path.join(at, 'fact--x.html')})`)
    expect(out[1]).toMatch(new RegExp(`^\\[docs/prd/PRD.md\\]\\(file://${at}/docs_prd_PRD.md-[0-9a-f]{8}\\.html\\)$`))
    expect(out[2]).toBe(`[${html}](file://${html})`)
    expect(fs.readFileSync(path.join(at, 'fact--x.html'), 'utf8')).toContain('url=../viewer.html#fact--x')
    expect(readLog(s.log)).toBe('')
  }, 60000)
})
