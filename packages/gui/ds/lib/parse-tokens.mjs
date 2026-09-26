// ds/lib/parse-tokens.mjs — the ONE parser for the token file.
//
// Per T-659 Outcome §확정 DS HTML 생성 명세: "파서 · 테마 재방출 · 글꼴 부분집합은
// 한 모듈이고 T-665 뷰어 생성기가 같은 모듈로 제품의 얼굴을 입는다(파서가 둘이
// 되면 안 된다)" — a future viewer generator imports this module rather than
// re-implementing token parsing.
//
// Reads ONLY `code/packages/gui/src/styles/tokens.css` — never docs/design.md.

/** Strip `/* … *\/` comments (this file has no strings that contain `/*`). */
export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Find the body of the first rule whose opening looks like
 * `<selectorRegex> {`, via brace-depth matching (values in this file never
 * contain braces, so naive depth counting is exact).
 * @returns {{ body: string, afterIndex: number } | null}
 */
function extractRuleBody(css, selectorRegex) {
  const m = selectorRegex.exec(css)
  if (!m) return null
  const braceOpen = css.indexOf('{', m.index + m[0].length - 1)
  if (braceOpen === -1) throw new Error(`parse-tokens: no "{" found for ${selectorRegex}`)
  let depth = 0
  for (let i = braceOpen; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) {
        return { body: css.slice(braceOpen + 1, i), afterIndex: i + 1 }
      }
    }
  }
  throw new Error(`parse-tokens: unterminated rule body for ${selectorRegex}`)
}

/**
 * Parse a comment-stripped declaration-list body (`--name: value;` lines)
 * into an ordered Map, preserving source order.
 */
export function parseDeclarations(body) {
  const map = new Map()
  for (const stmt of body.split(';')) {
    const trimmed = stmt.trim()
    if (!trimmed) continue
    const m = trimmed.match(/^(--[a-zA-Z0-9-]+)\s*:\s*([\s\S]+)$/)
    if (!m) continue // not a custom-property declaration (defensive; none expected here)
    map.set(m[1].slice(2), m[2].trim())
  }
  return map
}

/** Map equality by key set + value-per-key (order-independent). */
function mapsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    if (!b.has(k) || b.get(k) !== v) return false
  }
  return true
}

function describeMapDiff(a, b) {
  const lines = []
  const allKeys = new Set([...a.keys(), ...b.keys()])
  for (const k of allKeys) {
    const av = a.get(k)
    const bv = b.get(k)
    if (av !== bv) lines.push(`  --${k}: ${av ?? '(missing)'} vs ${bv ?? '(missing)'}`)
  }
  return lines.join('\n')
}

/**
 * Find the "LEGACY ALIASES" comment marker in the RAW (comment-bearing)
 * source and return the set of token names declared after it, up to the
 * next `}` (the marker sits as the last group inside `:root { … }`, per the
 * token file's own authored structure — see tokens.css "LEGACY ALIASES").
 * Returns an empty Set if the marker is absent (degrades gracefully: those
 * tokens just render in their normal prefix group instead of the alias
 * section — never a generation failure).
 */
function findLegacyAliasNames(rawCss) {
  const idx = rawCss.indexOf('LEGACY ALIASES')
  if (idx === -1) return new Set()
  const rest = rawCss.slice(idx)
  const closeBrace = rest.indexOf('}')
  if (closeBrace === -1) return new Set()
  const block = stripComments(rest.slice(0, closeBrace))
  return new Set(parseDeclarations(block).keys())
}

/**
 * Build the dark + light token maps (RAW, i.e. still containing var()
 * chains — callers resolve those separately, see resolveVarChains) plus the
 * legacy-alias name set, from the full tokens.css source text.
 *
 * Runs the structural checks the spec requires ("오늘 실측 차이 0"): the
 * `@media (prefers-color-scheme: light)` value set must equal `.theme-light`,
 * and `.theme-dark` must equal the matching subset of `:root`. Either
 * mismatch throws — this IS "생성 실패", not a bug to route around.
 *
 * @param {string} rawCss
 * @returns {{ darkRaw: Map<string,string>, lightRaw: Map<string,string>, legacyAliasNames: Set<string> }}
 */
export function buildRawThemeMaps(rawCss) {
  const stripped = stripComments(rawCss)

  const darkRule = extractRuleBody(stripped, /:root[ \t\r\n]*\{/)
  if (!darkRule) throw new Error('parse-tokens: no bare ":root { … }" block found in tokens.css')
  const darkMap = parseDeclarations(darkRule.body)

  const mediaRule = extractRuleBody(stripped, /@media\s*\(\s*prefers-color-scheme:\s*light\s*\)[ \t\r\n]*\{/)
  if (!mediaRule) throw new Error('parse-tokens: no "@media (prefers-color-scheme: light)" block found')
  const mediaInner = extractRuleBody(mediaRule.body, /:root:not\(\.theme-dark\)[ \t\r\n]*\{/)
  if (!mediaInner) throw new Error('parse-tokens: no ":root:not(.theme-dark)" selector inside the light media query')
  const mediaLightMap = parseDeclarations(mediaInner.body)

  const themeLightRule = extractRuleBody(stripped, /:root\.theme-light[ \t\r\n]*\{/)
  if (!themeLightRule) throw new Error('parse-tokens: no ":root.theme-light { … }" block found')
  const themeLightMap = parseDeclarations(themeLightRule.body)

  const themeDarkRule = extractRuleBody(stripped, /:root\.theme-dark[ \t\r\n]*\{/)
  if (!themeDarkRule) throw new Error('parse-tokens: no ":root.theme-dark { … }" block found')
  const themeDarkMap = parseDeclarations(themeDarkRule.body)

  // Structural check 1: @media light must be byte-for-byte the same value
  // set as .theme-light (design.md §0.7 — class beats media, same values).
  if (!mapsEqual(mediaLightMap, themeLightMap)) {
    throw new Error(
      `ds generate: "@media (prefers-color-scheme: light)" and ":root.theme-light" disagree — generation refused.\n` +
        describeMapDiff(mediaLightMap, themeLightMap),
    )
  }

  // Structural check 2: .theme-dark must match the corresponding :root
  // (dark base) values wherever it redeclares a name.
  const darkSubset = new Map([...darkMap].filter(([k]) => themeDarkMap.has(k)))
  if (!mapsEqual(darkSubset, themeDarkMap)) {
    throw new Error(
      `ds generate: ":root.theme-dark" disagrees with ":root" (dark base) — generation refused.\n` +
        describeMapDiff(darkSubset, themeDarkMap),
    )
  }

  // lightRaw = dark base overridden by the light value set (mirrors the
  // cascade: dark declares everything once, light only overrides what
  // differs — radius/space/font tokens are never redeclared per theme).
  const lightRaw = new Map([...darkMap, ...mediaLightMap])

  const legacyAliasNames = findLegacyAliasNames(rawCss)

  return { darkRaw: darkMap, lightRaw, legacyAliasNames }
}

/**
 * Resolve every `var(--name[, fallback])` reference in a token map to its
 * final literal value, recursively, in the SAME map (so a light-theme alias
 * like `--accent: var(--brand-accent)` picks up that theme's own
 * `--brand-accent`). `color-mix()` calls are left as `color-mix()` — only
 * the `var()` references inside them are substituted, never evaluated —
 * per spec: "var() 연쇄는 생성 시점에 풀고, color-mix() 는 식 그대로 둔다".
 *
 * @param {Map<string,string>} rawMap
 * @returns {Map<string,string>}
 */
export function resolveVarChains(rawMap) {
  const resolved = new Map()
  const resolving = new Set()

  function resolveValue(name) {
    if (resolved.has(name)) return resolved.get(name)
    if (resolving.has(name)) {
      throw new Error(`ds generate: cyclic var() reference resolving --${name}`)
    }
    if (!rawMap.has(name)) {
      throw new Error(`ds generate: var(--${name}) references an undeclared token`)
    }
    resolving.add(name)
    const raw = rawMap.get(name)
    const out = raw.replace(/var\(\s*--([a-zA-Z0-9-]+)\s*(?:,[^)]*)?\)/g, (_match, refName) => resolveValue(refName))
    resolving.delete(name)
    resolved.set(name, out)
    return out
  }

  for (const name of rawMap.keys()) resolveValue(name)
  return resolved
}
