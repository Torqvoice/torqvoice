/**
 * The scan box the barcode scanner draws over the camera picture.
 *
 * html5-qrcode (2.3.8) asks for the box once the video plays, from a
 * `playing` listener, and throws there (uncaught, after `start()` has
 * resolved) when either side is under 50 px. It also throws when a box that
 * fits in height is wider than the viewfinder. Safari can report a small
 * viewfinder at that moment (a video with no size yet is 150 px tall), so the
 * box is clamped to the library's minimum and to the viewfinder itself.
 */

/** The library's `Constants.MIN_QR_BOX_SIZE`. */
export const MIN_SCAN_BOX = 50

export interface ScanBox {
  width: number
  height: number
}

function wholePixels(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * A wide, short box for one-dimensional barcodes, in whole pixels, at least
 * 50 px on each side and never larger than the viewfinder. `null` when the
 * viewfinder is too small for any box: then the whole frame is scanned.
 */
export function scanBoxFor(viewfinderWidth: number, viewfinderHeight: number): ScanBox | null {
  const width = wholePixels(viewfinderWidth)
  const height = wholePixels(viewfinderHeight)
  if (width < MIN_SCAN_BOX || height < MIN_SCAN_BOX) return null
  const side = Math.min(width, height)
  return {
    width: clamp(Math.floor(side * 0.8), MIN_SCAN_BOX, width),
    height: clamp(Math.floor(side * 0.3), MIN_SCAN_BOX, height),
  }
}

/**
 * What to hand html5-qrcode's `qrbox` function. The function has to return a
 * box once the config is set, so "no box" is said the way the library
 * understands it: a box of the minimum size that is taller than the
 * viewfinder, which makes it skip the shading and scan the whole frame.
 */
export function libraryScanBox(viewfinderWidth: number, viewfinderHeight: number): ScanBox {
  return (
    scanBoxFor(viewfinderWidth, viewfinderHeight) ?? {
      width: MIN_SCAN_BOX,
      height: Math.max(MIN_SCAN_BOX, wholePixels(viewfinderHeight) + 1),
    }
  )
}
