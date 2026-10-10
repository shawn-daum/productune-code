// T-958 (T-956 = A): the viewer's env screen and Home env block — key names
// with 설정됨 / 비어 있음 only (screen set docs/artifacts/v1.13/
// define-screen-set.html #screen-env). Every fixture value below is a dummy
// sentinel; the generated page and the collected data must carry none of them.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { collectAll } from '@productune/viewer/lib/collect.mjs'
import { envKeyStatus, collectEnv } from '@productune/viewer/lib/env-status.mjs'
import { renderPage } from '@productune/viewer/lib/render.mjs'
import { generate } from '@productune/viewer/generate.mjs'

const SENTINEL = 'SENTINELvalue9x7Q'
const render = (data: unknown) => renderPage({ data, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
const status = (text: string) => envKeyStatus(Buffer.from(text, 'utf8'))

function write(root: string, rel: string, text: string) {
  const p = path.join(root, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}

describe('envKeyStatus — same set/empty verdict as `prdt env check`', () => {
  it('reads names and set/empty, never a value', () => {
    const rows = status([
      '# comment',
      '',
      `A=${SENTINEL}`,
      'B=',
      'C=""',
      "D=''",
      `export E="${SENTINEL}"`,
      'F = ',
      `G="${SENTINEL}" # note`,
      'not a key line',
      '1BAD=x',
      `A=`,
    ].join('\n'))
    expect(rows).toEqual([
      { name: 'A', set: false },
      { name: 'B', set: false },
      { name: 'C', set: false },
      { name: 'D', set: false },
      { name: 'E', set: true },
      { name: 'F', set: false },
      { name: 'G', set: true },
    ])
    expect(JSON.stringify(rows)).not.toContain(SENTINEL)
  })

  it('CRLF, a BOM, and a multi-line quoted value whose lines are never read as keys', () => {
    expect(status('﻿X=1\r\nY=\r\n')).toEqual([{ name: 'X', set: true }, { name: 'Y', set: false }])
    const rows = status(`M="line one\nFAKE_KEY=${SENTINEL}\nend"\nN=2\n`)
    expect(rows).toEqual([{ name: 'M', set: true }, { name: 'N', set: true }])
  })

  it('a key whose bytes are not ASCII is skipped', () => {
    expect(status('KÉY=1\nOK=1')).toEqual([{ name: 'OK', set: true }])
  })
})

// T-958 QA: the line and key trim must strip exactly Python str.strip()'s set,
// or an open-quote line is skipped and its continuation reads as a key.
const PRDT_CLI = path.resolve(__dirname, '../../../core/scripts/prdt')
const NBSP = Buffer.from([0xc2, 0xa0])
const ws = (bytes: number[]) => Buffer.from(bytes)
const WS_CASES: Array<[string, Buffer]> = [
  ['J1 NBSP-led open quote', Buffer.concat([NBSP, Buffer.from(`J1="open ${SENTINEL}\nJ_LEAK_${SENTINEL}=v\n"\n`)])],
  ['J3 NBSP before =', Buffer.concat([Buffer.from('J3'), NBSP, Buffer.from(`=${SENTINEL}\n`)])],
  ['J4 \\x1c before key', Buffer.concat([ws([0x1c]), Buffer.from(`J4=${SENTINEL}\n`)])],
  ['KEY=NBSP', Buffer.concat([Buffer.from('KEY='), NBSP, Buffer.from('\n')])],
  ['KEY=\\x1c', Buffer.concat([Buffer.from('KEY='), ws([0x1c]), Buffer.from('\n')])],
  ['U+0085 · U+2028 · U+3000 around lines', Buffer.concat([ws([0xc2, 0x85]), Buffer.from('A=1'), ws([0xe2, 0x80, 0xa8]), Buffer.from('\nB='), ws([0xe3, 0x80, 0x80]), Buffer.from('\n'), ws([0xe2, 0x80, 0x89]), Buffer.from(`export C="${SENTINEL}\nD_LEAK=x"\n`)])],
]

describe('envKeyStatus — Unicode whitespace parity with Python str.strip() (T-958 QA)', () => {
  it('J1: an NBSP-led open-quote line is set and its continuation never becomes a key', () => {
    expect(envKeyStatus(WS_CASES[0][1])).toEqual([{ name: 'J1', set: true }])
  })

  it('J3 · J4 set; KEY=NBSP and KEY=\\x1c empty', () => {
    expect(envKeyStatus(WS_CASES[1][1])).toEqual([{ name: 'J3', set: true }])
    expect(envKeyStatus(WS_CASES[2][1])).toEqual([{ name: 'J4', set: true }])
    expect(envKeyStatus(WS_CASES[3][1])).toEqual([{ name: 'KEY', set: false }])
    expect(envKeyStatus(WS_CASES[4][1])).toEqual([{ name: 'KEY', set: false }])
    expect(envKeyStatus(WS_CASES[5][1])).toEqual([{ name: 'A', set: true }, { name: 'B', set: false }, { name: 'C', set: true }])
  })

  let py: string | null = null
  try { py = execFileSync('which', ['python3']).toString().trim() || null } catch { py = null }
  it.skipIf(!py)('agrees with `prdt env check` on every case', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-env-parity-'))
    try {
      for (const [label, bytes] of WS_CASES) {
        const f = path.join(dir, '.env.case')
        fs.writeFileSync(f, bytes)
        const out = execFileSync(py!, [PRDT_CLI, 'env', 'check', f]).toString()
        const want = out.trim().split('\n').filter(Boolean).map((l) => { const [name, st] = l.split(/\s+/); return { name, set: st === 'set' } })
        const got = envKeyStatus(bytes).slice().sort((x: { name: string }, y: { name: string }) => (x.name < y.name ? -1 : 1))
        expect(got, label).toEqual(want)
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('collectEnv', () => {
  let dir: string
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-env-dir-'))
    write(dir, 'code/.env.local', `DB_URL=${SENTINEL}\nTOKEN=\n`)
    write(dir, 'code/.env.example', 'DB_URL=\nTOKEN=\nONLY_SAMPLE=\n')
    write(dir, 'code/.envrc', `RC=${SENTINEL}\n`)
    fs.mkdirSync(path.join(dir, 'code/.env.d'))
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('lists .env / .env.* files (real first, sample last); a sample-only key counts as empty in the real file', () => {
    const env = collectEnv(dir, 'code')
    expect(env.dir).toBe('code')
    expect(env.files.map((f: { name: string; sample: boolean }) => [f.name, f.sample])).toEqual([['.env.local', false], ['.env.example', true]])
    expect(env.files[0].keys).toEqual([{ name: 'DB_URL', set: true }, { name: 'TOKEN', set: false }, { name: 'ONLY_SAMPLE', set: false }])
    expect(JSON.stringify(env)).not.toContain(SENTINEL)
  })

  it('a missing folder or no folder → no files', () => {
    expect(collectEnv(dir, 'nope').files).toEqual([])
    expect(collectEnv(dir, null)).toEqual({ dir: null, files: [] })
  })
})

const PO_STATE = (lines?: object) => JSON.stringify({ schema_version: 1, stage: 'build', version: 'v2.2', current_task: null, ...(lines ? { lines } : {}) })

describe('env screen + Home env block — several lines', () => {
  let base: string
  let root: string
  let html: string
  let data: ReturnType<typeof collectAll>
  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-env-'))
    root = path.join(base, 'ntf-pm')
    write(root, '.prdt/config.json', JSON.stringify({ slug: 'ntf-pm', lines: [{ name: 'ntf-archive', code: { dir: '../ntf-archive/code' } }] }))
    write(root, '.prdt/po-state.json', PO_STATE({ 'ntf-archive': { stage: 'build', version: 'v1.2' } }))
    write(root, 'docs/prd/PRD.md', '# PRD\n\n## v2.2 — home\n\n## ntf-archive v1.2 — arch\n')
    write(root, 'code/README.md', 'code\n')
    write(base, 'ntf-archive/code/.env.local', `POSTGRES_URL=${SENTINEL}\nSESSION_SECRET="${SENTINEL}"\nCRON_SECRET=\n`)
    write(base, 'ntf-archive/code/.env.example', 'POSTGRES_URL=\nSESSION_SECRET=\nCRON_SECRET=\nPM_INGEST_SECRET=\n')
    data = collectAll(root, { disciplineRoot: base })
    html = render(data)
  })
  afterAll(() => fs.rmSync(base, { recursive: true, force: true }))

  const envSection = () => html.split('id="store-env"')[1].split('</section>')[0]

  it('the activity bar carries env right after 아티팩트', () => {
    const order = [...html.matchAll(/class="activity-btn[^"]*" data-store="([a-z]+)"/g)].map((m) => m[1])
    expect(order.slice(order.indexOf('artifact'), order.indexOf('artifact') + 2)).toEqual(['artifact', 'env'])
  })

  it('sidebar: `<line> <version>` sections; the home line without env files shows the dim no-file row', () => {
    const side = envSection().split('<nav class="sidebar">')[1].split('</nav>')[0]
    expect(side).toContain('<div class="ls-h"><b>ntf-pm v2.2</b><span class="ls-st">build</span></div>')
    expect(side).toContain('<div class="ls-h"><b>ntf-archive v1.2</b><span class="ls-st">build</span></div>')
    expect(side).toMatch(/nav-dim[^"]*" data-group-select="none"[^>]*><span>env 파일 없음<\/span>/)
    expect(side).toMatch(/data-group-select="ntf-archive\/.env.local"[^>]*><span>.env.local<\/span><span class="nav-item-count">4<\/span>/)
    expect(side).toMatch(/nav-dim[^"]*" data-group-select="ntf-archive\/.env.example"[^>]*><span>.env.example · 견본<\/span>/)
    // lands on the first real env file
    expect(side).toMatch(/nav-item-clickable active" data-group-select="ntf-archive\/.env.local"/)
  })

  it('main pane: key names with 설정됨 / 비어 있음 only — no value, length, edit or copy control', () => {
    const sec = envSection()
    const pane = sec.split('data-group="ntf-archive/.env.local">')[1].split('<div class="view-pane')[0]
    expect(pane).toContain('<b>.env.local</b><span class="env-dir">../ntf-archive/code</span>')
    expect(pane).toContain('<div class="erow"><code>POSTGRES_URL</code><span class="est on">설정됨</span></div>')
    expect(pane).toContain('<div class="erow"><code>CRON_SECRET</code><span class="est off">비어 있음</span></div>')
    expect(pane).toContain('<div class="erow"><code>PM_INGEST_SECRET</code><span class="est off">비어 있음</span></div>')
    expect(pane).toContain('키 이름과 설정 여부만 보여요. 값은 이 화면에 없어요.')
    expect(pane).not.toMatch(/len=|<input|<textarea|contenteditable|clipboard|copy/i)
    const none = sec.split('data-group="none">')[1].split('<div class="view-pane')[0]
    expect(none).toContain('이 줄에는 env 파일이 없어요.')
    expect(none).toContain('코드 폴더에서 .env · .env.* 파일을 찾았어요: code')
  })

  it('Home per line: counts, empty keys named, a link to the env screen; no env file → one line', () => {
    const home = html.split('id="store-home"')[1].split('</section>')[0]
    const archive = home.split('data-group="ntf-archive/progress">')[1].split('<div class="view-pane')[0]
    expect(archive).toContain('<code>.env.local</code><span class="env-c"><span class="est on">설정됨</span> 2 · <span class="est off">비어 있음</span> 2</span>')
    expect(archive).toContain('data-open-store="env" data-open-group="ntf-archive/.env.local"')
    expect(archive).toContain('<p class="env-empty"><span>비어 있음</span>: <code>CRON_SECRET</code> · <code>PM_INGEST_SECRET</code></p>')
    expect(archive).not.toContain('.env.example')
    const homeLine = home.split('data-group="progress">')[1].split('<div class="view-pane')[0]
    expect(homeLine).toContain('<p class="env-none">이 줄의 코드 폴더에 env 파일이 없어요.</p>')
  })

  it('the page script opens the named file row from Home', () => {
    expect(html).toContain("var openGroup = readBtn.getAttribute('data-open-group');")
  })

  it('no sentinel value in the collected data or the page', () => {
    expect(JSON.stringify(data)).not.toContain(SENTINEL)
    expect(html).not.toContain(SENTINEL)
  })
})

describe('env screen — single-line project', () => {
  let root: string
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'viewer-env-single-'))
    write(root, '.prdt/config.json', JSON.stringify({ slug: 'shop' }))
    write(root, '.prdt/po-state.json', PO_STATE())
    write(root, 'docs/prd/PRD.md', '# PRD\n\n## v2.2 — round\n')
    write(root, 'code/.env.local', `DATABASE_URL=${SENTINEL}\nPUSH_CERT_PASSWORD=\n`)
  })
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  it('no section heads; one file is still a file row; Home shows the block', () => {
    const html = render(collectAll(root, { disciplineRoot: root }))
    const sec = html.split('id="store-env"')[1].split('</section>')[0]
    const side = sec.split('<nav class="sidebar">')[1].split('</nav>')[0]
    expect(side).not.toContain('ls-h')
    expect(side).toMatch(/data-group-select=".env.local"[^>]*><span>.env.local<\/span><span class="nav-item-count">2<\/span>/)
    const home = html.split('id="store-home"')[1].split('</section>')[0]
    expect(home).toContain('data-open-store="env" data-open-group=".env.local"')
    expect(home).toContain('<p class="env-empty"><span>비어 있음</span>: <code>PUSH_CERT_PASSWORD</code></p>')
    expect(html).not.toContain(SENTINEL)
  })

  it('no env file → Home one-line notice', () => {
    fs.rmSync(path.join(root, 'code/.env.local'))
    const html = render(collectAll(root, { disciplineRoot: root }))
    expect(html).toContain('<p class="env-none">코드 폴더에 env 파일이 없어요.</p>')
    expect(html).toContain('env 파일 없음')
  })

  it('the generated files (page · data files · build file) carry no sentinel value', async () => {
    write(root, 'code/.env.local', `DATABASE_URL=${SENTINEL}\nSTRIPE_SECRET_KEY="${SENTINEL}"\n`)
    fs.writeFileSync(path.join(root, 'code/.env.test'), WS_CASES[0][1])
    write(root, 'docs/tickets/v2.1/T-1.md', '---\nid: T-1\nslug: s\ntype: impl\nstatus: done\nassignee: developer\n---\nbody\n')
    const { html, dataFiles, buildFile } = await generate({ repoRoot: root, outputPath: path.join(root, 'out/viewer.html'), disciplineRoot: root })
    expect(html).toContain('<code>STRIPE_SECRET_KEY</code>')
    expect(html).toContain('<code>J1</code>')
    expect(html).not.toContain('J_LEAK_')
    for (const text of [html, buildFile.content, ...dataFiles.map((f: { content: string }) => f.content)]) expect(text).not.toContain(SENTINEL)
  }, 60_000)
})
