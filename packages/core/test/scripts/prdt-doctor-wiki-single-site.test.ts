/**
 * prdt-doctor-wiki-single-site.test.ts — the `wiki-single-site` doctor rule (T-664).
 *
 * T-664's designer Outcome names the shape: any `docs/wiki/*.md` page carrying
 * `single_site: {subject: [...], claim: [...]}` frontmatter becomes the ONE
 * citation site for the fact those tokens describe. A line elsewhere that
 * carries a subject token AND a claim token together, without citing that
 * page (`[[<slug>]]` or `docs/wiki/<slug>.md` on the SAME line), restates the
 * fact instead of pointing at it. The rule knows nothing about GUI or any
 * other project vocabulary — only the shape — so this fixture invents its own
 * tokens rather than reusing `fact--gui-deferral`'s.
 *
 * Four behaviors this file pins, verbatim from the dispatch acceptance:
 *   1. fires on a restating line without citation
 *   2. silent when the same line cites the page
 *   3. Skipped when no single_site page exists (the FAMILY_PROJECT `Skipped`
 *      return itself — this family's Skipped state never reaches the
 *      discipline↔execution verdict tail, so it is probed directly on the
 *      function, the same importlib technique
 *      prdt-doctor-verdict.test.ts uses to reach `doctor_verdict_lines`)
 *   4. silent for done tickets, and for an open ticket's own `log` frame key
 *
 * Drives the real CLI (`python3 scripts/prdt doctor`) for 1/2/4 — the surface
 * the dispatch asked for a "permanent regression test... that drives the real
 * CLI" to cover — and imports the script as a module only for 3, where the
 * CLI has no visible signal to assert on.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
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
let env: NodeJS.ProcessEnv

function makeFixture(): void {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-wikisite-'))
  const home = path.join(sandbox, 'home')
  fs.mkdirSync(home, { recursive: true })
  env = {
    ...process.env,
    HOME: home,
    PRDT_HOME: path.join(home, '.prdt'),
    PRDT_DISCIPLINE: path.join(CORE_ROOT, 'discipline'),
  }
  projectRoot = path.join(sandbox, 'proj')
  fs.mkdirSync(path.join(projectRoot, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.1', current_task: null }))
  fs.writeFileSync(path.join(projectRoot, '.prdt', 'config.json'),
    JSON.stringify({ slug: 'proj' }, null, 2))
  for (const d of ['docs/prd', 'docs/tickets', 'docs/wiki', 'docs/features']) {
    fs.mkdirSync(path.join(projectRoot, d), { recursive: true })
  }
}

/** A `single_site` fact page — generic tokens, not this project's own vocabulary. */
function factPage(slug: string, subject: string[], claim: string[]): void {
  const fm = [
    '---',
    `title: ${slug} fixture fact`,
    'type: fact',
    'status: live',
    'single_site:',
    `  subject: [${subject.map(s => JSON.stringify(s)).join(', ')}]`,
    `  claim: [${claim.map(c => JSON.stringify(c)).join(', ')}]`,
    '---',
    '',
    `# ${slug}`,
    '',
    'fixture body.',
    '',
  ].join('\n')
  fs.writeFileSync(path.join(projectRoot, 'docs', 'wiki', `${slug}.md`), fm)
}

function design(content: string): void {
  fs.writeFileSync(path.join(projectRoot, 'docs', 'design.md'), content)
}

function ticket(id: string, status: 'open' | 'done', body: string): void {
  const dir = path.join(projectRoot, 'docs', 'tickets', 'v1.1')
  fs.mkdirSync(dir, { recursive: true })
  const closed = status === 'done' ? '\nclosed: 2026-01-02' : ''
  fs.writeFileSync(path.join(dir, `${id}.md`),
    `---\nid: ${id}\nslug: s-${id.toLowerCase()}\ntype: impl\nstatus: ${status}\n` +
    `assignee: developer\ncreated: 2026-01-01${closed}\n---\n\n${body}\n`)
}

/** Only this rule's own lines. */
function siteWarnings(): string[] {
  const out = execFileSync('python3', [PRDT_CLI, 'doctor'],
    { cwd: projectRoot, encoding: 'utf8', env, timeout: subprocessTimeout('doctor') })
  // proof the run reached the end rather than dying early — silence below is
  // then a verdict, not a dead code path (same shape prdt-doctor-feature-seam
  // pins its own rule with)
  expect(out).toMatch(/^doctor: (clean|\d+ warning\(s\)) \(non-blocking\)$/m)
  return out.split('\n').filter(l => l.startsWith('⚠ wiki-single-site:')).map(l => l.replace(/^⚠ /, ''))
}

beforeEach(() => { if (CAN_RUN) makeFixture() })
afterEach(() => { if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true }) })

describe.skipIf(!CAN_RUN)('wiki-single-site (T-664)', () => {
  test('a line carrying subject + claim together, uncited, IS reported', () => {
    factPage('fact--widget-tier', ['widget', 'Widget'], ['tier two', 'tier2'])
    design('# Design\n\nThe widget ships in tier two this round.\n')
    const w = siteWarnings()
    expect(w).toHaveLength(1)
    expect(w[0]).toBe(
      'wiki-single-site: docs/design.md:3 restates fact--widget-tier without citing it')
  })

  test('the SAME line, now citing the page via [[wikilink]], is silent', () => {
    factPage('fact--widget-tier', ['widget', 'Widget'], ['tier two', 'tier2'])
    design('# Design\n\nThe widget ships in tier two this round ([[fact--widget-tier]]).\n')
    expect(siteWarnings()).toEqual([])
  })

  test('the same line, citing via the bare docs/wiki/<slug>.md path, is also silent', () => {
    factPage('fact--widget-tier', ['widget', 'Widget'], ['tier two', 'tier2'])
    design('# Design\n\nThe widget ships in tier two this round — see docs/wiki/fact--widget-tier.md.\n')
    expect(siteWarnings()).toEqual([])
  })

  test('citing on a DIFFERENT line than the restatement still fires — citation is per-line', () => {
    factPage('fact--widget-tier', ['widget', 'Widget'], ['tier two', 'tier2'])
    design('# Design\n\nSee [[fact--widget-tier]] for background.\n\nThe widget ships in tier two this round.\n')
    expect(siteWarnings()).toHaveLength(1)
  })

  test('a subject token alone, with no claim token on the line, is silent', () => {
    factPage('fact--widget-tier', ['widget', 'Widget'], ['tier two', 'tier2'])
    design('# Design\n\nThe widget team meets on Tuesdays.\n')
    expect(siteWarnings()).toEqual([])
  })

  test('Skipped when no page carries single_site frontmatter — probed directly, no visible CLI signal', () => {
    // wiki-single-site is FAMILY_PROJECT, so its Skipped state never reaches
    // doctor_verdict_lines' fam filter (FAMILY_DE only) and prints no line of
    // its own either way — the CLI is silent whether it looked and found
    // nothing, or could not look at all. So this half of the acceptance is
    // asked of the function directly, importing scripts/prdt as a module the
    // same way prdt-doctor-verdict.test.ts reaches doctor_verdict_lines.
    design('# Design\n\nThe widget ships in tier two this round.\n')  // would fire if a page existed
    const probe = `
import importlib.util, importlib.machinery, pathlib
loader = importlib.machinery.SourceFileLoader("prdt", ${JSON.stringify(PRDT_CLI)})
spec = importlib.util.spec_from_loader("prdt", loader)
m = importlib.util.module_from_spec(spec); loader.exec_module(m)
root = pathlib.Path(${JSON.stringify(projectRoot)})
result = m.wiki_single_site_warnings(root, [])
assert isinstance(result, m.Skipped), (type(result), result)
assert result.reason == "no single_site page", result.reason
print("PROBE_OK")
`
    const out = execFileSync('python3', ['-c', probe],
      { encoding: 'utf8', timeout: subprocessTimeout('cli') })
    expect(out).toContain('PROBE_OK')
    // and the CLI itself stays silent on this rule in the same fixture, since
    // there is nothing (no single_site page) for it to fire against either way
    expect(siteWarnings()).toEqual([])
  })

  test('a done ticket restating the fact, uncited, is silent — closed record, not a live restatement', () => {
    factPage('fact--widget-tier', ['widget', 'Widget'], ['tier two', 'tier2'])
    ticket('T-900', 'done', '## outcome\n\nThe widget ships in tier two this round.\n')
    expect(siteWarnings()).toEqual([])
  })

  test('an OPEN ticket restating the fact OUTSIDE its log key IS reported', () => {
    factPage('fact--widget-tier', ['widget', 'Widget'], ['tier two', 'tier2'])
    ticket('T-901', 'open', '## problem\n\nThe widget ships in tier two this round.\n')
    const w = siteWarnings()
    expect(w).toHaveLength(1)
    expect(w[0]).toBe(
      'wiki-single-site: docs/tickets/v1.1/T-901.md:12 restates fact--widget-tier without citing it')
  })

  test('the SAME open ticket restating it INSIDE its log key is silent', () => {
    factPage('fact--widget-tier', ['widget', 'Widget'], ['tier two', 'tier2'])
    ticket('T-902', 'open',
      '## problem\n\nunrelated.\n\n## log\n\nThe widget ships in tier two this round.\n')
    expect(siteWarnings()).toEqual([])
  })

  test('the same open ticket, log key AND another key both restating, reports only the other key\'s line', () => {
    factPage('fact--widget-tier', ['widget', 'Widget'], ['tier two', 'tier2'])
    ticket('T-903', 'open',
      '## problem\n\nThe widget ships in tier two this round.\n\n' +
      '## log\n\nThe widget ships in tier two this round.\n')
    const w = siteWarnings()
    expect(w).toHaveLength(1)
    expect(w[0]).toBe(
      'wiki-single-site: docs/tickets/v1.1/T-903.md:12 restates fact--widget-tier without citing it')
  })

  test('a page never needs to cite itself — its own body can restate its own tokens', () => {
    factPage('fact--widget-tier', ['widget', 'Widget'], ['tier two', 'tier2'])
    // rewrite the page so its own body plainly carries both tokens uncited
    fs.appendFileSync(path.join(projectRoot, 'docs', 'wiki', 'fact--widget-tier.md'),
      '\nThe widget ships in tier two this round, restated in its own words.\n')
    expect(siteWarnings()).toEqual([])
  })
})
