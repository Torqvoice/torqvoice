/**
 * The line drawings the condition map is marked on.
 *
 * One drawing per body type, four views each: from above, the left side,
 * the front and the rear. The right side is the left mirrored, with every
 * left panel renamed to its right twin, so nobody draws a car twice and the
 * two sides can never drift apart.
 *
 * Every view lives in its own box, VIEW_SIZE units wide and high, origin
 * top-left, the vehicle centred and filling most of the box. A mark's
 * position is stored as a fraction of that box (0..1 in x and y), so a
 * drawing can be redrawn later without moving anyone's marks.
 *
 * Panels are named so a tap records where it landed in words ("left front
 * door") as well as where in the picture. Names are stable ids, never text:
 * the words come from the locale files.
 */

/** The side of every view's square box, in drawing units. */
export const VIEW_SIZE = 1000

export const BODY_TYPES = [
  'sedan',
  'hatchback',
  'estate',
  'suv',
  'van',
  'pickup',
  'motorcycle',
  'boat',
] as const
export type BodyType = (typeof BODY_TYPES)[number]

export const VIEWS = ['top', 'left', 'right', 'front', 'rear'] as const
export type View = (typeof VIEWS)[number]

/** The views an author draws; `right` is derived from `left`. */
export type DrawnView = Exclude<View, 'right'>

/**
 * Every panel a drawing may name. A side-specific panel is `left_*` or
 * `right_*`; the mirror swaps the prefix. Anything else is shared.
 */
export const PANELS = [
  // Car body
  'hood',
  'roof',
  'trunk',
  'tailgate',
  'front_bumper',
  'rear_bumper',
  'grille',
  'windshield',
  'rear_window',
  'left_headlight',
  'right_headlight',
  'left_taillight',
  'right_taillight',
  'left_front_fender',
  'right_front_fender',
  'left_front_door',
  'right_front_door',
  'left_rear_door',
  'right_rear_door',
  'left_rear_quarter',
  'right_rear_quarter',
  'left_sill',
  'right_sill',
  'left_mirror',
  'right_mirror',
  'left_front_wheel',
  'right_front_wheel',
  'left_rear_wheel',
  'right_rear_wheel',
  'left_a_pillar',
  'right_a_pillar',
  'left_windows',
  'right_windows',
  // Van and pickup
  'left_sliding_door',
  'right_sliding_door',
  'left_side_panel',
  'right_side_panel',
  'rear_doors',
  'bed',
  'bed_side_left',
  'bed_side_right',
  // Motorcycle
  'tank',
  'seat',
  'front_fairing',
  'left_fairing',
  'right_fairing',
  'front_fender',
  'rear_fender',
  'front_wheel',
  'rear_wheel',
  'exhaust',
  'handlebars',
  'headlamp',
  'tail',
  // Boat
  'bow',
  'stern',
  'transom',
  'port_hull',
  'starboard_hull',
  'deck',
  'cabin',
  'windscreen',
  'gunwale_port',
  'gunwale_starboard',
  'keel',
  'outboard',
] as const
export type Panel = (typeof PANELS)[number]

/** One closed panel a tap can land on: an SVG path in view units. */
export interface DrawingPanel {
  id: Panel
  /** SVG path data, closed, in the view's 0..VIEW_SIZE box. */
  d: string
}

/**
 * One view of one body type. `panels` are the tappable regions, drawn as
 * hairline fills; `lines` are the decoration drawn over them (window
 * outlines, door shuts, wheel arches, lamps) that give the silhouette its
 * character and never receive taps.
 */
export interface DrawingView {
  panels: DrawingPanel[]
  /** SVG path data for detail strokes, in the same box. */
  lines: string[]
}

export interface BodyDrawing {
  body: BodyType
  views: Record<DrawnView, DrawingView>
}

/** A panel's twin on the other side, or itself when it has no side. */
export function mirrorPanel(id: Panel): Panel {
  if (id.startsWith('left_')) return `right_${id.slice(5)}` as Panel
  if (id.startsWith('right_')) return `left_${id.slice(6)}` as Panel
  if (id === 'port_hull') return 'starboard_hull'
  if (id === 'starboard_hull') return 'port_hull'
  if (id === 'gunwale_port') return 'gunwale_starboard'
  if (id === 'gunwale_starboard') return 'gunwale_port'
  if (id === 'bed_side_left') return 'bed_side_right'
  if (id === 'bed_side_right') return 'bed_side_left'
  return id
}
