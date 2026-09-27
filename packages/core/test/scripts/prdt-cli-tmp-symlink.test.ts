/**
 * T-656 slice D1 — symlink-attack regression for the 11 CLI write sites that
 * slice B (054fe17) moved onto `atomic_write_text`.
 *
 * The attack: each site wrote a FIXED `<target>.tmp` name and opened it
 * following links. A clone (or any other writer) that plants `<target>.tmp` as
 * a symlink to a file this uid owns gets that file truncated with the call's
 * payload. Each row plants that symlink pointing at a victim file, calls the
 * site's function once, and checks the victim:
 *   pre-fix  — the pinned body (test/fixtures/pre-t656-prdt-cli.py, taken ONCE
 *              from `git show 71ef974:packages/core/scripts/prdt`, never HEAD)
 *              MUST clobber the victim. A row where it does not is a row that
 *              does not reach the site, and it fails.
 *   live     — scripts/prdt MUST leave the victim byte-identical AND must have
 *              written the target (so "untouched" is never a site that simply
 *              did not run).
 *
 * Mechanism: scripts/prdt has a `__main__` guard, so it loads as a module via
 * SourceFileLoader (precedent: prdt-update-nudge-direction.test.ts `py()`), and
 * each row calls the one function that holds the site. Preconditions the site
 * does not own (git state, the register resolver, lume) are stubbed by
 * replacing a module attribute; the write itself always runs unmodified.
 * Functions are addressed by name, never by line.
 */

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const PKG = path.resolve(__dirname, '..', '..')
const LIVE = path.join(PKG, 'scripts', 'prdt')
const PRE_FIX = path.join(PKG, 'test', 'fixtures', 'pre-t656-prdt-cli.py')
const VICTIM_BODY = 'VICTIM — must survive\n'

interface Row {
  /** scripts/prdt function holding the site (slice B list) */
  site: string
  /** the file the site replaces, relative to the work dir */
  target: string
  /** every `.tmp` name the site may use (pre-fix and live differ for the canary latch) */
  tmps: string[]
  /** files to lay down before the call */
  prep?: Record<string, string>
  /** Python statements; `m` = the loaded module, `W` = Path(work dir) */
  call: string
}

const PROJ_CFG = { 'proj/.prdt/config.json': '{"slug": "proj"}\n' }

const ROWS: Row[] = [
  {
    site: 'set_trust_accepted',
    target: 'home/.claude.json',
    tmps: ['home/.claude.json.tmp'],
    prep: { 'proj/.keep': '' },
    call: `m.set_trust_accepted(str(W / "proj"))`,
  },
  {
    site: 'cmd_attest',
    target: 'proj/.prdt/config.json',
    tmps: ['proj/.prdt/config.json.tmp'],
    prep: { ...PROJ_CFG, 'proj/hook': '#!/bin/sh\nexit 0\n' },
    call: `
hook = W / "proj" / "hook"
os.chmod(hook, 0o755)
m.require_root = lambda: W / "proj"
m.prepush_status = lambda root: {"state": "unverified", "path": hook, "executable": True,
                                 "hooks_path": None, "current": False, "mentions": False}
m.cmd_attest(types.SimpleNamespace(reason="read the hook body", blocks_main="yes", hotfix_escape="yes"))`,
  },
  {
    site: 'ensure_prepush_hook',
    target: 'proj/hooks/pre-push',
    tmps: ['proj/hooks/pre-push.tmp'],
    call: `
m.prepush_status = lambda root: {"state": "missing", "path": W / "proj" / "hooks" / "pre-push",
                                 "hooks_path": None, "current": False, "mentions": False,
                                 "executable": False}
r = m.ensure_prepush_hook(W / "proj")
assert r["action"] == "installed", r`,
  },
  {
    site: 'init_project',
    target: 'proj/.prdt/config.json',
    tmps: ['proj/.prdt/config.json.tmp'],
    call: `
m.init_meta_split = lambda root: "stubbed"
m.ensure_prepush_hook = lambda root: {"action": "skipped", "detail": "stubbed"}
m.init_project(W / "proj", slug="proj", interactive=False)`,
  },
  {
    site: 'cmd_register',
    target: 'prdt-home/register',
    tmps: ['prdt-home/register.tmp'],
    call: `
dom = {"file": str(W / "prdt-home" / "register"),
       "keys": [{"key": "form", "kind": "enum", "domain": ["a", "b"], "default": "a"}]}
m.register_query = lambda mode, droot=None: dom
m.cmd_register(types.SimpleNamespace(list=False, json=False, action="set", rest=["form", "b"]))`,
  },
  {
    site: '_write_update_state',
    target: 'home/.prdt/update-state.json',
    tmps: ['home/.prdt/update-state.json.tmp'],
    call: `m._write_update_state({"probe": 1})`,
  },
  {
    site: 'write_artifact_manifest',
    target: 'proj/docs/artifacts/manifest.json',
    tmps: ['proj/docs/artifacts/manifest.json.tmp'],
    call: `assert m.write_artifact_manifest(W / "proj", {"entries": []}) is True`,
  },
  {
    site: 'features_vocab_seed',
    target: 'proj/.prdt/config.json',
    tmps: ['proj/.prdt/config.json.tmp'],
    prep: PROJ_CFG,
    call: `m.features_vocab_seed(W / "proj")`,
  },
  {
    site: 'cmd_resource',
    target: 'prdt-home/run/resources/vm1/d1.json',
    tmps: ['prdt-home/run/resources/vm1/d1.json.tmp'],
    call: `m.cmd_resource(types.SimpleNamespace(action="up", rest=["vm1"], dispatch="d1", json=False))`,
  },
  {
    site: '_lume_resident_resources',
    target: 'prdt-home/run/resident-vm-since.json',
    tmps: ['prdt-home/run/resident-vm-since.json.tmp'],
    call: `
m._lume_running_vm_names = lambda: ["vm1"]
m._lume_resident_resources(datetime.now(timezone.utc))`,
  },
  {
    site: 'write_canary_latch',
    target: 'prdt-home/run/preflight/nosession.sonnet.json',
    // pre-fix used p.with_suffix(".tmp"); the helper uses <name>.tmp — plant both
    tmps: ['prdt-home/run/preflight/nosession.sonnet.tmp', 'prdt-home/run/preflight/nosession.sonnet.json.tmp'],
    call: `m.write_canary_latch("sonnet", "probe")`,
  },
]

const DRIVER = `
import importlib.util, importlib.machinery, os, sys, types
from datetime import datetime, timezone
from pathlib import Path
loader = importlib.machinery.SourceFileLoader("prdt_mod", sys.argv[1])
spec = importlib.util.spec_from_loader("prdt_mod", loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
W = Path(sys.argv[2])
exec(sys.argv[3])
`

function dedent(s: string): string {
  return s.replace(/^\n/, '')
}

let W: string
beforeEach(() => { W = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t656-cli-'))) })
afterEach(() => { fs.rmSync(W, { recursive: true, force: true }) })

function runRow(row: Row, cli: string): { victim: string } {
  const victim = path.join(W, 'victim.txt')
  fs.writeFileSync(victim, VICTIM_BODY)
  for (const [rel, body] of Object.entries(row.prep ?? {})) {
    fs.mkdirSync(path.dirname(path.join(W, rel)), { recursive: true })
    fs.writeFileSync(path.join(W, rel), body)
  }
  for (const rel of row.tmps) {
    fs.mkdirSync(path.dirname(path.join(W, rel)), { recursive: true })
    fs.symlinkSync(victim, path.join(W, rel))
  }
  fs.mkdirSync(path.join(W, 'home'), { recursive: true })
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: path.join(W, 'home'), PRDT_HOME: path.join(W, 'prdt-home') }
  delete env.CLAUDE_CODE_SESSION_ID
  execFileSync('python3', ['-c', DRIVER, cli, W, dedent(row.call)], {
    cwd: W, env, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: subprocessTimeout('cli'),
  })
  return { victim: fs.readFileSync(victim, 'utf-8') }
}

describe('T-656 CLI write sites — a planted <target>.tmp symlink', () => {
  it('the table covers all 11 slice-B sites', () => {
    expect(ROWS).toHaveLength(11)
    for (const r of ROWS) {
      expect(fs.readFileSync(LIVE, 'utf-8')).toMatch(new RegExp(`^def ${r.site}\\(`, 'm'))
    }
  })

  describe.each(ROWS)('$site', (row) => {
    it('pre-fix (71ef974) follows it and clobbers the victim', () => {
      const { victim } = runRow(row, PRE_FIX)
      expect(victim).not.toBe(VICTIM_BODY)
    })

    it('live leaves the victim untouched and still writes the target', () => {
      const { victim } = runRow(row, LIVE)
      expect(victim).toBe(VICTIM_BODY)
      const target = path.join(W, row.target)
      expect(fs.lstatSync(target).isSymbolicLink()).toBe(false)
      expect(fs.statSync(target).isFile()).toBe(true)
      // the helper's own temp name: the planted link was removed, not followed
      expect(() => fs.lstatSync(`${target}.tmp`)).toThrow()
    })
  })
})
