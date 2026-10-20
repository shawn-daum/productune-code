// T-1147: `prdt` imports its sibling `prdt_lanes.py` (the one lane computation, shared with
// the statusline); T-1170: `prdt` is a launcher whose CLI body is the sibling `prdt_cli.py`.
// A copy of the CLI into a fixture needs both beside it — the same set install.sh makes in
// ~/.prdt/bin.
import fs from 'fs'
import path from 'path'

export const PRDT_SIBLINGS = ['prdt_cli.py', 'prdt_lanes.py']

export function copyPrdtCli(src: string, dst: string): void {
  fs.copyFileSync(src, dst)
  for (const m of PRDT_SIBLINGS) {
    const from = path.join(path.dirname(src), m)
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(path.dirname(dst), m))
  }
}

/** T-1170: the CLI's source text (the body beside the `prdt` launcher), for tests that
 *  assert on what the code says rather than what it does. */
export function prdtSource(cli: string): string {
  return fs.readFileSync(path.join(path.dirname(cli), 'prdt_cli.py'), 'utf8')
}
