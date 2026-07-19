import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { describe, it, expect } from 'vitest'
import { parseTagLines, listTags } from './git'

describe('parseTagLines (git:listTags)', () => {
  it('returns [] for empty stdout (tag-less repo)', () => {
    expect(parseTagLines('')).toEqual([])
    expect(parseTagLines('\n')).toEqual([])
    expect(parseTagLines('   \n  \n')).toEqual([])
  })

  it('parses name|date lines', () => {
    const out = parseTagLines('v1.0|2026-07-03\nv0.5|2026-06-25\n')
    expect(out).toEqual([
      { name: 'v1.0', date: '2026-07-03' },
      { name: 'v0.5', date: '2026-06-25' },
    ])
  })

  it('sorts by date descending regardless of input order', () => {
    const out = parseTagLines('v0.5|2026-06-25\nv1.0|2026-07-03\nv0.4|2026-06-01\n')
    expect(out.map((t) => t.name)).toEqual(['v1.0', 'v0.5', 'v0.4'])
  })

  it('tolerates trailing CR (\\r\\n) and blank lines', () => {
    const out = parseTagLines('v1.0|2026-07-03\r\n\r\nv0.5|2026-06-25\r\n')
    expect(out).toEqual([
      { name: 'v1.0', date: '2026-07-03' },
      { name: 'v0.5', date: '2026-06-25' },
    ])
  })

  it('keeps a tag with a missing date (no separator) and sorts it last', () => {
    const out = parseTagLines('weird-tag\nv1.0|2026-07-03\n')
    expect(out).toEqual([
      { name: 'v1.0', date: '2026-07-03' },
      { name: 'weird-tag', date: '' },
    ])
  })

  it('does not filter non-version tag names (caller decides the pattern)', () => {
    const out = parseTagLines('release-candidate|2026-07-01\nv1.0|2026-07-03\n')
    expect(out.map((t) => t.name)).toEqual(['v1.0', 'release-candidate'])
  })
})

// ── T-377 QA regression (anchor miss A): tags live on the CODE repo ───────────

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const GIT = which('git')

/** Init a git repo at `dir` with one commit and a `v1.0` tag. */
function initTaggedRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  const run = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  run(['init', '-b', 'main'])
  run(['config', 'user.email', 'g@test'])
  run(['config', 'user.name', 'g'])
  run(['config', 'commit.gpgsign', 'false'])
  fs.writeFileSync(path.join(dir, 'f'), 'x\n')
  run(['add', 'f'])
  run(['commit', '-qm', 'c'])
  run(['tag', 'v1.0'])
}

function seedMeta(root: string, codeDir: string | null): void {
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  const cfg = codeDir ? { slug: 'p', code: { dir: codeDir } } : { slug: 'p' }
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify(cfg))
}

describe.skipIf(!GIT)('listTags — code-repo anchor (T-377)', () => {
  it('SPLIT: code.dir set, tag on code/ repo → listTags(projectRoot) finds it via codeRoot', async () => {
    const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tags-split-')), 'proj')
    fs.mkdirSync(root, { recursive: true })
    seedMeta(root, 'code')
    initTaggedRepo(path.join(root, 'code')) // tag lives on the code repo, NOT projectRoot
    try {
      // Before the fix: git read projectRoot (no `.git`) → catch → [] (empty HistoryPane).
      const tags = await listTags(root)
      expect(tags.map((t) => t.name)).toEqual(['v1.0'])
    } finally {
      fs.rmSync(path.dirname(root), { recursive: true, force: true })
    }
  })

  it('LEGACY: no code.dir, git+tag at projectRoot → listTags unchanged', async () => {
    const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tags-legacy-')), 'proj')
    fs.mkdirSync(root, { recursive: true })
    seedMeta(root, null)
    initTaggedRepo(root) // legacy: code repo IS projectRoot
    try {
      const tags = await listTags(root)
      expect(tags.map((t) => t.name)).toEqual(['v1.0'])
    } finally {
      fs.rmSync(path.dirname(root), { recursive: true, force: true })
    }
  })
})
