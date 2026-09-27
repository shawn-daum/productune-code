#!/usr/bin/env node
// viewer/cli.mjs — `pnpm --filter @productune/gui viewer` (generate) /
// `viewer --check` (verify regeneration is byte-identical, T-665 acceptance
// line 4). NOT wired into `lint` (unlike `ds --check`): unlike tokens.css,
// this generator's input is the whole evolving docs/ corpus, so checking it
// on every lint run would re-read hundreds of files for no defect this repo
// has — regenerate on demand instead.
import fs from 'node:fs'
import { generate, checkUpToDate, OUTPUT_PATH } from './generate.mjs'

const checkMode = process.argv.includes('--check')

async function main() {
  if (checkMode) {
    const { upToDate } = await checkUpToDate()
    if (!upToDate) {
      console.error(`viewer --check: ${OUTPUT_PATH} is stale. Re-run \`pnpm --filter @productune/gui viewer\`.`)
      process.exitCode = 1
      return
    }
    console.log('viewer --check: viewer.html is up to date.')
    return
  }

  const { html } = await generate()
  fs.writeFileSync(OUTPUT_PATH, html)
  console.log(`viewer: wrote ${OUTPUT_PATH} (${Buffer.byteLength(html, 'utf8')} bytes)`)
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err)
  process.exitCode = 1
})
