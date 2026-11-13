/**
 * @vitest-environment node
 *
 * A vehicle's "Add from phone": the signed link its QR code carries, and the
 * public route a phone posts the vehicle's photo to with it. Nobody is signed
 * in on that route, so what it lets through, and which vehicle it may touch,
 * are the point.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { vehicle: { findFirst: vi.fn(), updateMany: vi.fn() } },
}))
vi.mock('@/lib/backup/freeze', () => ({
  isRestoring: vi.fn(() => false),
  RESTORE_IN_PROGRESS_MESSAGE: 'A restore is in progress.',
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('@/lib/image-upload.server', () => ({ compressPhoto: vi.fn() }))
vi.mock('@/lib/files/manager', () => ({
  releaseFiles: vi.fn(async () => undefined),
  discardUnsavedUpload: vi.fn(async () => undefined),
}))
vi.mock('@/lib/upload-root', () => ({ uploadsRoot: () => '/tmp/uploads' }))
vi.mock('node:fs/promises', () => {
  const fs = { mkdir: vi.fn(), writeFile: vi.fn() }
  return { ...fs, default: fs }
})

import { writeFile } from 'node:fs/promises'
import { db } from '@/lib/db'
import { isRestoring } from '@/lib/backup/freeze'
import { compressPhoto } from '@/lib/image-upload.server'
import { releaseFiles } from '@/lib/files/manager'
import { createVehicleHandoffToken } from '@/lib/photo-handoff'
import { POST } from '@/app/api/public/vehicle-handoff/[token]/route'

const HANDOFF = { organizationId: 'org-1', vehicleId: 'veh-1', userId: 'user-1' }
const OLD_PHOTO = '/api/protected/files/org-1/vehicles/old.jpg'

function post(token: string, file?: File) {
  const body = new FormData()
  if (file) body.append('file', file)
  return POST(
    new Request(`http://app.test/api/public/vehicle-handoff/${token}`, { method: 'POST', body }),
    { params: Promise.resolve({ token }) }
  )
}

const photo = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'IMG_0001.HEIC', { type: 'image/heic' })

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = 'test-secret-for-vehicle-handoff'
  vi.mocked(db.vehicle.findFirst)
    .mockReset()
    .mockResolvedValue({ id: 'veh-1', imageUrl: OLD_PHOTO } as never)
  vi.mocked(db.vehicle.updateMany).mockReset().mockResolvedValue({ count: 1 })
  vi.mocked(isRestoring).mockReset().mockReturnValue(false)
  vi.mocked(compressPhoto)
    .mockReset()
    .mockResolvedValue({ data: Buffer.from([1, 2, 3]), width: 1600, height: 1200 })
  vi.mocked(releaseFiles).mockClear()
  vi.mocked(writeFile).mockClear()
})

describe("a vehicle's phone photo", () => {
  it('becomes the photo of that vehicle, and the old one is let go', async () => {
    const { token } = createVehicleHandoffToken(HANDOFF)
    const res = await post(token, photo())

    expect(res.status).toBe(200)
    expect(writeFile).toHaveBeenCalledTimes(1)
    // Scoped to the workshop in the code, not just the vehicle id.
    expect(db.vehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'veh-1', organizationId: 'org-1' } })
    )
    expect(db.vehicle.updateMany).toHaveBeenCalledWith({
      where: { id: 'veh-1', organizationId: 'org-1' },
      data: {
        imageUrl: expect.stringMatching(/^\/api\/protected\/files\/org-1\/vehicles\/.+\.jpg$/),
      },
    })
    expect(releaseFiles).toHaveBeenCalledWith(
      [OLD_PHOTO],
      expect.objectContaining({ organizationId: 'org-1' })
    )
  })

  it('says an old code has expired and writes nothing', async () => {
    const now = Date.now()
    const { token } = createVehicleHandoffToken(HANDOFF, now - 31 * 60 * 1000)
    const res = await post(token, photo())

    expect(res.status).toBe(410)
    expect(writeFile).not.toHaveBeenCalled()
    expect(db.vehicle.updateMany).not.toHaveBeenCalled()
  })

  it('touches nothing when the vehicle is not in that workshop', async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null)
    const { token } = createVehicleHandoffToken(HANDOFF)
    const res = await post(token, photo())

    expect(res.status).toBe(404)
    expect(writeFile).not.toHaveBeenCalled()
    expect(db.vehicle.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a file that is not a photo', async () => {
    const { token } = createVehicleHandoffToken(HANDOFF)
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'bill.pdf', {
      type: 'application/pdf',
    })
    const res = await post(token, pdf)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ code: 'type' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('waits while the workshop is being restored', async () => {
    vi.mocked(isRestoring).mockReturnValue(true)
    const { token } = createVehicleHandoffToken(HANDOFF)
    const res = await post(token, photo())

    expect(res.status).toBe(409)
    expect(db.vehicle.findFirst).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })
})
