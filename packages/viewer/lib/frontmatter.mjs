// viewer/lib/frontmatter.mjs — a deliberately NARROW YAML-frontmatter reader.
//
// This repo's frontmatter dialect (ticket / wiki `---\n...\n---` header) is a
// closed, disciplined subset per contracts §Tickets: flat scalars (bare or
// quoted strings, dates), inline arrays (`deps: ["T-1", "T-2"]`, `deps: []`),
// and block list arrays (`links:\n  - a\n  - b`). A handful of wiki pages also
// carry a nested MAPPING key (e.g. `single_site: {subject: [...], claim: [...]}`
// in docs/wiki/fact--gui-deferral.md) — the viewer never needs that shape's
// contents, so a nested value is captured as raw text rather than parsed.
//
// A general YAML engine (js-yaml / yaml) is not installable offline on this
// machine (no cached tarball, no network — measured 2026-09-26) and pulling
// one is out of this ticket's scope for a format this constrained; this
// parser covers every shape actually observed in docs/tickets, docs/wiki and
// docs/features (see viewer/lib/frontmatter.test.mjs fixtures drawn from
// real files) and degrades to raw text — never a throw — on anything it does
// not recognize, so an unusual page still renders (frontmatter-light) rather
// than breaking generation.

/** @returns {{ data: Record<string, unknown>, body: string }} */
export function parseFrontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!m) return { data: {}, body: raw }
  const body = raw.slice(m[0].length)
  const lines = m[1].split(/\r?\n/)
  const data = {}
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '' || /^\s*#/.test(line)) {
      i++
      continue
    }
    const km = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line)
    if (!km) {
      i++
      continue
    }
    const key = km[1]
    const rest = km[2]
    if (rest === '') {
      // Empty value: a block list, a nested mapping, or a true null/empty —
      // decided by what the following indented lines look like.
      let j = i + 1
      if (j < lines.length && /^\s*-\s?/.test(lines[j])) {
        const list = []
        while (j < lines.length && /^\s*-\s?/.test(lines[j])) {
          list.push(parseScalar(lines[j].replace(/^\s*-\s?/, '')))
          j++
        }
        data[key] = list
        i = j
        continue
      }
      if (j < lines.length && /^\s+\S/.test(lines[j])) {
        const rawLines = []
        while (j < lines.length && /^\s+\S/.test(lines[j])) {
          rawLines.push(lines[j])
          j++
        }
        data[key] = { __raw: rawLines.join('\n') }
        i = j
        continue
      }
      data[key] = null
      i++
      continue
    }
    if (rest.startsWith('[')) {
      let arrText = rest
      let j = i
      while (!balancedBrackets(arrText) && j + 1 < lines.length) {
        j++
        arrText += `\n${lines[j]}`
      }
      data[key] = parseInlineArray(arrText)
      i = j + 1
      continue
    }
    if (rest.startsWith('{')) {
      data[key] = { __raw: rest }
      i++
      continue
    }
    data[key] = parseScalar(rest)
    i++
  }
  return { data, body }
}

function balancedBrackets(s) {
  let depth = 0
  for (const ch of s) {
    if (ch === '[') depth++
    else if (ch === ']') depth--
  }
  return depth <= 0
}

function parseScalar(s) {
  const t = s.trim()
  if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
    return t.slice(1, -1)
  }
  return t
}

function parseInlineArray(s) {
  const inner = s.trim().replace(/^\[/, '').replace(/\]\s*$/, '')
  if (!inner.trim()) return []
  const parts = inner.match(/(?:[^,"']+|"[^"]*"|'[^']*')+/g) || []
  return parts.map((p) => parseScalar(p.trim())).filter((p) => p !== '')
}
