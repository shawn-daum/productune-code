/**
 * core-src-tmp-symlink.test.ts — T-656 slice D3: every packages/core/src write
 * site that slice A moved onto `atomicWriteFileSync` is proven against a
 * symlink planted at its `<target>.tmp` name.
 *
 * One table (`ROWS`, one row per site). Each row runs the site twice through a
 * PUBLIC entry point:
 *   - pre-fix body  → the planted symlink is followed and the victim file is
 *                     clobbered (the attack works — the test can see the bug);
 *   - live body     → the victim is byte-for-byte untouched, the target is a
 *                     regular file, and no `<target>.tmp` is left behind.
 *
 * Pre-fix bodies: `test/fixtures/pre-t656-*.ts`, pinned in 71ef974 and
 * byte-identical to `git show 71ef974^:packages/core/src/<file>` (never HEAD).
 * They keep their original sibling imports (`../state/project-kind`, `./rules`,
 * …), which do not resolve from `test/fixtures/`. So a pre-fix module is loaded
 * from a temp copy of the whole live `src/` tree with exactly that one file
 * replaced by its fixture — every sibling stays live, the depth matches.
 *
 * Non-exported writers are reached through their public callers:
 * `saveSnapshot` → `setSnapshot`, `writeStateAtomic` → `appendPendingPromotion`,
 * `recordCodeDir` → `runPhysicalMigration`. No src export was added for this.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { describe, test, expect, afterAll } from 'vitest'

const SRC = path.resolve(__dirname, '..', 'src')
const FIXTURES = path.resolve(__dirname, 'fixtures')
const VICTIM_BODY = 'VICTIM — must never be overwritten\n'

type Mod = Record<string, any>
interface Ctx { dir: string; home: string }
interface Row {
  site: string
  /** src-relative file the site lives in; its fixture is `pre-t656-<basename>` */
  file: string
  /** absolute path of the file the site writes */
  target: (ctx: Ctx) => string
  /** optional setup that is not the site under test */
  prep?: (ctx: Ctx) => Promise<void> | void
  call: (m: Mod, ctx: Ctx) => Promise<unknown> | unknown
}

const cleanup: string[] = []
afterAll(() => { for (const p of cleanup.splice(0)) fs.rmSync(p, { recursive: true, force: true }) })

function mkTmp(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  cleanup.push(d)
  return d
}

// ── loaders ──────────────────────────────────────────────────────────────────

/** Live body: the real module in src/. */
const loadLive = (file: string): Promise<Mod> => import(path.join(SRC, file))

/** Pre-fix body: a temp copy of src/ with `file` replaced by its pinned fixture. */
async function loadPre(file: string): Promise<Mod> {
  const tree = path.join(mkTmp('t656-pre-src-'), 'src')
  fs.cpSync(SRC, tree, { recursive: true })
  const fixture = path.join(FIXTURES, `pre-t656-${path.basename(file)}`)
  fs.copyFileSync(fixture, path.join(tree, file))
  return import(path.join(tree, file))
}

// ── fixtures for the rows ────────────────────────────────────────────────────

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim()
}

/** A logically split repo (`.git` at root + meta.git) ready for runPhysicalMigration. */
async function makeNormalSplit(root: string): Promise<void> {
  git(['init', '-q', '-b', 'main'], root)
  git(['config', 'user.email', 'c@t'], root)
  git(['config', 'user.name', 'c'], root)
  git(['config', 'commit.gpgsign', 'false'], root)
  fs.mkdirSync(path.join(root, 'packages'), { recursive: true })
  fs.writeFileSync(path.join(root, 'packages', 'app.ts'), 'export const x = 1\n')
  fs.writeFileSync(path.join(root, 'README.md'), '# readme\n')
  git(['add', 'packages/app.ts', 'README.md'], root)
  git(['commit', '-qm', 'code'], root)
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs', 'prd'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'config.json'), JSON.stringify({ slug: 'proj' }))
  fs.writeFileSync(path.join(root, 'docs', 'prd', 'PRD.md'), '# PRD\n')
  const mg = await loadLive('git-workflow/meta-git.ts')
  await mg.initMetaRepo(root)
  await mg.commitMeta(root, 'initial meta snapshot')
}

const prdtProject = (ctx: Ctx) => { fs.mkdirSync(path.join(ctx.dir, '.prdt'), { recursive: true }) }

// ── the table ────────────────────────────────────────────────────────────────

const ROWS: Row[] = [
  {
    site: 'settings/register.ts writeRegisterKey',
    file: 'settings/register.ts',
    target: (c) => path.join(c.dir, '.prdt', 'register'),
    call: (m, c) => m.writeRegisterKey('audience', m.REGISTER_DOMAIN.audience[0], c.dir),
  },
  {
    site: 'settings/ui-settings.ts saveSettings',
    file: 'settings/ui-settings.ts',
    // SETTINGS_PATH is fixed from os.homedir() at import — the per-worker sandbox HOME
    target: (c) => path.join(c.home, '.productune', 'settings.json'),
    call: (m) => m.saveSettings(m.loadSettings()),
  },
  {
    site: 'settings/plan-tier.ts setPlanTier',
    file: 'settings/plan-tier.ts',
    target: (c) => path.join(c.dir, '.prdt', 'plan-tier'),
    call: (m, c) => m.setPlanTier('team-premium', c.dir),
  },
  {
    site: 'git-workflow/meta-git.ts writeMetaAllowlist',
    file: 'git-workflow/meta-git.ts',
    target: (c) => path.join(c.dir, '.prdt', 'config.json'),
    prep: prdtProject,
    call: (m, c) => m.writeMetaAllowlist(c.dir, ['docs/']),
  },
  {
    site: 'git-workflow/rules.ts saveRules',
    file: 'git-workflow/rules.ts',
    target: (c) => path.join(c.dir, '.prdt', 'git-rules.json'),
    prep: prdtProject,
    call: (m, c) => m.saveRules(c.dir, m.loadRules(c.dir)),
  },
  {
    site: 'git-workflow/rules.ts getDefault (first-run create)',
    file: 'git-workflow/rules.ts',
    // GLOBAL_DEFAULT_PATH is fixed from os.homedir() at import
    target: (c) => path.join(c.home, '.productune', 'git-rules.default.json'),
    call: (m) => m.getDefault(),
  },
  {
    site: 'git-workflow/meta-migrate.ts recordCodeDir (via runPhysicalMigration)',
    file: 'git-workflow/meta-migrate.ts',
    target: (c) => path.join(c.dir, '.prdt', 'config.json'),
    prep: (c) => makeNormalSplit(c.dir),
    call: async (m, c) => {
      const res = await m.runPhysicalMigration(c.dir)
      expect(res.ok, JSON.stringify(res)).toBe(true)
    },
  },
  {
    site: 'git-workflow/autosave.ts saveSnapshot (via setSnapshot)',
    file: 'git-workflow/autosave.ts',
    target: (c) => path.join(c.home, '.productune', 'state', 'autosave-snapshots',
      `${crypto.createHash('sha1').update(c.dir).digest('hex')}.json`),
    call: (m, c) => m.setSnapshot(c.dir, 'T-1',
      { status: 'open', qa_status: null, qa_loops: null, lastCheckedAt: '2026-09-23T00:00:00Z' }),
  },
  {
    site: 'state/pending-promotions.ts writeStateAtomic (via appendPendingPromotion)',
    file: 'state/pending-promotions.ts',
    target: (c) => path.join(c.dir, '.prdt', 'po-state.json'),
    prep: prdtProject,
    call: (m, c) => m.appendPendingPromotion(c.dir, {
      persona: 'developer', turn_id: 't1', scope: 'project', kind: 'habit',
      target: 'docs/x.md', delta: 'd', rationale: 'r',
    }),
  },
]

/** Plant `<target>.tmp` → victim, run the site, report what happened. */
async function attack(row: Row, load: (f: string) => Promise<Mod>) {
  const dir = mkTmp('t656-site-')
  const ctx: Ctx = { dir, home: os.homedir() }
  await row.prep?.(ctx)
  const target = row.target(ctx)
  // home-anchored targets are shared by the pre and live runs — start clean
  fs.rmSync(target, { force: true })
  fs.rmSync(target + '.tmp', { force: true })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const victim = path.join(mkTmp('t656-victim-'), 'victim.txt')
  fs.writeFileSync(victim, VICTIM_BODY)
  fs.symlinkSync(victim, target + '.tmp')

  const m = await load(row.file)
  await row.call(m, ctx)

  const out = {
    victim: fs.readFileSync(victim, 'utf-8'),
    targetIsFile: fs.lstatSync(target).isFile(),
    tmpLeft: fs.existsSync(target + '.tmp') || isLink(target + '.tmp'),
  }
  if (target.startsWith(ctx.home)) { fs.rmSync(target, { force: true }); fs.rmSync(target + '.tmp', { force: true }) }
  return out
}

function isLink(p: string): boolean {
  try { return fs.lstatSync(p).isSymbolicLink() } catch { return false }
}

describe('T-656 core/src write sites vs a symlink planted at <target>.tmp', () => {
  describe.each(ROWS)('$site', (row) => {
    test('pre-fix body follows the symlink and clobbers the victim', async () => {
      const r = await attack(row, loadPre)
      expect(r.victim, 'attack did not land on the pre-fix body').not.toBe(VICTIM_BODY)
    })

    test('live body leaves the victim untouched and writes a regular file', async () => {
      const r = await attack(row, loadLive)
      expect(r.victim, 'victim was overwritten by the live body').toBe(VICTIM_BODY)
      expect(r.targetIsFile).toBe(true)
      expect(r.tmpLeft).toBe(false)
    })
  })

  test('the table names every atomicWriteFileSync call site in src/', () => {
    const calls: string[] = []
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (p.endsWith('.ts') && !p.endsWith(path.join('fs', 'atomic-write.ts'))) {
          for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
            if (/^\s*atomicWriteFileSync\(/.test(line)) calls.push(path.relative(SRC, p))
          }
        }
      }
    }
    walk(SRC)
    expect(calls.sort()).toEqual(ROWS.map((r) => r.file).sort())
  })
})
