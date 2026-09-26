// ds/lib/color.mjs — color parsing + WCAG contrast math for the generated DS HTML.
//
// Scope: only the color forms that actually occur in
// `code/packages/gui/src/styles/tokens.css` after var() chains are resolved
// (hex #rgb/#rrggbb/#rrggbbaa, rgb()/rgba(), `transparent`, and
// `color-mix(in srgb, <color> P%, <color>[ P%])` with the color args already
// var()-free). This is not a general CSS color parser.

/** @typedef {{ r: number, g: number, b: number, a: number }} RGBA r/g/b in 0..255, a in 0..1 */

/** Split a color-mix() argument list on top-level commas (parens-depth aware). */
function splitTopLevel(str) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(str.slice(start, i))
      start = i + 1
    }
  }
  parts.push(str.slice(start))
  return parts.map((s) => s.trim())
}

/**
 * Parse a CSS color literal into RGBA (0..255 / 0..1). Returns null if the
 * string is not a color this generator needs to render (e.g. it is itself a
 * dimension like `4px` — callers only invoke this on tokens known to be
 * colors).
 * @param {string} raw
 * @returns {RGBA | null}
 */
export function parseColor(raw) {
  const str = raw.trim()
  if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

  const hex = str.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('')
    }
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return { r, g, b, a }
  }

  const rgb = str.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/i)
  if (rgb) {
    return {
      r: parseFloat(rgb[1]),
      g: parseFloat(rgb[2]),
      b: parseFloat(rgb[3]),
      a: rgb[4] !== undefined ? parseFloat(rgb[4]) : 1,
    }
  }

  const mix = str.match(/^color-mix\(\s*in\s+srgb\s*,\s*(.+)\)$/i)
  if (mix) {
    const [stop1, stop2] = splitTopLevel(mix[1])
    if (!stop1 || !stop2) return null
    const parseStop = (stop) => {
      const m = stop.match(/^(.*?)(?:\s+([\d.]+)%)?$/)
      const colorStr = (m ? m[1] : stop).trim()
      const pct = m && m[2] !== undefined ? parseFloat(m[2]) : undefined
      return { color: parseColor(colorStr), pct }
    }
    const s1 = parseStop(stop1)
    const s2 = parseStop(stop2)
    if (!s1.color || !s2.color) return null
    let p1 = s1.pct
    let p2 = s2.pct
    if (p1 === undefined && p2 === undefined) {
      p1 = 50
      p2 = 50
    } else if (p1 === undefined) {
      p1 = 100 - p2
    } else if (p2 === undefined) {
      p2 = 100 - p1
    }
    return mixColors(s1.color, p1, s2.color, p2)
  }

  return null
}

/** CSS Color 4 rectangular (non-hue) color-mix, premultiplied-alpha. */
function mixColors(c1, p1, c2, p2) {
  const w1 = p1 / 100
  const w2 = p2 / 100
  const a1 = c1.a * w1
  const a2 = c2.a * w2
  const aOut = a1 + a2
  if (aOut <= 0) return { r: 0, g: 0, b: 0, a: 0 }
  const r = (c1.r * a1 + c2.r * a2) / aOut
  const g = (c1.g * a1 + c2.g * a2) / aOut
  const b = (c1.b * a1 + c2.b * a2) / aOut
  return {
    r: clamp255(r),
    g: clamp255(g),
    b: clamp255(b),
    a: Math.min(1, Math.max(0, aOut)),
  }
}

function clamp255(v) {
  return Math.min(255, Math.max(0, v))
}

/** Alpha-composite a (possibly translucent) color over an opaque background. */
export function compositeOver(fg, bg) {
  const a = fg.a
  return {
    r: clamp255(fg.r * a + bg.r * (1 - a)),
    g: clamp255(fg.g * a + bg.g * (1 - a)),
    b: clamp255(fg.b * a + bg.b * (1 - a)),
    a: 1,
  }
}

function relLuminance({ r, g, b }) {
  const chan = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
}

/** WCAG 2.x contrast ratio between two OPAQUE colors. */
export function contrastRatio(c1, c2) {
  const l1 = relLuminance(c1)
  const l2 = relLuminance(c2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Render an sRGB color back to a `#rrggbb` (or `#rrggbbaa`) string, for
 * display / composited swatches. Rounds to the nearest integer channel.
 */
export function toHex({ r, g, b, a = 1 }) {
  const ch = (v) => Math.round(clamp255(v)).toString(16).padStart(2, '0')
  return a >= 1 ? `#${ch(r)}${ch(g)}${ch(b)}` : `#${ch(r)}${ch(g)}${ch(b)}${ch(a * 255)}`
}

/**
 * Contrast verdict text for a token value shown against a theme's
 * `--bg-surface-base`, per T-659 Outcome §생성 명세 ("칸마다 … --bg-surface-base
 * 대비 · 4.5/3 판정"). Translucent values are alpha-composited over the base
 * first so every token — text, tint, or fill alike — gets one uniform rule.
 */
export function contrastVerdict(tokenRaw, baseOpaqueColor) {
  const parsed = parseColor(tokenRaw)
  if (!parsed) return null
  const opaque = parsed.a < 1 ? compositeOver(parsed, baseOpaqueColor) : parsed
  const ratio = contrastRatio(opaque, baseOpaqueColor)
  const rounded = Math.round(ratio * 100) / 100
  let verdict
  if (ratio >= 4.5) verdict = '4.5:1 AA (text)'
  else if (ratio >= 3) verdict = '3:1 (large text / UI only)'
  else verdict = 'Fail (< 3:1)'
  return { ratio: rounded, verdict, effective: opaque }
}
