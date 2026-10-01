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
const good = (links: unknown[] = []) => ({ kind: 'tag', label: '설치', taxonomy: { kind: 'feature', area: 'start', def: 'd', links } })

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
      "feature: config features.vocab 'bad-kind' taxonomy kind 'other' is not a features.taxonomy.kinds key",
      "feature: config features.vocab 'bare' has no label — the feature screen shows the key instead",
      "feature: config features.vocab 'bare' taxonomy has no def",
      "feature: config features.vocab 'bare' taxonomy link to 'ghost' names no other vocab key",
    ])
  })

  test('no features.taxonomy block: silent (a project without a taxonomy)', () => {
    config({ vocab: { 'install-cli': { kind: 'tag' } } })
    expect(featureWarnings()).toEqual([])
  })
})
