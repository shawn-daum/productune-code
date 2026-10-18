/**
 * prdt-lanes-gate-parity.test.ts — T-1145: R1's gate-ticket rule lives twice
 * (Python `_lane_find_gate_ticket` for `prdt schedule`, JS `findGateTicket` for
 * the viewer home). One fixture, both must pick the same ticket.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'
// @ts-ignore — plain .mjs module
import { findGateTicket } from '../../../viewer/lib/home-graph.mjs'

const PRDT_CLI = path.join(path.resolve(__dirname, '..', '..'), 'scripts', 'prdt')
const GATE = 'docs/artifacts/v0.1/g.md'

type T = { id: string; status: string; deps: string[]; names: boolean }
const FIXTURES: Record<string, T[]> = {
  'longest chain wins over a later mention': [
    { id: 'T-001', status: 'done', deps: [], names: false }, { id: 'T-002', status: 'open', deps: ['T-001'], names: true },
    { id: 'T-003', status: 'open', deps: [], names: true },
  ],
  'tie falls to the higher number': [
    { id: 'T-001', status: 'open', deps: [], names: true }, { id: 'T-002', status: 'open', deps: [], names: true },
  ],
  'a dropped mention is no gate': [
    { id: 'T-001', status: 'open', deps: [], names: true }, { id: 'T-002', status: 'dropped', deps: ['T-001'], names: true },
  ],
  'a dependency cycle does not hang or diverge': [
    { id: 'T-001', status: 'open', deps: ['T-002'], names: true }, { id: 'T-002', status: 'open', deps: ['T-001'], names: true },
  ],
}

for (const [name, tickets] of Object.entries(FIXTURES)) {
  test(`gate ticket parity — ${name}`, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-lanes-parity-'))
    try {
      const proj = path.join(tmp, 'proj'), home = path.join(tmp, 'home')
      fs.mkdirSync(path.join(proj, 'docs', 'prd'), { recursive: true })
      fs.mkdirSync(home, { recursive: true })
      const env = { ...process.env, PRDT_HOME: home, PRDT_LANG: 'en', PRDT_META_BACKUP: '0' }
      const cli = (a: string[]) => execFileSync('python3', [PRDT_CLI, ...a], { cwd: proj, encoding: 'utf8', env, timeout: subprocessTimeout('cli'), stdio: ['ignore', 'pipe', 'pipe'] })
      cli(['init', '--json', '--slug', 'proj', '--yes'])
      fs.rmSync(path.join(proj, 'docs', 'tickets'), { recursive: true, force: true })
      fs.writeFileSync(path.join(proj, 'docs', 'prd', 'PRD.md'), `# PRD\n\n## v0.1 — r\n\n### 합격선\n\n| 항목 | 문언 |\n|:--|:--|\n| **합격선** | **레인 A · \`${GATE}\` 있다** |\n`)
      const dir = path.join(proj, 'docs', 'tickets', 'v0.1')
      fs.mkdirSync(dir, { recursive: true })
      for (const t of tickets) {
        fs.writeFileSync(path.join(dir, `${t.id}.md`), ['---', `id: ${t.id}`, `slug: s-${t.id.toLowerCase()}`, 'type: impl', `status: ${t.status}`, 'assignee: developer',
          ...(t.deps.length ? [`deps: [${t.deps.join(', ')}]`] : []), 'created: 2026-10-15', '---', '', t.names ? `\`${GATE}\`` : 'x', ''].join('\n'))
      }
      let raw: string
      try { raw = cli(['schedule', '--json']) } catch (e: any) { raw = e.stdout } // a cycle exits 1 but still prints the JSON
      const py = JSON.parse(raw).lanes[0].gate_ticket
      const js = findGateTicket(tickets.map((t) => ({ frontmatter: { id: t.id, status: t.status, deps: t.deps }, body: t.names ? `\`${GATE}\`` : 'x' })), GATE)
      expect(py).toBe(js ? js.frontmatter.id : null)
      expect(py).not.toBeNull()
    } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
  })
}
