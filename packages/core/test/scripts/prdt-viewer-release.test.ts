/**
 * prdt-viewer-release.test.ts — T-1303: `prdt viewer code/docs/RELEASES.md`
 * and `prdt viewer --release v<N>.<m>` print a viewer link (a forwarding page
 * under `.prdt/scratch/viewer/at/`) that opens the release-notes view, at that
 * version's section when one is named; the working-tree file (an uncommitted
 * draft) is what the viewer shows. Black-box over the REAL `prdt` CLI.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
const VIEWER_READY = fs.existsSync(path.join(CORE_ROOT, '..', 'viewer', 'node_modules', 'marked'))

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')

let projectDir: string

function run(args: string[]) {
  return spawnSync('python3', [PRDT_CLI, ...args], {
    cwd: projectDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli'),
  })
}

const RELEASES = (extra = '') => `# Releases\n\n> preamble\n\n${extra}## v1.15 — 지난 (2026-10-27)\n\n요약\n\n- 지난 줄\n`

function writeReleases(text: string) {
  const p = path.join(projectDir, 'code', 'docs', 'RELEASES.md')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}

function detailData(): any {
  const html = fs.readFileSync(path.join(fs.realpathSync(projectDir), '.prdt', 'scratch', 'viewer', 'viewer.html'), 'utf-8')
  return JSON.parse(/<script id="detail-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1])
}

/** `[label](file://dest)` → { label, dest } */
function link(out: string) {
  const m = /^\[([^\]]+)\]\(file:\/\/(.+)\)$/.exec(out.trim())
  expect(m, out).not.toBeNull()
  return { label: m![1], dest: decodeURIComponent(m![2]) }
}

beforeEach(() => {
  projectDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-viewer-release-')), 'proj')
  fs.mkdirSync(path.join(projectDir, 'docs', 'prd'), { recursive: true })
  execFileSync('python3', [PRDT_CLI, 'init', '--json', '--slug', 'proj', '--yes'], { cwd: projectDir, stdio: 'ignore', timeout: subprocessTimeout('cli') })
})

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true })
})

describe.skipIf(!PYTHON3 || !VIEWER_READY)('prdt viewer → release notes (T-1303)', () => {
  test('RELEASES.md path → a viewer link that opens the release-notes view', () => {
    writeReleases(RELEASES())
    const r = run(['viewer', '--no-open', 'code/docs/RELEASES.md'])
    expect(r.status, r.stderr).toBe(0)
    const { label, dest } = link(r.stdout)
    expect(label).toBe('code/docs/RELEASES.md')
    expect(dest.startsWith(path.join(fs.realpathSync(projectDir), '.prdt', 'scratch', 'viewer', 'at') + path.sep)).toBe(true)
    expect(fs.readFileSync(dest, 'utf-8')).toContain('url=../viewer.html#code/docs/RELEASES.md"')
    expect(detailData().anchors['code/docs/RELEASES.md']).toEqual({ s: 'release', g: 'all' })
  })

  test('--release v<N>.<m> → a link at that section, from the uncommitted working-tree draft', () => {
    writeReleases(RELEASES())
    // the draft section is added after init, never committed
    writeReleases(RELEASES('## v1.16 — 초안 (2026-11-02)\n\n요약\n\n- 초안 줄\n\n'))
    const r = run(['viewer', '--no-open', '--release', 'v1.16'])
    expect(r.status, r.stderr).toBe(0)
    const { label, dest } = link(r.stdout)
    expect(label).toBe('code/docs/RELEASES.md#v1.16')
    expect(fs.readFileSync(dest, 'utf-8')).toContain('url=../viewer.html#code/docs/RELEASES.md%23v1.16"')
    const d = detailData()
    expect(d.anchors['code/docs/RELEASES.md#v1.16']).toEqual({ s: 'release', g: 'all', k: 'release', i: 'v1.16' })
    expect(d.release['v1.16'].html).toContain('<li>1-1. 초안 줄')
  })

  test('the path#version target form and a bare 1.15 both reach the section', () => {
    writeReleases(RELEASES())
    expect(link(run(['viewer', '--no-open', 'code/docs/RELEASES.md#v1.15']).stdout).label).toBe('code/docs/RELEASES.md#v1.15')
    expect(link(run(['viewer', '--no-open', '--release', '1.15']).stdout).label).toBe('code/docs/RELEASES.md#v1.15')
  })

  test('a version with no section → exit 1 naming the versions there, no link', () => {
    writeReleases(RELEASES())
    const r = run(['viewer', '--no-open', '--release', 'v9.9'])
    expect(r.status).toBe(1)
    expect(r.stdout).not.toContain('file://')
    expect(r.stderr).toContain('v9.9')
    expect(r.stderr).toContain('v1.15')
  })

  test('no RELEASES.md → exit 1, no link', () => {
    const r = run(['viewer', '--no-open', '--release', 'v1.15'])
    expect(r.status).toBe(1)
    expect(r.stdout).not.toContain('file://')
    expect(r.stderr).toContain('code/docs/RELEASES.md')
  })
})
