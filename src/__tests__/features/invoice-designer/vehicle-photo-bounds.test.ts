/**
 * @vitest-environment node
 *
 * How much work a vehicle's photo may cost the server. Documents opened at
 * once wait for the same decode instead of each starting their own; a photo
 * that cannot be made is tried once, not on every redraw; only a couple of
 * photos decode at a time across every document; and issuing an invoice
 * waits longer for the photo than a redraw does, on the same decode.
 *
 * sharp is played by a stand-in whose every decode waits until the test
 * finishes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Decode = {
  file: string
  resolve: (value: { data: Buffer; info: { width: number; height: number } }) => void
  reject: (error: Error) => void
}

const decodes: Decode[] = []
const sharpCalls: { input: Buffer; options: Record<string, unknown> }[] = []
const resizeCalls: Record<string, unknown>[] = []
const concurrency = vi.fn()

vi.mock('sharp', () => {
  const factory = (input: Buffer, options: Record<string, unknown>) => {
    sharpCalls.push({ input, options })
    const chain = {
      rotate: () => chain,
      resize: (opts: Record<string, unknown>) => {
        resizeCalls.push(opts)
        return chain
      },
      flatten: () => chain,
      jpeg: () => chain,
      toBuffer: () =>
        new Promise((resolve, reject) => {
          decodes.push({ file: input.toString(), resolve, reject } as Decode)
        }),
    }
    return chain
  }
  return { default: Object.assign(factory, { concurrency }) }
})

/** Each file's version; bump one to stand for a new upload. */
const versions: Record<string, number> = {}
vi.mock('node:fs/promises', () => ({
  stat: async (file: string) => ({
    isFile: () => true,
    size: 1000,
    mtimeMs: versions[file] ?? 1,
  }),
  readFile: async (file: string) => Buffer.from(file),
}))
vi.mock('@/lib/resolve-upload-path', () => ({
  resolveUploadPath: (fileUrl: string) => fileUrl.split('/').pop() ?? '',
}))
vi.mock('@/lib/db', () => ({ db: {} }))

const {
  clearVehiclePhotoCache,
  ISSUE_PHOTO_WAIT_MS,
  loadVehiclePhotoSource,
  MAX_CONCURRENT_DECODES,
  MAX_INPUT_PIXELS,
  PHOTO_TIMEOUT_MS,
} = await import('@/features/invoice-designer/Lib/vehiclePhoto.server')

const ORG = 'org-1'
const url = (name: string) => `/api/protected/files/${ORG}/vehicles/${name}`
const done = (decode: Decode) =>
  decode.resolve({ data: Buffer.from(`jpeg of ${decode.file}`), info: { width: 600, height: 400 } })

/** Lets the loader's awaits run until nothing more moves. */
const settle = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(() => {
  clearVehiclePhotoCache()
  decodes.length = 0
  sharpCalls.length = 0
  resizeCalls.length = 0
  for (const key of Object.keys(versions)) delete versions[key]
})

afterEach(async () => {
  vi.useRealTimers()
  // Finish whatever a test left, so no slot stays taken into the next one.
  for (let i = 0; i < 20 && decodes.length > 0; i++) {
    for (const decode of decodes.splice(0)) done(decode)
    await settle()
  }
})

describe('the vehicle photo’s decode', () => {
  it('is shared by documents that ask for the same photo at once', async () => {
    const asked = [1, 2, 3].map(() => loadVehiclePhotoSource(ORG, url('boat.jpg')))
    await settle()
    expect(sharpCalls).toHaveLength(1)
    done(decodes[0])
    const [a, b, c] = await Promise.all(asked)
    expect(a?.width).toBe(600)
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('is tried once for a photo that cannot be made, and again for a new upload', async () => {
    const first = loadVehiclePhotoSource(ORG, url('broken.jpg'))
    await settle()
    decodes[0].reject(new Error('VipsJpeg: premature end of input'))
    await expect(first).resolves.toBeNull()

    await expect(loadVehiclePhotoSource(ORG, url('broken.jpg'))).resolves.toBeNull()
    await expect(loadVehiclePhotoSource(ORG, url('broken.jpg'))).resolves.toBeNull()
    expect(sharpCalls).toHaveLength(1)

    versions['broken.jpg'] = 2
    const fresh = loadVehiclePhotoSource(ORG, url('broken.jpg'))
    await settle()
    expect(sharpCalls).toHaveLength(2)
    done(decodes[1])
    await expect(fresh).resolves.not.toBeNull()
  })

  it('runs for only a couple of photos at a time across every document', async () => {
    const names = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']
    const asked = names.map((name) => loadVehiclePhotoSource(ORG, url(name)))
    let finished = 0
    while (finished < names.length) {
      await settle()
      expect(decodes.length).toBeLessThanOrEqual(MAX_CONCURRENT_DECODES)
      expect(decodes.length).toBeGreaterThan(0)
      const next = decodes.shift() as Decode
      done(next)
      finished++
    }
    const sources = await Promise.all(asked)
    expect(sources.every((s) => s?.width === 600)).toBe(true)
    expect(sharpCalls).toHaveLength(names.length)
    expect(MAX_CONCURRENT_DECODES).toBeLessThanOrEqual(2)
  })

  it('leaves the rest of the server’s sharp alone, and refuses huge photos from the header', async () => {
    const asked = loadVehiclePhotoSource(ORG, url('boat.jpg'))
    await settle()
    done(decodes[0])
    await asked
    expect(concurrency).not.toHaveBeenCalled()
    expect(sharpCalls[0].options.limitInputPixels).toBe(MAX_INPUT_PIXELS)
    expect(MAX_INPUT_PIXELS).toBeLessThanOrEqual(40_000_000)
    expect(resizeCalls[0]).toMatchObject({ fastShrinkOnLoad: true })
  })

  it('runs on after a document stops waiting, and the next one gets its result', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const impatient = loadVehiclePhotoSource(ORG, url('slow.jpg'))
    await settle()
    await vi.advanceTimersByTimeAsync(PHOTO_TIMEOUT_MS + 10)
    await expect(impatient).resolves.toBeNull()

    // A refresh while it is still decoding starts nothing new.
    const refreshed = loadVehiclePhotoSource(ORG, url('slow.jpg'))
    await settle()
    expect(sharpCalls).toHaveLength(1)
    done(decodes[0])
    await expect(refreshed).resolves.not.toBeNull()
    await expect(loadVehiclePhotoSource(ORG, url('slow.jpg'))).resolves.not.toBeNull()
    expect(sharpCalls).toHaveLength(1)
  })
})

describe('issuing an invoice', () => {
  it('waits up to 15 s for the photo, on the decode a redraw started', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    expect(ISSUE_PHOTO_WAIT_MS).toBe(15_000)
    const redraw = loadVehiclePhotoSource(ORG, url('big.jpg'))
    const issue = loadVehiclePhotoSource(ORG, url('big.jpg'), { waitMs: ISSUE_PHOTO_WAIT_MS })
    await settle()
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(redraw).resolves.toBeNull()
    done(decodes[0])
    const kept = await issue
    expect(kept?.width).toBe(600)
    expect(sharpCalls).toHaveLength(1)
  })

  it('goes without the photo once 15 s have passed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const issue = loadVehiclePhotoSource(ORG, url('stuck.jpg'), { waitMs: ISSUE_PHOTO_WAIT_MS })
    await settle()
    await vi.advanceTimersByTimeAsync(ISSUE_PHOTO_WAIT_MS + 10)
    await expect(issue).resolves.toBeNull()
  })
})
