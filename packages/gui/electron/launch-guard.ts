/**
 * launch-guard.ts — T-442: detect a GUI boot that was meant to be a node run.
 *
 * The toolchain shims (toolchain.ts) exec the app binary with
 * ELECTRON_RUN_AS_NODE exported. When that binary honors the var (RunAsNode
 * fuse enabled — our shipped configuration), main.ts never executes: Electron
 * runs the target script as plain Node. Therefore, if main-process GUI code IS
 * executing while the var is set, the env marker was inert (fuse-disabled
 * binary, or any future spawn edge that boots the app GUI-mode from a
 * node-intended path). That misfired instance's startup would otherwise
 * re-enter toolchain provisioning against the REAL home and re-spawn itself
 * once per probe — the 2026-07-30 machine-hang runaway. The caller (main.ts)
 * must app.exit() immediately, before any window, IPC, or provisioning side
 * effect.
 *
 * No electron import — pure env predicate, unit-tested in launch-guard.test.ts.
 */

/** Exit code for a misfired GUI boot — distinct so probe failures and logs can
 *  attribute the exit to the guard rather than a crash. */
export const MISFIRE_EXIT_CODE = 97

/** True when ELECTRON_RUN_AS_NODE is set (non-empty, mirroring Electron's own
 *  truthiness for this var) in the environment of RUNNING GUI code. */
export function isShimMisfire(env: NodeJS.ProcessEnv): boolean {
  const v = env.ELECTRON_RUN_AS_NODE
  return typeof v === 'string' && v !== ''
}
