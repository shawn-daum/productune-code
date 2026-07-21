import fs from 'fs'
import path from 'path'
import { codeRoot } from '../state/project-kind'

const HOOK_MARKER = '# productune managed pre-push hook'

/**
 * Build the generated pre-push script body.
 *
 * Blocks direct push to `main` — the ONLY protected branch (T-381 hard rule:
 * `dev` is the pushable residence, `main` is reached only by promote). Since the
 * protected set is a fixed constant, `main` is baked straight into the script.
 *
 * This replaces the previous up-walk + `sed`-parse of git-rules.json
 * `protectedBranches` (T-386 C5): the parser matched only single-line JSON, but
 * the product always pretty-prints git-rules.json (rules.ts saveRules /
 * mergeWithDefaults), so the `sed` never matched a real file and every push
 * fell through to the hard-coded `main` fallback anyway. Baking `main` in makes
 * the actual behavior explicit and removes ~20 lines of dead parsing — and,
 * because it no longer reads a possibly-stale `["main","dev"]` file, it can
 * never resurrect the dev-push-block landmine T-381 retired.
 */
function prePushScript(): string {
  return `#!/bin/sh
# productune managed pre-push hook
# Blocks direct push to main (T-381 hard rule). Auto-generated. Do not edit manually.

while read local_ref local_sha remote_ref remote_sha; do
  branch="\${remote_ref#refs/heads/}"
  if [ "$branch" = "main" ]; then
    echo ""
    echo "  이 작업 줄기는 직접 보낼 수 없어요."
    echo "  배포 준비 단계를 거쳐 보내주세요."
    echo ""
    echo "  (대상 = main)"
    echo ""
    exit 1
  fi
done

exit 0
`
}

/** The pre-push hook path — inside the CODE repo (codeRoot's `.git/hooks`). */
function hookPath(projectDir: string): string {
  return path.join(codeRoot(projectDir), '.git', 'hooks', 'pre-push')
}

export async function installPrePushHook(projectDir: string): Promise<void> {
  const hp = hookPath(projectDir)
  const hooksDir = path.dirname(hp)

  fs.mkdirSync(hooksDir, { recursive: true })

  if (fs.existsSync(hp)) {
    const existing = fs.readFileSync(hp, 'utf-8')
    if (existing.includes(HOOK_MARKER)) {
      // already productune hook — overwrite to update
    } else {
      // OQ-T020-1: backup existing hook
      const backup = `${hp}.bak.${Date.now()}`
      fs.copyFileSync(hp, backup)
    }
  }

  fs.writeFileSync(hp, prePushScript(), { mode: 0o755 })
}

export function isPrePushHookInstalled(projectDir: string): boolean {
  const hp = hookPath(projectDir)
  if (!fs.existsSync(hp)) return false
  try {
    const content = fs.readFileSync(hp, 'utf-8')
    return content.includes(HOOK_MARKER)
  } catch {
    return false
  }
}
