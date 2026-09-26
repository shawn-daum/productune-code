#!/usr/bin/env node
// ds/cli.mjs — `pnpm --filter @productune/gui ds` (generate) /
// `ds --check` (verify, part of `lint`). T-659 Outcome §생성 명세.
import fs from 'node:fs'
import { generate, checkUpToDate, OUTPUT_PATH } from './generate.mjs'
import { checkDocSurfaceMirror } from './lib/doc-surface-mirror.mjs'

const checkMode = process.argv.includes('--check')

async function main() {
  if (checkMode) {
    let ok = true

    const { upToDate } = await checkUpToDate()
    if (!upToDate) {
      console.error(
        `ds --check: ${OUTPUT_PATH} is stale for the current token file.\n` +
          'Re-run `pnpm --filter @productune/gui ds` and commit the result.',
      )
      ok = false
    }

    // T-697: md-recipes.css's `.md-doc.md-light` hex-copies a few tokens.css
    // light values on purpose (viewer light/dark toggle is independent of
    // the app theme — see ds/lib/doc-surface-mirror.mjs). Catch drift here,
    // the same place a stale design-system.html is already caught.
    const mirror = checkDocSurfaceMirror()
    if (!mirror.ok) {
      console.error(
        `ds --check: src/styles/md-recipes.css ".md-doc.md-light" has drifted from ` +
          `src/styles/tokens.css's light value for:\n` +
          mirror.mismatches
            .map((m) => `  --${m.name}: md-recipes=${m.mdRecipes ?? '(missing)'} vs tokens(light)=${m.tokens ?? '(missing)'}`)
            .join('\n') +
          '\nUpdate md-recipes.css .md-doc.md-light to match, or if this name should no ' +
          'longer mirror tokens.css, update the mapping in ds/lib/doc-surface-mirror.mjs.',
      )
      ok = false
    }

    if (!ok) {
      process.exitCode = 1
      return
    }
    console.log('ds --check: design-system.html is up to date; doc-surface mirror OK.')
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
