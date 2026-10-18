// T-1165 (mock docs/artifacts/v1.14/viewer-identity-progress.html; T-1161 = B): the viewer's sidebar identity line,
// tool version and progress card. The card's numbers are pinned against the REAL statusline-prdt.sh over one
// temp project, so a rule change on either side fails here (statusline-stage-parity family).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'
import { GUI_ROOT } from '@productune/viewer/generate.mjs'
import { collectAll } from '@productune/viewer/lib/collect.mjs'
import { renderPage, pageIdentityOf } from '@productune/viewer/lib/render.mjs'
import { IDENTITY } from '@productune/viewer/lib/labels.mjs'

const STATUSLINE_PATH = path.join(GUI_ROOT, '../core/scripts/statusline-prdt.sh')
const MESSAGES_PATH = path.join(GUI_ROOT, '../core/scripts/prdt-messages.json')
const VERSION = 'v9.8'

const TICKETS: Array<[string, string, string, string, string]> = [
  ['T-1', 'impl', 'done', 'developer', ''],
  ['T-2', 'impl', 'done', 'developer', ''],
  ['T-3', 'impl', 'open', 'user', ''],
  ['T-4', 'design', 'done', 'designer', ''],
  ['T-5', 'design', 'open', 'developer', 'deps: [T-3]\n'],
  ['T-6', 'decision', 'open', 'user', ''],
  ['T-7', 'qa', 'open', 'qa', ''],
  ['T-8', 'impl', 'dropped', 'developer', ''],
]

function project(stage: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1165-')))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'demo' }))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage, version: VERSION, current_task: null }))
  const dir = path.join(root, 'docs', 'tickets', VERSION)
  fs.mkdirSync(dir, { recursive: true })
  for (const [id, type, status, assignee, extra] of TICKETS) {
    fs.writeFileSync(path.join(dir, `${id}.md`), `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: ${type}\nstatus: ${status}\nassignee: ${assignee}\ncreated: 2026-01-01\n${extra}---\n\nbody\n`)
  }
  fs.mkdirSync(path.join(root, 'code', 'docs'), { recursive: true })
  fs.writeFileSync(path.join(root, 'code', 'docs', 'RELEASES.md'), '# Releases\n\n## v1.13 — newest (2026-10-01)\n\nx\n\n## v1.12 — older\n')
  return root
}

function statusline(root: string): string {
  return execFileSync('bash', [STATUSLINE_PATH], { input: JSON.stringify({ workspace: { current_dir: root } }), encoding: 'utf8', env: { ...process.env, PRDT_LANG: 'en' } })
}

describe('T-1165: progress card numbers = statusline numbers', () => {
  it.each(['define', 'build', 'ship', 'retro'])('stage %s: stage n/m · tickets n/m · dec · req match the real statusline', (stage) => {
    const root = project(stage)
    try {
      const out = statusline(root)
      const m = new RegExp(`stage: ${stage} (\\d+)/(\\d+) \\| total tickets (\\d+)/(\\d+)`).exec(out)
      expect(m, out).not.toBeNull()
      const ids = (label: string) => {
        const r = new RegExp(`${label} ([^|\\n]*)`).exec(out)
        return r ? r[1].trim().split(/[ ,]+/).filter((x) => /^T-\d+$/.test(x)).length : 0
      }
      const card = pageIdentityOf(collectAll(root)).card!
      expect([card.stageDone, card.stageTotal, card.done, card.total]).toEqual([m![1], m![2], m![3], m![4]].map(Number))
      expect(card.dec).toBe(ids('decision'))
      expect(card.req).toBe(ids('request'))
      // non-vacuous: a counted ticket set with a dropped one, and a non-zero wait list on each side
      expect(card.total).toBe(TICKETS.length - 1)
      expect(card.dec + card.req).toBeGreaterThan(0)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('stage names are the statusline ko words', () => {
    const msgs = JSON.parse(fs.readFileSync(MESSAGES_PATH, 'utf8'))
    const ko = msgs.ko || msgs[Object.keys(msgs).find((k) => msgs[k]['statusline.stage.build'] === '개발')!]
    for (const [k, v] of Object.entries(IDENTITY.stage)) expect(ko[`statusline.stage.${k}`]).toBe(v)
  })
})

describe('T-1165: rendered sidebar', () => {
  const render = (stage: string) => {
    const root = project(stage)
    try {
      return renderPage({ data: collectAll(root), dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  }

  it('running: identity line, card (stage first line, no ordinal), tool version', () => {
    const html = render('build')
    expect(html).toContain('<div class="sidebar-id"><b>demo</b> <span class="sid-sep">·</span> <span class="sid-v">v9.8</span> <span class="sid-st">build</span></div>')
    expect(html).not.toContain('class="sidebar-title"')
    expect(html).toMatch(/<span class="sp-stage">개발<\/span><span>2\/3<\/span>/)
    expect(html).toContain('<span class="foot-tool">productune v1.13</span>')
    expect(html).toContain('<span class="rail-tool">productune v1.13</span>')
  })

  it('idle: 쉬는 중 and no card', () => {
    const html = render('idle')
    expect(html).toContain('<span class="sid-st">쉬는 중</span>')
    expect(html).not.toContain('class="sp"')
  })
})
