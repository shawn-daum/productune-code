// viewer/lib/docs-layout.mjs — JS port of the CLI's docs-layout seam
// (packages/core/scripts/prdt: docs_layout · project_products · current_product ·
// product_docs_dir · shared_docs_dir · docs_layer_chain · resolve_docs_ref ·
// resolve_docs_link · docs_as_is_rel). T-1104 part 2. Design:
// docs/artifacts/v1.14/product-first-docs-layout.html (② both layers read,
// product wins · ③ closed links).
//
// Two layouts, detected by `docs/_shared/` being a real directory (not a link):
//   product (To-Be) — product rows (prd · tickets · artifacts · DEPLOY.md ·
//     wiki/retro--v*.md) in `docs/<product>/`, the rest in `docs/_shared/`.
//   legacy (As-Is)  — no `docs/_shared/`: every helper returns the pre-v1.14
//     path, so single-product output is byte-identical.
// The shared vectors (packages/core/test/fixtures/docs-layout-vectors.json)
// pin this port to the CLI on the same inputs.
import fs from 'node:fs'
import path from 'node:path'

export const DOCS_SHARED = '_shared'
export const PRODUCT_DOCS_KINDS = ['prd', 'tickets', 'artifacts', 'DEPLOY.md']
// Same shape as the CLI's LINE_NAME_RE (`\Z` → `$`: no trailing-newline slack in JS).
// T-1215: top-level docs/ names the layout owns — keep in lockstep with PRODUCT_RESERVED_NAMES in prdt_lanes.py.
const PRODUCT_RESERVED_NAMES = ['prd', 'tickets', 'artifacts', 'wiki', 'features', 'archive', 'po', 'designer', 'developer', 'qa']
const LINE_NAME_RE = /^(?!v[0-9])(?!backlog$)[a-z0-9]+(?:-[a-z0-9]+)*$/

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}
const isRealDir = (p) => {
  try {
    return fs.lstatSync(p).isDirectory()
  } catch {
    return false
  }
}
const exists = (p) => {
  try {
    fs.statSync(p)
    return true
  } catch {
    return false
  }
}
const readJsonOrNull = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/** os.path.normpath for posix strings ('' and all-`..` collapse the same way). */
function normpath(p) {
  const out = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else out.push('..')
    } else out.push(seg)
  }
  return out.join('/') || '.'
}

/** A config `slug` as the `docs/<kebab>/` folder name — the CLI's `product_dir_name` (what `prdt init` scaffolds). */
export function productDirName(slug) {
  const k = String(slug ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (!LINE_NAME_RE.test(k)) return 'product'
  return PRODUCT_RESERVED_NAMES.includes(k) ? `${k}-product` : k
}

/** "product" when `docs/_shared/` is a real dir, else "legacy". */
export function docsLayout(root) {
  if (!root) return 'legacy'
  return isRealDir(path.join(root, 'docs', DOCS_SHARED)) ? 'product' : 'legacy'
}

/** Products, first (config `slug`) first, then `products[].name`, then any `docs/<kebab>/` holding prd/ or tickets/. [] in legacy. */
export function projectProducts(root) {
  if (docsLayout(root) !== 'product') return []
  const cfg = readJsonOrNull(path.join(root, '.prdt', 'config.json')) || {}
  const out = []
  const add = (n) => {
    if (typeof n === 'string' && LINE_NAME_RE.test(n) && !PRODUCT_RESERVED_NAMES.includes(n) && !out.includes(n)) out.push(n)
  }
  const isObj = cfg && typeof cfg === 'object' && !Array.isArray(cfg)
  add(isObj && typeof cfg.slug === 'string' && cfg.slug ? productDirName(cfg.slug) : null)
  const prods = isObj && Array.isArray(cfg.products) ? cfg.products : []
  for (const e of prods) add(e && typeof e === 'object' && !Array.isArray(e) ? e.name : null)
  let names = []
  try {
    names = fs.readdirSync(path.join(root, 'docs')).sort()
  } catch {
    names = []
  }
  for (const n of names) {
    const d = path.join(root, 'docs', n)
    if (isRealDir(d) && !n.startsWith('_') && !n.startsWith('.') && (isDir(path.join(d, 'prd')) || isDir(path.join(d, 'tickets')))) add(n)
  }
  return out
}

function productFromDocsPath(root, p, prods) {
  if (typeof p !== 'string' || !p) return null
  let s = p.split('#')[0]
  if (path.isAbsolute(s)) {
    const rel = path.relative(root, s)
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null
    s = rel
  }
  const parts = s.split(path.sep === '\\' ? /[\\/]/ : '/').filter((x) => x !== '' && x !== '.')
  return parts.length >= 2 && parts[0] === 'docs' && prods.includes(parts[1]) ? parts[1] : null
}

/** The product in focus: hint path → po-state `current_task.product` / `.path` → the first product. null in legacy. */
export function currentProduct(root, hint = null) {
  const prods = projectProducts(root)
  if (!prods.length) return null
  const fromHint = productFromDocsPath(root, hint, prods)
  if (fromHint) return fromHint
  const st = readJsonOrNull(path.join(root, '.prdt', 'po-state.json')) || {}
  const ct = st && typeof st === 'object' ? st.current_task : null
  if (ct && typeof ct === 'object' && !Array.isArray(ct)) {
    if (prods.includes(ct.product)) return ct.product
    const p = productFromDocsPath(root, ct.path, prods)
    if (p) return p
  }
  return prods[0]
}

/** `docs/<product>/` (product layout) or `docs/` (legacy), absolute. */
export function productDocsDir(root, product = null) {
  if (docsLayout(root) !== 'product') return path.join(root, 'docs')
  return path.join(root, 'docs', product || currentProduct(root) || DOCS_SHARED)
}

/** `docs/_shared/` (product layout) or `docs/` (legacy), absolute. */
export function sharedDocsDir(root) {
  return docsLayout(root) === 'product' ? path.join(root, 'docs', DOCS_SHARED) : path.join(root, 'docs')
}

/** Home of one fixed-path row; `kind` = first segment under docs/ in the As-Is layout. */
export function docsPath(root, kind, product = null) {
  return PRODUCT_DOCS_KINDS.includes(kind) ? path.join(productDocsDir(root, product), kind) : path.join(sharedDocsDir(root), kind)
}

/** [product file, _shared file] — the ones that exist (② both read, product wins). Legacy → [docs/<rel>]. */
export function docsLayerChain(root, rel, product = null) {
  if (docsLayout(root) !== 'product') {
    const p = path.join(root, 'docs', rel)
    return exists(p) ? [p] : []
  }
  return [path.join(productDocsDir(root, product), rel), path.join(sharedDocsDir(root), rel)].filter(exists)
}

/** A product-layout project that names no product, asked for a product path. */
export class DocsLayoutError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DocsLayoutError'
    this.code = 'no-product'
  }
}

/** The product a product-row path maps into; none → DocsLayoutError (never a `docs/undefined/…` path). */
function needProduct(root, rel, product = null) {
  const p = product || currentProduct(root)
  if (!p) {
    throw new DocsLayoutError(
      `cannot map ${rel}: docs/_shared/ exists but the project names no product — set \`slug\` in .prdt/config.json, or create docs/<product>/prd or docs/<product>/tickets`,
    )
  }
  return p
}

/** ③ An As-Is `docs/…` path → its To-Be path (project-relative posix). Unchanged for new-layout, non-docs, legacy. A product-row path with no product → DocsLayoutError. */
export function resolveDocsRef(root, rel, product = null) {
  if (typeof rel !== 'string' || docsLayout(root) !== 'product') return rel
  const parts = rel.split('/')
  if (parts.length < 2 || parts[0] !== 'docs') return rel
  const head = parts[1]
  const prods = projectProducts(root)
  if (head === DOCS_SHARED || prods.includes(head)) return rel
  const tail = parts.slice(1).join('/')
  if (PRODUCT_DOCS_KINDS.includes(head) || (head === 'wiki' && parts.length === 3 && parts[2].startsWith('retro--v'))) return `docs/${needProduct(root, rel, product)}/${tail}`
  if (head === 'wiki' || head === 'features') {
    const p = product || currentProduct(root)
    if (p && exists(path.join(root, 'docs', p, tail))) return `docs/${p}/${tail}`
  }
  return `docs/${DOCS_SHARED}/${tail}`
}

/**
 * A relative link written in a docs file → the project-relative posix path it
 * opens (null when it leaves the project). `baseDir` is project-relative or
 * absolute under root. A `docs/<p>/X` target that does not exist falls back to
 * `docs/_shared/X`; an As-Is `docs/…` result goes through `resolveDocsRef`.
 */
export function resolveDocsLink(root, baseDir, href, product = null) {
  if (typeof href !== 'string' || !href || href.includes('://') || href.startsWith('#') || href.startsWith('/')) return null
  const target = href.split('#')[0]
  let baseRel
  if (path.isAbsolute(baseDir)) {
    const rel = path.relative(root, baseDir)
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null
    baseRel = rel.split(path.sep).join('/')
  } else baseRel = baseDir
  const joined = normpath(`${baseRel}/${target}`)
  if (joined.startsWith('..') || path.isAbsolute(joined)) return null
  return mapJoinedDocsPath(root, joined, product)
}

/** The layout step of `resolveDocsLink` on an already-joined project-relative path. */
export function mapJoinedDocsPath(root, joined, product = null) {
  if (docsLayout(root) !== 'product') return joined
  const prods = projectProducts(root)
  const parts = joined.split('/')
  if (parts.length >= 3 && parts[0] === 'docs' && prods.includes(parts[1])) {
    if (!exists(path.join(root, joined))) {
      const alt = `docs/${DOCS_SHARED}/${parts.slice(2).join('/')}`
      if (exists(path.join(root, alt))) return alt
    }
    return joined
  }
  return resolveDocsRef(root, joined, product)
}

/** Inverse view: To-Be `docs/<p>/X` or `docs/_shared/X` → `docs/X`. */
export function docsAsIsRel(root, rel) {
  if (typeof rel !== 'string' || docsLayout(root) !== 'product') return rel
  const parts = rel.split('/')
  if (parts.length >= 3 && parts[0] === 'docs' && (parts[1] === DOCS_SHARED || projectProducts(root).includes(parts[1]))) return `docs/${parts.slice(2).join('/')}`
  return rel
}

/**
 * Bound view of one repo's layout for the collector and the renderer. Products
 * and the layout are fixed at creation (one generation = one disk snapshot).
 */
export function createDocsLayout(root, forProduct = null) {
  const layout = docsLayout(root)
  const products = projectProducts(root)
  // T-1108: `forProduct` binds the view to one added product (its own `docs/<product>/…`), never the first.
  const product = layout === 'product' ? forProduct || currentProduct(root) : null
  const rel = (abs) => path.relative(root, abs).split(path.sep).join('/')
  return {
    root,
    layout,
    products,
    product,
    /** Absolute dir of a product-row kind (`prd` · `tickets` · `artifacts`) or a shared one (`wiki` · `features`). */
    dir: (kind) => docsPath(root, kind, product),
    /** Project-relative posix form of {@link dir}. */
    relDir: (kind) => rel(docsPath(root, kind, product)),
    /** Read-order chain of a layered dir: absolute dirs, product first, then _shared (legacy: one). */
    layerDirs: (kind) => (layout === 'product' ? [path.join(productDocsDir(root, product), kind), path.join(sharedDocsDir(root), kind)] : [path.join(root, 'docs', kind)]),
    resolveRef: (r) => resolveDocsRef(root, r, product),
    mapJoined: (j) => mapJoinedDocsPath(root, j, product),
    asIsRel: (r) => docsAsIsRel(root, r),
  }
}
