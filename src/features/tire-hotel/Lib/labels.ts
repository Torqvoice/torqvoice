/**
 * Labels that go on the tire itself.
 *
 * One deliberate omission runs through all of these: the shelf code is not
 * printed. A set gets relocated when a rack is consolidated, and a printed
 * shelf would then be wrong in the one place nobody thinks to check. The QR
 * resolves the current location live, which is the whole reason it is there.
 *
 * What is printed is what identifies the tire when a technician is standing
 * at a rack holding it: the plate, in the largest type the label allows.
 */

export const LABEL_FORMATS = ['dymo_small', 'dymo_standard', 'thermal_large', 'sheet_a4'] as const
export type LabelFormat = (typeof LABEL_FORMATS)[number]

export type LabelSpec = {
  /** Page size in points, which is what the PDF renderer works in. */
  width: number
  height: number
  /** Millimetres, for the size shown in the picker. */
  widthMm: number
  heightMm: number
  /** Labels per page. Above one, they are laid out in a grid. */
  columns: number
  rows: number
  /** How much detail fits without crowding. */
  detail: 'minimal' | 'standard' | 'full'
}

const MM = 72 / 25.4

function spec(
  widthMm: number,
  heightMm: number,
  detail: LabelSpec['detail'],
  columns = 1,
  rows = 1
): LabelSpec {
  return {
    width: widthMm * MM,
    height: heightMm * MM,
    widthMm,
    heightMm,
    columns,
    rows,
    detail,
  }
}

export const LABEL_SPECS: Record<LabelFormat, LabelSpec> = {
  /// Dymo 11354. Barely bigger than the QR, so it carries the plate and
  /// nothing else that would shrink the type.
  dymo_small: spec(57, 32, 'minimal'),
  /// Dymo 99012, the common address label and the size most shops already
  /// have a roll of.
  dymo_standard: spec(89, 36, 'standard'),
  /// Brother QL and most 62mm thermal rolls. Room for the full description.
  thermal_large: spec(62, 100, 'full'),
  /// For a shop with only an office printer. Avery L7163 geometry: two
  /// columns of seven on A4.
  sheet_a4: spec(99.1, 38.1, 'standard', 2, 7),
}

export const A4 = { width: 210 * MM, height: 297 * MM }

/** Margins that keep a sheet grid off the edge of an A4 page. */
export const SHEET_MARGIN = { top: 15 * MM, left: 5 * MM }

export type LabelData = {
  tireSetId: string
  reference: string | null
  plate: string | null
  vehicle: string | null
  customer: string | null
  season: string
  size: string | null
  brand: string | null
  quantity: number
  withRims: boolean
  hasTpms: boolean
  studded: boolean
  shopName: string
  /** Data URI, generated server-side. */
  qr: string
  /** Printed under the QR so the code is usable without a scanner. */
  url: string
}

/**
 * How many labels to print for a set.
 *
 * One per tire by default, since the point is that each tire can be
 * identified on its own. A set split across two shelves, or one tire sent
 * for repair, is exactly the case a per-set label fails at.
 */
export function defaultCopies(quantity: number): number {
  return Math.max(1, Math.min(20, quantity))
}

/** Labels per page for a format, so the caller can size the document. */
export function perPage(format: LabelFormat): number {
  const { columns, rows } = LABEL_SPECS[format]
  return columns * rows
}

export function pageCount(format: LabelFormat, copies: number): number {
  return Math.ceil(copies / perPage(format))
}

/**
 * What fits on a label, and how big it is.
 *
 * Shared by the PDF and the on-screen preview so the two cannot disagree.
 * A preview that flattered the small format would send someone to the
 * printer twice, and the only reliable way to prevent that is for both to
 * read the same numbers.
 *
 * Sizes are in PDF points; the preview converts them for the screen.
 */
export type LabelLayout = {
  /** Stacked for tall rolls, side by side otherwise. */
  stacked: boolean
  padding: number
  qr: number
  plate: number
  body: number
  footer: number
  flag: number
  reference: number
  /** The URL in text under the QR, for a code that will not scan. */
  showUrl: boolean
  /** Everything that would compete with the plate on a small label. */
  showDetail: boolean
  showQuantity: boolean
}

export function labelLayout(detail: LabelSpec['detail']): LabelLayout {
  if (detail === 'full') {
    return {
      stacked: true,
      padding: 8,
      qr: 110,
      plate: 22,
      body: 9,
      footer: 6,
      flag: 5.5,
      reference: 8,
      showUrl: true,
      showDetail: true,
      showQuantity: true,
    }
  }
  if (detail === 'minimal') {
    return {
      stacked: false,
      padding: 6,
      qr: 52,
      plate: 13,
      body: 7,
      footer: 6,
      flag: 5.5,
      reference: 8,
      showUrl: false,
      // Barely bigger than the QR, so anything else would shrink the plate.
      showDetail: false,
      showQuantity: false,
    }
  }
  return {
    stacked: false,
    padding: 6,
    qr: 62,
    plate: 16,
    body: 7,
    footer: 6,
    flag: 5.5,
    reference: 8,
    showUrl: false,
    showDetail: true,
    showQuantity: false,
  }
}
