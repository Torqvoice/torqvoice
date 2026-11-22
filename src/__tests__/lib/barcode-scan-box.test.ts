/**
 * The barcode scanner's scan box never makes html5-qrcode throw, whatever
 * size the camera picture turns out to be. A phone once reported a short
 * viewfinder and the scanner crashed with "minimum size of 'config.qrbox'
 * dimension value is 50px".
 */

import { describe, it, expect } from 'vitest'
import { libraryScanBox, MIN_SCAN_BOX, scanBoxFor } from '@/lib/barcode-scan-box'

/**
 * html5-qrcode 2.3.8's own checks in `setupUi`: both sides at least 50 px;
 * a box no taller than the viewfinder is shaded and must then fit inside it,
 * a taller one is ignored and the whole frame scanned.
 */
function libraryAccepts(viewfinderWidth: number, viewfinderHeight: number) {
  const box = libraryScanBox(viewfinderWidth, viewfinderHeight)
  if (box.width < MIN_SCAN_BOX || box.height < MIN_SCAN_BOX) return false
  const shaded = box.height <= viewfinderHeight
  if (shaded && (box.width > viewfinderWidth || box.height > viewfinderHeight)) return false
  return true
}

const sizes: Array<[string, number, number]> = [
  ['very small', 20, 30],
  ['49 px square', 49, 49],
  ['narrow and tall', 40, 300],
  ['wide and flat', 300, 40],
  ['50 px square', 50, 50],
  ['100x100', 100, 100],
  ['166x300', 166, 300],
  ['300x166', 300, 166],
  ['Safari before the video has a size', 382, 150],
  ['430x320', 430, 320],
  ['1280x720', 1280, 720],
  ['fractional', 333.7, 187.4],
  ['zero', 0, 0],
  ['NaN', Number.NaN, Number.NaN],
  ['NaN height', 400, Number.NaN],
]

describe('scanBoxFor', () => {
  it.each(
    sizes
  )('%s (%s x %s) gives a box of at least 50 px inside the viewfinder, or none', (_, w, h) => {
    const box = scanBoxFor(w, h)
    const fits = Number.isFinite(w) && Number.isFinite(h) && w >= MIN_SCAN_BOX && h >= MIN_SCAN_BOX
    if (!fits) {
      expect(box).toBeNull()
      return
    }
    expect(box).not.toBeNull()
    const { width, height } = box!
    expect(Number.isInteger(width) && Number.isInteger(height)).toBe(true)
    expect(width).toBeGreaterThanOrEqual(MIN_SCAN_BOX)
    expect(height).toBeGreaterThanOrEqual(MIN_SCAN_BOX)
    expect(width).toBeLessThanOrEqual(w)
    expect(height).toBeLessThanOrEqual(h)
  })

  it('keeps the wide barcode shape on a normal camera picture', () => {
    expect(scanBoxFor(1280, 720)).toEqual({ width: 576, height: 216 })
    expect(scanBoxFor(430, 320)).toEqual({ width: 256, height: 96 })
  })

  it('raises a short box to the minimum instead of going under it', () => {
    expect(scanBoxFor(166, 300)).toEqual({ width: 132, height: 50 })
    expect(scanBoxFor(382, 150)).toEqual({ width: 120, height: 50 })
  })
})

describe('libraryScanBox', () => {
  it.each(sizes)('%s (%s x %s) passes the library checks', (_, w, h) => {
    expect(libraryAccepts(w, h)).toBe(true)
  })

  it('asks for the whole frame when the viewfinder is under 50 px', () => {
    const box = libraryScanBox(300, 40)
    expect(box.height).toBeGreaterThan(40)
  })
})
