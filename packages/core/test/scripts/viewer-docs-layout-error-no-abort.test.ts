/**
 * T-1220 — one unresolvable doc path never aborts viewer generation.
 *
 * Fixture: `docs/_shared/` exists, config names no slug / products, no
 * `docs/<x>/prd|tickets`, and a wiki page + ticket body write the As-Is path
 * `docs/prd/PRD.md`. `resolveDocsRef` throws DocsLayoutError (no product to
 * map into); the renderer and collector used to let it escape.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawnSync } from 'child_process'
import { test, expect, afterEach } from 'vitest'

const CLI = path.resolve(__dirname, '..', '..', '..', 'viewer', 'cli.mjs')
const HAS_GENERATOR = fs.existsSync(path.resolve(__dirname, '..', '..', '..', 'viewer', 'node_modules', 'marked'))

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop() as string, { recursive: true, force: true })
})

function fixture(prd: boolean): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t1220-')))
  dirs.push(root)
  const w = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(path.join(root, rel), body)
  }
  w('.prdt/config.json', '{}')
  w('.prdt/po-state.json', '{"schema_version":1,"stage":"build","version":"v1.0","current_task":null}')
  w('docs/_shared/wiki/fact--x.md', '---\ntitle: x\ntype: fact\nstatus: live\n---\nsee docs/prd/PRD.md and `docs/prd/PRD.md`\n')
  w('docs/_shared/tickets/v1.0/T-001.md',
    '---\nid: T-001\nslug: a\ntype: impl\nstatus: open\nassignee: developer\ncreated: 2026-09-28\n---\n\n## problem\n\nsee docs/prd/PRD.md\n')
  if (prd) w('docs/_shared/prd/PRD.md', '# PRD\n\n## v1.0\n\nGate: docs/artifacts/gate/x.md\n')
  return root
}

test.skipIf(!HAS_GENERATOR)('viewer generation completes; the unresolvable path stays literal text', () => {
  for (const prd of [false, true]) {
    const root = fixture(prd)
    const out = path.join(root, 'out.html')
    const r = spawnSync('node', [CLI, '--repo-root', root, '--out', out], { encoding: 'utf8', timeout: 60_000 })
    expect(r.stderr).not.toContain('DocsLayoutError')
    expect(r.status).toBe(0)
    const html = fs.readFileSync(out, 'utf8')
    expect(html).toContain('docs/prd/PRD.md')
    expect(html).not.toMatch(/<a [^>]*>docs\/prd\/PRD\.md<\/a>/)
  }
})
