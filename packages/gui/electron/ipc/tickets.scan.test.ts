/**
 * tickets:scan version resolution — C1 (T-316).
 *
 * A prdt ticket carries no `version` frontmatter key; its version comes from the
 * directory it sits in (`docs/tickets/<version>/`). Before C1 the scan resolved
 * every non-backlog version-less dir to `null`, so a prdt project's auto-opened
 * version-filtered board (TicketDashboardView filters `t.version === versionFilter`,
 * with versionFilter = po-state's flat `version` e.g. `v1.1`) rendered an empty
 * board. C1: for a prdt project the directory name IS the version.
 *
 * Legacy (`.productune`) projects MUST keep the old `null` fallback for non-backlog
 * version-less dirs. `backlog/` stays a literal `backlog` label in both modes, and
 * an explicit `version:` frontmatter value always wins.
 *
 * Builds throwaway project dirs under os.tmpdir mkdtemp; electron imports are
 * stubbed by vitest.setup.ts. Case-list + vitest-driver idiom (project-paths.test.ts).
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { scanTickets } from './tickets'

interface Case {
  readonly label: string
  readonly run: () => { ok: boolean; detail?: string }
}

/**
 * Temp project dir of the given kind (`.prdt` or `.productune` marker), seeded with
 * ticket files keyed by `<versionDir>/<file>` → file content.
 */
function makeProject(marker: '.prdt' | '.productune', tickets: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-scan-'))
  fs.mkdirSync(path.join(root, marker), { recursive: true })
  for (const [rel, content] of Object.entries(tickets)) {
    const abs = path.join(root, 'docs', 'tickets', rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf-8')
  }
  return root
}

const ok = { ok: true } as const
const fail = (detail: string) => ({ ok: false, detail })

/** Find a scanned ticket's resolved version by ticket_id. */
function versionOf(dir: string, ticketId: string): string | null | undefined {
  const t = scanTickets(dir).find((x) => x.ticket_id === ticketId)
  return t ? t.version : undefined
}

const VERSIONLESS = `---
id: T-316
slug: sample
type: impl
status: open
---
# T-316: sample
`

const WITH_VERSION = `---
id: T-900
version: v2.0
status: open
---
# T-900
`

export const SCAN_CASES: readonly Case[] = [
  {
    label: 'prdt: version-less ticket under v1.1/ → version resolves to "v1.1"',
    run: () => {
      const d = makeProject('.prdt', { 'v1.1/T-316.md': VERSIONLESS })
      const v = versionOf(d, 'T-316')
      return v === 'v1.1' ? ok : fail(`expected "v1.1", got ${JSON.stringify(v)}`)
    },
  },
  {
    label: 'legacy: version-less ticket under v1.1/ → version stays null (unchanged)',
    run: () => {
      const d = makeProject('.productune', { 'v1.1/T-316.md': VERSIONLESS })
      const v = versionOf(d, 'T-316')
      return v === null ? ok : fail(`expected null, got ${JSON.stringify(v)}`)
    },
  },
  {
    label: 'prdt: backlog/ ticket → literal "backlog" (not the dir-name rule)',
    run: () => {
      const d = makeProject('.prdt', { 'backlog/T-316.md': VERSIONLESS })
      const v = versionOf(d, 'T-316')
      return v === 'backlog' ? ok : fail(`expected "backlog", got ${JSON.stringify(v)}`)
    },
  },
  {
    label: 'legacy: backlog/ ticket → literal "backlog" (unchanged)',
    run: () => {
      const d = makeProject('.productune', { 'backlog/T-316.md': VERSIONLESS })
      const v = versionOf(d, 'T-316')
      return v === 'backlog' ? ok : fail(`expected "backlog", got ${JSON.stringify(v)}`)
    },
  },
  {
    label: 'prdt: explicit version: frontmatter still wins over the dir name',
    run: () => {
      const d = makeProject('.prdt', { 'v1.1/T-900.md': WITH_VERSION })
      const v = versionOf(d, 'T-900')
      return v === 'v2.0' ? ok : fail(`expected "v2.0", got ${JSON.stringify(v)}`)
    },
  },
  {
    label: 'legacy: explicit version: frontmatter still wins (unchanged)',
    run: () => {
      const d = makeProject('.productune', { 'v1.1/T-900.md': WITH_VERSION })
      const v = versionOf(d, 'T-900')
      return v === 'v2.0' ? ok : fail(`expected "v2.0", got ${JSON.stringify(v)}`)
    },
  },
]

export function runScanCases(): { passed: number; failures: string[] } {
  const failures: string[] = []
  for (const c of SCAN_CASES) {
    let res: { ok: boolean; detail?: string }
    try {
      res = c.run()
    } catch (e) {
      res = { ok: false, detail: String(e) }
    }
    if (!res.ok) failures.push(`${c.label}${res.detail ? `: ${res.detail}` : ''}`)
  }
  return { passed: SCAN_CASES.length - failures.length, failures }
}

// ── vitest driver ─────────────────────────────────────────────────────────────

import { test, expect } from 'vitest'

test('tickets:scan version resolution: all C1 cases pass', () => {
  const { passed, failures } = runScanCases()
  if (failures.length > 0) {
    throw new Error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`)
  }
  expect(passed).toBe(SCAN_CASES.length)
})
