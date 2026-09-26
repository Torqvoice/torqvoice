/**
 * Shared construction for the car-like bodies (sedan, hatchback, estate,
 * SUV, van). Each body supplies its proportions; the panels, their shared
 * edges, the wheels and the lamps are built the same way so the set reads
 * as one family.
 */

import type { DrawingPanel, DrawingView, Panel } from '../Lib/drawingTypes'
import {
  A,
  archEnds,
  C,
  type Edge,
  edge,
  panel,
  type Pt,
  Q,
  rev,
  ring,
  roundRect,
  type Seg,
  stroke,
  symmetric,
  wheel,
} from './path'

// ---- Side view ----------------------------------------------------------------

export interface SideSpec {
  nose: number
  tail: number
  /** Underside of the body. */
  bottom: number
  frontWheel: Pt
  rearWheel: Pt
  /** Tyre radius and wheel-arch radius. */
  r: number
  ar: number
  /** Top edge of the front bumper (the headlamp sits on it) and its rear edge. */
  bumperTop: number
  bumperBack: number
  /** Nose curve end, end of the lamp's straight top, hood curve control, hood/windscreen corner. */
  hoodFront: Pt
  hoodKink: Pt
  hoodCtrl: Pt
  cowl: Pt
  /** Where the lamp's rear edge meets the fender crease, and the lamp's rear bottom x. */
  lampBack: Pt
  lampBottomX: number
  /** Windscreen curve control and where it meets the roof. */
  wsCtrl: Pt
  roofFront: Pt
  /** Rear-top corner of the A-pillar band, on the glass top line. */
  pillarBack: Pt
  belt: number
  sill: number
  /** Door shut lines: fender/door, front/rear door, rear door/quarter (null on a 2-door). */
  doorA: number
  doorB: number
  doorC: number | null
  glassTopCtrl: Pt
  cPillarTop: Pt
  cPillarBase: Pt
  /** Roof silhouette from `roofFront`; tail silhouette from the roof's end to the lamp's top. */
  roofSegs: Seg[]
  tailSegs: Seg[]
  tailCornerCtrl: Pt
  tailCorner: Pt
  rearBumperTop: number
  rearBumperFront: number
  lampFrontX: number
  lampFrontCtrl: Pt
  /** Rear end of the roof band's bottom line, when it goes beyond the C-pillar. */
  roofBandEnd?: Pt
  /** Inner edge of a tailgate band, from the lamp's top up to `roofBandEnd`. */
  tailgateInner?: Seg[]
  /** Panel id of that band: 'tailgate' unless the body has 'rear_doors'. */
  tailBandId?: Panel
  /**
   * Pickup: `tailSegs` then run down the cab's back to (cabBack, railY) and an
   * open bed with its own side panel follows, ending in a vertical lamp.
   */
  pickupBed?: { cabBack: number; railY: number }
  /** Top of the mirror; it hangs from the belt line at the front door's edge. */
  mirrorTop: number
  rearDoorId?: Panel
  quarterId?: Panel
  roofRails?: boolean
  handles?: number[]
  /** Extra lines drawn as-is. */
  lines?: string[]
}

function lastTo(from: Pt, segs: Seg[]): Pt {
  return segs.length ? segs[segs.length - 1].to : from
}

/** x on the straight line p0-p1 at height y. */
function xAt(p0: Pt, p1: Pt, y: number): number {
  return p0[0] + ((p1[0] - p0[0]) * (y - p0[1])) / (p1[1] - p0[1])
}

/** Point on a quadratic curve at the parameter where x is closest to `x`. */
function qAtX(p0: Pt, c: Pt, p1: Pt, x: number): Pt {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const t = (lo + hi) / 2
    const px = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0]
    if (px < x) lo = t
    else hi = t
  }
  const t = (lo + hi) / 2
  return [
    (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1],
  ]
}

export function carSide(s: SideSpec): DrawingView {
  const [fx, fy] = s.frontWheel
  const [rx, ry] = s.rearWheel
  const [aF0, aF1] = archEnds(fx, fy, s.ar, s.bottom)
  const [aR0, aR1] = archEnds(rx, ry, s.ar, s.bottom)
  const A0: Pt = [s.doorA, s.belt]
  const roofEnd = lastTo(s.roofFront, s.roofSegs)
  const bed = s.pickupBed
  const lampTop: Pt = bed ? [s.tail, bed.railY + 14] : lastTo(roofEnd, s.tailSegs)
  const bandEnd = s.roofBandEnd ?? roofEnd
  const doorEnd = s.doorC ?? s.doorB
  const rearDoorId = s.rearDoorId ?? 'left_rear_door'
  const quarterId = s.quarterId ?? 'left_rear_quarter'

  // Shared edges
  const noseCurve = edge(
    [s.nose, s.bumperTop],
    C([s.nose, s.bumperTop - 24], [s.hoodFront[0] - 26, s.hoodFront[1] + 2], s.hoodFront),
    s.hoodKink
  )
  const lampTopEdge = edge(s.hoodKink, Q([s.lampBack[0] - 2, s.hoodKink[1] + 3], s.lampBack))
  const lampBottomEdge = edge(
    s.lampBack,
    Q([s.lampBack[0] + 2, s.bumperTop - 8], [s.lampBottomX, s.bumperTop])
  )
  const crease = edge(s.lampBack, A0)
  const hoodLine = edge(s.hoodKink, Q(s.hoodCtrl, s.cowl))
  const cowlEdge = edge(s.cowl, A0)
  const windscreen = edge(s.cowl, Q(s.wsCtrl, s.roofFront))
  const pillarTop = edge(s.roofFront, s.pillarBack)
  const mirrorX = xAt(s.pillarBack, A0, s.mirrorTop)
  const mW = mirrorX - s.doorA + 6
  const pillarRear = edge(s.pillarBack, [mirrorX, s.mirrorTop])
  const mirrorTopEdge = edge(
    [mirrorX, s.mirrorTop],
    [s.doorA + 6, s.mirrorTop],
    Q([s.doorA, s.mirrorTop], [s.doorA, s.mirrorTop + 6]),
    A0
  )
  const mirrorRear = edge(
    [s.doorA + mW, s.belt],
    [s.doorA + mW, s.mirrorTop + 6],
    Q([s.doorA + mW, s.mirrorTop], [mirrorX, s.mirrorTop])
  )
  const glassTop = edge(s.pillarBack, Q(s.glassTopCtrl, s.cPillarTop))
  const cPillar = edge(s.cPillarTop, s.cPillarBase)
  const roofLine = edge(s.roofFront, ...s.roofSegs)
  const tailLine = edge(roofEnd, ...s.tailSegs)
  const lampFront = edge(lampTop, Q(s.lampFrontCtrl, [s.lampFrontX, s.rearBumperTop]))
  const tailCornerEdge = edge(lampTop, Q(s.tailCornerCtrl, s.tailCorner), [s.tail, s.rearBumperTop])
  const frontArch = edge([aF1, s.bottom], A(s.ar, 0, [aF0, s.bottom], 1))
  const rearArch = edge([aR1, s.bottom], A(s.ar, 0, [aR0, s.bottom], 1))

  const panels: DrawingPanel[] = []
  const lines: string[] = []

  panels.push(
    panel(
      'front_bumper',
      edge(
        [s.bumperBack, s.bumperTop],
        [s.nose, s.bumperTop],
        [s.nose, s.bottom - 24],
        Q([s.nose, s.bottom], [s.nose + 24, s.bottom]),
        [s.bumperBack, s.bottom]
      )
    ),
    panel(
      'left_headlight',
      noseCurve,
      lampTopEdge,
      lampBottomEdge,
      edge([s.lampBottomX, s.bumperTop], [s.nose, s.bumperTop])
    ),
    panel('hood', hoodLine, cowlEdge, rev(crease), rev(lampTopEdge)),
    panel(
      'left_front_fender',
      crease,
      edge(A0, [s.doorA, s.sill], [aF1, s.sill], [aF1, s.bottom]),
      frontArch,
      edge(
        [aF0, s.bottom],
        [s.bumperBack, s.bottom],
        [s.bumperBack, s.bumperTop],
        [s.lampBottomX, s.bumperTop]
      ),
      rev(lampBottomEdge)
    ),
    panel('left_a_pillar', windscreen, pillarTop, pillarRear, mirrorTopEdge, rev(cowlEdge))
  )
  panels.push({
    id: 'left_mirror',
    d: ring(
      edge(
        A0,
        [s.doorA, s.mirrorTop + 6],
        Q([s.doorA, s.mirrorTop], [s.doorA + 6, s.mirrorTop]),
        [mirrorX, s.mirrorTop],
        Q([s.doorA + mW, s.mirrorTop], [s.doorA + mW, s.mirrorTop + 6]),
        [s.doorA + mW, s.belt]
      )
    ),
  })

  const roofRing: Edge[] = [roofLine]
  if (bandEnd !== roofEnd) roofRing.push(edge(roofEnd, bandEnd))
  if (bandEnd[0] !== s.cPillarTop[0] || bandEnd[1] !== s.cPillarTop[1])
    roofRing.push(edge(bandEnd, s.cPillarTop))
  roofRing.push(rev(glassTop), rev(pillarTop))
  panels.push(panel('roof', ...roofRing))

  panels.push(
    panel('left_windows', mirrorRear, rev(pillarRear), glassTop, cPillar),
    panel('left_front_door', edge(A0, [s.doorB, s.belt], [s.doorB, s.sill], [s.doorA, s.sill]))
  )
  if (s.doorC !== null) {
    panels.push(
      panel(
        rearDoorId,
        edge([s.doorB, s.belt], [s.doorC, s.belt], [s.doorC, s.sill], [s.doorB, s.sill])
      )
    )
  }
  const sillEnd = bed ? bed.cabBack : aR0
  panels.push(
    panel('left_sill', edge([aF1, s.sill], [sillEnd, s.sill], [sillEnd, s.bottom], [aF1, s.bottom]))
  )

  // Rear quarter (or side panel), optional tailgate band or bed, lamp, bumper
  const bumperEdge = edge(
    [s.lampFrontX, s.rearBumperTop],
    [s.rearBumperFront, s.rearBumperTop],
    [s.rearBumperFront, s.bottom],
    [aR1, s.bottom]
  )
  const quarterRing: Edge[] = []
  if (bed) {
    const cabFoot: Pt = [bed.cabBack, bed.railY]
    quarterRing.push(
      tailLine,
      edge(cabFoot, [bed.cabBack, s.sill], [doorEnd, s.sill], [doorEnd, s.belt], s.cPillarBase),
      rev(cPillar)
    )
    panels.push(
      panel(
        'bed_side_left',
        edge(cabFoot, [s.tail - 14, bed.railY], Q([s.tail, bed.railY], lampTop)),
        lampFront,
        bumperEdge,
        rearArch,
        edge([aR0, s.bottom], [bed.cabBack, s.bottom])
      ),
      panel(
        'left_taillight',
        edge(lampTop, [s.tail, s.rearBumperTop], [s.lampFrontX, s.rearBumperTop]),
        rev(lampFront)
      )
    )
    lines.push(stroke(edge([bed.cabBack + 12, bed.railY + 12], [s.tail - 22, bed.railY + 12])))
  } else {
    if (s.tailgateInner) {
      const inner = edge(lampTop, ...s.tailgateInner)
      quarterRing.push(rev(inner))
      panels.push(panel(s.tailBandId ?? 'tailgate', tailLine, inner, edge(bandEnd, roofEnd)))
    } else {
      if (bandEnd !== roofEnd) quarterRing.push(edge(bandEnd, roofEnd))
      quarterRing.push(tailLine)
    }
    quarterRing.push(
      lampFront,
      bumperEdge,
      rearArch,
      edge([aR0, s.bottom], [aR0, s.sill], [doorEnd, s.sill], [doorEnd, s.belt], s.cPillarBase),
      rev(cPillar)
    )
    panels.push(
      panel(
        'left_taillight',
        tailCornerEdge,
        edge([s.tail, s.rearBumperTop], [s.lampFrontX, s.rearBumperTop]),
        rev(lampFront)
      )
    )
  }
  if (bandEnd[0] !== s.cPillarTop[0] || bandEnd[1] !== s.cPillarTop[1])
    quarterRing.push(edge(s.cPillarTop, bandEnd))
  if (bed && bandEnd !== roofEnd) quarterRing.push(edge(bandEnd, roofEnd))
  panels.push(panel(quarterId, ...quarterRing))

  panels.push(
    panel(
      'rear_bumper',
      edge(
        [s.tail, s.rearBumperTop],
        [s.tail, s.bottom - 24],
        Q([s.tail, s.bottom], [s.tail - 24, s.bottom]),
        [s.rearBumperFront, s.bottom],
        [s.rearBumperFront, s.rearBumperTop]
      )
    )
  )

  const wf = wheel('left_front_wheel', fx, fy, s.r)
  const wr = wheel('left_rear_wheel', rx, ry, s.r)
  panels.push(wf.panel, wr.panel)
  lines.push(...wf.lines, ...wr.lines)

  // B-pillar and rear-door glass divider
  const bTop = qAtX(s.pillarBack, s.glassTopCtrl, s.cPillarTop, s.doorB)
  lines.push(stroke(edge([s.doorB, s.belt], bTop)))
  if (s.doorC !== null && s.doorC < s.cPillarBase[0]) {
    const cTop = qAtX(s.pillarBack, s.glassTopCtrl, s.cPillarTop, s.doorC)
    lines.push(stroke(edge([s.doorC, s.belt], cTop)))
  }
  for (const hx of s.handles ?? []) {
    lines.push(stroke(edge([hx, s.belt + 26], [hx + 30, s.belt + 26])))
  }
  if (s.roofRails) {
    const x0 = s.roofFront[0] + 45
    const x1 = roofEnd[0] - 40
    lines.push(
      stroke(
        edge(
          [x0, s.roofFront[1] - 4],
          Q([x0 + 10, s.roofFront[1] - 14], [x0 + 30, s.roofFront[1] - 14]),
          [x1 - 30, roofEnd[1] - 14],
          Q([x1 - 10, roofEnd[1] - 14], [x1, roofEnd[1] - 4])
        )
      )
    )
  }
  lines.push(...(s.lines ?? []))
  return { panels, lines }
}

// ---- Top view -----------------------------------------------------------------

export interface TopSpec {
  nose: number
  tail: number
  /** Half width of the body and of the glasshouse. */
  hw: number
  gw: number
  /** Depth of the bumpers, the fender strip width. */
  fb: number
  rb: number
  fender: number
  /** Windscreen and rear window x ranges; an empty rear range means no rear glass from above. */
  ws: [number, number]
  rw: [number, number]
  doorA: number
  doorB: number
  doorC: number | null
  rearDoorId?: Panel
  quarterId?: Panel
  /** 'trunk' | 'tailgate' | 'rear_doors' */
  backId: Panel
  /** Glass half width at the windscreen base, if wider than gw. */
  gw0?: number
  roofRails?: boolean
  handles?: number[]
  lines?: string[]
  /** Pickup: split a tailgate strip of this depth off the back of the bed. */
  tailgateDepth?: number
}

export function carTop(s: TopSpec): DrawingView {
  const yE = 500 + s.hw // outer edge (car's left side)
  const yG = 500 + s.gw
  const yG0 = 500 + (s.gw0 ?? s.hw - s.fender)
  const yF = yE - s.fender
  const x0 = s.nose
  const x1 = s.tail
  const bf = x0 + s.fb
  const br = x1 - s.rb
  const [ws0, ws1] = s.ws
  const [rw0, rw1] = s.rw
  const doorEnd = s.doorC ?? s.doorB
  const rearDoorId = s.rearDoorId ?? 'left_rear_door'
  const quarterId = s.quarterId ?? 'left_rear_quarter'

  const yA = yG0 + ((yG - yG0) * (s.doorA - ws0)) / (ws1 - ws0)

  const lampF = edge([bf, yF - 25], [bf + 60, yF], [bf + 82, yE])
  const lampR = edge([br, yF - 25], [br - 60, yF], [br - 82, yE])

  const panels: DrawingPanel[] = [
    // Full-width nose and tail strips, corners rounded within the strip.
    {
      id: 'front_bumper',
      d: ring(
        edge(
          [bf, 500 - s.hw],
          [x0 + s.fb, 500 - s.hw],
          Q([x0, 500 - s.hw], [x0, 500 - s.hw + s.fb]),
          [x0, yE - s.fb],
          Q([x0, yE], [bf, yE])
        )
      ),
    },
    {
      id: 'rear_bumper',
      d: ring(
        edge(
          [br, yE],
          Q([x1, yE], [x1, yE - s.rb]),
          [x1, 500 - s.hw + s.rb],
          Q([x1, 500 - s.hw], [br, 500 - s.hw])
        )
      ),
    },
    panel('left_headlight', lampF, edge([bf + 82, yE], [bf, yE])),
    panel('left_taillight', edge([br, yE], [br - 82, yE]), rev(lampR)),
    {
      id: 'hood',
      d: ring(
        edge([bf, 1000 - (yF - 25)], [bf, yF - 25], [bf + 60, yF], [ws0, yF]),
        edge([ws0, yF], [ws0, 1000 - yF]),
        edge([ws0, 1000 - yF], [bf + 60, 1000 - yF])
      ),
    },
    {
      id: 'windshield',
      d: ring(edge([ws0, 1000 - yG0], [ws0, yG0], [ws1, yG], [ws1, 1000 - yG])),
    },
    { id: 'roof', d: ring(edge([ws1, 1000 - yG], [ws1, yG], [rw0, yG], [rw0, 1000 - yG])) },
    ...(s.tailgateDepth
      ? [
          {
            id: s.backId,
            d: ring(
              edge(
                [rw1, 1000 - yG],
                [rw1, yG],
                [br - s.tailgateDepth, yG],
                [br - s.tailgateDepth, 1000 - yG]
              )
            ),
          },
          {
            id: 'tailgate' as Panel,
            d: ring(
              edge(
                [br - s.tailgateDepth, 1000 - yG],
                [br - s.tailgateDepth, yG],
                [br - 60, yG],
                [br, yG - 25],
                [br, 1000 - (yG - 25)],
                [br - 60, 1000 - yG]
              )
            ),
          },
        ]
      : [
          {
            id: s.backId,
            d: ring(
              edge(
                [rw1, 1000 - yG],
                [rw1, yG],
                [br - 60, yG],
                [br, yG - 25],
                [br, 1000 - (yG - 25)],
                [br - 60, 1000 - yG]
              )
            ),
          },
        ]),
    panel(
      'left_front_fender',
      edge([bf + 60, yF], [ws0, yF], [s.doorA, yA], [s.doorA, yE], [bf + 82, yE])
    ),
    panel(
      'left_front_door',
      edge([s.doorA, yA], [ws1, yG], [s.doorB, yG], [s.doorB, yE], [s.doorA, yE])
    ),
  ]
  if (rw1 > rw0) {
    panels.push({
      id: 'rear_window',
      d: ring(edge([rw0, 1000 - yG], [rw0, yG], [rw1, yG], [rw1, 1000 - yG])),
    })
  }
  if (s.doorC !== null) {
    panels.push(panel(rearDoorId, edge([s.doorB, yG], [s.doorC, yG], [s.doorC, yE], [s.doorB, yE])))
  }
  panels.push(
    panel(
      quarterId,
      edge([doorEnd, yG], [br - 60, yG], [br, yG - 25]),
      edge([br, yG - 25], [br, yF - 25]),
      lampR,
      edge([br - 82, yE], [doorEnd, yE])
    )
  )
  panels.push({ id: 'left_mirror', d: roundRect(s.doorA - 2, yE, 40, 26, 8) })

  const sideLines: string[] = []
  for (const hx of s.handles ?? []) sideLines.push(stroke(edge([hx, yG + 14], [hx + 30, yG + 14])))
  if (s.roofRails) {
    sideLines.push(stroke(edge([ws1 + 30, yG - 8], [rw0 - 30, yG - 8])))
  }
  return symmetric({
    axis: 'y',
    panels,
    sideLines,
    centreLines: s.lines ?? [],
  })
}

// ---- Front and rear views ----------------------------------------------------

export interface FrontSpec {
  /** Half body width, roof top, roof strip bottom, windscreen base, hood bottom (lamp top). */
  hw: number
  roofTop: number
  roofBottom: number
  wsBase: number
  hoodBottom: number
  lampBottom: number
  bumperBottom: number
  /** Body corner x at the roof and at the pillar base, glasshouse half width at the top and base. */
  roofX: number
  pillarBaseX: number
  glassTopX: number
  glassBaseX: number
  /** Lamp inner x at its bottom and top. */
  lampInX: number
  lampInTopX: number
  grilleHalf: number
  /** Tyre centre offset from the middle and half its width; tyre bottom. */
  tyreX: number
  tyreHalf: number
  ground: number
  roofRails?: boolean
  lines?: string[]
}

export function carFront(s: FrontSpec): DrawingView {
  const R = 500 + s.roofX
  const Ri = 500 + s.glassTopX
  const Pb = 500 + s.pillarBaseX
  const Wb = 500 + s.glassBaseX
  const E = 500 + s.hw
  const yShoulder = s.wsBase + 14
  const mirrorY = s.wsBase - 44
  const mirrorX = xAt([R, s.roofTop + 8], [Pb, s.wsBase], mirrorY + 22)

  const shoulder = edge([Pb, s.wsBase], Q([E - 20, s.wsBase], [E - 6, yShoulder]))
  const lampIn = edge(
    [500 + s.lampInX, s.lampBottom],
    Q([500 + s.lampInX, s.hoodBottom + 16], [500 + s.lampInTopX, s.hoodBottom])
  )

  const panels: DrawingPanel[] = [
    {
      id: 'roof',
      d: ring(
        edge(
          [1000 - R, s.roofTop + 8],
          C([1000 - R + 90, s.roofTop], [R - 90, s.roofTop], [R, s.roofTop + 8]),
          [Ri, s.roofBottom],
          [1000 - Ri, s.roofBottom]
        )
      ),
    },
    {
      id: 'windshield',
      d: ring(
        edge([1000 - Ri, s.roofBottom], [Ri, s.roofBottom], [Wb, s.wsBase], [1000 - Wb, s.wsBase])
      ),
    },
    panel(
      'left_a_pillar',
      edge([R, s.roofTop + 8], [Pb, s.wsBase], [Wb, s.wsBase], [Ri, s.roofBottom])
    ),
    {
      id: 'hood',
      d: ring(
        edge(
          [1000 - Pb, s.wsBase],
          [Pb, s.wsBase],
          [Pb + 4, s.hoodBottom],
          [1000 - Pb - 4, s.hoodBottom]
        )
      ),
    },
    panel(
      'left_front_fender',
      shoulder,
      edge([E - 6, yShoulder], [E, s.hoodBottom], [Pb + 4, s.hoodBottom], [Pb, s.wsBase])
    ),
    panel(
      'left_headlight',
      edge(
        [500 + s.lampInTopX, s.hoodBottom],
        [E, s.hoodBottom],
        [E, s.lampBottom],
        [500 + s.lampInX, s.lampBottom]
      ),
      lampIn
    ),
    {
      id: 'grille',
      d: ring(
        edge(
          [500 - s.grilleHalf, s.hoodBottom],
          [500 + s.grilleHalf, s.hoodBottom],
          [500 + s.grilleHalf, s.lampBottom],
          [500 - s.grilleHalf, s.lampBottom]
        )
      ),
    },
  ]
  // Bumper: right half from the bottom centre round to the grille, mirrored.
  const bumperHalf = edge(
    [500, s.bumperBottom],
    [E - 40, s.bumperBottom],
    Q([E, s.bumperBottom], [E, s.bumperBottom - 40]),
    [E, s.lampBottom],
    [500 + s.lampInX, s.lampBottom],
    Q([500 + s.lampInX, s.hoodBottom + 16], [500 + s.lampInTopX, s.hoodBottom]),
    [500 + s.grilleHalf, s.hoodBottom],
    [500 + s.grilleHalf, s.lampBottom],
    [500, s.lampBottom]
  )
  panels.push({ id: 'front_bumper', d: ring(bumperHalf, rev(mirrorEdgeX(bumperHalf))) })
  panels.push({ id: 'left_mirror', d: roundRect(mirrorX + 6, mirrorY, 60, 44, 12) })
  panels.push({
    id: 'left_front_wheel',
    d: tyre(500 + s.tyreX, s.tyreHalf, s.bumperBottom, s.ground),
  })

  const sideLines = [
    stroke(edge([mirrorX - 2, mirrorY + 22], [mirrorX + 6, mirrorY + 22])),
    // lamp lens
    roundRect(
      500 + s.lampInTopX + 18,
      s.hoodBottom + 14,
      E - 500 - s.lampInTopX - 34,
      s.lampBottom - s.hoodBottom - 28,
      10
    ),
  ]
  if (s.roofRails) {
    sideLines.push(
      stroke(
        edge(
          [R - 30, s.roofTop + 4],
          [R - 30, s.roofTop - 8],
          [R - 12, s.roofTop - 8],
          [R - 12, s.roofTop + 6]
        )
      )
    )
  }
  const centreLines = [
    // grille frame and bars
    roundRect(
      500 - s.grilleHalf + 10,
      s.hoodBottom + 10,
      2 * s.grilleHalf - 20,
      s.lampBottom - s.hoodBottom - 20,
      8
    ),
    stroke(
      edge(
        [500 - s.grilleHalf + 10, (s.hoodBottom + s.lampBottom) / 2],
        [500 + s.grilleHalf - 10, (s.hoodBottom + s.lampBottom) / 2]
      )
    ),
    // number plate
    roundRect(430, s.lampBottom + 26, 140, 36, 4),
    // lower air intake
    roundRect(500 - s.grilleHalf - 40, s.bumperBottom - 46, 2 * s.grilleHalf + 80, 28, 10),
    ...(s.lines ?? []),
  ]
  return symmetric({ axis: 'x', panels, sideLines, centreLines })
}

export interface RearSpec {
  hw: number
  roofTop: number
  roofBottom: number
  /** Rear glass bottom, lid/tailgate bottom (lamp top), lamp bottom (bumper top), bumper bottom. */
  glassBase: number
  lidBottom: number
  lampBottom: number
  bumperBottom: number
  roofX: number
  glassTopX: number
  glassBaseX: number
  /** Lamp inner x (from the middle) at the lamp bottom. */
  lampInX: number
  /** 'trunk' | 'tailgate' | 'rear_doors' */
  backId: Panel
  quarterId?: Panel
  tyreX: number
  tyreHalf: number
  ground: number
  roofRails?: boolean
  /** Vertical lamp strips (tailgate bodies) instead of low wide lamps. */
  tallLamps?: boolean
  lines?: string[]
  sideLines?: string[]
}

export function carRear(s: RearSpec): DrawingView {
  // The car's left is on the viewer's left: author at x < 500.
  const R = 500 - s.roofX
  const Ri = 500 - s.glassTopX
  const Gb = 500 - s.glassBaseX
  const E = 500 - s.hw
  const yShoulder = s.glassBase + 18
  const quarterId = s.quarterId ?? 'left_rear_quarter'
  const mirrorY = s.glassBase - 70
  const lampTop = s.tallLamps ? s.glassBase + 10 : s.lidBottom
  const lampIn = 500 - s.lampInX

  const pillarOuter = edge(
    [R, s.roofTop + 8],
    C([R - 40, s.roofTop + 60], [E + 20, s.glassBase - 60], [E + 6, yShoulder]),
    [E, s.lidBottom]
  )
  const glassSide = edge([Ri, s.roofBottom], [Gb, s.glassBase])
  const panels: DrawingPanel[] = [
    {
      id: 'roof',
      d: ring(
        edge(
          [R, s.roofTop + 8],
          C([R + 90, s.roofTop], [1000 - R - 90, s.roofTop], [1000 - R, s.roofTop + 8]),
          [1000 - Ri, s.roofBottom],
          [Ri, s.roofBottom]
        )
      ),
    },
    {
      id: 'rear_window',
      d: ring(
        edge(
          [Ri, s.roofBottom],
          [1000 - Ri, s.roofBottom],
          [1000 - Gb, s.glassBase],
          [Gb, s.glassBase]
        )
      ),
    },
  ]
  if (s.tallLamps) {
    const pillar = edge(
      [R, s.roofTop + 8],
      C([R - 40, s.roofTop + 60], [E + 20, s.glassBase - 60], [E + 6, yShoulder]),
      [E, lampTop]
    )
    panels.push(
      panel(
        quarterId,
        pillar,
        edge([E, lampTop], [lampIn - 14, lampTop], [Gb, s.glassBase]),
        rev(glassSide),
        edge([Ri, s.roofBottom], [R, s.roofTop + 8])
      )
    )
    panels.push(
      panel(
        'left_taillight',
        edge([E, lampTop], [E, s.lampBottom]),
        edge([E, s.lampBottom], [lampIn, s.lampBottom]),
        edge(
          [lampIn, s.lampBottom],
          [lampIn, lampTop + 14],
          Q([lampIn, lampTop], [lampIn - 14, lampTop])
        ),
        edge([lampIn - 14, lampTop], [E, lampTop])
      )
    )
    // Gate between the lamps, from the glass down to the bumper.
    panels.push({
      id: s.backId,
      d: ring(
        edge(
          [Gb, s.glassBase],
          [1000 - Gb, s.glassBase],
          [1000 - lampIn + 14, lampTop],
          Q([1000 - lampIn, lampTop], [1000 - lampIn, lampTop + 14]),
          [1000 - lampIn, s.lampBottom],
          [lampIn, s.lampBottom],
          [lampIn, lampTop + 14],
          Q([lampIn, lampTop], [lampIn - 14, lampTop])
        )
      ),
    })
  } else {
    panels.push(
      panel(
        quarterId,
        pillarOuter,
        edge([E, s.lidBottom], [Gb + 6, s.lidBottom], [Gb, s.glassBase]),
        rev(glassSide),
        edge([Ri, s.roofBottom], [R, s.roofTop + 8])
      )
    )
    panels.push(
      panel(
        'left_taillight',
        edge([E, s.lidBottom], [E, s.lampBottom], [lampIn, s.lampBottom]),
        edge(
          [lampIn, s.lampBottom],
          Q([lampIn, s.lidBottom + 16], [lampIn - 28, s.lidBottom]),
          [Gb + 6, s.lidBottom],
          [E, s.lidBottom]
        )
      )
    )
    panels.push({
      id: s.backId,
      d: ring(
        edge(
          [Gb, s.glassBase],
          [1000 - Gb, s.glassBase],
          [1000 - Gb - 6, s.lidBottom],
          [1000 - lampIn + 28, s.lidBottom],
          Q([1000 - lampIn, s.lidBottom + 16], [1000 - lampIn, s.lampBottom]),
          [lampIn, s.lampBottom],
          Q([lampIn, s.lidBottom + 16], [lampIn - 28, s.lidBottom]),
          [Gb + 6, s.lidBottom]
        )
      ),
    })
  }
  panels.push({
    id: 'rear_bumper',
    d: ring(
      edge(
        [E, s.lampBottom],
        [E, s.bumperBottom - 40],
        Q([E, s.bumperBottom], [E + 40, s.bumperBottom]),
        [1000 - E - 40, s.bumperBottom],
        Q([1000 - E, s.bumperBottom], [1000 - E, s.bumperBottom - 40]),
        [1000 - E, s.lampBottom]
      )
    ),
  })
  const mirrorX = E - 62
  panels.push({ id: 'left_mirror', d: roundRect(mirrorX, mirrorY, 56, 42, 12) })
  panels.push({
    id: 'left_rear_wheel',
    d: tyre(500 - s.tyreX, s.tyreHalf, s.bumperBottom, s.ground),
  })

  const sideLines = [
    stroke(edge([mirrorX + 56, mirrorY + 21], [E + 8, mirrorY + 21])),
    ...(s.sideLines ?? []),
  ]
  if (s.tallLamps) {
    sideLines.push(
      stroke(
        edge(
          [E + 14, lampTop + (s.lampBottom - lampTop) / 2],
          [lampIn - 12, lampTop + (s.lampBottom - lampTop) / 2]
        )
      )
    )
  } else {
    sideLines.push(
      stroke(
        edge(
          [E + 14, s.lidBottom + (s.lampBottom - s.lidBottom) / 2],
          [lampIn - 12, s.lidBottom + (s.lampBottom - s.lidBottom) / 2]
        )
      )
    )
  }
  if (s.roofRails) {
    sideLines.push(
      stroke(
        edge(
          [R + 30, s.roofTop + 4],
          [R + 30, s.roofTop - 8],
          [R + 12, s.roofTop - 8],
          [R + 12, s.roofTop + 6]
        )
      )
    )
  }
  const centreLines = [roundRect(430, s.lampBottom + 26, 140, 36, 4), ...(s.lines ?? [])]
  return symmetric({ axis: 'x', panels, sideLines, centreLines })
}

/** A tyre seen end-on: a block under the body with rounded bottom corners. */
export function tyre(cx: number, half: number, top: number, bottom: number): string {
  return ring(
    edge(
      [cx - half, top],
      [cx + half, top],
      [cx + half, bottom - 14],
      Q([cx + half, bottom], [cx + half - 14, bottom]),
      [cx - half + 14, bottom],
      Q([cx - half, bottom], [cx - half, bottom - 14])
    )
  )
}

/** Mirror an edge across x = 500. */
export function mirrorEdgeX(e: Edge): Edge {
  const fx = (p: Pt): Pt => [1000 - p[0], p[1]]
  return {
    from: fx(e.from),
    segs: e.segs.map((s): Seg => {
      switch (s.k) {
        case 'L':
          return { k: 'L', to: fx(s.to) }
        case 'Q':
          return { k: 'Q', c: fx(s.c), to: fx(s.to) }
        case 'C':
          return { k: 'C', c1: fx(s.c1), c2: fx(s.c2), to: fx(s.to) }
        case 'A':
          return { k: 'A', r: s.r, large: s.large, sweep: s.sweep ? 0 : 1, to: fx(s.to) }
      }
    }),
  }
}
