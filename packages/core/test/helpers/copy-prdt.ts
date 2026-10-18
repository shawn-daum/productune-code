// T-1147: `prdt` imports its sibling `prdt_lanes.py` (the one lane computation, shared with
// the statusline), so a copy of the CLI into a fixture needs the module beside it — the
// same pairing install.sh makes in ~/.prdt/bin.
import fs from 'fs'
import path from 'path'

export function copyPrdtCli(src: string, dst: string): void {
  fs.copyFileSync(src, dst)
  const lanes = path.join(path.dirname(src), 'prdt_lanes.py')
  if (fs.existsSync(lanes)) fs.copyFileSync(lanes, path.join(path.dirname(dst), 'prdt_lanes.py'))
}
