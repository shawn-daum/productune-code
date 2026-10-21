// T-1168: po-state `version` null / missing renders like the idle state ("" already did) instead of a TypeError.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { collectAll } from '@productune/viewer/lib/collect.mjs'
import { renderPage } from '@productune/viewer/lib/render.mjs'

const render = (data: unknown) => renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
function write(root: string, rel: string, text: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}
const ticket = (id: string) => `---\nid: ${id}\nslug: s-${id}\ntype: impl\nstatus: open\nassignee: developer\n---\nbody ${id}\n`

function build(state: Record<string, unknown>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-nullver-')))
  write(root, '.prdt/config.json', JSON.stringify({ slug: 'p' }))
  write(root, '.prdt/po-state.json', JSON.stringify(state))
  write(root, 'docs/prd/PRD.md', '# PRD\n\nhead\n\n## v1.1 — round\n\n#### a — Item A\n')
  write(root, 'docs/tickets/v1.1/T-1.md', ticket('T-1'))
  write(root, 'docs/tickets/backlog/T-2.md', ticket('T-2'))
  return render(collectAll(root, { disciplineRoot: path.join(root, 'no-discipline') }))
}

describe('T-1168 po-state version null / missing', () => {
  const empty = build({ schema_version: 1, stage: 'idle', version: '', current_task: null })
  it('version null renders like version ""', () => {
    expect(build({ schema_version: 1, stage: 'idle', version: null, current_task: null })).toBe(empty)
  })
  it('version missing renders like version ""', () => {
    expect(build({ schema_version: 1, stage: 'idle', current_task: null })).toBe(empty)
  })
})
