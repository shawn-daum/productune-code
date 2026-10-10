/**
 * prdt-features-taxonomy.test.ts — T-882: the feature taxonomy the viewer's
 * feature screen draws lives in `.prdt/config.json` (`features.taxonomy`
 * {areas, kinds} + each `features.vocab` entry's `label` · `taxonomy`), so
 * doctor's existing W4 checks tickets' `feature:` values against the
 * taxonomy's own keys, and the new lines catch entries the screen would drop
 * or mis-draw. Every expectation is a literal fixed by the fixture.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')
let CAN_RUN = true
try { execFileSync('python3', ['--version'], { stdio: 'ignore' }) } catch { CAN_RUN = false }

let sandbox: string
let projectRoot: string
let env: NodeJS.ProcessEnv

beforeEach(() => {
  if (!CAN_RUN) return
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-feattax-'))
  const home = path.join(sandbox, 'home')
  fs.mkdirSync(home, { recursive: true })
  env = { ...process.env, HOME: home, PRDT_HOME: path.join(home, '.prdt'), PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline') }
  projectRoot = path.join(sandbox, 'proj')
  for (const d of ['.prdt', 'docs/prd', 'docs/tickets/v1.1', 'docs/wiki', 'docs/features']) fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.1', current_task: null }))
})
afterEach(() => { if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true }) })

function config(features: Record<string, unknown>): void {
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'),
    JSON.stringify({ slug: 'proj', meta: { allowlist: ['.prdt', 'docs'] }, features }, null, 2) + '\n')
}
function ticket(id: string, feature: string): void {
  fs.writeFileSync(path.join(projectRoot, 'docs', 'tickets', 'v1.1', `${id}.md`),
    `---\nid: ${id}\nslug: s\ntype: impl\nstatus: done\nassignee: developer\nfeature: ${feature}\ncreated: 2026-01-01\n---\n\nbody\n`)
}
function featureWarnings(): string[] {
  const out = execFileSync('python3', [PRDT_CLI, 'doctor'],
    { cwd: projectRoot, encoding: 'utf8', env, timeout: subprocessTimeout('doctor') })
  return out.split('\n').filter(l => l.startsWith('⚠ feature:')).map(l => l.replace(/^⚠ /, ''))
}

const TAXONOMY = {
  areas: [{ key: 'start', name: '시작', def: 'd' }],
  kinds: [{ key: 'feature', name: '기능', def: 'd' }],
}
const GUIDE = { when: ['w'], ux: 'u', logic: [{ text: 'l', ground: 'T-1' }], limits: [], example: 'e' }
const good = (links: unknown[] = [], guide: unknown = GUIDE) => ({ kind: 'tag', label: '설치', taxonomy: { kind: 'feature', area: 'start', def: 'd', links, guide } })

describe.skipIf(!CAN_RUN)('prdt doctor — feature taxonomy (T-882)', () => {
  test('a complete taxonomy and a ticket on its key: no feature line', () => {
    config({ taxonomy: TAXONOMY, vocab: { 'install-cli': good(), 'viewer': good([{ to: 'install-cli', text: 't', ground: 'g' }]) } })
    ticket('T-1', 'install-cli')
    expect(featureWarnings()).toEqual([])
  })

  test("a ticket whose feature: is not a taxonomy key is reported (W4 reads the same keys)", () => {
    config({ taxonomy: TAXONOMY, vocab: { 'install-cli': good() } })
    ticket('T-1', 'installer')
    expect(featureWarnings()).toEqual([
      "feature: 'installer' is not a .prdt/config.json features.vocab key (docs/tickets/v1.1/T-1.md) — add a vocab line first, or fix the value",
    ])
  })

  test('entries the screen would drop or mis-draw are each named', () => {
    config({
      taxonomy: TAXONOMY,
      vocab: {
        'no-tax': { kind: 'tag' },
        'bad-area': { kind: 'tag', label: 'x', taxonomy: { kind: 'feature', area: 'nowhere', def: 'd' } },
        'bad-kind': { kind: 'tag', label: 'x', taxonomy: { kind: 'other', area: 'start', def: 'd' } },
        'bare': { kind: 'tag', taxonomy: { kind: 'feature', area: 'start', links: [{ to: 'ghost' }] } },
      },
    })
    expect(featureWarnings()).toEqual([
      "feature: config features.vocab 'no-tax' has no taxonomy — the viewer's feature screen leaves it out",
      "feature: config features.vocab 'bad-area' taxonomy area 'nowhere' is not a features.taxonomy.areas key — the viewer's feature screen leaves it out",
      "feature: config features.vocab 'bad-area' taxonomy guide is missing — the viewer's feature detail shows the new-feature notice",
      "feature: config features.vocab 'bad-kind' taxonomy kind 'other' is not a features.taxonomy.kinds key",
      "feature: config features.vocab 'bad-kind' taxonomy guide is missing — the viewer's feature detail shows the new-feature notice",
      "feature: config features.vocab 'bare' has no label — the feature screen shows the key instead",
      "feature: config features.vocab 'bare' taxonomy has no def",
      "feature: config features.vocab 'bare' taxonomy guide is missing — the viewer's feature detail shows the new-feature notice",
      "feature: config features.vocab 'bare' taxonomy link to 'ghost' names no other vocab key",
    ])
  })

  test('no features.taxonomy block: silent (a project without a taxonomy)', () => {
    config({ vocab: { 'install-cli': { kind: 'tag' } } })
    expect(featureWarnings()).toEqual([])
  })

  test('malformed taxonomy shapes (list / dict values) are named, never a crash', () => {
    config({
      taxonomy: TAXONOMY,
      vocab: {
        'area-list': { kind: 'tag', label: 'x', taxonomy: { kind: 'feature', area: ['start'], def: 'd' } },
        'kind-dict': { kind: 'tag', label: 'x', taxonomy: { kind: { a: 1 }, area: 'start', def: 'd' } },
        'link-list': { kind: 'tag', label: 'x', taxonomy: { kind: 'feature', area: 'start', def: 'd', links: [{ to: ['area-list'] }, { to: { a: 1 } }] } },
        'label-list': { kind: 'tag', label: ['x'], taxonomy: { kind: 'feature', area: 'start', def: ['d'] } },
      },
    })
    expect(featureWarnings()).toEqual([
      "feature: config features.vocab 'label-list' label is not a string",
      "feature: config features.vocab 'area-list' taxonomy area is not a string — the viewer's feature screen leaves it out",
      "feature: config features.vocab 'area-list' taxonomy guide is missing — the viewer's feature detail shows the new-feature notice",
      "feature: config features.vocab 'kind-dict' taxonomy kind is not a string",
      "feature: config features.vocab 'kind-dict' taxonomy guide is missing — the viewer's feature detail shows the new-feature notice",
      "feature: config features.vocab 'link-list' taxonomy guide is missing — the viewer's feature detail shows the new-feature notice",
      "feature: config features.vocab 'link-list' taxonomy link to is not a string",
      "feature: config features.vocab 'link-list' taxonomy link to is not a string",
      "feature: config features.vocab 'label-list' has no label — the feature screen shows the key instead",
      "feature: config features.vocab 'label-list' taxonomy has no def",
      "feature: config features.vocab 'label-list' taxonomy guide is missing — the viewer's feature detail shows the new-feature notice",
    ])
  })

  test('features.taxonomy as a list, and areas / kinds items as lists: named, never a crash', () => {
    config({ taxonomy: [1], vocab: { 'install-cli': good() } })
    expect(featureWarnings()).toEqual(['feature: config features.taxonomy is not an object'])
    config({ taxonomy: { areas: [['start']], kinds: { key: 'feature' } }, vocab: { 'install-cli': good() } })
    expect(featureWarnings().slice(0, 2)).toEqual([
      'feature: config features.taxonomy.areas[0] has no kebab-case key',
      'feature: config features.taxonomy.kinds is missing or empty',
    ])
  })

  test('features.vocab entries that are lists, and a taxonomy block that is a list: named, never a crash', () => {
    config({ taxonomy: TAXONOMY, vocab: { 'install-cli': good(), 'weird': ['x'], 'bad-tax': { kind: 'tag', label: 'x', taxonomy: ['feature'] } } })
    const w = featureWarnings()
    expect(w).toContain("feature: config features.vocab 'bad-tax' has no taxonomy — the viewer's feature screen leaves it out")
  })

  test('T-964: a guide missing, empty cells and malformed types are each named, never a crash', () => {
    config({
      taxonomy: TAXONOMY,
      vocab: {
        'no-guide': good([], null),
        'empty-cells': good([], { when: [], ux: '  ', logic: [], limits: [], example: '' }),
        'bad-types': good([], { when: 3, ux: ['a', 1], logic: [{ text: 5, ground: 7 }, 9], limits: { a: 1 }, example: ['x'] }),
        'guide-list': good([], ['x']),
        'ok-string-logic': good([], { when: 'w', ux: ['u'], logic: ['plain', { text: 't', ground: ['T-1', 'T-2'] }], example: 'e' }),
      },
    })
    const w = 'feature: config features.vocab'
    expect(featureWarnings()).toEqual([
      `${w} 'no-guide' taxonomy guide is missing — the viewer's feature detail shows the new-feature notice`,
      `${w} 'empty-cells' taxonomy guide.when is empty`,
      `${w} 'empty-cells' taxonomy guide.ux is empty`,
      `${w} 'empty-cells' taxonomy guide.logic is empty`,
      `${w} 'empty-cells' taxonomy guide.example is empty`,
      `${w} 'bad-types' taxonomy guide.when is not a string or a list of strings`,
      `${w} 'bad-types' taxonomy guide.ux[1] is not a string or a {text, at} object`,
      `${w} 'bad-types' taxonomy guide.limits is not a string or a list of strings`,
      `${w} 'bad-types' taxonomy guide.logic[0] text is not a string`,
      `${w} 'bad-types' taxonomy guide.logic[0] ground is not a ticket id string or a list of them`,
      `${w} 'bad-types' taxonomy guide.logic[1] is not a string or a {text, ground} object`,
      `${w} 'bad-types' taxonomy guide.logic is empty`,
      `${w} 'bad-types' taxonomy guide.example is not a string`,
      `${w} 'guide-list' taxonomy guide is not an object`,
    ])
  })

  test('T-1049: ux {text, at} and flow — accepted when well-formed, each malformed one named', () => {
    config({
      taxonomy: TAXONOMY,
      vocab: {
        'ok-at': good([], { when: 'w', ux: [{ text: 'a', at: 'viewer.prd' }, { text: 'b', at: 'terminal' }, 'plain'], logic: ['l'], example: 'e', flow: '%% c\nflowchart TD\n  A --> B' }),
        'ok-seq': good([], { when: 'w', ux: ['u'], logic: ['l'], example: 'e', flow: 'sequenceDiagram\n  A->>B: x' }),
        'bad-at': good([], { when: 'w', ux: [{ text: 'a', at: 'viewer.nope' }, { text: 'b', at: 'nowhere' }, { text: 'c', at: 3 }, { at: 'viewer' }, { text: 'd', at: 'viewer.' }], logic: ['l'], example: 'e', flow: 'just prose' }),
        'bad-flow': good([], { when: 'w', ux: ['u'], logic: ['l'], example: 'e', flow: ['flowchart TD'] }),
      },
    })
    const w = 'feature: config features.vocab'
    expect(featureWarnings()).toEqual([
      `${w} 'bad-at' taxonomy guide.ux[0] at 'viewer.nope' names no surface (terminal · statusline · viewer · cli, as <surface>.<part>)`,
      `${w} 'bad-at' taxonomy guide.ux[1] at 'nowhere' names no surface (terminal · statusline · viewer · cli, as <surface>.<part>)`,
      `${w} 'bad-at' taxonomy guide.ux[2] at is not a string`,
      `${w} 'bad-at' taxonomy guide.ux[3] text is not a string`,
      `${w} 'bad-at' taxonomy guide.ux[4] at 'viewer.' names no surface (terminal · statusline · viewer · cli, as <surface>.<part>)`,
      `${w} 'bad-at' taxonomy guide.flow does not start with a mermaid diagram type (flowchart TD · sequenceDiagram · ...)`,
      `${w} 'bad-flow' taxonomy guide.flow is not a string`,
    ])
  })

  test('T-1049: the surface keys doctor accepts are the ones the viewer draws', () => {
    const py = fs.readFileSync(PRDT_CLI, 'utf8')
    const block = /SURFACE_KEYS = \{([\s\S]*?)\n\}/.exec(py)![1]
    const doctor = [...block.matchAll(/"(\w+)": \(([^)]*)\)/g)].map(m => [m[1], [...m[2].matchAll(/"(\w+)"/g)].map(x => x[1])])
    const labels = fs.readFileSync(path.resolve(__dirname, '../../../viewer/lib/labels.mjs'), 'utf8')
    const viewer = [...labels.matchAll(/\{ key: '(\w+)', name: '[^']*', parts: \[([^\]]*(?:\][^\]]*)*?)\] \}/g)]
      .map(m => [m[1], [...m[2].matchAll(/\['(\w+)',/g)].map(x => x[1])])
    expect(viewer.length).toBe(4)
    expect(doctor).toEqual(viewer)
  })
})
