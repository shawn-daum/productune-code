// T-1514: the 자투리 record is recognised by three readers — prdt_lanes.is_jatturi_record (python),
// statusline-prdt.sh's own copy (it runs without the python module) and render.mjs isJatturiRecord.
// The rule is stated once in prdt_lanes.py; this test ties the three to ONE table of frontmatter
// spellings (jatturi-record-table.json): same answer for every row, same version total on every
// surface that counts.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'
import { GUI_ROOT } from '@productune/viewer/generate.mjs'
import { isJatturiRecord, versionProgressCounts } from '@productune/viewer/lib/render.mjs'
import { parseFrontmatter } from '@productune/viewer/lib/frontmatter.mjs'

const SCRIPTS_DIR = path.join(GUI_ROOT, '../core/scripts')
const STATUSLINE_PATH = path.join(SCRIPTS_DIR, 'statusline-prdt.sh')
const TABLE: { name: string; fm: string; record: boolean }[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'jatturi-record-table.json'), 'utf8'),
)
const VERSION = 'v9.8'
const ticketText = (id: string, status: string, extra = '') =>
  `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: impl\nstatus: ${status}\nassignee: developer\ncreated: 2026-01-01\n${extra}---\n\nbody\n`

function pythonAnswers(): boolean[] {
  const code = [
    'import sys, json',
    `sys.path.insert(0, ${JSON.stringify(SCRIPTS_DIR)})`,
    'from prdt_lanes import parse_frontmatter_text, is_jatturi_record',
    'rows = json.load(sys.stdin)',
    'print(json.dumps([is_jatturi_record(parse_frontmatter_text(r)[0]) for r in rows]))',
  ].join('\n')
  const texts = TABLE.map((r) => ticketText('T-9', 'open', `${r.fm}\ndeps: [T-2]\n`))
  return JSON.parse(execFileSync('python3', ['-I', '-c', code], { input: JSON.stringify(texts), encoding: 'utf8' }))
}

function statuslineTotal(fm: string): [number, number] {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1514-sl-')))
  try {
    fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.prdt', 'po-state.json'),
      JSON.stringify({ schema_version: 1, stage: 'build', version: VERSION, current_task: null }),
    )
    const dir = path.join(root, 'docs', 'tickets', VERSION)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'T-1.md'), ticketText('T-1', 'done'))
    fs.writeFileSync(path.join(dir, 'T-2.md'), ticketText('T-2', 'open'))
    fs.writeFileSync(path.join(dir, 'T-9.md'), ticketText('T-9', 'open', `${fm}\ndeps: [T-2]\n`))
    const out = execFileSync('bash', [STATUSLINE_PATH], {
      input: JSON.stringify({ workspace: { current_dir: root } }),
      encoding: 'utf8',
      env: { ...process.env, PRDT_LANG: 'en' },
    })
    const m = /total tickets (\d+)\/(\d+)/.exec(out)
    expect(m, `statusline output "${out}"`).not.toBeNull()
    return [Number((m as RegExpExecArray)[1]), Number((m as RegExpExecArray)[2])]
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

describe('자투리 record: python, statusline and viewer agree on every spelling (T-1514)', () => {
  const py = pythonAnswers()
  it('the table has both answers (non-vacuous)', () => {
    expect(TABLE.some((r) => r.record)).toBe(true)
    expect(TABLE.some((r) => !r.record)).toBe(true)
  })
  TABLE.forEach((r, i) => {
    it(`${r.name}: ${JSON.stringify(r.fm)}`, () => {
      const viewerRecord = isJatturiRecord({ frontmatter: parseFrontmatter(ticketText('T-9', 'open', `${r.fm}\n`)).data })
      expect(py[i]).toBe(r.record)
      expect(viewerRecord).toBe(r.record)
      // every surface that counts shows the same total: T-1 done, T-2 open, + the ticket T-9
      const want: [number, number] = r.record ? [1, 2] : [1, 3]
      const viewer = versionProgressCounts(
        [
          { frontmatter: { status: 'done' } },
          { frontmatter: { status: 'open' } },
          { frontmatter: parseFrontmatter(ticketText('T-9', 'open', `${r.fm}\n`)).data },
        ].filter((t) => !isJatturiRecord(t)),
      )
      expect([viewer.done, viewer.total]).toEqual(want)
      expect(statuslineTotal(r.fm)).toEqual(want)
    })
  })
})
