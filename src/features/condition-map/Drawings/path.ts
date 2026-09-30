/**
 * A tiny path builder for the condition-map drawings.
 *
 * Panels must tile the body with no gaps, so neighbouring panels have to
 * share an edge with the exact same numbers. Edges are built once as a start
 * point plus segments, then a panel is a ring of edges walked forwards or
 * reversed (`rev`). Everything is formatted to one decimal.
 */

import { type DrawingPanel, type DrawingView, mirrorPanel, type Panel } from '../Lib/drawingTypes'

export type Pt = readonly [number, number]

export type Seg =
  | { k: 'L'; to: Pt }
  | { k: 'Q'; c: Pt; to: Pt }
  | { k: 'C'; c1: Pt; c2: Pt; to: Pt }
  | { k: 'A'; r: number; large: 0 | 1; sweep: 0 | 1; to: Pt }

export interface Edge {
  from: Pt
  segs: Seg[]
}

export const L = (to: Pt): Seg => ({ k: 'L', to })
export const Q = (c: Pt, to: Pt): Seg => ({ k: 'Q', c, to })
export const C = (c1: Pt, c2: Pt, to: Pt): Seg => ({ k: 'C', c1, c2, to })
/** Circular arc of radius `r` to `to`; sweep 1 is clockwise on screen. */
export const A = (r: number, sweep: 0 | 1, to: Pt, large: 0 | 1 = 0): Seg => ({
  k: 'A',
  r,
  large,
  sweep,
  to,
})

/** An edge from `from` through the segments; bare points are straight lines. */
export function edge(from: Pt, ...parts: (Seg | Pt)[]): Edge {
  return {
    from,
    segs: parts.map((p) => (Array.isArray(p) ? L(p as Pt) : (p as Seg))),
  }
}

export function endOf(e: Edge): Pt {
  return e.segs.length ? e.segs[e.segs.length - 1].to : e.from
}

/** The same edge walked the other way. */
export function rev(e: Edge): Edge {
  const pts: Pt[] = [e.from, ...e.segs.map((s) => s.to)]
  const segs: Seg[] = []
  for (let i = e.segs.length - 1; i >= 0; i--) {
    const s = e.segs[i]
    const to = pts[i]
    if (s.k === 'L') segs.push(L(to))
    else if (s.k === 'Q') segs.push(Q(s.c, to))
    else if (s.k === 'C') segs.push(C(s.c2, s.c1, to))
    else segs.push(A(s.r, s.sweep ? 0 : 1, to, s.large))
  }
  return { from: pts[pts.length - 1], segs }
}

export const n = (v: number): string => {
  const r = Math.round(v * 10) / 10
  return Object.is(r, -0) ? '0' : String(r)
}
const pt = (p: Pt) => `${n(p[0])} ${n(p[1])}`

function segText(s: Seg): string {
  switch (s.k) {
    case 'L':
      return `L${pt(s.to)}`
    case 'Q':
      return `Q${pt(s.c)} ${pt(s.to)}`
    case 'C':
      return `C${pt(s.c1)} ${pt(s.c2)} ${pt(s.to)}`
    case 'A':
      return `A${n(s.r)} ${n(s.r)} 0 ${s.large} ${s.sweep} ${pt(s.to)}`
  }
}

function walk(edges: Edge[], close: boolean): string {
  const out: string[] = [`M${pt(edges[0].from)}`]
  let cur = edges[0].from
  for (const e of edges) {
    if (Math.abs(e.from[0] - cur[0]) > 0.05 || Math.abs(e.from[1] - cur[1]) > 0.05) {
      throw new Error(`edge does not continue from ${pt(cur)} (starts at ${pt(e.from)})`)
    }
    for (const s of e.segs) out.push(segText(s))
    cur = endOf(e)
  }
  if (close) out.push('Z')
  return out.join(' ')
}

/** A closed panel outline from a ring of edges. */
export const ring = (...edges: Edge[]): string => walk(edges, true)
/** An open detail stroke. */
export const stroke = (...edges: Edge[]): string => walk(edges, false)

export const panel = (id: Panel, ...edges: Edge[]): DrawingPanel => ({ id, d: ring(...edges) })

/** A full circle as a panel path. */
export function circle(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)} A${n(r)} ${n(r)} 0 1 1 ${n(cx + r)} ${n(cy)} A${n(r)} ${n(r)} 0 1 1 ${n(cx - r)} ${n(cy)} Z`
}

/** Rounded rectangle, corner radius `r`, as a closed path. */
export function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2)
  return ring(
    edge(
      [x + rr, y],
      [x + w - rr, y],
      Q([x + w, y], [x + w, y + rr]),
      [x + w, y + h - rr],
      Q([x + w, y + h], [x + w - rr, y + h]),
      [x + rr, y + h],
      Q([x, y + h], [x, y + h - rr]),
      [x, y + rr],
      Q([x, y], [x + rr, y])
    )
  )
}

/** Where a wheel arch of radius `ar` around (cx, cy) meets the body bottom `y`. */
export function archEnds(cx: number, cy: number, ar: number, y: number): [number, number] {
  const dx = Math.sqrt(ar * ar - (y - cy) * (y - cy))
  return [cx - dx, cx + dx]
}

/** A wheel: the tyre as a panel, the rim and hub as lines. Same on every body. */
export function wheel(
  id: Panel,
  cx: number,
  cy: number,
  r: number
): { panel: DrawingPanel; lines: string[] } {
  return {
    panel: { id, d: circle(cx, cy, r) },
    lines: [circle(cx, cy, r * 0.62), circle(cx, cy, r * 0.16)],
  }
}

// ---- Path string transforms -------------------------------------------------

type Tok = { cmd: string; nums: number[] }

export function tokenize(d: string): Tok[] {
  const out: Tok[] = []
  const re = /([MLCQAZ])|(-?\d+(?:\.\d+)?)/gi
  let cur: Tok | null = null
  for (const m of d.matchAll(re)) {
    if (m[1]) {
      cur = { cmd: m[1].toUpperCase(), nums: [] }
      out.push(cur)
    } else if (cur) cur.nums.push(Number(m[2]))
  }
  return out
}

function emit(toks: Tok[]): string {
  return toks
    .map((t) => {
      if (t.cmd === 'A') {
        const [rx, ry, rot, large, sweep, x, y] = t.nums
        return `A${n(rx)} ${n(ry)} ${n(rot)} ${large} ${sweep} ${n(x)} ${n(y)}`
      }
      if (t.cmd === 'Z') return 'Z'
      const pairs: string[] = []
      for (let i = 0; i < t.nums.length; i += 2) pairs.push(`${n(t.nums[i])} ${n(t.nums[i + 1])}`)
      return `${t.cmd}${pairs.join(' ')}`
    })
    .join(' ')
}

/** Apply a point transform to every coordinate; arcs flip their sweep when mirrored. */
export function transform(d: string, fn: (x: number, y: number) => Pt, mirrored = false): string {
  return emit(
    tokenize(d).map((t) => {
      if (t.cmd === 'A') {
        const [rx, ry, rot, large, sweep, x, y] = t.nums
        const [nx, ny] = fn(x, y)
        return { cmd: 'A', nums: [rx, ry, rot, large, mirrored ? 1 - sweep : sweep, nx, ny] }
      }
      if (t.cmd === 'Z') return t
      const nums: number[] = []
      for (let i = 0; i < t.nums.length; i += 2) nums.push(...fn(t.nums[i], t.nums[i + 1]))
      return { cmd: t.cmd, nums }
    })
  )
}

export const flipX = (d: string, axis = 500) => transform(d, (x, y) => [2 * axis - x, y], true)
export const flipY = (d: string, axis = 500) => transform(d, (x, y) => [x, 2 * axis - y], true)
export const translate = (d: string, dx: number, dy: number) =>
  transform(d, (x, y) => [x + dx, y + dy])

/** Move a whole view. */
export function shift(view: DrawingView, dx: number, dy: number): DrawingView {
  return {
    panels: view.panels.map((p) => ({ id: p.id, d: translate(p.d, dx, dy) })),
    lines: view.lines.map((d) => translate(d, dx, dy)),
  }
}

/**
 * Build a symmetric view from one drawn half. Side-specific panels and
 * `sideLines` are mirrored across the axis (x = 500 for `'x'`, y = 500 for
 * `'y'`), with the panel ids swapped to their twins. Shared panels and
 * `centreLines` are used as drawn.
 */
export function symmetric(opts: {
  axis: 'x' | 'y'
  panels: DrawingPanel[]
  sideLines?: string[]
  centreLines?: string[]
}): DrawingView {
  const flip = opts.axis === 'x' ? flipX : flipY
  const panels: DrawingPanel[] = []
  const mirrored: DrawingPanel[] = []
  for (const p of opts.panels) {
    panels.push(p)
    const twin = mirrorPanel(p.id)
    if (twin !== p.id) mirrored.push({ id: twin, d: flip(p.d) })
  }
  const side = opts.sideLines ?? []
  return {
    panels: [...panels, ...mirrored],
    lines: [...(opts.centreLines ?? []), ...side, ...side.map((d) => flip(d))],
  }
}
