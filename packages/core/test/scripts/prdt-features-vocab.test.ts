/**
 * prdt-features-vocab.test.ts — the feature vocabulary closes (T-674 slice 1,
 * design docs/artifacts/v1.10/linkage-design.md §1.3 · §1.5 · §1.6).
 *
 * Before this slice `feature:` was a free string: the GUI carried five names
 * (`gui-adapter` 32 · `gui` 24 · `gui-core` 2 · `gui-rework` 2 ·
 * `gui-prd-viewer` 1) and no check ever read the value itself — W1–W3 watch
 * orphans, promotion candidates and rot, never the spelling.
 *
 * What lands here, each pinned against the real CLI on a sandbox project:
 *   `prdt features vocab --seed`   every histogram value → `kind: tag`, every
 *                                  `features.non_features` entry → `kind: area`,
 *                                  no judgment, one-time (the block is then the
 *                                  PO's to edit)
 *   `prdt features migrate`        alias → key rewrite of the `feature:` line
 *                                  ONLY; --dry-run prints and writes nothing,
 *                                  --apply rewrites and reindexes
 *   doctor W4  value ∉ keys ∪ aliases → did-you-mean by alias/prefix
 *          W5  value ∈ aliases → migrate hint
 *          W6  spec file · `feature--<x>` · `term--<x>` with x ∉ vocab ∪ the
 *              prdt constants — project store AND the machine store
 *          W3' `kind: area` with a spec file present
 *
 * Every expectation is fixed by CONSTRUCTION (the fixture states the histogram,
 * the vocab, the alias) and quoted as a literal; nothing here asks the CLI what
 * the answer should be. All four checks are standard doctor warnings — never a
 * gate (raising W4 to a failure is the next round's user decision).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function has(bin: string, args: string[]): boolean {
  try { execFileSync(bin, args, { stdio: 'ignore' }); return true } catch { return false }
}
const CAN_RUN = has('python3', ['--version'])

let sandbox: string
let projectRoot: string
let machineWiki: string
let env: NodeJS.ProcessEnv

interface Ticket { id: string; version: string; feature: string; status?: 'open' | 'done' | 'dropped'; quoted?: boolean }

function makeFixture(): void {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-featvocab-'))
  const home = path.join(sandbox, 'home')
  const prdtHome = path.join(home, '.prdt')
  machineWiki = path.join(prdtHome, 'wiki')
  fs.mkdirSync(home, { recursive: true })
  env = {
    ...process.env,
    HOME: home,
    PRDT_HOME: prdtHome,
    PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline'),
  }
  projectRoot = path.join(sandbox, 'proj')
  fs.mkdirSync(path.join(projectRoot, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.10', current_task: null }))
  for (const d of ['docs/prd', 'docs/tickets', 'docs/wiki', 'docs/features']) {
    fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
  }
  config({ slug: 'proj', meta: { allowlist: ['.prdt', 'docs'] } })
}

const CONFIG = () => path.join(projectRoot, '.prdt', 'config.json')
function config(cfg: Record<string, unknown>): void {
  fs.writeFileSync(CONFIG(), JSON.stringify(cfg, null, 2) + '\n')
}
function readConfig(): any {
  return JSON.parse(fs.readFileSync(CONFIG(), 'utf8'))
}

function ticketPath(t: Ticket): string {
  return path.join(projectRoot, 'docs', 'tickets', t.version, `${t.id}.md`)
}
function ticket(t: Ticket): string {
  const p = ticketPath(t)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const value = t.quoted ? `'${t.feature}'` : t.feature
  fs.writeFileSync(p,
    `---\nid: ${t.id}\nslug: s-${t.id.toLowerCase()}\ntype: impl\nstatus: ${t.status ?? 'done'}\n` +
    `assignee: developer\nfeature: ${value}\ncreated: 2026-01-01\n---\n\n## Request\n\n` +
    `body mentions feature: ${t.feature} in prose — this line must never move\n`)
  return p
}

function spec(name: string): void {
  fs.writeFileSync(path.join(projectRoot, 'docs', 'features', `${name}.md`), `# ${name}\n`)
}
function wikiPage(store: 'project' | 'machine', name: string): void {
  const dir = store === 'project' ? path.join(projectRoot, 'docs', 'wiki') : machineWiki
  fs.mkdirSync(dir, { recursive: true })
  const type = name.split('--')[0]
  fs.writeFileSync(path.join(dir, `${name}.md`),
    `---\ntitle: ${name}\ntype: ${type}\nstatus: live\n---\n\n# ${name}\n`)
}

function vocab(v: Record<string, Record<string, unknown>>, extra: Record<string, unknown> = {}): void {
  config({ slug: 'proj', meta: { allowlist: ['.prdt', 'docs'] }, features: { vocab: v, ...extra } })
}

function prdt(args: string[]): { out: string; err: string; status: number | null } {
  const r = spawnSync('python3', [PRDT_CLI, ...args],
    { cwd: projectRoot, encoding: 'utf8', env, timeout: subprocessTimeout('cli') })
  return { out: r.stdout, err: r.stderr, status: r.status }
}

/** Only the seam's own lines. Everything else doctor says is another check's. */
function featureWarnings(): string[] {
  const out = execFileSync('python3', [PRDT_CLI, 'doctor'],
    { cwd: projectRoot, encoding: 'utf8', env, timeout: subprocessTimeout('doctor') })
  expect(out).toMatch(/^doctor: (clean|\d+ warning\(s\)) \(non-blocking\)$/m)
  return out.split('\n').filter(l => l.startsWith('⚠ feature:')).map(l => l.replace(/^⚠ /, ''))
}

beforeEach(() => { if (CAN_RUN) makeFixture() })
afterEach(() => { if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!CAN_RUN)('prdt features vocab --seed — the histogram closes, no judgment', () => {
  test('every value → kind: tag with its first version; non_features → kind: area; key removed', () => {
    config({ slug: 'proj', meta: { allowlist: ['.prdt'] }, features: { non_features: ['gui', 'discipline'] } })
    ticket({ id: 'T-101', version: 'v1.2', feature: 'gui' })
    ticket({ id: 'T-102', version: 'v1.1', feature: 'gui' })
    ticket({ id: 'T-103', version: 'v1.1', feature: 'gui-core' })
    ticket({ id: 'T-104', version: 'v1.3', feature: 'discipline', status: 'open' })
    ticket({ id: 'T-105', version: 'backlog', feature: 'later', status: 'open' })
    ticket({ id: 'T-106', version: 'v1.10', feature: 'late-one', status: 'dropped' })
    const r = prdt(['features', 'vocab', '--seed'])
    expect(r.status, r.err).toBe(0)
    const cfg = readConfig()
    expect(cfg.features.vocab).toEqual({
      'discipline': { kind: 'area', since: 'v1.3' },
      'gui': { kind: 'area', since: 'v1.1' },
      'gui-core': { kind: 'tag', since: 'v1.1' },
      'late-one': { kind: 'tag', since: 'v1.10' },
      'later': { kind: 'tag' },
    })
    expect(cfg.features).not.toHaveProperty('non_features')
    // everything else in the file survives the rewrite
    expect(cfg.slug).toBe('proj')
    expect(cfg.meta).toEqual({ allowlist: ['.prdt'] })
    expect(r.out).toContain('5 key(s)')
    expect(r.out).toContain('3 kind: tag')
    expect(r.out).toContain('2 kind: area')
  })

  test('a non_features entry no ticket carries is still converted — the record is kept, not judged', () => {
    config({ slug: 'proj', features: { non_features: ['ghost'] } })
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui' })
    expect(prdt(['features', 'vocab', '--seed']).status).toBe(0)
    expect(readConfig().features.vocab).toEqual({ ghost: { kind: 'area' }, gui: { kind: 'tag', since: 'v1.1' } })
  })

  test('seeding is one-time — a present vocab is refused, the file untouched', () => {
    vocab({ gui: { kind: 'area' } })
    const before = fs.readFileSync(CONFIG(), 'utf8')
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui' })
    const r = prdt(['features', 'vocab', '--seed'])
    expect(r.status).not.toBe(0)
    expect(r.err).toContain('already')
    expect(fs.readFileSync(CONFIG(), 'utf8')).toBe(before)
  })

  test('a corrupt config.json is refused rather than replaced by the seed', () => {
    fs.writeFileSync(CONFIG(), '{ not json')
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui' })
    const r = prdt(['features', 'vocab', '--seed'])
    expect(r.status).not.toBe(0)
    expect(fs.readFileSync(CONFIG(), 'utf8')).toBe('{ not json')
  })

  test('bare `prdt features vocab` lists the block, one key per line', () => {
    vocab({ gui: { kind: 'area', since: 'v1.1', aliases: ['gui-core'] }, 'gui-adapter': { kind: 'feature', parent: 'gui' } })
    const r = prdt(['features', 'vocab'])
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/^gui\s+area\s+v1\.1\s+aliases: gui-core$/m)
    expect(r.out).toMatch(/^gui-adapter\s+feature\s+.*parent: gui$/m)
  })
})

describe.skipIf(!CAN_RUN)('prdt features migrate — alias → key, the `feature:` line only', () => {
  const V = {
    gui: { kind: 'area', aliases: ['gui-core', 'gui-rework', 'gui-prd-viewer'] },
    'gui-adapter': { kind: 'feature', parent: 'gui' },
    discipline: { kind: 'area', aliases: ['prdt-discipline'] },
  }

  function seedTickets(): { moving: string[]; still: string[] } {
    const moving = [
      ticket({ id: 'T-101', version: 'v1.1', feature: 'gui-core' }),
      ticket({ id: 'T-102', version: 'v1.1', feature: 'gui-core', quoted: true }),
      ticket({ id: 'T-103', version: 'v2.0', feature: 'gui-rework', status: 'open' }),
      ticket({ id: 'T-104', version: 'v1.5', feature: 'prdt-discipline' }),
    ]
    const still = [
      ticket({ id: 'T-105', version: 'v1.9', feature: 'gui' }),
      ticket({ id: 'T-106', version: 'v1.9', feature: 'gui-adapter' }),
      ticket({ id: 'T-107', version: 'backlog', feature: 'unrelated', status: 'open' }),
    ]
    return { moving, still }
  }

  test('--dry-run prints file · old → new per affected ticket and writes nothing', () => {
    vocab(V)
    const { moving, still } = seedTickets()
    const snap = new Map([...moving, ...still].map(p => [p, fs.readFileSync(p, 'utf8')]))
    const r = prdt(['features', 'migrate', '--dry-run'])
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain('docs/tickets/v1.1/T-101.md · gui-core → gui')
    expect(r.out).toContain('docs/tickets/v1.1/T-102.md · gui-core → gui')
    expect(r.out).toContain('docs/tickets/v2.0/T-103.md · gui-rework → gui')
    expect(r.out).toContain('docs/tickets/v1.5/T-104.md · prdt-discipline → discipline')
    expect(r.out.split('\n').filter(l => l.includes(' → ')).length).toBe(4)
    expect(r.out).toContain('4 file(s) would change')
    expect(r.out).toMatch(/nothing written/)
    for (const [p, text] of snap) expect(fs.readFileSync(p, 'utf8')).toBe(text)
    expect(fs.existsSync(path.join(projectRoot, '.prdt', 'index.db'))).toBe(false)
  })

  test('--apply rewrites exactly the affected files, exactly the frontmatter line, and reindexes', () => {
    vocab(V)
    const { moving, still } = seedTickets()
    const before = new Map([...moving, ...still].map(p => [p, fs.readFileSync(p, 'utf8')]))
    const r = prdt(['features', 'migrate', '--apply'])
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain('4 file(s) rewritten')
    expect(r.out).toContain('reindexed')
    for (const p of still) expect(fs.readFileSync(p, 'utf8')).toBe(before.get(p))
    const expectedNew: Record<string, string> = {
      [moving[0]]: before.get(moving[0])!.replace('\nfeature: gui-core\n', '\nfeature: gui\n'),
      [moving[1]]: before.get(moving[1])!.replace("\nfeature: 'gui-core'\n", "\nfeature: 'gui'\n"),
      [moving[2]]: before.get(moving[2])!.replace('\nfeature: gui-rework\n', '\nfeature: gui\n'),
      [moving[3]]: before.get(moving[3])!.replace('\nfeature: prdt-discipline\n', '\nfeature: discipline\n'),
    }
    for (const p of moving) {
      const after = fs.readFileSync(p, 'utf8')
      expect(after).not.toBe(before.get(p))
      expect(after).toBe(expectedNew[p])
      // the prose mention of the old value in the body is untouched — one line moved
      const diff = before.get(p)!.split('\n').filter((l, i) => l !== after.split('\n')[i])
      expect(diff).toHaveLength(1)
      expect(diff[0]).toMatch(/^feature: /)
      expect(after).toContain('body mentions feature: ')
    }
    // reindexed: the derived index now answers with the new key
    expect(fs.existsSync(path.join(projectRoot, '.prdt', 'index.db'))).toBe(true)
    const listed = prdt(['tickets', '--feature', 'gui']).out
    for (const id of ['T-101', 'T-102', 'T-103', 'T-105']) expect(listed).toContain(id)
    expect(listed).not.toContain('T-104')
    // idempotent: a second pass finds nothing left to move
    const again = prdt(['features', 'migrate', '--dry-run'])
    expect(again.out).toContain('0 file(s) would change')
    // and doctor's W5 is now silent
    expect(featureWarnings().filter(l => l.includes('is an alias of'))).toEqual([])
  })

  test('no vocab → refused with the seed hint; neither flag → usage error', () => {
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui-core' })
    const r = prdt(['features', 'migrate', '--dry-run'])
    expect(r.status).not.toBe(0)
    expect(r.err).toContain('prdt features vocab --seed')
    vocab(V)
    const u = prdt(['features', 'migrate'])
    expect(u.status).not.toBe(0)
    expect(u.err).toMatch(/--dry-run|--apply/)
  })

  test('a vocab whose alias is also a key is refused before any file moves', () => {
    vocab({ gui: { kind: 'area', aliases: ['gui-core'] }, 'gui-core': { kind: 'tag' } })
    const p = ticket({ id: 'T-101', version: 'v1.1', feature: 'gui-core' })
    const text = fs.readFileSync(p, 'utf8')
    const r = prdt(['features', 'migrate', '--apply'])
    expect(r.status).not.toBe(0)
    expect(r.err).toContain("alias 'gui-core'")
    expect(fs.readFileSync(p, 'utf8')).toBe(text)
  })
})

describe.skipIf(!CAN_RUN)('doctor W4 — a value outside vocab keys ∪ aliases', () => {
  test('fires with a did-you-mean by prefix, naming the ticket', () => {
    vocab({ gui: { kind: 'area' }, discipline: { kind: 'area' } })
    ticket({ id: 'T-101', version: 'v1.9', feature: 'guii' })
    const w = featureWarnings()
    expect(w).toContain(
      "feature: 'guii' is not a .prdt/config.json features.vocab key (docs/tickets/v1.9/T-101.md) — did you mean 'gui'? — add a vocab line first, or fix the value")
    expect(w).toHaveLength(1)
  })

  test('did-you-mean resolves through an alias to its key', () => {
    vocab({ gui: { kind: 'area', aliases: ['gui-core'] } })
    ticket({ id: 'T-101', version: 'v1.9', feature: 'gui-cor' })
    expect(featureWarnings()[0]).toContain("did you mean 'gui'?")
  })

  test('no candidate → no suggestion, the warning still fires; several tickets fold into one line', () => {
    vocab({ gui: { kind: 'area' } })
    ticket({ id: 'T-101', version: 'v1.9', feature: 'zzz' })
    ticket({ id: 'T-102', version: 'v1.8', feature: 'zzz', status: 'open' })
    const w = featureWarnings()
    expect(w).toHaveLength(1)
    expect(w[0]).toContain("'zzz' is not a .prdt/config.json features.vocab key (2 tickets: docs/tickets/v1.8/T-102.md, docs/tickets/v1.9/T-101.md)")
    expect(w[0]).not.toContain('did you mean')
  })

  test('without a vocab the value is not checked — the vocabulary is not closed yet', () => {
    config({ slug: 'proj' })
    ticket({ id: 'T-101', version: 'v1.9', feature: 'anything-goes' })
    expect(featureWarnings()).toEqual([])
  })
})

describe.skipIf(!CAN_RUN)('doctor W5 — an alias still in use', () => {
  test('fires once per alias with the migrate hint, and never as W4', () => {
    vocab({ gui: { kind: 'area', aliases: ['gui-core'] } })
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui-core' })
    ticket({ id: 'T-102', version: 'v1.1', feature: 'gui-core' })
    const w = featureWarnings()
    expect(w).toEqual([
      "feature: 'gui-core' is an alias of 'gui' — 2 tickets still carry it (docs/tickets/v1.1/T-101.md, docs/tickets/v1.1/T-102.md): run `prdt features migrate --dry-run`, then `--apply`",
    ])
  })
})

describe.skipIf(!CAN_RUN)('doctor W6 — a name page or spec file outside vocab ∪ constants, both stores', () => {
  test('spec file · feature-- · term-- in the project store, and term-- in the machine store', () => {
    vocab({ gui: { kind: 'area', aliases: ['gui-core'] } })
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui' })
    spec('gui-core')                         // an alias, not a key
    wikiPage('project', 'feature--ghost')
    wikiPage('project', 'term--nobody')
    wikiPage('machine', 'term--elsewhere')
    wikiPage('machine', 'feature--gui')      // a key — silent
    const w = featureWarnings()
    expect(w).toContain("feature: docs/features/gui-core.md names no features.vocab key — 'gui-core' is an alias of 'gui'")
    expect(w).toContain('feature: wiki page feature--ghost names no features.vocab key')
    expect(w).toContain('feature: wiki page term--nobody names no features.vocab key nor a prdt constant')
    expect(w).toContain('feature: machine wiki page machine:term--elsewhere names no features.vocab key nor a prdt constant')
    expect(w.filter(l => l.includes('feature--gui '))).toEqual([])
  })

  test('the prdt constants are legal term-- stems: the concepts and their members', () => {
    vocab({ gui: { kind: 'area' } })
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui' })
    for (const s of ['dispatch', 'persona', 'stage', 'ticket', 'po', 'designer', 'build', 'impl']) wikiPage('project', `term--${s}`)
    expect(featureWarnings()).toEqual([])
  })

  test('a constant is NOT a legal feature-- stem or spec name — those are features by definition', () => {
    vocab({ gui: { kind: 'area' } })
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui' })
    wikiPage('project', 'feature--persona')
    const w = featureWarnings()
    expect(w).toContain('feature: wiki page feature--persona names no features.vocab key')
  })
})

describe.skipIf(!CAN_RUN)("doctor W3' — kind: area with a spec file is rot", () => {
  test('fires naming both sides', () => {
    vocab({ gui: { kind: 'area' } })
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui' })
    spec('gui')
    expect(featureWarnings()).toContain(
      "feature: config features.vocab 'gui' is kind: area but docs/features/gui.md exists — set kind: feature or remove the spec")
  })

  test('kind: feature with a spec, kind: area without one — both silent', () => {
    vocab({ gui: { kind: 'area' }, 'gui-adapter': { kind: 'feature', parent: 'gui' } })
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui' })
    ticket({ id: 'T-102', version: 'v1.1', feature: 'gui-adapter' })
    spec('gui-adapter')
    expect(featureWarnings()).toEqual([])
  })

  test('kind: area records the judgment W2 asks for — T3 passing stays silent; kind: tag does not', () => {
    vocab({ gui: { kind: 'area' }, dormant: { kind: 'tag' } })
    for (const v of ['v1.1', 'v1.2', 'v1.3']) ticket({ id: `T-1${v.replace('.', '')}`, version: v, feature: 'gui' })
    ticket({ id: 'T-201', version: 'v1.1', feature: 'dormant' })
    ticket({ id: 'T-202', version: 'v1.2', feature: 'dormant' })
    const w = featureWarnings()
    expect(w).toHaveLength(1)
    expect(w[0]).toContain("'dormant' — done tickets span 2 version dirs")
    expect(w[0]).toContain('record `kind: area` in .prdt/config.json features.vocab')
  })
})

describe.skipIf(!CAN_RUN)('the vocab block itself — shape problems and the retired key', () => {
  test('bad kind · alias colliding with a key · parent outside vocab · non-kebab key', () => {
    vocab({
      gui: { kind: 'bogus', aliases: ['gui-core'] },
      'gui-core': { kind: 'tag' },
      'Gui_Adapter': { kind: 'feature', parent: 'nowhere' },
    })
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui' })
    const w = featureWarnings()
    expect(w).toContain("feature: config features.vocab 'gui' kind 'bogus' is not one of feature/area/tag")
    expect(w).toContain("feature: config features.vocab alias 'gui-core' of 'gui' is also a key — an alias never overlaps a key")
    expect(w).toContain("feature: config features.vocab 'Gui_Adapter' parent 'nowhere' is not a vocab key")
    expect(w).toContain("feature: config features.vocab key 'Gui_Adapter' is not kebab-case ([a-z0-9]+(-[a-z0-9]+)*)")
  })

  test('features.non_features left beside a vocab is reported as retired', () => {
    vocab({ gui: { kind: 'area' } }, { non_features: ['gui'] })
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui' })
    expect(featureWarnings()).toContain(
      'feature: config features.non_features is retired by features.vocab (kind: area) — remove it (entries: gui)')
  })
})

describe.skipIf(!CAN_RUN)('the clean shape — every check silent together', () => {
  test('keys cover every value, spec files sit on kind: feature, term pages sit on keys or constants', () => {
    vocab({
      gui: { kind: 'area', since: 'v1.1', aliases: ['gui-core'] },
      'gui-adapter': { kind: 'feature', since: 'v1.1', parent: 'gui' },
      'meta-split': { kind: 'feature', since: 'v1.2' },
      'init-cli': { kind: 'tag', since: 'v1.1' },
    })
    ticket({ id: 'T-101', version: 'v1.1', feature: 'gui' })
    ticket({ id: 'T-102', version: 'v1.2', feature: 'gui-adapter' })
    ticket({ id: 'T-103', version: 'v1.2', feature: 'meta-split' })
    ticket({ id: 'T-104', version: 'v1.3', feature: 'meta-split' })
    ticket({ id: 'T-105', version: 'v1.1', feature: 'init-cli', status: 'open' })
    spec('gui-adapter'); spec('meta-split')
    wikiPage('project', 'feature--gui-adapter'); wikiPage('project', 'feature--meta-split')
    wikiPage('project', 'term--meta-split'); wikiPage('project', 'term--dispatch')
    wikiPage('machine', 'fact--this-machine')
    expect(featureWarnings()).toEqual([])
  })
})
