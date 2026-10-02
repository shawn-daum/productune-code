/**
 * T-917 test seam: the meta backup accepts only network remotes, so a test
 * that needs a real push target registers an https URL on the meta repo and
 * points it at a local bare repo through the sandbox HOME's `~/.gitconfig`
 * (`url.<bare>.insteadOf <https url>`). git rewrites the URL at push time; the
 * meta config itself holds only the https URL, so the trust check judges
 * exactly what production judges and no production code path has a bypass.
 *
 * Every meta git runner scrubs GIT_* but keeps HOME, so the alias reaches
 * them as long as the process (or the spawned CLI's env) uses `home`.
 * Note: `git remote -v` prints the REWRITTEN url (the bare path).
 */
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

let seq = 0

export function networkAlias(localBare: string, home = process.env.HOME as string): string {
  if (!home) throw new Error('networkAlias: no HOME to write the alias into')
  const url = `https://meta-backup.invalid/${process.pid}-${++seq}-${path.basename(localBare)}`
  fs.mkdirSync(home, { recursive: true })
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k]
  execFileSync('git', ['config', '--file', path.join(home, '.gitconfig'), '--add', `url.${localBare}.insteadOf`, url], {
    env,
    stdio: 'ignore',
  })
  return url
}
