/**
 * T-983 — the viewer is built on install and update without anyone asking.
 *
 * `prdt viewer --ensure` installs the generator's dependencies when missing
 * (the filtered install install.sh §1c runs) and builds viewer.html when
 * absent; silent when both are in place; one failure line (exit 1) when the
 * install fails, so the NEXT PO session start — which runs the same command —
 * tries again. The PO SessionStart hook runs it detached; a worker's
 * SubagentStart never does.
 *
 * Same fake-checkout shape as viewer-missing-deps.test.ts: a COPY of
 * scripts/prdt in `<sb>/code/packages/core/scripts/`, a stub generator, and a
 * stub `pnpm` first on PATH that records argv and (STUB_MODE=ok) links the
 * dependencies the way a real filtered install does. No network.
 */
import path from 'path'
import { copyPrdtCli } from '../helpers/copy-prdt'
import fs from 'fs'
import os from 'os'
import { execFileSync, spawn, spawnSync } from 'child_process'
import { test, expect, describe, beforeEach, afterEach } from 'vitest'
import { subprocessTimeout } from '../helpers/subprocess-timeout'

const CORE_ROOT = path.resolve(__dirname, '..', '..')
const REAL_PRDT = path.join(CORE_ROOT, 'scripts', 'prdt')
const HOOK = path.join(CORE_ROOT, 'scripts', 'hooks', 'prdt-session-start.sh')

function which(bin: string): string | null {
  try { return execFileSync('which', [bin], { encoding: 'utf8' }).trim() || null } catch { return null }
}
const PYTHON3 = which('python3')
const NODE = which('node')
const JQ = which('jq')

const OK_CLI = `import fs from 'node:fs'
import path from 'node:path'
const a = process.argv
const out = a[a.indexOf('--out') + 1]
if (a.includes('--emit')) {
  process.stdout.write(JSON.stringify({ files: [{ name: path.basename(out), content: '<!doctype html>' }], at: [], prune: null }))
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, '<!doctype html>')
}
`
const STUB_PNPM = `#!/bin/bash
printf '%s\\t%s\\n' "$PWD" "$*" >> "$STUB_LOG"
if [ "$STUB_MODE" = fail ]; then
  echo " ERR_PNPM_META_FETCH_FAIL  GET https://registry.npmjs.org/marked: request failed, reason: getaddrinfo ENOTFOUND" >&2
  exit 1
fi
if [ "$STUB_MODE" = slow ]; then echo $$ > "$STUB_LOG.pid"; sleep 4; fi
nm="$PWD/packages/viewer/node_modules"
mkdir -p "$nm/marked" "$nm/subset-font" "$nm/mermaid" "$nm/pretendard/dist/web/static/woff2"
echo '{}' > "$nm/marked/package.json"; echo '{}' > "$nm/subset-font/package.json"; echo '{}' > "$nm/mermaid/package.json"
`

let sb: string, home: string, root: string, code: string, prdt: string, log: string, binDir: string

function fakeCheckout(withDeps: boolean, omitPkg: string[] = []) {
  code = path.join(sb, 'code')
  const scripts = path.join(code, 'packages', 'core', 'scripts')
  const viewer = path.join(code, 'packages', 'viewer')
  fs.mkdirSync(scripts, { recursive: true })
  prdt = path.join(scripts, 'prdt')
  copyPrdtCli(REAL_PRDT, prdt)
  fs.chmodSync(prdt, 0o755)
  fs.mkdirSync(viewer, { recursive: true })
  fs.writeFileSync(path.join(viewer, 'cli.mjs'), OK_CLI)
  fs.mkdirSync(path.join(code, 'packages', 'gui', 'src', 'styles'), { recursive: true })
  fs.writeFileSync(path.join(code, 'packages', 'gui', 'src', 'styles', 'tokens.css'), ':root{}')
  if (withDeps) {
    for (const pkg of ['marked', 'subset-font', 'mermaid'].filter((x) => !omitPkg.includes(x))) {
      fs.mkdirSync(path.join(viewer, 'node_modules', pkg), { recursive: true })
      fs.writeFileSync(path.join(viewer, 'node_modules', pkg, 'package.json'), '{}')
    }
    fs.mkdirSync(path.join(viewer, 'node_modules', 'pretendard', 'dist', 'web', 'static', 'woff2'), { recursive: true })
  }
}

function pnpmCalls(): string[] {
  try { return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) } catch { return [] }
}
const page = () => path.join(root, '.prdt', 'scratch', 'viewer', 'viewer.html')

function env(mode: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, HOME: path.join(sb, 'sandbox-home'), PRDT_HOME: home, PRDT_BIN: prdt, STUB_LOG: log, STUB_MODE: mode,
           PATH: `${binDir}${path.delimiter}${process.env.PATH}`, ...extra }
}
function ensure(mode: string, args: string[] = []) {
  const r = spawnSync(PYTHON3 as string, [prdt, 'viewer', '--ensure', ...args], {
    cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'), env: env(mode),
  })
  return { code: r.status, out: r.stdout, err: r.stderr }
}

beforeEach(() => {
  sb = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-t983-')))
  home = path.join(sb, 'home')
  fs.mkdirSync(home, { recursive: true })
  root = path.join(sb, 'proj')
  fs.mkdirSync(path.join(root, '.prdt'), { recursive: true })
  fs.writeFileSync(path.join(root, '.prdt', 'po-state.json'),
    JSON.stringify({ schema_version: 1, stage: 'build', version: 'v1.0', current_task: null }))
  fs.mkdirSync(path.join(root, 'docs', 'tickets', 'v1.0'), { recursive: true })
  binDir = path.join(sb, 'bin')
  fs.mkdirSync(binDir)
  fs.writeFileSync(path.join(binDir, 'pnpm'), STUB_PNPM, { mode: 0o755 })
  log = path.join(sb, 'pnpm.log')
})
afterEach(() => { fs.rmSync(sb, { recursive: true, force: true }) })

describe.skipIf(!PYTHON3 || !NODE)('prdt viewer --ensure (T-983)', () => {
  test('deps missing: installs with the filtered frozen install, then builds viewer.html, silently', () => {
    fakeCheckout(false)
    const r = ensure('ok')
    expect(r).toMatchObject({ code: 0, out: '', err: '' })
    const calls = pnpmCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe(`${code}\tinstall --frozen-lockfile --filter @productune/viewer --ignore-scripts --config.fetch-retries=1`)
    expect(fs.existsSync(page())).toBe(true)
  })

  test('T-1063: every dep present except mermaid: ensure installs (the page exists already)', () => {
    fakeCheckout(true, ['mermaid'])
    fs.mkdirSync(path.dirname(page()), { recursive: true })
    fs.writeFileSync(page(), 'old')
    expect(ensure('ok')).toMatchObject({ code: 0, out: '', err: '' })
    expect(pnpmCalls()).toHaveLength(1)
    expect(fs.existsSync(path.join(code, 'packages', 'viewer', 'node_modules', 'mermaid', 'package.json'))).toBe(true)
  })

  test('deps present, page absent: builds without any install', () => {
    fakeCheckout(true)
    expect(ensure('ok')).toMatchObject({ code: 0, out: '', err: '' })
    expect(pnpmCalls()).toEqual([])
    expect(fs.existsSync(page())).toBe(true)
  })

  test('deps present, page present: nothing runs (page untouched) — unless --refresh', () => {
    fakeCheckout(true)
    fs.mkdirSync(path.dirname(page()), { recursive: true })
    fs.writeFileSync(page(), 'old')
    expect(ensure('ok').code).toBe(0)
    expect(fs.readFileSync(page(), 'utf8')).toBe('old')
    expect(pnpmCalls()).toEqual([])
    expect(ensure('ok', ['--refresh']).code).toBe(0)
    expect(fs.readFileSync(page(), 'utf8')).toBe('<!doctype html>')
  })

  test('install fails (offline): one line naming the cause, exit 1, no page — the next run retries and succeeds', () => {
    fakeCheckout(false)
    const r = ensure('fail')
    expect(r.code).toBe(1)
    expect(r.err.trim().split('\n')).toHaveLength(1)
    expect(r.err).toContain('prdt viewer: 뷰어 의존성 설치가 실패했어요')
    expect(r.err).toContain('ERR_PNPM_META_FETCH_FAIL')
    expect(fs.existsSync(page())).toBe(false)
    expect(ensure('ok')).toMatchObject({ code: 0, err: '' })
    expect(pnpmCalls()).toHaveLength(2)
    expect(fs.existsSync(page())).toBe(true)
  })

  test('pnpm absent: one line naming pnpm, exit 1', () => {
    fakeCheckout(false)
    fs.rmSync(path.join(binDir, 'pnpm'))
    const r = spawnSync(PYTHON3 as string, [prdt, 'viewer', '--ensure'], {
      cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'),
      env: { ...env('ok'), PATH: `${path.dirname(NODE as string)}${path.delimiter}/usr/bin${path.delimiter}/bin` },
    })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('pnpm')
  })
})

describe.skipIf(!PYTHON3 || !NODE || !JQ)('PO session start runs the ensure (T-983)', () => {
  function hook(agent: string, event: string) {
    return spawnSync('bash', [HOOK], {
      cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'),
      input: JSON.stringify({ agent_type: agent, hook_event_name: event, cwd: root }),
      env: env('ok', { PRDT_VIEWER_ENSURE: '1' }),
    })
  }
  async function waitPage(ms = 6000) {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (fs.existsSync(page())) return true
      await new Promise((r) => setTimeout(r, 50))
    }
    return false
  }

  test('prdt-po SessionStart: installs deps and builds the page, detached', async () => {
    fakeCheckout(false)
    hook('prdt-po', 'SessionStart')
    expect(await waitPage()).toBe(true)
    expect(pnpmCalls()).toHaveLength(1)
  })

  test('T-1063: page present, only mermaid missing: the session start still spawns the ensure', async () => {
    fakeCheckout(true, ['mermaid'])
    const h = path.join(sb, 'hh')
    fs.mkdirSync(h, { recursive: true })
    fs.writeFileSync(path.join(h, 'prdt.env'), `PRDT_REPO=${path.join(code, 'packages', 'core')}\n`)
    fs.mkdirSync(path.dirname(page()), { recursive: true })
    fs.writeFileSync(page(), 'x')
    spawnSync('bash', [HOOK], { cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'),
      input: JSON.stringify({ agent_type: 'prdt-po', hook_event_name: 'SessionStart', cwd: root }),
      env: { ...env('ok'), PRDT_HOME: h } })
    const t0 = Date.now()
    const done = path.join(code, 'packages', 'viewer', 'node_modules', 'mermaid', 'package.json')
    while (!fs.existsSync(done) && Date.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 50))
    await new Promise((r) => setTimeout(r, 500)) // the detached ensure goes on to regenerate the page
    expect(pnpmCalls()).toHaveLength(1)
  })

  test('a worker (SubagentStart) and the PRDT_VIEWER_ENSURE=0 switch build nothing', async () => {
    fakeCheckout(false)
    hook('prdt-developer', 'SubagentStart')
    const off = spawnSync('bash', [HOOK], {
      cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'),
      input: JSON.stringify({ agent_type: 'prdt-po', hook_event_name: 'SessionStart', cwd: root }),
      env: env('ok', { PRDT_VIEWER_ENSURE: '0' }),
    })
    expect(off.status).toBe(0)
    expect(await waitPage(800)).toBe(false)
    expect(pnpmCalls()).toEqual([])
  })
})

describe.skipIf(!PYTHON3 || !NODE)('T-983 grill fixes', () => {
  function installedEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    // HOME sandbox with a prdt.env pointing PRDT_REPO at a git checkout: the
    // daily nudge's own gates (once a day, repo found) then pass.
    const h = path.join(sb, 'h')
    fs.mkdirSync(path.join(h, '.prdt'), { recursive: true })
    fs.writeFileSync(path.join(h, '.prdt', 'prdt.env'), `PRDT_REPO=${path.join(code, 'packages', 'core')}\n`)
    return { ...env('ok', extra), HOME: h, CI: '' }
  }
  const state = () => path.join(sb, 'h', '.prdt', 'update-state.json')

  test('--ensure never runs the daily nudge (no update-state.json); a plain viewer run does (control)', () => {
    fakeCheckout(true)
    execFileSync('git', ['init', '-q', code])
    const run = (args: string[]) => spawnSync(PYTHON3 as string, [prdt, 'viewer', ...args], {
      cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'), env: installedEnv() })
    expect(run(['--ensure']).status).toBe(0)
    expect(fs.existsSync(state())).toBe(false)
    run([])
    expect(fs.existsSync(state())).toBe(true)
  })

  test('PRDT_VIEWER_NO_INSTALL (prdt update): no second install, one failure line naming the fix', () => {
    fakeCheckout(false)
    const r = spawnSync(PYTHON3 as string, [prdt, 'viewer', '--ensure', '--refresh'], {
      cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'), env: env('ok', { PRDT_VIEWER_NO_INSTALL: '1' }) })
    expect(r.status).toBe(1)
    expect(pnpmCalls()).toEqual([])
    expect(r.stderr).toContain('pnpm install --frozen-lockfile --filter @productune/viewer')
  })

  test('kill -9 of the ensure mid-install: the orphaned pnpm still holds the lock — no second install', async () => {
    fakeCheckout(false)
    const child = spawn(PYTHON3 as string, [prdt, 'viewer', '--ensure'], { cwd: root, env: env('slow'), stdio: 'ignore' })
    const t0 = Date.now()
    while (pnpmCalls().length < 1 && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 50))
    expect(pnpmCalls()).toHaveLength(1)
    child.kill('SIGKILL')
    await new Promise((r) => setTimeout(r, 200))
    const second = spawnSync(PYTHON3 as string, [prdt, 'viewer', '--ensure'], {
      cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'), env: env('slow') })
    expect(pnpmCalls()).toHaveLength(1)
    expect(second.status).toBe(1)
    // clean up only the stub this test started
    try { process.kill(Number(fs.readFileSync(`${log}.pid`, 'utf8').trim())) } catch { /* already gone */ }
  })
})

describe.skipIf(!PYTHON3 || !NODE || !JQ)('T-983 hook skips the spawn when ready', () => {
  test('page and deps present: the CLI is not invoked; page absent: it is', async () => {
    fakeCheckout(true)
    const h = path.join(sb, 'hh')
    fs.mkdirSync(h, { recursive: true })
    fs.writeFileSync(path.join(h, 'prdt.env'), `PRDT_REPO=${path.join(code, 'packages', 'core')}\n`)
    const stub = path.join(sb, 'stub-prdt')
    fs.writeFileSync(stub, `#!/bin/bash\necho "$@" >> ${log}.stub\n`, { mode: 0o755 })
    const fire = () => spawnSync('bash', [HOOK], { cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'),
      input: JSON.stringify({ agent_type: 'prdt-po', hook_event_name: 'SessionStart', cwd: root }),
      env: { ...env('ok'), PRDT_HOME: h, PRDT_BIN: stub } })
    fs.mkdirSync(path.dirname(page()), { recursive: true })
    fs.writeFileSync(page(), 'x')
    fire()
    await new Promise((r) => setTimeout(r, 600))
    expect(fs.existsSync(`${log}.stub`)).toBe(false)
    fs.rmSync(page())
    fire()
    const t0 = Date.now()
    while (!fs.existsSync(`${log}.stub`) && Date.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 50))
    expect(fs.readFileSync(`${log}.stub`, 'utf8').trim()).toBe('viewer --ensure')
  })
})

describe.skipIf(!PYTHON3 || !NODE)('T-1063 generation without mermaid', () => {
  const MARK = 'PRDT_VIEWER_WARN mermaid-missing'

  test('mermaidScript() with no mermaid package prints the marker once and returns null', () => {
    // the lib copied under the sandbox: `mermaid` resolves from nowhere
    const lib = path.join(sb, 'lib')
    fs.mkdirSync(lib)
    fs.copyFileSync(path.join(CORE_ROOT, '..', 'viewer', 'lib', 'mermaid.mjs'), path.join(lib, 'mermaid.mjs'))
    const r = spawnSync(NODE as string, ['--input-type=module', '-e',
      `import { mermaidScript } from ${JSON.stringify(path.join(lib, 'mermaid.mjs'))}; console.log(String(mermaidScript()))`],
      { encoding: 'utf8', timeout: subprocessTimeout('cli'), env: { ...process.env, NODE_PATH: '' } })
    expect(r.stdout.trim()).toBe('null')
    expect(r.stderr.trim().split('\n')).toEqual([MARK])
  })

  test('prdt viewer turns the generator marker into one line naming mermaid and the fix; absent marker: silent', () => {
    fakeCheckout(true)
    const cli = path.join(code, 'packages', 'viewer', 'cli.mjs')
    const warn = OK_CLI.replace("if (a.includes('--emit')) {", `if (a.includes('--emit')) {\n  console.error('${MARK}')`)
    fs.writeFileSync(cli, warn)
    const run = () => spawnSync(PYTHON3 as string, [prdt, 'viewer'], {
      cwd: root, encoding: 'utf8', timeout: subprocessTimeout('cli'), env: env('ok') })
    const r = run()
    expect(r.status).toBe(0)
    const lines = r.stderr.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('mermaid')
    expect(lines[0]).toContain('pnpm install --frozen-lockfile --filter @productune/viewer')
    fs.writeFileSync(cli, OK_CLI)
    expect(run().stderr).toBe('')
  })
})
