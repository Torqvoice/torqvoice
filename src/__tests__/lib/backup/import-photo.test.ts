import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import sharp from 'sharp'
import {
  IMPORTED_PHOTO_SIDE,
  isPhotoName,
  prepareImportedFile,
  writeImportedFile,
} from '@/lib/backup/import-photo'
import { isGeneratedName } from '@/lib/files/manager'

// Only the manager's name rule is used here; nothing reaches the database.
vi.mock('@/lib/files/references', () => ({
  referencedSuffixes: async () => new Set(),
  allReferencedSuffixes: async () => new Set(),
  existingOrganizationIds: async () => new Set(),
  hasAnyOrganization: async () => false,
}))

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

  it('renames a PNG photo to .jpg once re-encoded', async () => {
    const original = await photo(3000, 2000, 'png')
    const out = await prepareImportedFile('in-0064-Service_km_stand.PNG', original)
    expect(out.compressed).toBe(true)
    expect(out.name).toBe('in-0064-Service_km_stand.jpg')
    expect(out.type).toBe('image/jpeg')
  })

  it('keeps every frame of an animated image', async () => {
    const frames = [await photo(200, 150, 'png'), await photo(200, 150, 'png')]
    const original = await sharp(frames, { join: { animated: true } })
      .gif()
      .toBuffer()
    const out = await prepareImportedFile('walkaround.gif', original)
    expect(out).toEqual({
      data: original,
      name: 'walkaround.gif',
      type: 'image/gif',
      compressed: false,
    })
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

describe('writeImportedFile', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'import-photo-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('stores the file under a name the file manager sweeps', async () => {
    const stored = await writeImportedFile(dir, 'in-0064-scan.JPG', Buffer.from('scan'))
    expect(stored).toMatch(/\.jpg$/)
    expect(isGeneratedName(stored)).toBe(true)
    expect(await readFile(path.join(dir, stored), 'utf8')).toBe('scan')
  })

  it('gives two files of the same name a file each', async () => {
    const first = await writeImportedFile(dir, 'in-0064-scan.jpg', Buffer.from('first'))
    const second = await writeImportedFile(dir, 'in-0064-scan.jpg', Buffer.from('second'))
    expect(first).not.toBe(second)
    expect(await readFile(path.join(dir, first), 'utf8')).toBe('first')
    expect(await readFile(path.join(dir, second), 'utf8')).toBe('second')
  })

  it('still gives a name the sweep knows to a file without a usable extension', async () => {
    expect(isGeneratedName(await writeImportedFile(dir, 'notes', Buffer.from('a')))).toBe(true)
    expect(isGeneratedName(await writeImportedFile(dir, 'a.backup2023', Buffer.from('b')))).toBe(
      true
    )
  })
})
