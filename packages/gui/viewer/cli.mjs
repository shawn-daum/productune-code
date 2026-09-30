#!/usr/bin/env node
// viewer/cli.mjs — `pnpm --filter @productune/gui viewer` (generate) /
// `viewer --check` (verify regeneration is byte-identical, T-665 acceptance
// line 4). NOT wired into `lint` (unlike `ds --check`): unlike tokens.css,
// this generator's input is the whole evolving docs/ corpus, so checking it
// on every lint run would re-read hundreds of files for no defect this repo
// has — regenerate on demand instead.
//
// T-746: `--repo-root <dir> --out <file>` generate ANY project's viewer from
// this checkout — the installed `prdt` calls it that way (`prdt viewer`,
// `prdt tickets --link`, the auto-open hook), so a project with no
// `code/packages/gui` of its own still gets one. Without them, the defaults
// are this repo's own layout, unchanged.
import fs from 'node:fs'
import path from 'node:path'
import { generate, checkUpToDate, OUTPUT_PATH, REPO_ROOT } from './generate.mjs'

function argValue(name) {
  const i = process.argv.indexOf(name)
  if (i === -1) return undefined
  const v = process.argv[i + 1]
  if (v === undefined || v.startsWith('--')) {
    throw new Error(`viewer: ${name} needs a value`)
  }
  return v
}

const checkMode = process.argv.includes('--check')

async function main() {
  const repoRootArg = argValue('--repo-root')
  const outArg = argValue('--out')
  const repoRoot = repoRootArg ? path.resolve(repoRootArg) : REPO_ROOT
  const outputPath = outArg ? path.resolve(outArg) : OUTPUT_PATH

  if (checkMode) {
    const { upToDate } = await checkUpToDate({ repoRoot, outputPath })
    if (!upToDate) {
      console.error(`viewer --check: ${outputPath} is stale. Re-run \`pnpm --filter @productune/gui viewer\`.`)
      process.exitCode = 1
      return
    }
    console.log('viewer --check: viewer.html is up to date.')
    return
  }

  const { html } = await generate({ repoRoot, outputPath })
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  // Write-then-rename: a browser tab opening the page mid-write never reads
  // a half-written file.
  // T-842: the temp is created exclusively ('wx' = O_CREAT|O_EXCL, which
  // never follows a symlink), so a `<out>.<pid>.tmp` link committed into the
  // output directory is removed, never written through; renameSync replaces
  // a symlinked `viewer.html` itself rather than its target. The directory
  // chain is checked by the caller (`prdt` refuses a symlinked one).
  const tmp = `${outputPath}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, html, { flag: 'wx' })
  } catch (err) {
    if (!err || err.code !== 'EEXIST') throw err
    fs.unlinkSync(tmp)
    fs.writeFileSync(tmp, html, { flag: 'wx' })
  }
  fs.renameSync(tmp, outputPath)
  console.log(`viewer: wrote ${outputPath} (${Buffer.byteLength(html, 'utf8')} bytes)`)
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err)
  process.exitCode = 1
})
