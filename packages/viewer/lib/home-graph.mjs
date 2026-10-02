// viewer/lib/home-graph.mjs — the pure logic behind Home 「현재 버전」 (T-881,
// design T-796 / T-865). No markup and no user-visible string lives here: the
// functions return numbers, ids and class keys, and render.mjs draws them with
// the labels from labels.mjs.
//
// What this answers, from the current version's ticket frontmatter alone:
//   - which stage segment each ticket sits in (stage bar)
//   - which tickets are the 메인 패스 (the open tickets that lead to the gate
//     ticket) and which is the 크리티컬 패스 (the longest dependency chain)
//   - where each node and arrow goes (column = dependency depth, row = a
//     barycenter sweep, so a plain chain stays one straight lane)
//   - the decision / user-task wait lists

export const HOME_STAGES = ['define', 'build', 'ship', 'retro']

// PRD v1.12 §home-progress: 설계 · 결정 티켓은 define, 배포와 배포 전 점검 ·
// 배포 뒤 확인(qa · ops)은 ship, 구현(and any other type) 은 build; retro 는
// 티켓이 없다. A ticket has no stage field, so the stage bar reads the type.
const DEFINE_TYPES = new Set(['design', 'decision'])
const SHIP_TYPES = new Set(['qa', 'ops'])

export function stageOfTicketType(type) {
  if (DEFINE_TYPES.has(type)) return 'define'
  if (SHIP_TYPES.has(type)) return 'ship'
  return 'build'
}

export function ticketNumber(id) {
  const m = /(\d+)\s*$/.exec(String(id || ''))
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER
}

export function compareTicketIds(a, b) {
  const d = ticketNumber(a) - ticketNumber(b)
  return d !== 0 ? d : String(a).localeCompare(String(b))
}

/** `deps` frontmatter → ids (array, a bare string, or empty/null). */
export function ticketDeps(fm) {
  const raw = fm && fm.deps
  if (Array.isArray(raw)) return raw.map((d) => String(d).trim()).filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()]
  return []
}

/**
 * Stage bar segments: `{stage, tickets:[{id, done}]}` for the four stages, each
 * segment listing finished tickets first then open ones, by ticket number.
 * Only open + done tickets are counted (the same set as the statusline's
 * done/total — `versionProgressCounts`).
 */
export function stageSegments(currentTickets) {
  const counted = currentTickets.filter((t) => t.frontmatter.status === 'open' || t.frontmatter.status === 'done')
  return HOME_STAGES.map((stage) => {
    const inStage = counted.filter((t) => stage !== 'retro' && stageOfTicketType(t.frontmatter.type) === stage)
    const mk = (t) => ({ id: t.frontmatter.id, done: t.frontmatter.status === 'done' })
    const done = inStage.filter((t) => t.frontmatter.status === 'done').map(mk).sort((a, b) => compareTicketIds(a.id, b.id))
    const open = inStage.filter((t) => t.frontmatter.status === 'open').map(mk).sort((a, b) => compareTicketIds(a.id, b.id))
    return { stage, tickets: [...done, ...open] }
  })
}

/**
 * The gate (합격선) ticket: the live current-version ticket whose body names the
 * artifact path the PRD 합격선 row names. Null when the PRD names none or no
 * live ticket carries it — the screen then says the main path is not connected.
 *
 * Only open + done tickets count (a dropped ticket is no gate). Several tickets
 * may merely mention the path (a follow-up, a note); the gate is the one at the
 * end of the longest dependency chain of the version's work — the mention with
 * the most work behind it — so a later ticket with no work behind it never
 * displaces it. Ties fall to the higher ticket number (T-914).
 */
export function findGateTicket(currentTickets, gatePath) {
  if (!gatePath) return null
  const live = currentTickets.filter((t) => t.frontmatter.status === 'open' || t.frontmatter.status === 'done')
  const hits = live.filter((t) => typeof t.body === 'string' && t.body.includes(gatePath))
  if (hits.length === 0) return null
  const ids = live.map((t) => t.frontmatter.id)
  const preds = new Map(live.map((t) => [t.frontmatter.id, ticketDeps(t.frontmatter)]))
  const { memo } = longestEndingAt(ids, preds)
  return hits
    .slice()
    .sort((a, b) => (memo.get(a.frontmatter.id) || 0) - (memo.get(b.frontmatter.id) || 0) || compareTicketIds(a.frontmatter.id, b.frontmatter.id))
    .pop()
}

/** Longest chain (node count) ending at each id of `ids`, over `preds` (id → ids), cycle-safe. */
function longestEndingAt(ids, preds) {
  const memo = new Map()
  const stack = new Set()
  const best = new Map() // id → chosen predecessor on the longest chain
  const idSet = new Set(ids)
  const walk = (id) => {
    if (memo.has(id)) return memo.get(id)
    if (stack.has(id)) return 0 // a cycle: ignore the edge that closes it
    stack.add(id)
    let len = 1
    let pick = null
    for (const p of (preds.get(id) || []).filter((x) => idSet.has(x)).sort(compareTicketIds)) {
      const l = walk(p) + 1
      if (l > len) {
        len = l
        pick = p
      }
    }
    stack.delete(id)
    memo.set(id, len)
    best.set(id, pick)
    return len
  }
  for (const id of ids) walk(id)
  return { memo, best }
}

/** One longest chain (ids, source first) inside `ids`; `prefer` breaks ties toward those ids. */
function longestChain(ids, preds, prefer = new Set()) {
  if (ids.length === 0) return []
  const { memo, best } = longestEndingAt(ids, preds)
  const ends = [...ids].sort((a, b) => memo.get(b) - memo.get(a) || (prefer.has(b) ? 1 : 0) - (prefer.has(a) ? 1 : 0) || compareTicketIds(a, b))
  const chain = []
  const seen = new Set()
  for (let cur = ends[0]; cur && !seen.has(cur); cur = best.get(cur)) {
    seen.add(cur)
    chain.push(cur)
  }
  return chain.reverse()
}

/**
 * The home graph model.
 *   tickets      current-version tickets (any status), full frontmatter + body
 *   gatePath     the artifact path the PRD 합격선 row names (or '')
 *   riderKey     the `prd_item` key whose tickets are riders
 * Returns `{ connected, nodes, edges, spine:Set, cp:Set, cpIsSpine, empty }`
 * where `nodes` are the open tickets (plus the finished direct dependencies of
 * open tickets that are not on the route), and `edges` run dependency → ticket.
 */
export function buildHomeGraph({ tickets, gatePath = '', riderKey = 'riders' }) {
  const byId = new Map(tickets.map((t) => [t.frontmatter.id, t]))
  const open = tickets.filter((t) => t.frontmatter.status === 'open').map((t) => t.frontmatter.id).sort(compareTicketIds)
  const openSet = new Set(open)
  const preds = new Map(open.map((id) => [id, ticketDeps(byId.get(id).frontmatter).filter((d) => openSet.has(d))]))

  const gate = findGateTicket(tickets, gatePath)
  const gateId = gate ? gate.frontmatter.id : null
  const connected = !!gate && ticketDeps(gate.frontmatter).length > 0

  // 메인 패스: the open tickets the gate transitively waits on (the gate included while open).
  const spine = new Set()
  if (connected) {
    const visit = (id) => {
      if (spine.has(id) || !openSet.has(id)) return
      spine.add(id)
      for (const p of preds.get(id)) visit(p)
    }
    visit(gateId)
  }

  const spineIds = [...spine]
  const spineLen = longestChain(spineIds, preds).length
  const globalChain = longestChain(open, preds, spine)
  // A 메인 패스 at least as long as the longest chain IS the 크리티컬 패스 (the
  // longest chain by definition): the two draw as one route (T-796, 2026-10-01).
  const cpIsSpine = spine.size > 0 && spineLen >= globalChain.length
  const cpChain = cpIsSpine ? longestChain(spineIds, preds) : globalChain
  const cp = new Set(cpChain)
  const route = new Set([...spine, ...cp])

  const drawn = connected && spine.size > 0 ? new Set(open) : new Set(cpChain)
  // Finished direct dependencies of drawn open tickets off the route show as ✓ nodes.
  const doneNodes = new Set()
  if (connected && spine.size > 0) {
    for (const id of open) {
      if (route.has(id)) continue
      for (const d of ticketDeps(byId.get(id).frontmatter)) {
        const dt = byId.get(d)
        if (dt && dt.frontmatter.status === 'done') doneNodes.add(d)
      }
    }
  }
  const all = [...drawn, ...doneNodes]
  const idsDrawn = new Set(all)
  const edges = []
  for (const id of all) {
    for (const d of ticketDeps(byId.get(id).frontmatter)) {
      if (idsDrawn.has(d) && d !== id) edges.push({ from: d, to: id })
    }
  }
  const nodes = all.sort(compareTicketIds).map((id) => {
    const fm = byId.get(id).frontmatter
    const prd = typeof fm.prd_item === 'string' ? fm.prd_item : ''
    const hash = prd.indexOf('#')
    const key = hash === -1 ? '' : prd.slice(hash + 1)
    return {
      id,
      slug: fm.slug || '',
      assignee: fm.assignee || '',
      status: fm.status,
      done: fm.status === 'done',
      gate: id === gateId && spine.has(id),
      sp: spine.has(id),
      cp: cp.has(id) && (!cpIsSpine || spine.has(id)),
      rider: key === riderKey && !spine.has(id),
      // a ticket the user must answer or do: an open decision, or open assignee: user
      waits: fm.status === 'open' && (fm.type === 'decision' || fm.assignee === 'user'),
    }
  })
  return { connected, nodes, edges, spine, cp, cpIsSpine, empty: open.length === 0 }
}

// ---------- layout ----------
export const NODE_W = 112
export const NODE_H = 40
export const COL_PITCH = 140
/** Per extra edge into one node: the gap between neighbouring vertical channels. */
const CHANNEL_STEP = 7
const CHANNEL_LEAD = 12
export const ROW_PITCH = 72
const PAD_X = 6
const PAD_TOP = 36

/** Weakly connected components, each `{ids}`, in the order of their smallest member. */
function components(ids, edges) {
  const parent = new Map(ids.map((i) => [i, i]))
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)))
      x = parent.get(x)
    }
    return x
  }
  for (const e of edges) parent.set(find(e.from), find(e.to))
  const groups = new Map()
  for (const i of ids) {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(i)
  }
  return [...groups.values()].map((g) => g.sort(compareTicketIds))
}

/** Column (dependency depth) and row for the members of one component. */
function layoutComponent(ids, edges, priority) {
  const set = new Set(ids)
  const preds = new Map(ids.map((i) => [i, []]))
  for (const e of edges) if (set.has(e.from) && set.has(e.to)) preds.get(e.to).push(e.from)
  const col = new Map()
  const stack = new Set()
  const depth = (id) => {
    if (col.has(id)) return col.get(id)
    if (stack.has(id)) return 0
    stack.add(id)
    let d = 0
    for (const p of preds.get(id)) d = Math.max(d, depth(p) + 1)
    stack.delete(id)
    col.set(id, d)
    return d
  }
  for (const id of ids) depth(id)
  const maxCol = Math.max(...ids.map((i) => col.get(i)))
  const row = new Map()
  let rows = 0
  for (let c = 0; c <= maxCol; c++) {
    const here = ids.filter((i) => col.get(i) === c)
    const want = (id) => {
      const ps = preds.get(id).filter((p) => row.has(p))
      return ps.length === 0 ? Infinity : ps.reduce((s, p) => s + row.get(p), 0) / ps.length
    }
    here.sort((a, b) => (priority(b) - priority(a)) * (c === 0 ? 1 : 0) || want(a) - want(b) || compareTicketIds(a, b))
    let prev = -1
    for (const id of here) {
      const w = want(id)
      const r = Math.max(prev + 1, w === Infinity ? prev + 1 : Math.round(w))
      row.set(id, r)
      prev = r
    }
    rows = Math.max(rows, prev + 1)
  }
  return { col, row, cols: maxCol + 1, rows }
}

/**
 * Positions for `graph.nodes`. The 메인 패스 lanes sit on top, then the other
 * chains; single-ticket lanes pack into columns to the right so the diagram
 * stays as tall as its chains. Returns `{ nodes:[{...node, x, y}], edges:[{...edge, d}], width, height }`.
 */
export function layoutHomeGraph(graph) {
  const ids = graph.nodes.map((n) => n.id)
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const priority = (id) => (byId.get(id).sp ? 2 : byId.get(id).cp ? 1 : 0)
  const comps = components(ids, graph.edges)
  const rank = (g) => Math.max(...g.map(priority)) * 1000 + g.length
  const multi = comps.filter((g) => g.length > 1).sort((a, b) => rank(b) - rank(a) || compareTicketIds(a[0], b[0]))
  const singles = comps.filter((g) => g.length === 1).map((g) => g[0]).sort((a, b) => priority(b) - priority(a) || compareTicketIds(a, b))

  const pos = new Map()
  let rowBase = 0
  let maxCol = 0
  for (const g of multi) {
    const lay = layoutComponent(g, graph.edges, priority)
    for (const id of g) pos.set(id, { col: lay.col.get(id), row: rowBase + lay.row.get(id) })
    rowBase += lay.rows
    maxCol = Math.max(maxCol, lay.cols - 1)
  }
  const mainRows = Math.max(rowBase, singles.length > 0 && multi.length === 0 ? Math.min(singles.length, 6) : 0)
  const perCol = Math.max(mainRows, 1)
  const startCol = multi.length > 0 ? maxCol + 1 : 0
  singles.forEach((id, i) => pos.set(id, { col: startCol + Math.floor(i / perCol), row: i % perCol }))

  const cols = Math.max(...[...pos.values()].map((p) => p.col)) + 1
  const rows = Math.max(...[...pos.values()].map((p) => p.row)) + 1
  // A node with many incoming edges needs one vertical channel per edge in the gap
  // before its column; widen the column pitch until every channel clears the source column.
  const fanIn = new Map()
  for (const e of graph.edges) fanIn.set(e.to, (fanIn.get(e.to) || 0) + 1)
  const maxIn = Math.max(1, ...fanIn.values())
  const pitch = Math.max(COL_PITCH, NODE_W + CHANNEL_LEAD + CHANNEL_STEP * (maxIn - 1) + 2 * 5 + 6)
  const nodes = graph.nodes.map((n) => ({ ...n, x: PAD_X + pos.get(n.id).col * pitch, y: PAD_TOP + pos.get(n.id).row * ROW_PITCH }))
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // arrows: leave the right edge, enter the left edge; ports of one node fan out evenly
  const outs = new Map()
  const ins = new Map()
  for (const e of graph.edges) {
    if (!outs.has(e.from)) outs.set(e.from, [])
    if (!ins.has(e.to)) ins.set(e.to, [])
    outs.get(e.from).push(e)
    ins.get(e.to).push(e)
  }
  const port = (list, e, node) => {
    const sorted = list.slice().sort((a, b) => nodeById.get(a.from).y - nodeById.get(b.from).y || nodeById.get(a.to).y - nodeById.get(b.to).y || compareTicketIds(a.from, b.from))
    const i = sorted.indexOf(e)
    return node.y + NODE_H / 2 + (i - (sorted.length - 1) / 2) * 6.7
  }
  const R = 5
  const edges = graph.edges.map((e) => {
    const a = nodeById.get(e.from)
    const b = nodeById.get(e.to)
    const sx = a.x + NODE_W
    const sy = port(outs.get(e.from), e, a)
    const tx = b.x
    const ty = port(ins.get(e.to), e, b)
    const incoming = ins.get(e.to).slice().sort((p, q) => nodeById.get(p.from).y - nodeById.get(q.from).y)
    const mx = tx - CHANNEL_LEAD - CHANNEL_STEP * (incoming.length - 1 - incoming.indexOf(e))
    const fx = (n) => Number(n.toFixed(1))
    let d
    if (Math.abs(sy - ty) < 0.05 || tx - sx < 2 * R + 2) {
      d = `M${fx(sx)},${fx(sy)} L${fx(tx)},${fx(ty)}`
    } else {
      const dir = ty > sy ? 1 : -1
      d =
        `M${fx(sx)},${fx(sy)} L${fx(mx - R)},${fx(sy)} Q${fx(mx)},${fx(sy)} ${fx(mx)},${fx(sy + dir * R)} ` +
        `L${fx(mx)},${fx(ty - dir * R)} Q${fx(mx)},${fx(ty)} ${fx(mx + R)},${fx(ty)} L${fx(tx)},${fx(ty)}`
    }
    const bothSpine = graph.spine.has(e.from) && graph.spine.has(e.to)
    return { ...e, d, sp: bothSpine, cp: graph.cp.has(e.from) && graph.cp.has(e.to) && !bothSpine }
  })
  return { nodes, edges, width: PAD_X * 2 + (cols - 1) * pitch + NODE_W, height: PAD_TOP + (rows - 1) * ROW_PITCH + NODE_H + 8 }
}

// ---------- wait lists ----------
/**
 * The decision and user-task wait lists, by the T-849 rule the statusline
 * `dec` / `req` uses: `dec` = every open `type: decision` ticket, `req` = every
 * open `assignee: user` ticket that is not a decision — across every version
 * directory, not only the current one (backlog is not a version directory).
 * `rows` is `[{ bucket, fm }]` for every ticket of every bucket.
 */
export function waitLists(rows) {
  const open = rows.filter((r) => r.bucket !== 'backlog' && r.fm.status === 'open')
  const pick = (pred) => open.filter((r) => pred(r.fm)).map((r) => r.fm).sort((a, b) => compareTicketIds(a.id, b.id))
  return {
    dec: pick((fm) => fm.type === 'decision'),
    req: pick((fm) => fm.assignee === 'user' && fm.type !== 'decision'),
  }
}
