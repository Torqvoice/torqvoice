/**
 * @vitest-environment node
 *
 * A photo is never worth a document. The loader hands back nothing, and
 * never throws, for a file that is missing, not a picture, too large or too
 * slow, so the sheet prints as if the option were off. What it has made it
 * keeps, so a redraw does not decode the photo again.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const FIXTURES = path.join(tmpdir(), 'torqvoice-vehicle-photo-loader')
const ORG = 'org-1'
const url = (name: string) => `/api/protected/files/${ORG}/vehicles/${name}`

/** A promise that never settles, for a step that never answers. */
const hang = () =>
  new Promise<never>(() => {
    // never settles
  })

/** How the file system misbehaves for the next read, if at all. */
const fsMode: { stat?: 'hang' | 'huge'; read?: 'hang' } = {}
const reads = vi.fn()
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const realStat = actual.stat as (file: string) => Promise<import('node:fs').Stats>
  const realRead = actual.readFile as (file: string) => Promise<Buffer>
  return {
    ...actual,
    stat: async (file: string) => {
      if (fsMode.stat === 'hang') return hang()
      const info = await realStat(file)
      if (fsMode.stat === 'huge') return Object.assign(info, { size: 400 * 1024 * 1024 })
      return info
    },
    readFile: async (file: string) => {
      reads(file)
      if (fsMode.read === 'hang') return hang()
      return realRead(file)
    },
  }
})
vi.mock('@/lib/resolve-upload-path', () => ({
  resolveUploadPath: (fileUrl: string) => path.join(FIXTURES, fileUrl.split('/').pop() ?? ''),
}))
vi.mock('@/lib/db', () => ({ db: {} }))

const {
  clearVehiclePhotoCache,
  loadVehiclePhotoSource,
  PHOTO_TIMEOUT_MS,
  photoSourceFromSnapshot,
  vehiclePhotoCacheSize,
  vehiclePhotoPrint,
  withTimeout,
} = await import('@/features/invoice-designer/Lib/vehiclePhoto.server')

beforeAll(async () => {
  mkdirSync(FIXTURES, { recursive: true })
  await sharp({ create: { width: 900, height: 600, channels: 3, background: '#3b82f6' } })
    .png()
    .toFile(path.join(FIXTURES, 'boat.png'))
  writeFileSync(path.join(FIXTURES, 'notes.jpg'), 'not a picture at all')
  writeFileSync(path.join(FIXTURES, 'empty.jpg'), '')
})

beforeEach(() => {
  clearVehiclePhotoCache()
  delete fsMode.stat
  delete fsMode.read
  reads.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('loading the vehicle’s photo', () => {
  it('resizes a real photo to a small JPEG with its proportions', async () => {
    const source = await loadVehiclePhotoSource(ORG, url('boat.png'))
    expect(source?.width).toBe(600)
    expect(source?.height).toBe(400)
    expect((await sharp(source!.bytes).metadata()).format).toBe('jpeg')
  })

  it('returns nothing for no photo, a missing file, an empty one and one that is not a picture', async () => {
    await expect(loadVehiclePhotoSource(ORG, null)).resolves.toBeNull()
    await expect(loadVehiclePhotoSource(ORG, url('gone.jpg'))).resolves.toBeNull()
    await expect(loadVehiclePhotoSource(ORG, url('empty.jpg'))).resolves.toBeNull()
    await expect(loadVehiclePhotoSource(ORG, url('notes.jpg'))).resolves.toBeNull()
  })

  it('returns nothing for an address that is not this workshop’s upload', async () => {
    await expect(
      loadVehiclePhotoSource(ORG, '/api/protected/files/org-2/vehicles/boat.png')
    ).resolves.toBeNull()
    await expect(loadVehiclePhotoSource(ORG, 'https://example.com/boat.png')).resolves.toBeNull()
    await expect(loadVehiclePhotoSource(ORG, '/etc/passwd')).resolves.toBeNull()
  })

  it('does not read a file that is too large', async () => {
    fsMode.stat = 'huge'
    await expect(loadVehiclePhotoSource(ORG, url('boat.png'))).resolves.toBeNull()
    expect(reads).not.toHaveBeenCalled()
  })

  it('gives up quietly on a file system that does not answer', async () => {
    vi.useFakeTimers()
    fsMode.stat = 'hang'
    const pending = loadVehiclePhotoSource(ORG, url('boat.png'))
    await vi.advanceTimersByTimeAsync(PHOTO_TIMEOUT_MS + 10)
    await expect(pending).resolves.toBeNull()
  })

  it('gives up quietly on a read that does not finish', async () => {
    fsMode.read = 'hang'
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const pending = loadVehiclePhotoSource(ORG, url('boat.png'))
    // Let the real stat finish before the clock moves.
    await vi.waitFor(() => expect(reads).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(PHOTO_TIMEOUT_MS + 10)
    await expect(pending).resolves.toBeNull()
  })

  it('ends any step that runs too long, and passes a failure on as nothing', async () => {
    vi.useFakeTimers()
    const never = withTimeout(hang(), 50)
    await vi.advanceTimersByTimeAsync(60)
    await expect(never).resolves.toBeNull()
    await expect(withTimeout(Promise.reject(new Error('boom')))).resolves.toBeNull()
  })

  it('keeps what it made, so a redraw does not read the file again', async () => {
    const first = await loadVehiclePhotoSource(ORG, url('boat.png'))
    const second = await loadVehiclePhotoSource(ORG, url('boat.png'))
    expect(second).toBe(first)
    expect(reads).toHaveBeenCalledTimes(1)
    const tone = () => ({ mode: 'floor' as const, value: 240 })
    const a = await vehiclePhotoPrint(first, 'faded', tone)
    const b = await vehiclePhotoPrint(first, 'faded', tone)
    expect(b?.faded).toBe(a?.faded)
    expect(vehiclePhotoCacheSize()).toBe(2)
  })

  it('reads a kept photo back as it was kept, and refuses one that is not a JPEG', async () => {
    const source = await loadVehiclePhotoSource(ORG, url('boat.png'))
    const kept = await photoSourceFromSnapshot({ id: 'snap-1', data: source!.bytes })
    expect(kept?.bytes.equals(source!.bytes)).toBe(true)
    expect(kept?.width).toBe(600)
    await expect(
      photoSourceFromSnapshot({ id: 'snap-2', data: Buffer.from('garbage') })
    ).resolves.toBeNull()
  })

  it('prints nothing without a source or a style', async () => {
    await expect(
      vehiclePhotoPrint(null, 'beside', () => ({ mode: 'floor', value: 0 }))
    ).resolves.toBeUndefined()
    const source = await loadVehiclePhotoSource(ORG, url('boat.png'))
    await expect(
      vehiclePhotoPrint(source, null, () => ({ mode: 'floor', value: 0 }))
    ).resolves.toBeUndefined()
  })
})
