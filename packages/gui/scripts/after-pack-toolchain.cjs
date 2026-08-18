/**
 * after-pack-toolchain.cjs — copy the JS toolchain payload into the packed app (T-440).
 *
 * Why an afterPack hook and not extraResources: electron-builder's file matcher
 * structurally drops `node_modules` directories from extraResources copies —
 * verified against a real `--mac dir` package build, with and without an
 * explicit `node_modules/**` include: the packaged `toolchain/npm` came out
 * 932K instead of ~16M, missing npm's entire bundled dependency tree, so
 * npm-cli.js would die at require time on a participant machine. A plain
 * dereferencing fs.cpSync sidesteps the matcher entirely (and also settles the
 * pnpm-symlink question: node_modules/npm is a symlink into the store and is
 * dereferenced here explicitly).
 *
 * Consumed by electron/toolchain.ts: resolveNpmPayloadDir() reads
 * <Resources>/toolchain/npm in packaged builds; the launch-time shim writer
 * (ensureNodeToolchain) execs <Resources>/toolchain/npm/bin/npm-cli.js under
 * ELECTRON_RUN_AS_NODE. docs/ and man/ are trimmed (never read at runtime).
 */

const fs = require('fs')
const path = require('path')

/** npm package root, resolved through the pnpm symlink. */
function npmSourceDir() {
  return fs.realpathSync(path.join(__dirname, '..', 'node_modules', 'npm'))
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = `${context.packager.appInfo.productFilename}.app`
  const resourcesDir = path.join(context.appOutDir, appName, 'Contents', 'Resources')
  if (!fs.existsSync(resourcesDir)) {
    throw new Error(`[t440] Resources dir not found at ${resourcesDir}`)
  }

  const src = npmSourceDir()
  const dst = path.join(resourcesDir, 'toolchain', 'npm')
  fs.rmSync(dst, { recursive: true, force: true })
  fs.cpSync(src, dst, {
    recursive: true,
    dereference: true,
    filter: (p) => {
      const rel = path.relative(src, p)
      return !(rel === 'docs' || rel.startsWith(`docs${path.sep}`) || rel === 'man' || rel.startsWith(`man${path.sep}`))
    },
  })

  // Fail the build loudly if the payload is not runnable-shaped — a silent
  // half-copy here is exactly the failure class this hook exists to prevent.
  for (const rel of ['bin/npm-cli.js', 'bin/npx-cli.js', 'node_modules']) {
    if (!fs.existsSync(path.join(dst, rel))) {
      throw new Error(`[t440] packaged npm payload incomplete: missing ${rel} under ${dst}`)
    }
  }
  console.log(`  • [t440] toolchain payload staged: ${dst}`)
}
