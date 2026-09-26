#!/usr/bin/env node
// ds/cli.mjs — `pnpm --filter @productune/gui ds` (generate) /
// `ds --check` (verify, part of `lint`). T-659 Outcome §생성 명세.
import fs from 'node:fs'
import { generate, checkUpToDate, OUTPUT_PATH } from './generate.mjs'

const checkMode = process.argv.includes('--check')

async function main() {
  if (checkMode) {
    const { upToDate } = await checkUpToDate()
    if (!upToDate) {
      console.error(
        `ds --check: ${OUTPUT_PATH} is stale for the current token file.\n` +
          'Re-run `pnpm --filter @productune/gui ds` and commit the result.',
      )
      process.exitCode = 1
      return
    }
    console.log('ds --check: design-system.html is up to date.')
    return
  }

  const { html } = await generate()
  fs.writeFileSync(OUTPUT_PATH, html)
  console.log(`ds: wrote ${OUTPUT_PATH} (${html.length} bytes)`)
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err)
  process.exitCode = 1
})
