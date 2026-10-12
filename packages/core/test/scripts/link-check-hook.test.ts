/**
 * prdt-link-check.sh — the PO's unlinked-first-mention check at Stop (T-899,
 * need and wording T-898 = A; wording approved by the user 2026-10-01;
 * WORDING reworded T-1072, decision T-1073 = A, 2026-10-11: the `[링크]` follow-up shape).
 *
 * FIXTURES are the PO's real replies of 2026-10-06 (test/fixtures/question-check/,
 * shared with the question-check tests). Unlinked cases run them as sent; linked
 * cases rewrite each id's first prose mention into the real `prdt tickets --link`
 * shape `[T-NNN](file://…/.prdt/scratch/viewer/at/T-NNN.html)`.
 */

import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe, afterEach } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-link-check.sh')
const MANIFEST = path.join(CORE_ROOT, 'scripts', 'hook-manifest.json')
const FIXTURES = path.join(CORE_ROOT, 'test', 'fixtures', 'question-check')
const fx = (name: string) => fs.readFileSync(path.join(FIXTURES, `${name}.md`), 'utf8')

const roots: string[] = []
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop() as string, { recursive: true, force: true })
})

const wording = (ids: string[]) =>
  `[prdt link check] unlinked first mention: ${ids.join(', ')}. Post now, in this turn, only a \`[링크]\` line, then \`prdt tickets --link ${ids.join(' ')}\` output, one id per line; no sentence.`
const link = (id: string) => `[${id}](file:///Users/x/proj/.prdt/scratch/viewer/at/${id}.html)`

function makeProject(ids: string[], opts: { prdt?: boolean } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t899-')))
  roots.push(root)
  const proj = path.join(root, 'proj')
  fs.mkdirSync(path.join(proj, 'docs', 'tickets', 'v1.13'), { recursive: true })
  if (opts.prdt !== false) {
    fs.mkdirSync(path.join(proj, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(proj, '.prdt', 'po-state.json'), '{}')
  }
  for (const id of ids) fs.writeFileSync(path.join(proj, 'docs', 'tickets', 'v1.13', `${id}.md`), `---\nid: ${id}\n---\n`)
  return { root, proj }
}

// spawned hook runs in a sandbox HOME + PRDT_HOME (never the real machine's)
function run(event: Record<string, unknown>, root: string): string {
  const env = { ...process.env, HOME: path.join(root, 'home'), PRDT_HOME: path.join(root, 'prdt-home') }
  return execFileSync('bash', [HOOK], { input: JSON.stringify(event), encoding: 'utf8', timeout: 20_000, env })
}

function stop(ids: string[], reply: string, extra: Record<string, unknown> = {}, opts: { prdt?: boolean } = {}) {
  const { root, proj } = makeProject(ids, opts)
  return run({
    session_id: 's', hook_event_name: 'Stop', agent_type: 'prdt-po', stop_hook_active: false,
    cwd: proj, last_assistant_message: reply, ...extra,
  }, root)
}
const blocked = (out: string) => {
  const j = JSON.parse(out)
  expect(j.decision).toBeUndefined()
  expect(j.hookSpecificOutput.hookEventName).toBe('Stop')
  return j.hookSpecificOutput.additionalContext as string
}

describe('unlinked first mention → blocked once, verbatim wording', () => {
  const cases: Array<[string, string[], string[]]> = [
    ['flagged-statusline-two-rows', ['T-975'], ['T-975']],
    ['flagged-t949-canon', ['T-949'], ['T-949']],
    ['flagged-t949-waiting-item', ['T-949', 'T-960', 'T-975'], ['T-975', 'T-949', 'T-960']],
    ['report-only', ['T-709', 'T-712', 'T-961', 'T-962', 'T-984', 'T-988'], ['T-988', 'T-984', 'T-961']], // T-709/712/962 only in code
    ['compliant-t982-options', ['T-949', 'T-961', 'T-982', 'T-960', 'T-984'], ['T-961', 'T-949']], // T-982 linked, T-960/T-984 in code
  ]
  for (const [name, store, ids] of cases) {
    test(`${name} → ${ids.join(' ')}`, () => {
      expect(blocked(stop(store, fx(name)))).toBe(wording(ids))
    })
  }
})

describe('every first mention linked → passes untouched', () => {
  // The real replies, each prose first mention rewritten into the link shape.
  for (const name of ['flagged-statusline-two-rows', 'flagged-t949-waiting-item', 'report-only', 'compliant-t984-options']) {
    test(`${name} linked`, () => {
      const store = [...new Set(fx(name).match(/T-\d+/g) ?? [])]
      let text = fx(name)
      const out = stop(store, text)
      const ids = out ? blocked(out).match(/first mention: ([^.]*)\./)![1].split(', ') : []
      for (const id of ids) {
        let fenced = false
        text = text.split('\n').map(ln => {
          if (/^\s*```/.test(ln)) { fenced = !fenced; return ln }
          return fenced ? ln : ln.replace(new RegExp(`(?<![\\w\`/\\[-])${id}(?![\\d\\]])`), link(id))
        }).join('\n')
      }
      expect(stop(store, text)).toBe('')
    })
  }
  test('compliant-t984-options passes as the PO sent it', () => {
    expect(stop(['T-984', 'T-960', 'T-961'], fx('compliant-t984-options'))).toBe('')
  })
})

describe('first mention only, code and paths ignored', () => {
  test('a later repeat needs no link', () => {
    expect(stop(['T-5'], `${link('T-5')} 닫았어요. T-5 는 다음 차례예요.`)).toBe('')
  })
  test('an unlinked first mention followed by a linked repeat is still blocked', () => {
    expect(blocked(stop(['T-5'], `T-5 를 닫았어요. ${link('T-5')}`))).toBe(wording(['T-5']))
  })
  test('code spans and fences are ignored', () => {
    expect(stop(['T-5', 'T-6'], '`T-5` 와\n\n```\nT-6 done\n```\n')).toBe('')
  })
  test('paths, destinations and longer tokens are not mentions', () => {
    expect(stop(['T-5', 'T-6'], 'docs/tickets/v1.13/T-5.md 와 xT-6, T-6-slug 요')).toBe('')
  })
  test('an id with no ticket file is prose', () => {
    expect(stop(['T-5'], 'T-99 는 없어요')).toBe('')
  })
  test('legacy T-PATCH-NNN counts', () => {
    expect(blocked(stop(['T-PATCH-117'], 'T-PATCH-117 을 봤어요'))).toBe(wording(['T-PATCH-117']))
  })
  test('a link around the id plus text counts as linked', () => {
    expect(stop(['T-5'], '[T-5 링크 확인](file:///x/.prdt/scratch/viewer/at/T-5.html)')).toBe('')
  })
})

describe('slash-joined ids and id-plus-suffix tokens', () => {
  test('T-976/T-977 머지 → both ids', () => {
    expect(blocked(stop(['T-976', 'T-977'], 'T-976/T-977 머지'))).toBe(wording(['T-976', 'T-977']))
  })
  test('T-1006/T-1007 and T-980/T-991 작업', () => {
    expect(blocked(stop(['T-1006', 'T-1007', 'T-980', 'T-991'], 'T-1006/T-1007\nT-980/T-991 작업'))).toBe(wording(['T-1006', 'T-1007', 'T-980', 'T-991']))
  })
  test('first-mention rule applies per id: a linked pair passes, an unlinked pair blocks', () => {
    expect(blocked(stop(['T-5', 'T-6'], 'T-5/T-6'))).toBe(wording(['T-5', 'T-6']))
    expect(stop(['T-5', 'T-6'], `${link('T-5')}/${link('T-6')}`)).toBe('')
  })
  test('paths stay excluded', () => {
    expect(stop(['T-899', 'T-1', 'T-6'], 'tracks/T-899 docs/tickets/v1.13/T-899.md a/T-1/b T-6/foo')).toBe('')
  })
  test('T-899-2 and T-899-후속 are not T-899', () => {
    expect(stop(['T-899'], 'T-899-2 와 T-899-후속')).toBe('')
  })
})

describe('one retry, PO only, fails open', () => {
  test('stop_hook_active → silent (never blocks twice)', () => {
    expect(stop(['T-5'], 'T-5 를 봤어요', { stop_hook_active: true })).toBe('')
  })
  test('a worker Stop → silent', () => {
    expect(stop(['T-5'], 'T-5 를 봤어요', { agent_type: 'prdt-developer' })).toBe('')
  })
  test('a plain session (no agent_type) → silent', () => {
    expect(stop(['T-5'], 'T-5 를 봤어요', { agent_type: undefined })).toBe('')
  })
  test('no prdt project on the cwd chain → silent', () => {
    expect(stop(['T-5'], 'T-5 를 봤어요', {}, { prdt: false })).toBe('')
  })
  test('malformed event → silent', () => {
    const { root } = makeProject([])
    expect(run({ x: 1 } as any, root)).toBe('')
    const env = { ...process.env, HOME: path.join(root, 'h'), PRDT_HOME: path.join(root, 'p') }
    expect(execFileSync('bash', [HOOK], { input: '"prdt-po" {not json', encoding: 'utf8', env })).toBe('')
  })
})

describe('roster', () => {
  test('manifest: its own matcher-less Stop entry, after question-check, before user-prompt', () => {
    const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    expect(m.basenames).toContain('prdt-link-check.sh')
    const stops = m.registrations.filter((r: any) => r.event === 'Stop')
    expect(stops.map((r: any) => r.hooks)).toEqual([['prdt-question-check.sh'], ['prdt-link-check.sh'], ['prdt-user-prompt.sh']])
    expect(stops.every((r: any) => r.matcher === undefined)).toBe(true)
  })
  test('the hook file is executable', () => {
    fs.accessSync(HOOK, fs.constants.X_OK)
  })
})
