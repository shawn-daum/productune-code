/** T-1191: the viewer generator's record of project roots the prdt:// handler may open. */
import path from 'path'
import fs from 'fs'
import os from 'os'
import { describe, test, expect } from 'vitest'
// @ts-expect-error plain .mjs
import { recordOpenRoot, openRootsPath } from '../../../viewer/lib/open-roots.mjs'

describe('recordOpenRoot', () => {
  test('records the realpath once; refuses a non-project, a symlinked list', () => {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'open-roots-')))
    try {
      const home = path.join(base, 'prdt')
      fs.mkdirSync(path.join(base, 'proj', '.prdt'), { recursive: true })
      fs.writeFileSync(path.join(base, 'proj', '.prdt', 'po-state.json'), '{}')
      fs.symlinkSync(path.join(base, 'proj'), path.join(base, 'link'))
      fs.mkdirSync(path.join(base, 'plain'))
      expect(recordOpenRoot(path.join(base, 'link'), home)).toBe(true)
      expect(recordOpenRoot(path.join(base, 'proj'), home)).toBe(true)
      expect(fs.readFileSync(openRootsPath(home), 'utf8')).toBe(path.join(base, 'proj') + '\n')
      expect(recordOpenRoot(path.join(base, 'plain'), home)).toBe(false)
      const home2 = path.join(base, 'prdt2')
      fs.mkdirSync(path.join(home2, 'run'), { recursive: true })
      fs.writeFileSync(path.join(base, 'target'), '')
      fs.symlinkSync(path.join(base, 'target'), openRootsPath(home2))
      expect(recordOpenRoot(path.join(base, 'proj'), home2)).toBe(false)
      expect(fs.readFileSync(path.join(base, 'target'), 'utf8')).toBe('')
    } finally {
      fs.rmSync(base, { recursive: true, force: true })
    }
  })
})
