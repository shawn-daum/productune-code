// T-1104 part 2: the viewer's JS port of the CLI docs-layout seam gives the same
// results as the CLI on the same inputs (shared vectors), and — when python3 is
// there — as the live CLI functions.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import * as L from '@productune/viewer/lib/docs-layout.mjs'

const VECTORS = path.resolve(__dirname, '../../../core/test/fixtures/docs-layout-vectors.json')
const PRDT = path.resolve(__dirname, '../../../core/scripts/prdt')
const vec = JSON.parse(fs.readFileSync(VECTORS, 'utf8'))

export function buildTree(spec: any): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-layout-'))
  for (const f of spec.files || []) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true })
    fs.writeFileSync(path.join(root, f), '')
  }
  if (spec.config) {
    fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(root, '.prdt/config.json'), JSON.stringify(spec.config))
  }
  if (spec.poState) {
    fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(root, '.prdt/po-state.json'), JSON.stringify(spec.poState))
  }
  return fs.realpathSync(root)
}

const rootArg = (a: unknown, root: string) => (typeof a === 'string' ? a.replace('@ROOT', root) : a)

function runJs(root: string, c: any): unknown {
  const args = c.args.map((a: unknown) => rootArg(a, root))
  const norm = (p: string) => path.relative(root, p).split(path.sep).join('/')
  switch (c.fn) {
    case 'docsLayerChain':
      return L.docsLayerChain(root, args[0], args[1] ?? null).map(norm)
    default:
      try {
        return (L as any)[c.fn](root, ...args)
      } catch (e: any) {
        if (e && e.name === 'DocsLayoutError') return { error: e.code }
        throw e
      }
  }
}

const PY = `
import sys, json, importlib.machinery, importlib.util
from pathlib import Path
loader = importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[1])
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec); loader.exec_module(m)
root = Path(sys.argv[2]); cases = json.loads(sys.argv[3])
names = {"docsLayout":"docs_layout","projectProducts":"project_products","currentProduct":"current_product",
  "resolveDocsRef":"resolve_docs_ref","resolveDocsLink":"resolve_docs_link","docsAsIsRel":"docs_as_is_rel","docsLayerChain":"docs_layer_chain"}
out = []
for c in cases:
    f = getattr(m, names[c["fn"]]); a = [x.replace("@ROOT", str(root)) if isinstance(x, str) else x for x in c["args"]]
    try:
        r = f(root, *a)
    except m.DocsLayoutError:
        out.append({"error": "no-product"}); continue
    if c["fn"] == "docsLayerChain": r = [Path(p).relative_to(root).as_posix() for p in r]
    out.append(r)
print(json.dumps(out))
`

function runCli(root: string, cases: any[]): unknown[] | null {
  const r = spawnSync('python3', ['-I', '-c', PY, PRDT, root, JSON.stringify(cases)], { encoding: 'utf8' })
  if (r.status !== 0) return null
  return JSON.parse(r.stdout)
}

const byTree: Record<string, any[]> = {}
for (const c of vec.cases) (byTree[c.tree] ||= []).push(c)

describe('docs-layout JS port vs shared vectors', () => {
  for (const [name, cases] of Object.entries(byTree)) {
    const root = buildTree(vec.trees[name])
    it(`tree ${name}: expected values match the port${process.env.DOCS_LAYOUT_VECTORS_WRITE ? ' (regenerating expected from the CLI)' : ''}`, () => {
      if (process.env.DOCS_LAYOUT_VECTORS_WRITE) {
        const cli = runCli(root, cases)
        if (!cli) throw new Error('python3 CLI run failed')
        cases.forEach((c, i) => (c.expected = cli[i]))
        fs.writeFileSync(VECTORS, JSON.stringify(vec, null, 2) + '\n')
      }
      cases.forEach((c) => expect(runJs(root, c), `${c.fn}(${JSON.stringify(c.args)})`).toEqual(c.expected))
    })
    const py = spawnSync('python3', ['--version'])
    it.skipIf(py.status !== 0)(`tree ${name}: the port equals the live CLI functions`, () => {
      const cli = runCli(root, cases)
      expect(cli).not.toBeNull()
      cases.forEach((c, i) => expect(runJs(root, c), `${c.fn}(${JSON.stringify(c.args)})`).toEqual(cli![i]))
    })
  }
})
