/**
 * vitest-claude-trust-verdict.ts — T-846. The floor for `~/.claude.json`.
 *
 * `real-home-tripwire` excludes `~/.claude.json` from DETECTION (the agent
 * harness rewrites it continuously), so a test writing a trust entry for a temp
 * dir into the real file went unseen. This compares ONLY the set of `projects`
 * keys under the temp roots, before vs after the run: harness churn never
 * matches, a leaked `prdt-init-meta-*` entry does. Values are never read out.
 * Wired as `globalSetup` (main process, real HOME); fails the run through
 * `process.exitCode = 1` like the other verdicts (a throw would exit 0).
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

function roots(): string[] {
  const r = new Set(['/tmp', '/private/tmp', '/var/folders', '/private/var/folders'])
  r.add(os.tmpdir())
  try { r.add(fs.realpathSync(os.tmpdir())) } catch { /* keep the spelled one */ }
  return [...r].map(x => x.replace(/\/+$/, ''))
}

/** Project keys of `claudeJson` that live under a temp root (never throws). */
export function tempTrustKeys(claudeJson: string): Set<string> {
  const out = new Set<string>()
  try {
    const projects = JSON.parse(fs.readFileSync(claudeJson, 'utf-8'))?.projects
    if (!projects || typeof projects !== 'object') return out
    const rs = roots()
    for (const k of Object.keys(projects)) {
      if (!rs.some(r => k === r || k.startsWith(r + '/'))) continue
      // The harness's own per-session scratch dirs (…/claude-<uid>/…) are not ours.
      if (/\/claude-\d+\//.test(k)) continue
      out.add(k)
    }
  } catch { /* missing / corrupt → nothing to compare */ }
  return out
}

export function newTempTrustKeys(before: Set<string>, after: Set<string>): string[] {
  return [...after].filter(k => !before.has(k)).sort()
}

export default function setup(): () => void {
  const file = path.join(os.homedir(), '.claude.json')
  const before = tempTrustKeys(file)
  return function teardown(): void {
    const added = newTempTrustKeys(before, tempTrustKeys(file))
    if (added.length === 0) return
    process.stdout.write(
      `\nT-846: ${added.length} temp-dir trust entr${added.length === 1 ? 'y' : 'ies'} were added to the REAL ~/.claude.json during this run:\n` +
        added.slice(0, 20).map(k => `  + ${k}\n`).join('') +
        'A test ran claude trust against the real HOME instead of a fake one. The run is a\n' +
        'FAILURE even though the tests passed. (verdict at vitest globalSetup teardown)\n',
    )
    process.exitCode = 1
  }
}
