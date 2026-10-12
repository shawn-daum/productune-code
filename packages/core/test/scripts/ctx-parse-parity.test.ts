/**
 * T-789 — copies kept on purpose, pinned by parity instead of shared code.
 *
 * 1. The worker's first-prompt `[ctx]` line is read in three hooks, each its
 *    own process: prdt-post-dispatch.sh `ctx_from_prompt` (python),
 *    prdt-worktree-guard.sh `ctx_worktree` (python), prdt-dispatch-gate.sh
 *    (one jq program, two copies — the gate's no-fork budget keeps it in jq),
 *    and scripts/prdt `_ctx_from_prompt` (the schedule record). The same
 *    prompt corpus must select the same line and parse it the same way.
 * 2. post-dispatch `ticket_from_ctx` (+ `ticket_by_slug`) and scripts/prdt
 *    `schedule_ticket_for_ctx` resolve a `[ctx]` to a ticket by the same rule.
 *
 * The functions are lifted out of the hook sources at test time, so a change
 * to any one copy that the others do not follow fails here.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const HOOKS = path.join(CORE_ROOT, 'scripts', 'hooks')
const POST = path.join(HOOKS, 'prdt-post-dispatch.sh')
const GUARD = path.join(HOOKS, 'prdt-worktree-guard.sh')
const GATE = path.join(HOOKS, 'prdt-dispatch-gate.sh')
const PRDT_CLI = path.join(CORE_ROOT, 'scripts', 'prdt')

function has(cmd: string, arg: string): boolean {
  try { execFileSync(cmd, [arg], { stdio: 'ignore' }); return true } catch { return false }
}
const OK = has('python3', '--version') && has('jq', '--version')

/** Runs python with `defs` (top-level functions lifted from hook sources) in scope. */
const LIFT = `
import json, os, re, sys
def lift(src_path, name):
    src = open(src_path, encoding="utf-8").read()
    m = re.search(r"^def %s\\(.*?(?=^\\S)" % re.escape(name), src, re.M | re.S)
    if not m:
        raise SystemExit("not found: " + name + " in " + src_path)
    return m.group(0)
`

function runPy(body: string, args: string[]): unknown {
  const out = execFileSync('python3', ['-I', '-c', LIFT + body, ...args], { encoding: 'utf8' })
  return JSON.parse(out)
}

const CTX = '[ctx] {"slug":"s","worktree":"  /w  ","dispatch_id":"d-1"}'
const CORPUS: Record<string, string> = {
  'no [ctx] line': 'do the thing',
  'opening line': `${CTX}\nbody`,
  'after prose': `hello\n${CTX}`,
  'first of two wins': `${CTX}\n[ctx] {"slug":"other"}`,
  'first malformed, second good → malformed': `[ctx] {"slug":\n${CTX}`,
  'indented → not a [ctx] line': `  ${CTX}`,
  'array, not object → not a [ctx] line': '[ctx] [1]',
  'trailing junk → malformed': `${CTX} trailing`,
  'CRLF line ending': `${CTX}\r\nbody`,
  'worktree absent': '[ctx] {"slug":"s"}',
}

describe.skipIf(!OK)('[ctx] first-prompt parse — three hooks agree', () => {
  test('gate, post-dispatch and worktree-guard select and parse the same line', () => {
    const gateSrc = fs.readFileSync(GATE, 'utf8')
    // The gate's own selector, verbatim — pinned as text, then run as jq.
    const SELECT = 'split("\\n") | map(select(startswith("[ctx] {"))) | first'
    const PARSE = '.[6:] | fromjson | select(type == "object")'
    // Every copy in the gate (the tier-model read and the T-814 qa read), not
    // just one: a drift in either copy alone must fail here.
    const count = (hay: string, needle: string) => hay.split(needle).length - 1
    expect(count(gateSrc, `strings | ${SELECT}`)).toBe(2)
    expect(count(gateSrc, `strings | ${SELECT}\n                    | .[6:] | fromjson | `)).toBe(2)
    expect(gateSrc).toContain(`| ${PARSE}) catch null`)
    for (const [name, prompt] of Object.entries(CORPUS)) {
      const jq = execFileSync('jq', ['-c', `(try (strings | ${SELECT} | ${PARSE}) catch null) // null`],
        { input: JSON.stringify(prompt), encoding: 'utf8' }).trim()
      const gate = JSON.parse(jq)
      const [post, guard, cli] = runPy(`
exec(lift(sys.argv[1], "ctx_from_prompt"))
exec(lift(sys.argv[2], "ctx_worktree"))
exec(lift(sys.argv[4], "_ctx_from_prompt"))
p = sys.argv[3]
print(json.dumps([ctx_from_prompt(p), list(ctx_worktree(p)), _ctx_from_prompt(p)]))
`, [POST, GUARD, prompt, PRDT_CLI]) as [unknown, [boolean, string | null], unknown]
      expect(post, name).toEqual(gate)
      // scripts/prdt's own copy (the schedule record's [ctx] read).
      expect(cli, name).toEqual(gate)
      // ctx_worktree: (found_ctx, worktree) — a malformed line is not found;
      // no line at all is "found, no worktree" (nothing to guard).
      const wt = gate && typeof (gate as { worktree?: unknown }).worktree === 'string'
        ? ((gate as { worktree: string }).worktree.trim() || null) : null
      const lineSeen = prompt.split('\n').some((l) => l.startsWith('[ctx] {'))
      expect(guard, name).toEqual([gate !== null || !lineSeen, wt])
    }
  })
})

describe.skipIf(!OK)('[ctx] → ticket — post-dispatch and scripts/prdt agree', () => {
  test('slug match (open first, then highest id), else a T-NNN token, else none', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t789-parity-'))
    const t = (dir: string, id: string, slug: string, status: string) => {
      fs.mkdirSync(path.join(root, 'docs', 'tickets', dir), { recursive: true })
      fs.writeFileSync(path.join(root, 'docs', 'tickets', dir, `${id}.md`),
        `---\nid: ${id}\nslug: ${slug}\ntype: impl\nstatus: ${status}\nassignee: developer\ncreated: 2026-10-01\n---\n\n## problem\n\nx\n`)
    }
    t('v1.0', 'T-001', 'dup', 'closed')
    t('v1.0', 'T-002', 'dup', 'open')
    t('v1.1', 'T-010', 'dup', 'closed')
    t('v1.1', 'T-011', 'twice', 'closed')
    t('v1.1', 'T-012', 'twice', 'closed')
    t('v1.1', 'T-020', 'solo', 'open')
    const ctxs = [
      { slug: 'dup' }, { slug: 'twice' }, { slug: 'solo', dispatch_id: 'd-T999' },
      { slug: 'nope', dispatch_id: 'd-T123-a' }, { slug: 'nope', goal: 'fix T-45 now' },
      { slug: 'T-77-thing' }, { slug: 'nope' }, { slug: '' }, {},
    ]
    const [hook, cli] = runPy(`
root = sys.argv[3]
TICKET_TOKEN_RE = None
src = open(sys.argv[1], encoding="utf-8").read()
TICKET_TOKEN_RE = re.compile(re.search(r'^TICKET_TOKEN_RE = re\\.compile\\((r".*?")\\)$', src, re.M).group(1)[2:-1])
_SLUG_TICKETS = None
# T-1104: ticket_by_slug walks tickets_homes(root) — lift it and its product seam with it.
_PROD_NAME_RE = re.compile(r"^(?!v[0-9])(?!backlog\\Z)[a-z0-9]+(?:-[a-z0-9]+)*\\Z")
exec(lift(sys.argv[1], "project_products"))
exec(lift(sys.argv[1], "tickets_homes"))
exec(lift(sys.argv[1], "ticket_by_slug"))
exec(lift(sys.argv[1], "ticket_from_ctx"))
import importlib.util, importlib.machinery
loader = importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[2])
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec); loader.exec_module(m)
tickets = m._schedule_tickets(root)
ctxs = json.loads(sys.argv[4])
print(json.dumps([[ticket_from_ctx(c)[1] for c in ctxs],
                  [m.schedule_ticket_for_ctx(c, tickets)[0] for c in ctxs]]))
`, [POST, PRDT_CLI, root, JSON.stringify(ctxs)]) as [unknown[], unknown[]]
    expect(hook).toEqual(['T-002', 'T-012', 'T-020', 'T-123', 'T-45', 'T-77', null, null, null])
    expect(cli).toEqual(hook)
  })
})
