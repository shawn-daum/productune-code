// T-1274: build an expensive project fixture (a `prdt init` run) ONCE per test file and
// clone it per test. `init` records the project's absolute path in a few text files
// (`.prdt/meta.git/config` worktree + hooksPath), so the clone rewrites the source root
// to the destination root in every file that names it — both the raw and the realpath
// spelling (macOS /var → /private/var).
import fs from 'fs'
import path from 'path'

function spellings(p: string): string[] {
  const real = fs.realpathSync(p)
  return real === p ? [p] : [real, p]
}

function rewrite(dir: string, from: string[], to: string[]): void {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) { rewrite(p, from, to); continue }
    if (!ent.isFile()) continue
    const buf = fs.readFileSync(p)
    if (buf.length > 1 << 20 || buf.includes(0)) continue
    let text = buf.toString('utf8')
    let changed = false
    from.forEach((f, i) => { if (text.includes(f)) { text = text.split(f).join(to[i]); changed = true } })
    if (changed) fs.writeFileSync(p, text)
  }
}

/** Copy the tree at `srcRoot` (already built) to `dstRoot`, repointing absolute paths. */
export function cloneTree(srcRoot: string, dstRoot: string): void {
  fs.mkdirSync(dstRoot, { recursive: true })
  fs.cpSync(srcRoot, dstRoot, { recursive: true, verbatimSymlinks: true })
  const from = spellings(srcRoot)
  const dstSp = spellings(dstRoot)
  // pair spellings by role: [real, raw] ↔ [real, raw]; a single-spelling side repeats
  const to = from.map((_, i) => dstSp[Math.min(i, dstSp.length - 1)])
  rewrite(dstRoot, from, to)
}
