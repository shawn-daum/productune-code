/**
 * install-viewer-deps.test.ts — T-871.
 *
 * install.sh §1c installs ONLY the viewer generator's dependencies
 * (`packages/viewer`: marked · subset-font · pretendard) with a filtered,
 * frozen-lockfile, scripts-off pnpm install — never the GUI's (electron) —
 * skips when already up to date, and never fails the install when pnpm
 * fails (offline etc.): `prdt viewer` / `prdt doctor` name what is missing.
 *
 * Runs the REAL install.sh from a throwaway checkout-shaped payload
 * (`<sb>/code/packages/core/{discipline,agents,scripts,doctrine.md}` +
 * `packages/viewer/package.json` + `pnpm-lock.yaml`) with a stub `pnpm` first
 * on PATH that records its argv/cwd — so no case touches the network or the
 * real checkout's node_modules. HOME / PRDT_HOME / CLAUDE_DIR are sandboxed.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawnSync } from 'child_process'
import { test, expect, describe, afterEach, afterAll } from 'vitest'
import { CORE_ROOT } from '../helpers/install-fixture'

function hasJq(): boolean {
  try { execFileSync('jq', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

const FILTERED = 'install --frozen-lockfile --filter @productune/viewer --ignore-scripts --config.fetch-retries=1'

// The stub: logs `<cwd>\t<argv>` per call; STUB_MODE=ok creates the three
// packages the way a real filtered install links them, STUB_MODE=fail prints
// an offline-shaped error and exits 1.
const STUB = `#!/bin/bash
printf '%s\\t%s\\n' "$PWD" "$*" >> "$STUB_LOG"
if [ "$STUB_MODE" = fail ]; then
  echo " WARN  GET https://registry.npmjs.org/marked error (ENOTFOUND). Will retry in 10 seconds. 2 retries left." >&2
  echo " ERR_PNPM_META_FETCH_FAIL  GET https://registry.npmjs.org/marked: request failed, reason: getaddrinfo ENOTFOUND" >&2
  exit 1
fi
nm="$PWD/packages/viewer/node_modules"
mkdir -p "$nm/marked" "$nm/subset-font" "$nm/pretendard/dist/web/static/woff2"
echo '{}' > "$nm/marked/package.json"; echo '{}' > "$nm/subset-font/package.json"
case "$*" in *"--filter ./packages/gui"*)
  mkdir -p "$PWD/packages/gui/node_modules/@productune/viewer"
  echo '{}' > "$PWD/packages/gui/node_modules/@productune/viewer/package.json";;
esac
if [ -n "$STUB_NOLINK" ]; then rm -rf "$PWD/packages/gui/node_modules/@productune"; fi
`

let templateDir: string | undefined
function template(): string {
  if (templateDir === undefined) {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-viewer-tpl-')))
    const core = path.join(dir, 'code', 'packages', 'core')
    fs.mkdirSync(core, { recursive: true })
    for (const entry of ['discipline', 'agents', 'scripts', 'doctrine.md']) {
      execFileSync('cp', ['-R', path.join(CORE_ROOT, entry), path.join(core, entry)])
    }
    templateDir = dir
  }
  return templateDir
}

let roots: string[] = []
afterEach(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); roots = [] })
afterAll(() => { if (templateDir) fs.rmSync(templateDir, { recursive: true, force: true }) })

interface Sb { root: string; code: string; viewer: string; env: NodeJS.ProcessEnv; log: string; prdtHome: string }

function sandbox(opts: { viewerPkg?: boolean } = {}): Sb {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-viewer-')))
  roots.push(root)
  fs.cpSync(template(), root, { recursive: true })
  const code = path.join(root, 'code')
  const viewer = path.join(code, 'packages', 'viewer')
  if (opts.viewerPkg !== false) {
    fs.mkdirSync(viewer, { recursive: true })
    fs.writeFileSync(path.join(viewer, 'package.json'), '{"name":"@productune/viewer","dependencies":{"marked":"16.4.2"}}\n')
  }
  fs.writeFileSync(path.join(code, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n")
  const bin = path.join(root, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'pnpm'), STUB, { mode: 0o755 })
  const home = path.join(root, 'home'); const prdtHome = path.join(root, 'prdt'); const claude = path.join(root, 'claude')
  for (const d of [home, prdtHome, claude]) fs.mkdirSync(d)
  const log = path.join(root, 'pnpm.log')
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: home, PRDT_HOME: prdtHome, CLAUDE_DIR: claude, STUB_LOG: log, STUB_MODE: 'ok' }
  return { root, code, viewer, env, log, prdtHome }
}

function install(sb: Sb, mode: 'ok' | 'fail' = 'ok') {
  const r = spawnSync('bash', [path.join(sb.code, 'packages', 'core', 'scripts', 'install.sh')], {
    env: { ...sb.env, STUB_MODE: mode }, encoding: 'utf8',
  })
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

const calls = (sb: Sb) => (fs.existsSync(sb.log) ? fs.readFileSync(sb.log, 'utf8').trim().split('\n').filter(Boolean) : [])

describe.skipIf(!hasJq())('install.sh §1c — viewer-only dependency install (T-871)', () => {
  test('fresh checkout: one filtered, frozen, scripts-off install at the code root; then up to date → pnpm not run again', () => {
    const sb = sandbox()
    const r1 = install(sb)
    expect(r1.status, r1.out).toBe(0)
    expect(calls(sb)).toEqual([`${sb.code}\t${FILTERED}`])
    expect(r1.out).toContain('Installing viewer dependencies')
    expect(fs.existsSync(path.join(sb.viewer, 'node_modules', '.prdt-deps-stamp'))).toBe(true)

    const r2 = install(sb)
    expect(r2.status, r2.out).toBe(0)
    expect(r2.out).toContain('viewer dependencies already up to date')
    expect(calls(sb)).toHaveLength(1)
  }, 120000)

  test('a changed viewer package.json (or lockfile) re-runs the install', () => {
    const sb = sandbox()
    install(sb)
    fs.writeFileSync(path.join(sb.viewer, 'package.json'), '{"name":"@productune/viewer","dependencies":{"marked":"17.0.0"}}\n')
    install(sb)
    fs.appendFileSync(path.join(sb.code, 'pnpm-lock.yaml'), '# changed\n')
    install(sb)
    expect(calls(sb)).toHaveLength(3)
  }, 120000)

  test('a removed package (stamp still matching) re-runs the install', () => {
    const sb = sandbox()
    install(sb)
    fs.rmSync(path.join(sb.viewer, 'node_modules', 'subset-font'), { recursive: true })
    install(sb)
    expect(calls(sb)).toHaveLength(2)
  }, 120000)

  test('pnpm fails (offline): install still exits 0, names the failure and the retry command, writes no stamp, and finishes its later steps', () => {
    const sb = sandbox()
    const r = install(sb, 'fail')
    expect(r.status, r.out).toBe(0)
    expect(r.out).toContain('viewer dependencies install FAILED')
    expect(r.out).toContain('ERR_PNPM_META_FETCH_FAIL')
    expect(r.out).not.toContain('FAILED ( WARN')
    expect(r.out).toContain(`cd ${sb.code} && pnpm install --frozen-lockfile --filter @productune/viewer --ignore-scripts`)
    expect(fs.existsSync(path.join(sb.viewer, 'node_modules', '.prdt-deps-stamp'))).toBe(false)
    expect(fs.existsSync(path.join(sb.prdtHome, 'prdt.env'))).toBe(true) // §2 still ran
    // next run tries again
    install(sb)
    expect(calls(sb)).toHaveLength(2)
  }, 120000)

  test('no packages/viewer in this checkout: silent, pnpm never run', () => {
    const sb = sandbox({ viewerPkg: false })
    const r = install(sb)
    expect(r.status, r.out).toBe(0)
    expect(r.out).not.toContain('1c)')
    expect(calls(sb)).toEqual([])
  }, 120000)

  test('full checkout (gui/node_modules present, no viewer link): the install also links gui->viewer, and the stamp is written only once that link exists', () => {
    const sb = sandbox()
    const gui = path.join(sb.code, 'packages', 'gui')
    fs.mkdirSync(path.join(gui, 'node_modules'), { recursive: true })
    fs.writeFileSync(path.join(gui, 'package.json'), '{"name":"@productune/gui"}\n')
    const stamp = path.join(sb.viewer, 'node_modules', '.prdt-deps-stamp')
    const link = path.join(gui, 'node_modules', '@productune', 'viewer', 'package.json')

    // link not produced -> no stamp, so the next run retries (heals)
    const bad = spawnSync('bash', [path.join(sb.code, 'packages', 'core', 'scripts', 'install.sh')], {
      env: { ...sb.env, STUB_MODE: 'ok', STUB_NOLINK: '1' }, encoding: 'utf8',
    })
    expect(bad.status).toBe(0)
    expect(fs.existsSync(stamp)).toBe(false)

    const r = install(sb)
    expect(r.status, r.out).toBe(0)
    expect(fs.existsSync(link)).toBe(true)
    expect(fs.existsSync(stamp)).toBe(true)
    expect(calls(sb).at(-1)).toContain('--filter @productune/viewer --filter ./packages/gui')

    // link later lost (stamp matching) -> re-run heals
    fs.rmSync(path.join(gui, 'node_modules', '@productune'), { recursive: true })
    const n = calls(sb).length
    install(sb)
    expect(calls(sb)).toHaveLength(n + 1)
    expect(fs.existsSync(link)).toBe(true)
  }, 120000)

  test('viewer-only checkout (no gui/node_modules): no gui filter, no gui/node_modules created', () => {
    const sb = sandbox()
    fs.mkdirSync(path.join(sb.code, 'packages', 'gui'), { recursive: true })
    fs.writeFileSync(path.join(sb.code, 'packages', 'gui', 'package.json'), '{"name":"@productune/gui"}\n')
    install(sb)
    expect(calls(sb)).toEqual([`${sb.code}\t${FILTERED}`])
    expect(fs.existsSync(path.join(sb.code, 'packages', 'gui', 'node_modules'))).toBe(false)
  }, 120000)
})
