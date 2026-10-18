/**
 * Retired-hook sweep (T-1156). A hook dropped from hook-manifest.json `basenames`
 * stays registered on machines that installed it earlier (installs strip only roster
 * basenames), so the manifest also carries a `retired` list: install.sh, uninstall.sh
 * and the GUI onboarding (installPrdtHooks, its own test) strip a retired basename's
 * ~/.claude/settings.json entry; install.sh also removes its ~/.prdt/hooks mirror file.
 */
import path from 'path'
import fs from 'fs'
import { execFileSync } from 'child_process'
import { test, expect, describe } from 'vitest'
import { makeSandbox, runInstall, hasJq, CORE_ROOT } from '../helpers/install-fixture'

const UNINSTALL_SH = path.join(CORE_ROOT, 'scripts', 'uninstall.sh')
const manifest = JSON.parse(fs.readFileSync(path.join(CORE_ROOT, 'scripts', 'hook-manifest.json'), 'utf8'))

function cmds(settings: any): string[] {
  const out: string[] = []
  for (const entries of Object.values(settings.hooks ?? {}))
    for (const e of entries as any[]) for (const h of e?.hooks ?? []) out.push(h?.command ?? '')
  return out
}

function seed(sb: ReturnType<typeof makeSandbox>) {
  const hooksDir = path.join(sb.prdtHome, 'hooks')
  fs.mkdirSync(hooksDir, { recursive: true })
  fs.writeFileSync(path.join(hooksDir, 'prdt-link-check.sh'), '#!/bin/bash\n')
  fs.mkdirSync(sb.claudeDir, { recursive: true })
  fs.writeFileSync(path.join(sb.claudeDir, 'settings.json'), JSON.stringify({
    hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: `"${hooksDir}/prdt-link-check.sh"` }] },
        { hooks: [{ type: 'command', command: '/Users/me/own-stop.sh' }] },
      ],
    },
  }))
}

describe.skipIf(!hasJq())('retired hook sweep', () => {
  test('manifest: retired lists prdt-link-check.sh first, and none of it is in the roster', () => {
    expect(manifest.retired[0]).toBe('prdt-link-check.sh')
    for (const b of manifest.retired) expect(manifest.basenames).not.toContain(b)
  })

  test('install.sh removes the retired settings.json entry and mirror file, keeps foreign hooks', () => {
    const sb = makeSandbox('t1156-install-')
    seed(sb)
    runInstall(sb)
    const s = JSON.parse(fs.readFileSync(path.join(sb.claudeDir, 'settings.json'), 'utf8'))
    expect(cmds(s).some((c) => c.includes('prdt-link-check.sh'))).toBe(false)
    expect(cmds(s)).toContain('/Users/me/own-stop.sh')
    expect(fs.existsSync(path.join(sb.prdtHome, 'hooks', 'prdt-link-check.sh'))).toBe(false)
  }, 60_000)

  test('uninstall.sh strips a retired registration too', () => {
    const sb = makeSandbox('t1156-uninstall-')
    runInstall(sb)
    const p = path.join(sb.claudeDir, 'settings.json')
    const s = JSON.parse(fs.readFileSync(p, 'utf8'))
    s.hooks.Stop.push({ hooks: [{ type: 'command', command: `"${sb.prdtHome}/hooks/prdt-link-check.sh"` }] })
    fs.writeFileSync(p, JSON.stringify(s))
    execFileSync('bash', [UNINSTALL_SH], { env: sb.env, stdio: 'ignore' })
    expect(cmds(JSON.parse(fs.readFileSync(p, 'utf8'))).some((c) => c.includes('prdt-link-check.sh'))).toBe(false)
  }, 60_000)
})
