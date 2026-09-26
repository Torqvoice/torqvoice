/**
 * Moves SVG path data through an affine transform, so one drawing of a car's
 * left side becomes its right side, and five views can be laid out on one
 * sheet without the renderer needing transforms of its own.
 *
 * Only the transforms the map uses are supported: uniform scale, quarter
 * turns, mirroring and translation. That is enough to keep arcs honest,
 * which a general matrix would not: an arc's radii scale with the drawing,
 * its axis turns with it, and its sweep flips in a mirror.
 */

export interface Affine {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export function translate(tx: number, ty: number): Affine {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }
}

export function scale(s: number): Affine {
  return { a: s, b: 0, c: 0, d: s, e: 0, f: 0 }
}

/** Mirrors left to right across the vertical line x = axis. */
export function mirrorX(axis: number): Affine {
  return { a: -1, b: 0, c: 0, d: 1, e: 2 * axis, f: 0 }
}

/** A quarter turn clockwise about the origin. */
export function rotate90(): Affine {
  return { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 }
}

/** `first` then `second`, as a single transform. */
export function compose(second: Affine, first: Affine): Affine {
  return {
    a: second.a * first.a + second.c * first.b,
    b: second.b * first.a + second.d * first.b,
    c: second.a * first.c + second.c * first.d,
    d: second.b * first.c + second.d * first.d,
    e: second.a * first.e + second.c * first.f + second.e,
    f: second.b * first.e + second.d * first.f + second.f,
  }
}

export function applyPoint(m: Affine, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
}

export function invert(m: Affine): Affine {
  const det = m.a * m.d - m.b * m.c
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  }
}

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi

function round(value: number): string {
  return String(Math.round(value * 10) / 10)
}

/** Splits path data into commands with their numbers. */
function tokenize(d: string): { command: string; args: number[] }[] {
  const out: { command: string; args: number[] }[] = []
  const re = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g
  for (const match of d.matchAll(re)) {
    const args = (match[2].match(NUMBER) ?? []).map(Number)
    out.push({ command: match[1], args })
  }
  return out
}

/**
 * Path data with the transform applied. Relative commands are made absolute
 * on the way, and H and V become L, since a mirrored horizontal is still
 * horizontal but a rotated one is not.
 */
export function transformPath(d: string, m: Affine): string {
  const uniform = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))
  const mirrored = m.a * m.d - m.b * m.c < 0
  // The turn the transform applies, read off its first column with the
  // reflection taken out: a mirror alone turns nothing.
  const angle = (Math.atan2(mirrored ? -m.b : m.b, mirrored ? -m.a : m.a) * 180) / Math.PI
  const out: string[] = []
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  const pt = (px: number, py: number) => {
    const [tx, ty] = applyPoint(m, px, py)
    return `${round(tx)} ${round(ty)}`
  }
  for (const { command, args } of tokenize(d)) {
    const rel = command === command.toLowerCase()
    const cmd = command.toUpperCase()
    let i = 0
    const take = (n: number) => args.slice(i, (i += n))
    if (cmd === 'Z') {
      out.push('Z')
      x = startX
      y = startY
      continue
    }
    while (i < args.length) {
      switch (cmd) {
        case 'M':
        case 'L':
        case 'T': {
          const [px, py] = take(2)
          x = rel ? x + px : px
          y = rel ? y + py : py
          if (cmd === 'M') {
            startX = x
            startY = y
          }
          out.push(`${cmd === 'T' ? 'L' : cmd}${pt(x, y)}`)
          break
        }
        case 'H': {
          const [px] = take(1)
          x = rel ? x + px : px
          out.push(`L${pt(x, y)}`)
          break
        }
        case 'V': {
          const [py] = take(1)
          y = rel ? y + py : py
          out.push(`L${pt(x, y)}`)
          break
        }
        case 'C': {
          const [x1, y1, x2, y2, px, py] = take(6)
          const b = rel
            ? [x + x1, y + y1, x + x2, y + y2, x + px, y + py]
            : [x1, y1, x2, y2, px, py]
          x = b[4]
          y = b[5]
          out.push(`C${pt(b[0], b[1])} ${pt(b[2], b[3])} ${pt(b[4], b[5])}`)
          break
        }
        case 'S':
        case 'Q': {
          const [x1, y1, px, py] = take(4)
          const b = rel ? [x + x1, y + y1, x + px, y + py] : [x1, y1, px, py]
          x = b[2]
          y = b[3]
          // S loses its reflected control point; drawn as a quadratic through
          // its one explicit point, which is close enough for a line drawing.
          out.push(`Q${pt(b[0], b[1])} ${pt(b[2], b[3])}`)
          break
        }
        case 'A': {
          const [rx, ry, rot, large, sweep, px, py] = take(7)
          x = rel ? x + px : px
          y = rel ? y + py : py
          const flippedSweep = mirrored ? 1 - sweep : sweep
          const turned = mirrored ? -rot - angle : rot + angle
          out.push(
            `A${round(rx * uniform)} ${round(ry * uniform)} ${round(turned)} ${large} ${flippedSweep} ${pt(x, y)}`
          )
          break
        }
        default:
          i = args.length
      }
    }
  }
  return out.join('')
}
