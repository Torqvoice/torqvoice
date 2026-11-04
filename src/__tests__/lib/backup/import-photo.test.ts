import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { IMPORTED_PHOTO_SIDE, isPhotoName, prepareImportedFile } from '@/lib/backup/import-photo'

/**
 * What an importer stores for each kind of attachment: a phone-sized photo
 * comes down to the app's size as a JPEG, everything else is left as it came.
 */

async function photo(width: number, height: number, format: 'jpeg' | 'png' = 'jpeg') {
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 80, b: 40 },
      noise: { type: 'gaussian', mean: 128, sigma: 40 },
    },
  })
  return format === 'png' ? image.png().toBuffer() : image.jpeg({ quality: 100 }).toBuffer()
}

describe('prepareImportedFile', () => {
  it('fits a large photo to the imported size and stores it as a JPEG', async () => {
    const original = await photo(4000, 3000)
    const out = await prepareImportedFile('job-5-20231216_131344.jpg', original)
    expect(out.compressed).toBe(true)
    expect(out.name).toBe('job-5-20231216_131344.jpg')
    expect(out.type).toBe('image/jpeg')
    expect(out.data.length).toBeLessThan(original.length)
    const meta = await sharp(out.data).metadata()
    expect(meta.format).toBe('jpeg')
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(IMPORTED_PHOTO_SIDE)
  })

  it('adds .jpg to a PNG photo once re-encoded', async () => {
    const original = await photo(3000, 2000, 'png')
    const out = await prepareImportedFile('in-0064-Service_km_stand.PNG', original)
    expect(out.compressed).toBe(true)
    expect(out.name).toBe('in-0064-Service_km_stand.PNG.jpg')
    expect(out.type).toBe('image/jpeg')
  })

  it('stores a PNG and a JPEG of the same name as two files', async () => {
    const png = await prepareImportedFile('scan.png', await photo(3000, 2000, 'png'))
    const jpg = await prepareImportedFile('scan.jpg', await photo(3000, 2000))
    expect(png.name).not.toBe(jpg.name)
  })

  it('never enlarges a small photo nor makes it bigger on disk', async () => {
    const original = await photo(200, 150)
    const out = await prepareImportedFile('small.jpg', original)
    expect(out.data.length).toBeLessThanOrEqual(original.length)
    expect(out.name).toBe('small.jpg')
    const meta = await sharp(out.data).metadata()
    expect([meta.width, meta.height]).toEqual([200, 150])
  })

  it('leaves a PDF alone and names its type', async () => {
    const pdf = Buffer.from('%PDF-1.4 not really')
    const out = await prepareImportedFile('in-0062-invoice.pdf', pdf)
    expect(out).toEqual({
      data: pdf,
      name: 'in-0062-invoice.pdf',
      type: 'application/pdf',
      compressed: false,
    })
  })

  it('keeps a file named like a photo that sharp cannot read', async () => {
    const junk = Buffer.from('this is not a jpeg')
    const out = await prepareImportedFile('broken.jpg', junk)
    expect(out.compressed).toBe(false)
    expect(out.data).toBe(junk)
    expect(out.type).toBe('image/jpeg')
  })

  it('knows which names are photos', () => {
    expect(isPhotoName('a.JPG')).toBe(true)
    expect(isPhotoName('a.heic')).toBe(true)
    expect(isPhotoName('a.pdf')).toBe(false)
    expect(isPhotoName('a.docx')).toBe(false)
  })
})
