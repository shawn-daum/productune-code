// T-1513 (T-1508 C, I1): a version with no lane record and no PRD 합격선 row — `prdt schedule`, the statusline and the
// viewer home show the same single row 「기본 레인」 with the same d/t (this version's open+done tickets).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'
import { collectAll } from '@productune/viewer/lib/collect.mjs'
import { renderPage } from '@productune/viewer/lib/render.mjs'

const CORE = path.resolve(__dirname, '..', '..', '..', 'core')
const PRDT = path.join(CORE, 'scripts', 'prdt')
const STATUSLINE = path.join(CORE, 'scripts', 'statusline-prdt.sh')
const page = (data: unknown) => renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' } as never)
const OSC8_RE = /\x1b\]8;;[^\x1b]*\x1b\\([^\x1b]*)\x1b\]8;;\x1b\\/g

const VERSION = 'v9.8'

function ticket(dir: string, id: string, status: string, extra = '') {
  fs.writeFileSync(path.join(dir, `${id}.md`), `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: impl\nstatus: ${status}\nassignee: developer\n${extra}created: 2026-01-01\n---\n\n## acceptance\n\n- x\n`)
}

function project(withRecord = false): { root: string; home: string; env: NodeJS.ProcessEnv } {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1513-')))
  const root = path.join(tmp, 'proj')
  const home = path.join(tmp, 'home')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.mkdirSync(home, { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'demo' }))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: VERSION, current_task: null }))
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'PRD.md'), `# PRD\n\n## ${VERSION} — round\n\n#### a1 — item\n`)
  const dir = path.join(root, 'docs', 'tickets', VERSION)
  fs.mkdirSync(dir, { recursive: true })
  ticket(dir, 'T-1', 'done')
  ticket(dir, 'T-2', 'open')
  ticket(dir, 'T-3', 'open', 'deps: [T-1]\n')
  ticket(dir, 'T-4', 'done')
  if (withRecord) ticket(dir, 'T-9', 'open', 'lane: 묶음\ndeps: [T-2]\n')
  return { root, home, env: { ...process.env, HOME: tmp, PRDT_HOME: home, PRDT_LANG: 'ko', PRDT_META_BACKUP: '0', COLUMNS: '' } }
}

const schedule = (p: ReturnType<typeof project>) =>
  execFileSync('python3', [PRDT, 'schedule'], { cwd: p.root, encoding: 'utf8', env: p.env })
const statusline = (p: ReturnType<typeof project>) =>
  execFileSync('bash', [STATUSLINE], { input: JSON.stringify({ workspace: { current_dir: p.root } }), encoding: 'utf8', env: p.env }).replace(OSC8_RE, '$1')
function viewerRows(p: ReturnType<typeof project>) {
  const html = page(collectAll(p.root))
  const scope = /<div class="sc-e">[\s\S]*?<\/div><\/div><\/div>/.exec(html)![0]
  return [...scope.matchAll(/<span class="e-lab" title="([^"]*)">[^<]*<\/span><span class="e-sq">.*?<\/span><span class="mono e-n">(\d+\/\d+)<\/span>/g)].map((m) => [m[1], m[2]])
}

describe('T-1513: 기본 레인 — one row, three surfaces', () => {
  it('no record, no 합격선 row: schedule · statusline · viewer show 「기본 레인」 2/4', () => {
    const p = project()
    const out = schedule(p)
    expect(out).toContain(`lane 기본 레인 2/4 — no lane record in ${VERSION}`)
    expect(statusline(p)).toMatch(/레인: 기본 레인 {2}2\/4/)
    expect(statusline(p)).not.toContain('자투리')
    expect(viewerRows(p)).toEqual([['기본 레인', '2/4']])
  })

  it('schedule keeps the rank list (not lane mode) and adds only the one lane line', () => {
    const out = schedule(project())
    expect(out).toMatch(/^critical path/m)
    expect(out).toMatch(/^dispatch next:/m)
    expect(out).toMatch(/^PO work:|^in flight:/m)
    expect(out).not.toMatch(/^total |^lanes done:|^first pick:/m)
    expect(out.match(/^lane /gm)).toHaveLength(1)
  })

  it('a version with a lane record is unchanged: no 기본 레인 row, the record is the lane', () => {
    const p = project(true)
    expect(schedule(p)).not.toContain('기본 레인')
    expect(statusline(p)).not.toContain('기본 레인')
    expect(viewerRows(p).map((r) => r[0])).not.toContain('기본 레인')
  })
})
