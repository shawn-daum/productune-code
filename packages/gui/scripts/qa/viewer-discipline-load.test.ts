// T-1050: the load diagram at the top of 규율 「전체」 — generated from the real
// discipline tree, hook-manifest.json and `prdt-session-start.sh --plan`.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'
import { renderPage } from '@productune/viewer/lib/render.mjs'
import { collectDiscipline } from '@productune/viewer/lib/collect.mjs'
import { collectDisciplineLoad, disciplineLoadCard, DEFAULT_HOOK_MANIFEST, DEFAULT_PLAN_SCRIPT, DISCIPLINE_LOAD_SCRIPT, DISCIPLINE_LOAD_CSS } from '@productune/viewer/lib/discipline-load.mjs'

const REAL_DISCIPLINE = path.resolve(__dirname, '../../../core/discipline')
const NO_PLAN = path.join(os.tmpdir(), 'no-such-plan-script.sh')

const menu = (rows: string[][]) =>
  ['<!-- generated -->', '| playbook | when | floor |', '|---|---|---|', ...rows.map((r) => `| ${r[0]} | ${r[1]} | sonnet/medium |`)].join('\n') + '\n'

function fixture(opts: { annexWhen?: string; menuRows?: string[][]; hooks?: any[] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-dl-'))
  const applied = path.join(root, 'applied')
  const put = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(applied, rel)), { recursive: true })
    fs.writeFileSync(path.join(applied, rel), text)
  }
  put('contracts.md', '# C\n')
  put('contracts/git.md', `---\nname: git\nsection: Git\nwhen: "${opts.annexWhen ?? 'promoting the branch'}"\n---\n# git\n`)
  for (const p of ['po', 'designer', 'developer', 'qa']) {
    put(`${p}/habit.md`, 'h\n')
    put(`${p}/playbooks/_index.md`, menu(opts.menuRows ?? [['smoke', 'default verification']]))
  }
  const manifest = path.join(root, 'hook-manifest.json')
  fs.writeFileSync(manifest, JSON.stringify({
    registrations: opts.hooks ?? [
      { event: 'SessionStart', matcher: 'startup', hooks: ['prdt-session-start.sh', 'prdt-overrides-inject.sh'] },
      { event: 'PreToolUse', matcher: 'Read|Bash', hooks: ['prdt-secret-guard.sh'] },
      { event: 'Stop', hooks: ['prdt-question-check.sh'] },
    ],
  }))
  return { root, applied, manifest }
}

const load = (f: ReturnType<typeof fixture>) => collectDisciplineLoad(path.join(f.root, 'repo'), { disciplineRoot: f.applied, manifestPath: f.manifest, planScript: NO_PLAN }) as any
const card = (f: ReturnType<typeof fixture>) => disciplineLoadCard(load(f)) as string

describe('discipline load diagram: generated from the sources', () => {
  it('changing the annex `when:` changes the card', () => {
    const a = card(fixture({ annexWhen: 'promoting the branch' }))
    const b = card(fixture({ annexWhen: 'cutting a tag' }))
    expect(a).toContain('promoting the branch')
    expect(a).not.toContain('cutting a tag')
    expect(b).toContain('cutting a tag')
    expect(b).not.toContain('promoting the branch')
  })

  it('changing the playbook menu changes lane 2 for that persona', () => {
    const html = card(fixture({ menuRows: [['smoke', 'default verification'], ['grill', 'risk flags present']] }))
    expect(html).toContain('po/playbooks/grill.md')
    expect(html).toContain('qa/playbooks/grill.md')
    expect(html).toContain('risk flags present')
  })

  it('changing the hook manifest changes lane 3 and lane 1', () => {
    const base = card(fixture())
    expect(base).toContain('secret-guard')
    expect(base).toContain('Read|Bash')
    expect(base).not.toContain('worktree-guard')
    const more = card(fixture({ hooks: [
      { event: 'SessionStart', matcher: 'startup', hooks: ['prdt-session-start.sh', 'prdt-inbox-inject.sh'] },
      { event: 'PreToolUse', matcher: 'Edit|Write', hooks: ['prdt-worktree-guard.sh'] },
    ] }))
    expect(more).toContain('worktree-guard')
    expect(more).toContain('Edit|Write')
    expect(more).not.toContain('secret-guard')
    expect(more).toContain('다른 프로젝트 권고')
    expect(more).not.toContain('prdt-overrides-inject.sh')
  })

  it('PO-only hooks and layers are marked so other personas dim them; the same hook on two events merges matchers', () => {
    const html = card(fixture({ hooks: [
      { event: 'SessionStart', matcher: 'startup', hooks: ['prdt-session-start.sh', 'prdt-audience-inject.sh', 'prdt-overrides-inject.sh'] },
      { event: 'PostToolUse', matcher: 'Write', hooks: ['prdt-auto-open.sh'] },
      { event: 'PostToolUse', matcher: 'Bash', hooks: ['prdt-auto-open.sh'] },
      { event: 'Stop', hooks: ['prdt-question-check.sh'] },
    ] }))
    expect(html).toMatch(/class="dl-hk dl-po-only"[^>]*>(?:(?!<\/button>).)*question-check/s)
    expect(html).toMatch(/class="dl-layer dl-po-only"[^>]*>(?:(?!<\/button>).)*말투/s)
    expect(html).not.toMatch(/class="dl-layer dl-po-only"[^>]*>(?:(?!<\/button>).)*기기 override/s)
    expect(html).toContain('Write · Bash')
    expect(html).toContain('prdt-question-check.sh')
  })

  it('each item carries path · original `when:` · matcher for the click-through detail', () => {
    const html = card(fixture())
    const items = [...html.matchAll(/data-dl-item="([^"]*)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&')))
    const git = items.find((d) => d.p === 'contracts/git.md')
    expect(git.w).toBe('promoting the branch')
    const hk = items.find((d) => d.t === 'prdt-secret-guard.sh')
    expect(hk.m).toBe('Read|Bash')
    expect(hk.e).toBe('PreToolUse')
  })

  it('a missing manifest or plan is said in the lane, never drawn from nothing', () => {
    const f = fixture()
    fs.rmSync(f.manifest)
    const html = card(f)
    expect(html).toContain('세션 시작 파트를 읽지 못했어요.')
    expect(html).toContain('hook-manifest.json)을 읽지 못했어요.')
    expect(collectDisciplineLoad('/x', { disciplineRoot: '/nonexistent/x' })).toBeNull()
    expect(disciplineLoadCard(null)).toBe('')
  })

  it('the persona chips, three lanes, precedence strip with the floor and the detail line are present', () => {
    const html = card(fixture())
    for (const s of ['data-dl-who="po" aria-pressed="true"', 'data-dl-who="designer"', 'data-dl-who="developer"', 'data-dl-who="qa"', '1. 세션 시작 (상시)', '2. 필요할 때 (트리거)', '3. 도구를 쓸 때마다 (훅)', '우선순위', '바닥 (어느 override 도 못 바꿈)', 'data-dl-detail']) expect(html).toContain(s)
  })
})

describe('discipline load diagram: the real tree', () => {
  const runPlan = (persona: string) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-plan-home-'))
    try {
      const r = spawnSync('bash', [DEFAULT_PLAN_SCRIPT, '--plan', persona], { input: '', encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, PRDT_HOME: home, PRDT_DISCIPLINE: REAL_DISCIPLINE } })
      return JSON.parse(r.stdout)
    } finally { fs.rmSync(home, { recursive: true, force: true }) }
  }

  it('part counts and sizes equal what `--plan <persona>` prints', () => {
    const l = collectDisciplineLoad('/x', { disciplineRoot: REAL_DISCIPLINE }) as any
    for (const p of ['po', 'designer', 'developer', 'qa']) {
      const plan = runPlan(p)
      expect(l.plans[p].parts.map((x: any) => x.bytes)).toEqual(plan.parts.map((x: any) => x.bytes))
      expect(l.plans[p].parts).toHaveLength(plan.parts_needed)
    }
  }, 60_000)

  it('hooks match the real manifest: every non-session-start hook basename is on the card, nothing else is invented', () => {
    const l = collectDisciplineLoad('/x', { disciplineRoot: REAL_DISCIPLINE }) as any
    const manifest = JSON.parse(fs.readFileSync(DEFAULT_HOOK_MANIFEST, 'utf8'))
    const drawn = new Set<string>([...l.hooks.layers.map((x: any) => x.name), ...l.hooks.events.flatMap((e: any) => e.hooks.map((h: any) => h.name))])
    const manifestNames = new Set<string>(manifest.registrations.flatMap((r: any) => r.hooks).filter((h: string) => !/^prdt-(session-start(-p\d+)?|post-compact)\.sh$/.test(h)))
    expect(drawn).toEqual(manifestNames)
    expect(l.annex.length).toBe(fs.readdirSync(path.join(REAL_DISCIPLINE, 'contracts')).filter((f) => f.endsWith('.md')).length)
  }, 60_000)

  it('never writes under the real tool home', () => {
    const before = fs.existsSync(path.join(os.homedir(), '.prdt')) ? fs.statSync(path.join(os.homedir(), '.prdt')).mtimeMs : null
    collectDisciplineLoad('/x', { disciplineRoot: REAL_DISCIPLINE })
    const after = fs.existsSync(path.join(os.homedir(), '.prdt')) ? fs.statSync(path.join(os.homedir(), '.prdt')).mtimeMs : null
    expect(after).toBe(before)
  }, 60_000)
})

describe('discipline load diagram: in the page', () => {
  const render = (data: unknown) => renderPage({ data: data as any, dark: new Map(), light: new Map(), fontFaceCss: '', tokensSha256: '' })
  const page = (f: ReturnType<typeof fixture>) => {
    const discipline = collectDiscipline(path.join(f.root, 'repo'), { disciplineRoot: f.applied })
    return render({
      currentVersion: 'v1.13',
      prd: { current: { body: '' }, closed: [] },
      tickets: { included: [], omitted: [] },
      wiki: [], features: [], featureTaxonomy: null, artifacts: { entries: [] }, releases: [],
      discipline, disciplineLoad: load(f),
    })
  }
  const section = (html: string) => { const i = html.indexOf('<section class="store-section" data-store="disc"'); return html.slice(i, html.indexOf('</section>', i)) }

  it('the card sits at the top of 「전체」, above the document table', () => {
    const sec = section(page(fixture()))
    const first = sec.indexOf('data-dl-card')
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(sec.indexOf('count-badge'))
    // other groups (계약 · po ...) carry no card
    expect(sec.split('data-dl-card').length - 1).toBe(1)
  })

  it('a changed annex `when:` reaches the built page', () => {
    expect(section(page(fixture({ annexWhen: 'cutting a tag' })))).toContain('cutting a tag')
  })

  it('the page script (CSP-hashed with the rest) handles the persona chips', () => {
    const html = page(fixture())
    expect(html).toContain("querySelector('[data-dl-card]')")
    expect(html).toContain('data-dl-persona-now')
    expect(/script-src 'sha256-[^']+' 'sha256-[^']+' 'strict-dynamic';/.test(html)).toBe(true)
  })

  it('click behavior: a persona chip switches the card and resets the detail; an item fills the detail with its fields', () => {
    const attrs: Record<string, string> = { 'data-dl-persona-now': 'po' }
    const chipEls: any[] = []
    const mkEl = (a: Record<string, string> = {}) => ({ a, children: [] as any[], textContent: '', className: '', appendChild(c: any) { this.children.push(c) }, getAttribute(k: string) { return this.a[k] ?? null }, setAttribute(k: string, v: string) { this.a[k] = v } })
    const box: any = mkEl()
    box.appendChild = function (c: any) { this.children.push(c) }
    Object.defineProperty(box, 'textContent', { get() { return this._t ?? '' }, set(v: string) { this._t = v; if (v === '') this.children.length = 0 } })
    const designer = mkEl({ 'data-dl-who': 'designer', 'aria-pressed': 'false' }); chipEls.push(designer)
    let handler: any
    const card: any = {
      setAttribute: (k: string, v: string) => { attrs[k] = v },
      querySelector: () => box,
      querySelectorAll: () => chipEls,
      addEventListener: (_: string, h: any) => { handler = h },
    }
    const doc: any = { querySelector: () => card, createElement: () => mkEl() }
    vm.runInNewContext(DISCIPLINE_LOAD_SCRIPT, { document: doc, JSON })
    handler({ target: { closest: (sel: string) => (sel === '[data-dl-who]' ? designer : null) } })
    expect(attrs['data-dl-persona-now']).toBe('designer')
    expect(designer.a['aria-pressed']).toBe('true')
    const item = mkEl({ 'data-dl-item': JSON.stringify({ t: 'contracts/git.md', p: 'contracts/git.md', w: 'promoting' }) })
    handler({ target: { closest: (sel: string) => (sel === '[data-dl-item]' ? item : null) } })
    const texts = box.children.flatMap((c: any) => [c.textContent, ...c.children.map((x: any) => x.textContent)])
    expect(texts).toContain('contracts/git.md')
    expect(texts).toContain('promoting')
  })

  it('no card without documents or without load data', () => {
    const f = fixture()
    const bare = render({ currentVersion: 'v1.13', prd: { current: { body: '' }, closed: [] }, tickets: { included: [], omitted: [] }, wiki: [], features: [], featureTaxonomy: null, artifacts: { entries: [] }, releases: [], discipline: [] , disciplineLoad: load(f) })
    expect(section(bare)).not.toContain('data-dl-card')
  })
})

describe('T-1078 discipline load diagram: 1024px wrap and dark chip contrast', () => {
  it('Korean labels wrap at word gaps; the scope label never wraps', () => {
    expect(DISCIPLINE_LOAD_CSS).toMatch(/\.dl-card \{[^}]*word-break: keep-all; overflow-wrap: break-word; \}/)
    expect(DISCIPLINE_LOAD_CSS).toContain('.dl-who { flex: 0 0 auto; white-space: nowrap;')
  })
  it('dark SessionStart chips sit on the approved onlayer step', () => {
    expect(DISCIPLINE_LOAD_CSS).toContain(':root[data-theme="dark"] .dl-ev { background: var(--bg-surface-onlayer); }')
  })
})
