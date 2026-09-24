/**
 * @vitest-environment node
 *
 * "Add from phone" on an inspection: the signed link its QR code carries, and
 * the public route a phone posts to with it. One code covers the whole
 * checklist; the phone names the check each photo is for. Nobody is signed in
 * on that route, so what it lets through and where it writes are the point.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    inspection: { findFirst: vi.fn() },
    inspectionItem: { findFirst: vi.fn(), update: vi.fn() },
    inspectionAttachment: { count: vi.fn(), create: vi.fn() },
    auditLog: { count: vi.fn() },
  },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/image-upload.server', () => ({ compressPhoto: vi.fn() }))
vi.mock('@/lib/files/manager', () => ({ discardUnsavedUpload: vi.fn(async () => undefined) }))
vi.mock('@/lib/upload-root', () => ({ uploadsRoot: () => '/tmp/uploads' }))
vi.mock('node:fs/promises', () => {
  const fs = { mkdir: vi.fn(), writeFile: vi.fn() }
  return { ...fs, default: fs }
})

import { writeFile } from 'node:fs/promises'
import { db } from '@/lib/db'
import { compressPhoto } from '@/lib/image-upload.server'
import { discardUnsavedUpload } from '@/lib/files/manager'
import {
  createInspectionHandoffToken,
  createPhotoHandoffToken,
  isInspectionHandoffToken,
  PHOTO_HANDOFF_TTL_SECONDS,
  verifyInspectionHandoffToken,
  verifyPhotoHandoffToken,
} from '@/lib/photo-handoff'
import { POST } from '@/app/api/public/inspection-handoff/[token]/route'

const HANDOFF = { organizationId: 'org-1', inspectionId: 'insp-1', userId: 'user-1' }

function post(token: string, file?: File, itemId?: string) {
  const body = new FormData()
  if (file) body.append('file', file)
  if (itemId) body.append('itemId', itemId)
  return POST(
    new Request(`http://app.test/api/public/inspection-handoff/${token}`, {
      method: 'POST',
      body,
    }),
    { params: Promise.resolve({ token }) }
  )
}

const photo = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'IMG_0002.HEIC', { type: 'image/heic' })
const pdf = (bytes = '%PDF-1.7\n%ok') =>
  new File([bytes], 'signed-form.pdf', { type: 'application/pdf' })

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = 'test-secret-for-inspection-handoff'
  vi.mocked(db.inspection.findFirst)
    .mockReset()
    .mockResolvedValue({
      id: 'insp-1',
      status: 'in_progress',
      vehicle: { licensePlate: 'AB 12345' },
    } as never)
  vi.mocked(db.inspectionItem.findFirst)
    .mockReset()
    .mockResolvedValue({ id: 'item-1', name: 'Brake pads', imageUrls: [] } as never)
  vi.mocked(db.inspectionItem.update)
    .mockReset()
    .mockResolvedValue({} as never)
  vi.mocked(db.inspectionAttachment.count).mockReset().mockResolvedValue(0)
  vi.mocked(db.inspectionAttachment.create)
    .mockReset()
    .mockResolvedValue({ id: 'att-1' } as never)
  vi.mocked(db.auditLog.count).mockReset().mockResolvedValue(0)
  vi.mocked(compressPhoto)
    .mockReset()
    .mockResolvedValue({ data: Buffer.from('jpeg'), width: 1200, height: 900 })
  vi.mocked(writeFile).mockReset()
  vi.mocked(discardUnsavedUpload).mockClear()
})

describe('the signed inspection link', () => {
  it('reads back what it was made with, and says which kind it is', () => {
    const { token } = createInspectionHandoffToken(HANDOFF)
    expect(isInspectionHandoffToken(token)).toBe(true)
    const check = verifyInspectionHandoffToken(token)
    expect(check.ok && check.handoff).toMatchObject(HANDOFF)
  })

  it('lapses after half an hour', () => {
    const now = Date.UTC(2026, 8, 24, 12)
    const { token } = createInspectionHandoffToken(HANDOFF, now)
    expect(verifyInspectionHandoffToken(token, now + PHOTO_HANDOFF_TTL_SECONDS * 1000)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('cannot be passed off as a work order code, nor a work order code as one', () => {
    const inspection = createInspectionHandoffToken(HANDOFF).token
    const workOrder = createPhotoHandoffToken({
      organizationId: 'org-1',
      serviceRecordId: 'job-1',
      concernId: null,
      purpose: 'photos',
      userId: 'user-1',
    }).token
    expect(verifyPhotoHandoffToken(inspection).ok).toBe(false)
    expect(verifyInspectionHandoffToken(workOrder).ok).toBe(false)
    expect(isInspectionHandoffToken(workOrder)).toBe(false)

    // Same body under the other prefix: the prefix is part of what is signed.
    const [, body, signature] = inspection.split('.')
    expect(verifyPhotoHandoffToken(`ph1.${body}.${signature}`).ok).toBe(false)
  })

  it('refuses a link pointed at another inspection', () => {
    const { token } = createInspectionHandoffToken(HANDOFF)
    const [prefix, body, signature] = token.split('.')
    const other = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), i: 'insp-2' })
    ).toString('base64url')
    expect(verifyInspectionHandoffToken(`${prefix}.${other}.${signature}`).ok).toBe(false)
  })
})

describe('the inspection phone route', () => {
  it('appends a photo to the check it names, compressed, never writing the list back', async () => {
    const { token } = createInspectionHandoffToken(HANDOFF)
    const res = await post(token, photo(), 'item-1')

    expect(res.status).toBe(201)
    expect(compressPhoto).toHaveBeenCalledOnce()
    expect(vi.mocked(db.inspectionItem.findFirst).mock.calls[0][0]?.where).toEqual({
      id: 'item-1',
      inspectionId: 'insp-1',
    })
    const update = vi.mocked(db.inspectionItem.update).mock.calls[0][0]
    expect(update.where).toEqual({ id: 'item-1' })
    expect(update.data).toEqual({
      imageUrls: {
        push: expect.stringMatching(/^\/api\/protected\/files\/org-1\/services\/.+\.jpg$/),
      },
    })
    expect(db.inspectionAttachment.create).not.toHaveBeenCalled()
  })

  it('files a photo without a check on the inspection itself, shown to the customer', async () => {
    const { token } = createInspectionHandoffToken(HANDOFF)
    const res = await post(token, photo())

    expect(res.status).toBe(201)
    expect(vi.mocked(db.inspectionAttachment.create).mock.calls[0][0].data).toMatchObject({
      inspectionId: 'insp-1',
      category: 'image',
      fileType: 'image/jpeg',
      fileName: 'IMG_0002.jpg',
      includeInReport: true,
    })
  })

  it('takes a PDF on the inspection, kept from the customer until the workshop shows it', async () => {
    const { token } = createInspectionHandoffToken(HANDOFF)
    const res = await post(token, pdf())

    expect(res.status).toBe(201)
    expect(compressPhoto).not.toHaveBeenCalled()
    expect(vi.mocked(db.inspectionAttachment.create).mock.calls[0][0].data).toMatchObject({
      category: 'document',
      fileType: 'application/pdf',
      includeInReport: false,
    })
  })

  it('refuses a PDF on a check, and a file that only calls itself a PDF', async () => {
    const { token } = createInspectionHandoffToken(HANDOFF)
    expect((await post(token, pdf(), 'item-1')).status).toBe(400)
    expect((await post(token, pdf('MZ not a pdf'))).status).toBe(400)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('refuses a check that is not on this inspection', async () => {
    vi.mocked(db.inspectionItem.findFirst).mockResolvedValue(null)
    const { token } = createInspectionHandoffToken(HANDOFF)
    const res = await post(token, photo(), 'someone-elses-item')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ code: 'noItem' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('closes the checks of a completed inspection, but not the inspection itself', async () => {
    vi.mocked(db.inspection.findFirst).mockResolvedValue({
      id: 'insp-1',
      status: 'completed',
      vehicle: null,
    } as never)
    const { token } = createInspectionHandoffToken(HANDOFF)

    const onCheck = await post(token, photo(), 'item-1')
    expect(onCheck.status).toBe(409)
    expect(await onCheck.json()).toEqual({ code: 'completed' })

    expect((await post(token, pdf())).status).toBe(201)
  })

  it('stops a check at its cap, and a code at its budget', async () => {
    const { token } = createInspectionHandoffToken(HANDOFF)
    vi.mocked(db.inspectionItem.findFirst).mockResolvedValue({
      id: 'item-1',
      name: 'Brake pads',
      imageUrls: Array.from({ length: 20 }, (_, i) => `/p/${i}.jpg`),
    } as never)
    expect(await (await post(token, photo(), 'item-1')).json()).toEqual({ code: 'limit' })

    vi.mocked(db.inspectionItem.findFirst).mockResolvedValue({
      id: 'item-1',
      name: 'Brake pads',
      imageUrls: [],
    } as never)
    // Sixty phone uploads since the code was issued, by the audit log; what
    // the desk added meanwhile is not held against the phone.
    vi.mocked(db.auditLog.count).mockResolvedValue(60)
    expect(await (await post(token, photo(), 'item-1')).json()).toEqual({ code: 'codeLimit' })
    expect(vi.mocked(db.auditLog.count).mock.calls.at(-1)?.[0]?.where).toMatchObject({
      action: { in: ['inspection.photo_added', 'inspection.file_added'] },
    })
  })

  it('refuses an expired or a forged code before reading anything', async () => {
    const now = Date.now() - (PHOTO_HANDOFF_TTL_SECONDS + 5) * 1000
    const { token } = createInspectionHandoffToken(HANDOFF, now)
    expect((await post(token, photo())).status).toBe(410)
    expect((await post('ih1.bogus.bogus', photo())).status).toBe(404)
    expect(db.inspection.findFirst).not.toHaveBeenCalled()
  })

  it('removes the written file when its row cannot be saved', async () => {
    vi.mocked(db.inspectionAttachment.create).mockRejectedValue(new Error('db down'))
    const { token } = createInspectionHandoffToken(HANDOFF)
    await expect(post(token, photo())).rejects.toThrow('db down')
    expect(discardUnsavedUpload).toHaveBeenCalledWith(
      'org-1',
      'services',
      expect.stringMatching(/\.jpg$/)
    )
  })
})
