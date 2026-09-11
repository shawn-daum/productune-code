/**
 * Pinned-literal diagnostics — T-613.
 *
 * WHY: discipline prose IS the enforcement for text-only contracts, so the
 * tests pin load-bearing sentences verbatim. The failure mode measured three
 * rounds running (T-586 → T-610 → T-611 slice 1) is not the pin itself but
 * what it says when it breaks: `expected '…' to contain '…'` tells the reader
 * a string moved and nothing about what to do — so the pin gets "fixed" by the
 * cheapest route available, which is editing the discipline back or weakening
 * the assertion. Both are the wrong repair.
 *
 * WHAT THIS IS: a failure message that names the document, what the literal
 * was protecting, the nearest current line in that document (so the new
 * wording is visible without a second read), and the three legal repairs.
 *
 * WHAT THIS IS NOT: a fuzzy matcher. `pin()` is exact containment — it never
 * passes on a near match. The similarity scan runs only AFTER the assertion
 * has already failed, purely to print a hint.
 */

/** Tokens used for the "nearest line" hint only — never for matching. */
const words = (s: string): string[] => (s.toLowerCase().match(/[a-z0-9`~<>./_-]{3,}/g) ?? [])

/** Best-scoring line of `text` against `literal`, or null when nothing is close. */
export interface NearHit {
  line: number
  text: string
  score: number
}

export function nearestLine(text: string, literal: string): NearHit | null {
  const want = new Set(words(literal))
  if (want.size === 0) return null
  const lines = text.split('\n')
  let best: NearHit | null = null
  for (let i = 0; i < lines.length; i++) {
    const have = new Set(words(lines[i]))
    if (have.size === 0) continue
    let hit = 0
    for (const w of have) if (want.has(w)) hit++
    const score = hit / want.size
    if (best === null || score > best.score) best = { line: i + 1, text: lines[i], score }
  }
  return best !== null && best.score >= 0.3 ? best : null
}

const clip = (s: string, n = 400) => (s.length <= n ? s : `${s.slice(0, n)}…`)

export interface PinCtx {
  /** Repo-relative path of the document being pinned, for the message. */
  file: string
  /** What this literal protects — the rule, not the string. */
  protects: string
}

/**
 * Assert `literal` is present in `text`, with a message that says what to fix.
 * Throws (rather than `expect(...).toContain`) so the report carries the repair
 * note instead of a multi-kilobyte diff of the whole discipline file.
 */
export function pin(text: string, literal: string, ctx: PinCtx): void {
  if (text.includes(literal)) return
  const near = nearestLine(text, literal)
  throw new Error(
    [
      `pinned literal missing from ${ctx.file}`,
      `  protects: ${ctx.protects}`,
      `  pinned:   ${clip(literal)}`,
      near
        ? `  nearest:  ${ctx.file}:${near.line} (${Math.round(near.score * 100)}% overlap)\n            ${clip(near.text)}`
        : `  nearest:  no comparable line — the clause may have moved to another document entirely`,
      `  fix (pick one, and record which in the ticket):`,
      `    1. the rule still holds here → re-pin the literal to the wording above;`,
      `    2. the rule moved → move this pin to its new home and assert it is GONE from ${ctx.file} (no dual text);`,
      `    3. the rule was dropped on purpose → delete the pin and say why.`,
      `  NEVER edit a file under discipline/ to make this pass: the discipline text is the subject, this test is the instrument.`,
    ].join('\n'),
  )
}

/**
 * The other half of a move: assert the literal is GONE from the document it
 * left, so a copy left behind (dual text) fails loudly.
 */
export function pinAbsent(text: string, literal: string, ctx: PinCtx): void {
  if (!text.includes(literal)) return
  throw new Error(
    [
      `moved clause is still present in ${ctx.file} — dual text`,
      `  protects: ${ctx.protects}`,
      `  found:    ${clip(literal)}`,
      `  fix: delete the copy from ${ctx.file} (the clause lives in its new home), or, if it was moved BACK on purpose, move this pin with it.`,
    ].join('\n'),
  )
}
