// T-1259 (screen decision-view, docs/productune/artifacts/v1.15/define-screen-set.html): a decision row = id · title · status · answer,
// folding to 이유 · 방식 · 답 read from `## outcome` `### why / how / what`; a ticket without them shows 「기록 없음」.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { collectAll } from '@productune/viewer/lib/collect.mjs'
import { renderPage, decisionRecord } from '@productune/viewer/lib/render.mjs'

const NEW = `## problem\n\n- 질문 한 줄\n\n## outcome\n\n- 사용자 (원문 그대로): *"A"*\n\n### why\n\n- 이유 문장.\n\n### how\n\n- 방식 문장.\n\n### module\n\n- 모듈.\n\n### what\n\n- 답 문장.\n\n## log\n`
const OLD = `## problem\n\n- 질문\n\n## outcome\n\n### ①\n\n- 사용자: *"a"*\n\n### ②\n\n- 사용자: *"b"*\n\n## log\n`
const OPEN = `## problem\n\n- 열린 질문 한 줄\n\n## options\n\n- 추천: A 로 간다.\n\n## outcome\n\n## log\n`

function project() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1259-')))
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'demo' }))
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'), JSON.stringify({ schema_version: 1, stage: 'build', version: 'v9.8', current_task: null }))
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'PRD.md'), '# PRD\n\n## v9.8 — round\n')
  const dir = path.join(root, 'docs', 'tickets', 'v9.8')
  fs.mkdirSync(dir, { recursive: true })
  const t = (id: string, status: string, body: string) => fs.writeFileSync(path.join(dir, `${id}.md`), `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: decision\nstatus: ${status}\nassignee: user\ncreated: 2026-01-01\n---\n\n${body}`)
  t('T-1', 'done', NEW)
  t('T-2', 'done', OLD)
  t('T-3', 'open', OPEN)
  return root
}

describe('T-1259: decisionRecord', () => {
  it('reads why / how / what and the picked answer; absent keys are null', () => {
    expect(decisionRecord(NEW)).toMatchObject({ why: '이유 문장.', how: '방식 문장.', what: '답 문장.', answer: 'A' })
    expect(decisionRecord(OLD)).toMatchObject({ why: null, how: null, what: null, answer: '2건' })
    expect(decisionRecord(OPEN)).toMatchObject({ question: '열린 질문 한 줄', recommend: 'A 로 간다.' })
  })
})

describe('T-1259: decision screen rows', () => {
  const html = renderPage({ data: collectAll(project()), dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' } as never)
  const row = (id: string) => new RegExp(`<div class="dv-row[^>]*data-dv-id="${id}".*?</div></div>\\n`, 's').exec(html)![0]
  it('a done decision: id · title · status · answer, folding to 이유 · 방식 · 답', () => {
    const r = row('T-1')
    expect(r).toMatch(/class="tid">T-1<.*class="tt">s-t-1<.*class="tst done">완료<.*class="who">답 A</s)
    expect(r).toContain('<b>이유</b><span>이유 문장.')
    expect(r).toContain('<b>방식</b><span>방식 문장.')
    expect(r).toContain('<b>답</b><span>답 문장.')
    expect(r).not.toContain('기록 없음')
  })
  it('an old-shape decision shows 「기록 없음」 in each fold slot', () => {
    expect(row('T-2').match(/기록 없음/g)).toHaveLength(3)
  })
  it('an open decision is waiting and folds to 질문 · 추천', () => {
    const r = row('T-3')
    expect(r).toContain('기다리는 중')
    expect(r).toContain('<b>질문</b><span>열린 질문 한 줄')
    expect(r).toContain('<b>추천</b><span>A 로 간다.')
  })
})
