/**
 * surface-runner.path.test.ts — T-440 resolution-order contract.
 *
 * One resolver (toolchainBinDir) is shared by the writer (toolchain.ts) and
 * every reader; these tests pin the ORDER: the user's own toolchain always
 * wins (login-shell PATH, process PATH, ~/.local/bin), the app-provided
 * toolchain is strictly LAST — never shadowing, only a floor.
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import { withLoginShellPath, userLocalBinDir, pathWithLocalBins } from './surface-runner'
import { toolchainBinDir } from './toolchain'

describe('withLoginShellPath (bare-CLI spawns: PO turn, login, mcp, prewarm)', () => {
  it('appends the app toolchain dir LAST — after user PATH and ~/.local/bin', () => {
    const merged = (withLoginShellPath({ PATH: '/custom/user-tools' }).PATH ?? '').split(path.delimiter)
    const iUser = merged.indexOf('/custom/user-tools')
    const iLocal = merged.indexOf(userLocalBinDir())
    const iToolchain = merged.indexOf(toolchainBinDir())
    expect(iUser).toBeGreaterThanOrEqual(0)
    expect(iToolchain).toBe(merged.length - 1)
    expect(iUser).toBeLessThan(iToolchain)
    expect(iLocal).toBeLessThan(iToolchain)
  })
})

describe('pathWithLocalBins (surface build/run spawns)', () => {
  it('order: project node_modules/.bin → login-shell → process PATH → app toolchain (last)', () => {
    const prevPath = process.env.PATH
    process.env.PATH = `/custom/proc-path${path.delimiter}${prevPath ?? ''}`
    try {
      const merged = pathWithLocalBins('/nonexistent-project-t440').split(path.delimiter)
      const iProc = merged.indexOf('/custom/proc-path')
      const iToolchain = merged.indexOf(toolchainBinDir())
      expect(iProc).toBeGreaterThanOrEqual(0)
      expect(iToolchain).toBe(merged.length - 1)
      expect(iProc).toBeLessThan(iToolchain)
    } finally {
      process.env.PATH = prevPath
    }
  })
})
