import { deflateSync } from 'node:zlib'
import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { isPrintableImage } from '@/features/invoices/Lib/printableImage'

/**
 * Which attachments may be drawn into an invoice.
 *
 * The renderer decodes images inside its own stream, so one it cannot read
 * throws where the route cannot catch it: the PDF request never answers and
 * the process logs an uncaught `Z_DATA_ERROR`. A single truncated photograph
 * on a job made that job's invoice unobtainable, preview included. These are
 * the shapes that get past the door.
 */

function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(typed))
  return Buffer.concat([head, typed, tail])
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** A 1×1 truecolour PNG, built the way a PNG is built. */
function onePixelPng(): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.from([0x00, 0xff, 0x00, 0x00]))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const jpeg = (body: Buffer = Buffer.alloc(8)) =>
  Buffer.concat([Buffer.from([0xff, 0xd8]), body, Buffer.from([0xff, 0xd9])])

describe('what may be drawn into an invoice', () => {
  it('takes a PNG that holds together', () => {
    expect(isPrintableImage(onePixelPng(), 'image/png')).toBe(true)
  })

  it('refuses a PNG whose pixels are damaged', () => {
    // The checksum is what catches it, which is what a half-finished upload
    // looks like: the header parses and the rest does not.
    const png = onePixelPng()
    png[png.length - 10] ^= 0xff
    expect(isPrintableImage(png, 'image/png')).toBe(false)
  })

  it('refuses a PNG that stops early', () => {
    expect(isPrintableImage(onePixelPng().subarray(0, 40), 'image/png')).toBe(false)
  })

  it('refuses something that only says PNG', () => {
    const liar = Buffer.concat([PNG_SIGNATURE, Buffer.from('not a chunk at all, honestly')])
    expect(isPrintableImage(liar, 'image/png')).toBe(false)
  })

  it('refuses a chunk that claims to be longer than the file', () => {
    const png = onePixelPng()
    png.writeUInt32BE(0xffff_fff0, 8)
    expect(isPrintableImage(png, 'image/png')).toBe(false)
  })

  it('takes a JPEG with both its markers', () => {
    expect(isPrintableImage(jpeg(), 'image/jpeg')).toBe(true)
    expect(isPrintableImage(jpeg(), 'image/jpg')).toBe(true)
  })

  it('refuses a JPEG that was cut off before the end', () => {
    expect(isPrintableImage(Buffer.from([0xff, 0xd8, 0x01, 0x02, 0x03]), 'image/jpeg')).toBe(false)
  })

  it('refuses WEBP, which uploads accept and the renderer cannot read', () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBPVP8 '),
      Buffer.alloc(16),
    ])
    expect(isPrintableImage(webp, 'image/webp')).toBe(false)
  })

  it('refuses anything that is not an image at all', () => {
    expect(isPrintableImage(Buffer.from('%PDF-1.7'), 'application/pdf')).toBe(false)
    expect(isPrintableImage(Buffer.alloc(0), 'image/png')).toBe(false)
  })
})
