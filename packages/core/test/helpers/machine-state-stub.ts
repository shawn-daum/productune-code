/**
 * machine-state-stub.ts — T-790. A vitest setupFile (packages/core/vitest.config.ts):
 * every subprocess this worker spawns finds a fixed `uptime` and `memory_pressure`
 * first on PATH, so `prdt doctor` never reads the HOST's load.
 *
 * WHY (reproduced 2026-10-02): doctor's "resident machine resources" check
 * (scripts/prdt, T-592) is FAMILY_DE — each line it prints moves the verdict
 * tail's `violations=`. It prints one line per docker stack / VM resident
 * ≥ 24 h, but ONLY while the host 1-minute load (real `uptime`) is ≥ 10. Same
 * sandbox, same files, a docker stack 48.9 h old: `uptime` reading 9.90 →
 * `violations=0`, reading 10.10 → `violations=1` (the line names "host load is
 * 10.1"). Every doctor test that asserts a DELTA (`base` run, edit, second
 * run) or an absolute count therefore moved by one whenever the load crossed
 * 10 between its two doctor calls — which a full suite at maxWorkers 4 does
 * and a run at maxWorkers 1 does not (T-790: prd-shape "five findings move
 * the tail by five" read 6; agent-stubs · discipline-delivery · byte-caps ·
 * ticket-frame the same way). The test changed nothing; the machine did.
 *
 * Load 1.00 is below the check's threshold, so that check is silent and
 * deterministic in every test; the check itself is tested against its pure
 * function and its own PATH stubs (prdt-doctor-resident-resources.test.ts,
 * prdt-doctor-verdict.test.ts), which are prepended AFTER this and so win.
 * Real `docker` / `lume` stay reachable — the check still runs and is not
 * reported as skipped, it just never sees a load worth warning about.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prdt-vitest-machine-stub-'))
fs.writeFileSync(path.join(dir, 'uptime'),
  '#!/bin/sh\necho "12:00  up 1 day, 2 users, load averages: 1.00 1.00 1.00"\n', { mode: 0o755 })
fs.writeFileSync(path.join(dir, 'memory_pressure'),
  '#!/bin/sh\necho "System-wide memory free percentage: 50%"\n', { mode: 0o755 })
process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ''}`
process.env.PRDT_TEST_MACHINE_STUB = dir

process.on('exit', () => {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* tmp sweep gets it */ }
})
