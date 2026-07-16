/**
 * meta-cli.ts — JSON bridge exposing the core meta-git API to non-TS surfaces
 * (T-367: the Python `prdt` CLI and the prdt-post-dispatch hook).
 *
 * Why a bridge: CLI·GUI parity requires that NO surface owns git logic — the
 * GUI's electron main imports @productune/core directly, but the Python CLI
 * and the bash/python hook cannot. They spawn
 *   node <PRDT_REPO>/packages/core/dist/bin/meta-cli.cjs <cmd> <projectDir> …
 * and get one JSON object on stdout. The .cjs is a self-contained esbuild
 * bundle (see package.json `build`) because tsc's dist uses extensionless ESM
 * specifiers that node cannot resolve directly.
 *
 * Commands:
 *   tick         <projectDir>                — one meta autosave beat (metaAutosaveTick)
 *   log          <projectDir> [limit]        — meta commit timeline (scanMetaHistory)
 *   remote-list  <projectDir>                — configured backup remotes
 *   remote-add   <projectDir> <name> <url>   — add/update a backup remote (NEVER pushes)
 *   push         <projectDir> [name]         — EXPLICIT push of the meta branch to a backup
 *                                              remote (name defaults to "backup"; never --force)
 *   bootstrap    <projectDir> <url> [name]   — T-374: second-machine restore of meta.git from a
 *                                              backup remote (name defaults to "backup")
 *   migrate-plan <projectDir>                — T-366 migration eligibility + untrack preview (read-only)
 *   migrate-run  <projectDir>                — execute the CONFIRMED migration (caller owns the
 *                                              user prompt — see meta-migrate.ts auto/confirm boundary)
 *
 * Exit code: 0 on any handled result (including graceful skips); 1 only on
 * usage errors or unexpected throws — callers on the beat path ignore both.
 */

import { metaAutosaveTick } from '../git-workflow/meta-autosave'
import {
  metaRepoExists,
  scanMetaHistory,
  addMetaRemote,
  listMetaRemotes,
  pushMetaRemote,
  bootstrapMetaRepo,
} from '../git-workflow/meta-git'
import { planMetaMigration, runMetaMigration } from '../git-workflow/meta-migrate'

function out(obj: unknown, code = 0): never {
  process.stdout.write(JSON.stringify(obj) + '\n')
  process.exit(code)
}

async function main(): Promise<void> {
  const [cmd, projectDir, ...rest] = process.argv.slice(2)
  if (!cmd || !projectDir) {
    out({ ok: false, error: 'usage: meta-cli <tick|log|remote-list|remote-add|push|bootstrap|migrate-plan|migrate-run> <projectDir> [...]' }, 1)
  }

  switch (cmd) {
    case 'tick': {
      const res = await metaAutosaveTick(projectDir)
      out({ ok: true, ...res })
      break
    }
    case 'log': {
      const limit = rest[0] ? Number(rest[0]) : undefined
      const entries = await scanMetaHistory(projectDir, {
        limit: Number.isFinite(limit) ? limit : undefined,
      })
      out({ ok: true, exists: metaRepoExists(projectDir), entries })
      break
    }
    case 'remote-list': {
      const remotes = await listMetaRemotes(projectDir)
      out({ ok: true, exists: metaRepoExists(projectDir), remotes })
      break
    }
    case 'remote-add': {
      const [name, url] = rest
      if (!name || !url) {
        out({ ok: false, error: 'usage: meta-cli remote-add <projectDir> <name> <url>' }, 1)
      }
      const res = await addMetaRemote(projectDir, name, url)
      out({ ok: res.ok, error: res.error })
      break
    }
    case 'push': {
      const name = rest[0] || 'backup'
      const res = await pushMetaRemote(projectDir, name)
      out(res, res.ok ? 0 : 1)
      break
    }
    case 'bootstrap': {
      const [url, name] = rest
      if (!url) {
        out({ ok: false, error: 'usage: meta-cli bootstrap <projectDir> <url> [name]' }, 1)
      }
      const res = await bootstrapMetaRepo(projectDir, url, name || 'backup')
      out(res, res.ok ? 0 : 1)
      break
    }
    case 'migrate-plan': {
      const plan = await planMetaMigration(projectDir)
      out({ ok: true, ...plan })
      break
    }
    case 'migrate-run': {
      // Confirmation is the CALLER's contract (CLI y/N prompt · GUI dialog) —
      // this command executes immediately. rm --cached only; never pushes.
      const res = await runMetaMigration(projectDir)
      out(res)
      break
    }
    default:
      out({ ok: false, error: `unknown command: ${cmd}` }, 1)
  }
}

main().catch((err) => {
  out({ ok: false, error: err instanceof Error ? err.message : String(err) }, 1)
})
