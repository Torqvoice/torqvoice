/**
 * @vitest-environment node
 *
 * "Add from phone": the signed link a work order's QR code carries, and the
 * public route a phone posts photos to with it. Nobody is signed in on that
 * route, so what it lets through and how much it may write are the point.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    serviceRecord: { findFirst: vi.fn() },
    serviceConcern: { findFirst: vi.fn() },
    serviceAttachment: { count: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn() }))
vi.mock('@/lib/image-upload.server', () => ({ compressPhoto: vi.fn() }))
vi.mock('@/lib/files/manager', () => ({ discardUnsavedUpload: vi.fn(async () => undefined) }))
vi.mock('@/lib/upload-root', () => ({ uploadsRoot: () => '/tmp/uploads' }))
vi.mock('node:fs/promises', () => {
  const fs = { mkdir: vi.fn(), writeFile: vi.fn() }
  return { ...fs, default: fs }
})

import { writeFile } from 'node:fs/promises'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { compressPhoto } from '@/lib/image-upload.server'
import { discardUnsavedUpload } from '@/lib/files/manager'
import {
  createPhotoHandoffToken,
  PHOTO_HANDOFF_TTL_SECONDS,
  verifyPhotoHandoffToken,
} from '@/lib/photo-handoff'
import { POST } from '@/app/api/public/photo-handoff/[token]/route'

const HANDOFF = {
  organizationId: 'org-1',
  serviceRecordId: 'job-1',
  concernId: 'concern-1',
  purpose: 'photos' as const,
  userId: 'user-1',
}
const DROPOFF = { ...HANDOFF, concernId: null, purpose: 'dropoff' as const }

function post(token: string, file?: File, slot?: string) {
  const body = new FormData()
  if (file) body.append('file', file)
  if (slot) body.append('slot', slot)
  return POST(
    new Request(`http://app.test/api/public/photo-handoff/${token}`, { method: 'POST', body }),
    {
      params: Promise.resolve({ token }),
    }
  )
}

const photo = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'IMG_0001.HEIC', { type: 'image/heic' })

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = 'test-secret-for-photo-handoff'
  vi.mocked(db.serviceRecord.findFirst)
    .mockReset()
    .mockResolvedValue({ id: 'job-1', invoiceNumber: 'WO-7' } as never)
  vi.mocked(db.serviceConcern.findFirst)
    .mockReset()
    .mockResolvedValue({ id: 'concern-1' } as never)
  vi.mocked(db.serviceAttachment.count).mockReset().mockResolvedValue(0)
  vi.mocked(db.serviceAttachment.create)
    .mockReset()
    .mockResolvedValue({ id: 'att-1' } as never)
  vi.mocked(getFeatures)
    .mockReset()
    .mockResolvedValue({ maxImagesPerService: 999999 } as never)
  vi.mocked(compressPhoto)
    .mockReset()
    .mockResolvedValue({ data: Buffer.from('jpeg'), width: 1200, height: 900 })
  vi.mocked(writeFile).mockReset()
})

const pdf = (bytes = '%PDF-1.7\n%ok') =>
  new File([bytes], 'old-invoice.pdf', { type: 'application/pdf' })

describe('the signed link', () => {
  it('reads back what it was made with', () => {
    const { token } = createPhotoHandoffToken(HANDOFF)
    const check = verifyPhotoHandoffToken(token)
    expect(check.ok && check.handoff).toMatchObject(HANDOFF)
  })

  it('lapses after half an hour, and says so rather than calling it broken', () => {
    const now = Date.UTC(2026, 8, 19, 12)
    const { token } = createPhotoHandoffToken(HANDOFF, now)
    expect(verifyPhotoHandoffToken(token, now + (PHOTO_HANDOFF_TTL_SECONDS - 1) * 1000).ok).toBe(
      true
    )
    expect(verifyPhotoHandoffToken(token, now + PHOTO_HANDOFF_TTL_SECONDS * 1000)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('refuses a link that was changed, pointed at another job, or signed with another secret', () => {
    const { token } = createPhotoHandoffToken(HANDOFF)
    const [prefix, body, signature] = token.split('.')
    const otherJob = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), r: 'job-2' })
    ).toString('base64url')
    expect(verifyPhotoHandoffToken(`${prefix}.${otherJob}.${signature}`).ok).toBe(false)
    expect(verifyPhotoHandoffToken(`${prefix}.${body}.${signature.slice(0, -2)}xx`).ok).toBe(false)
    expect(verifyPhotoHandoffToken(`wa1.${body}.${signature}`).ok).toBe(false)
    expect(verifyPhotoHandoffToken('nonsense').ok).toBe(false)

    process.env.BETTER_AUTH_SECRET = 'a-different-secret'
    expect(verifyPhotoHandoffToken(token)).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('the phone upload route', () => {
  it('stores the photo compressed, as a JPEG, under the concern the code names', async () => {
    const { token } = createPhotoHandoffToken(HANDOFF)
    const res = await post(token, photo())

    expect(res.status).toBe(201)
    expect(compressPhoto).toHaveBeenCalledOnce()
    expect(vi.mocked(writeFile).mock.calls[0][0]).toMatch(
      /^\/tmp\/uploads\/org-1\/services\/[0-9a-f-]+\.jpg$/
    )
    expect(vi.mocked(db.serviceAttachment.create).mock.calls[0][0].data).toMatchObject({
      serviceRecordId: 'job-1',
      concernId: 'concern-1',
      category: 'image',
      fileType: 'image/jpeg',
      fileName: 'IMG_0001.jpg',
      fileSize: 4,
    })
  })

  it('files the photo on the job when its concern has since been removed', async () => {
    vi.mocked(db.serviceConcern.findFirst).mockResolvedValue(null)
    const { token } = createPhotoHandoffToken(HANDOFF)
    expect((await post(token, photo())).status).toBe(201)
    expect(vi.mocked(db.serviceAttachment.create).mock.calls[0][0].data.concernId).toBeNull()
  })

  it('tells an expired code from a broken one', async () => {
    const { token } = createPhotoHandoffToken(
      HANDOFF,
      Date.now() - PHOTO_HANDOFF_TTL_SECONDS * 1000 - 1
    )
    const expired = await post(token, photo())
    expect(expired.status).toBe(410)
    expect(await expired.json()).toEqual({ code: 'expired' })

    const broken = await post('ph1.e30.nope', photo())
    expect(broken.status).toBe(404)
    expect(db.serviceAttachment.create).not.toHaveBeenCalled()
  })

  it('refuses a code for a job that is not in the workshop it names', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null)
    const { token } = createPhotoHandoffToken(HANDOFF)
    expect((await post(token, photo())).status).toBe(404)
  })

  it('refuses what is not a photo, by type and by content, before writing anything', async () => {
    const { token } = createPhotoHandoffToken(HANDOFF)
    const pdf = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })
    expect(await (await post(token, pdf)).json()).toEqual({ code: 'type' })

    vi.mocked(compressPhoto).mockRejectedValue(new Error('Not an image we can read'))
    expect(await (await post(token, photo())).json()).toEqual({ code: 'type' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('refuses an upload too large to be a phone photo without decoding it', async () => {
    const { token } = createPhotoHandoffToken(HANDOFF)
    const huge = new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })
    expect(await (await post(token, huge)).json()).toEqual({ code: 'tooLarge' })
    expect(compressPhoto).not.toHaveBeenCalled()
  })

  it('keeps a PDF as it is, and off the invoice until the workshop has looked at it', async () => {
    vi.mocked(getFeatures).mockResolvedValue({
      maxImagesPerService: 999999,
      maxDocumentsPerService: 999999,
    } as never)
    const { token } = createPhotoHandoffToken(HANDOFF)
    const res = await post(token, pdf())

    expect(res.status).toBe(201)
    expect(compressPhoto).not.toHaveBeenCalled()
    expect(vi.mocked(writeFile).mock.calls[0][0]).toMatch(/\.pdf$/)
    expect(vi.mocked(db.serviceAttachment.create).mock.calls[0][0].data).toMatchObject({
      category: 'document',
      fileType: 'application/pdf',
      fileName: 'old-invoice.pdf',
      includeInInvoice: false,
    })
  })

  it('refuses a file that only calls itself a PDF, and a PDF too large to take', async () => {
    vi.mocked(getFeatures).mockResolvedValue({ maxDocumentsPerService: 999999 } as never)
    const { token } = createPhotoHandoffToken(HANDOFF)
    expect(await (await post(token, pdf('<html>not a pdf</html>'))).json()).toEqual({
      code: 'type',
    })
    const big = new File([`%PDF-${'x'.repeat(10 * 1024 * 1024)}`], 'big.pdf', {
      type: 'application/pdf',
    })
    expect(await (await post(token, big)).json()).toEqual({ code: 'tooLarge' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('stops at twenty documents on a job', async () => {
    vi.mocked(getFeatures).mockResolvedValue({ maxDocumentsPerService: 999999 } as never)
    vi.mocked(db.serviceAttachment.count).mockResolvedValueOnce(20).mockResolvedValueOnce(0)
    const { token } = createPhotoHandoffToken(HANDOFF)
    expect(await (await post(token, pdf())).json()).toEqual({ code: 'limit' })
  })

  it('removes the file again when its row cannot be written', async () => {
    vi.mocked(db.serviceAttachment.create).mockRejectedValue(new Error('database gone'))
    const { token } = createPhotoHandoffToken(HANDOFF)
    await expect(post(token, photo())).rejects.toThrow('database gone')
    const written = String(vi.mocked(writeFile).mock.calls[0][0])
    expect(discardUnsavedUpload).toHaveBeenCalledWith('org-1', 'services', written.split('/').pop())
  })

  it('stops at a hundred photos on a job, even on a plan without a cap', async () => {
    vi.mocked(db.serviceAttachment.count).mockResolvedValueOnce(100).mockResolvedValueOnce(0)
    const { token } = createPhotoHandoffToken(HANDOFF)
    const res = await post(token, photo())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ code: 'limit' })
    expect(compressPhoto).not.toHaveBeenCalled()
  })

  it('stops at the plan cap when it is lower', async () => {
    vi.mocked(getFeatures).mockResolvedValue({ maxImagesPerService: 10 } as never)
    vi.mocked(db.serviceAttachment.count).mockResolvedValueOnce(10).mockResolvedValueOnce(0)
    const { token } = createPhotoHandoffToken(HANDOFF)
    expect(await (await post(token, photo())).json()).toEqual({ code: 'limit' })
  })

  it('stops one code at thirty photos, counted from when it was shown', async () => {
    vi.mocked(db.serviceAttachment.count).mockResolvedValueOnce(30).mockResolvedValueOnce(30)
    const now = Date.now()
    const { token } = createPhotoHandoffToken(HANDOFF, now)
    expect(await (await post(token, photo())).json()).toEqual({ code: 'codeLimit' })

    const sinceShown = vi.mocked(db.serviceAttachment.count).mock.calls[1][0]?.where?.createdAt as {
      gte: Date
    }
    expect(Math.abs(sinceShown.gte.getTime() - now)).toBeLessThan(1000)
  })
  // The walk round the car as it arrives: a code of its own, signed as such.
  it('carries its purpose in the signature, and an ordinary code stays an ordinary code', () => {
    const dropoff = verifyPhotoHandoffToken(createPhotoHandoffToken(DROPOFF).token)
    expect(dropoff.ok && dropoff.handoff.purpose).toBe('dropoff')
    const ordinary = verifyPhotoHandoffToken(createPhotoHandoffToken(HANDOFF).token)
    expect(ordinary.ok && ordinary.handoff.purpose).toBe('photos')
  })

  it('files a drop-off photo on its own, off the invoice, named for its shot', async () => {
    const { token } = createPhotoHandoffToken(DROPOFF)
    const res = await post(token, photo(), 'odometer')
    expect(res.status).toBe(201)
    expect(vi.mocked(db.serviceAttachment.create).mock.calls[0][0].data).toMatchObject({
      category: 'dropoff',
      includeInInvoice: false,
      description: 'odometer',
      concernId: null,
    })
  })

  it('takes nothing the phone says about the shot except a name from the list', async () => {
    const { token } = createPhotoHandoffToken(DROPOFF)
    await post(token, photo(), '<b>front</b>')
    expect(vi.mocked(db.serviceAttachment.create).mock.calls[0][0].data.description).toBe('other')
  })

  it('ignores a shot name on an ordinary code', async () => {
    const { token } = createPhotoHandoffToken(HANDOFF)
    await post(token, photo(), 'front')
    expect(vi.mocked(db.serviceAttachment.create).mock.calls[0][0].data).toMatchObject({
      category: 'image',
      includeInInvoice: true,
      description: null,
    })
  })

  it('refuses a document on a drop-off code', async () => {
    const { token } = createPhotoHandoffToken(DROPOFF)
    const res = await post(token, pdf())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ code: 'type' })
    expect(db.serviceAttachment.create).not.toHaveBeenCalled()
  })

  it('stops at thirty drop-off photos on a job, whatever the plan allows for photos', async () => {
    vi.mocked(db.serviceAttachment.count).mockResolvedValueOnce(30).mockResolvedValueOnce(0)
    const { token } = createPhotoHandoffToken(DROPOFF)
    expect(await (await post(token, photo(), 'front')).json()).toEqual({ code: 'limit' })
    expect(vi.mocked(db.serviceAttachment.count).mock.calls[0][0]?.where).toMatchObject({
      category: 'dropoff',
    })
  })
})
