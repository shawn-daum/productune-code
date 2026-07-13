/**
 * bashActivity.ts (T-333) — humanize a Bash tool_use for the PO activity line.
 *
 * The live "실행 중" row used to show the raw shell command verbatim
 * ("echo ...; cat .prdt/po-st… 실행 중") — unreadable noise for a non-developer
 * planner. Policy, in order:
 *   1. Prefer the tool call's own `description` field (Claude Code's Bash tool
 *      always carries one) — but only when it's actually usable in the UI's
 *      language; Claude often defaults to an English one-liner even mid-Korean
 *      session, which would just move the noise rather than fix it.
 *   2. Else fall back to a small GUI-side map from the command's first word to
 *      a generic localized phrase (cat/grep/git/…).
 *   3. Else a generic "명령 실행 중" / "Running a command" — never raw shell text.
 *
 * Pure + exported so the mapping/heuristic logic (doctrine #3: test-first
 * where logic lives) can be unit-tested independent of ChatPanel's rendering.
 */

/** Crude Hangul detector — good enough to flag an English `description` as
 *  unusable when the GUI's own language is Korean (no dependency needed). */
const HANGUL_RE = /[가-힣]/

/** A Bash `description` is usable as-is when the UI isn't Korean (no mismatch
 *  possible), or when it actually contains Hangul. An English description
 *  rendered mid-Korean-session reads as noise, so that case falls through to
 *  the command-pattern fallback instead (T-333 lever b). */
export function descriptionUsable(desc: string, uiLang?: string): boolean {
  if (!uiLang || !uiLang.toLowerCase().startsWith('ko')) return true
  return HANGUL_RE.test(desc)
}

// GUI-side fallback map — first word of the command → a generic, localized
// "what kind of thing is this" bucket. Deliberately coarse (doctrine #1
// YAGNI): planners don't need per-flag nuance, just "it's reading a file" vs
// "it's searching" vs "it's running a script". Unmapped commands still get a
// safe, non-technical generic label — never the raw command text.
export const BASH_FALLBACK_BUCKETS: Record<string, string> = {
  cat: 'cat', head: 'cat', tail: 'cat', less: 'cat', more: 'cat',
  echo: 'echo', printf: 'echo',
  grep: 'grep', rg: 'grep', ag: 'grep', ack: 'grep',
  git: 'git',
  ls: 'ls', find: 'ls', tree: 'ls',
  mkdir: 'prep', touch: 'prep', cp: 'prep', mv: 'prep', rm: 'prep', chmod: 'prep',
  npm: 'run', yarn: 'run', pnpm: 'run', node: 'run', python: 'run', python3: 'run', bash: 'run', sh: 'run',
  curl: 'net', wget: 'net',
  jq: 'data', sed: 'data', awk: 'data',
}

/** First shell word of a (possibly chained) command, path-stripped. Best-effort
 *  only — this drives a coarse label bucket, not execution. */
export function firstBashWord(cmd: string): string {
  const firstSegment = cmd.split(/[;&|]+/)[0]?.trim() ?? ''
  const word = firstSegment.split(/\s+/)[0] ?? ''
  return word.split('/').filter(Boolean).pop() ?? ''
}

/** Resolve the fallback locale key (`workspace.chat.activity.bashFallback.<bucket>`)
 *  for a raw command. Always resolves to some bucket — `generic` when unmapped. */
export function bashFallbackBucket(cmd: string): string {
  return BASH_FALLBACK_BUCKETS[firstBashWord(cmd)] ?? 'generic'
}

/** Raw command text for the hover/title affordance (AC3 — dev debugging path
 *  stays available even though the primary label is always humanized now). */
export function rawBashCommand(input: unknown): string {
  const inp = (input && typeof input === 'object') ? (input as Record<string, unknown>) : {}
  return typeof inp.command === 'string' ? inp.command.trim() : ''
}
