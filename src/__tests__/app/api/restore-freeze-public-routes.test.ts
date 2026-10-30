/**
 * @vitest-environment node
 *
 * The public routes that write for a workshop without anyone signed in:
 * while that workshop is being restored they answer 409 and write nothing,
 * so a phone's photo or a customer's answer is not lost under the restore.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ frozen: new Set<string>() }))

vi.mock('@/lib/backup/freeze', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/backup/freeze')>()
  return {
    ...real,
    isRestoring: (organizationId: string) => state.frozen.has(organizationId),
    assertNotRestoring: (organizationId: string) => {
      if (state.frozen.has(organizationId)) throw new real.RestoreInProgressError()
    },
  }
})
vi.mock('@/lib/db', () => ({
  db: {
    inspection: { findFirst: vi.fn() },
    inspectionItem: { findFirst: vi.fn(), update: vi.fn() },
    inspectionAttachment: { count: vi.fn(), create: vi.fn() },
    inspectionQuoteRequest: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), update: vi.fn() },
    quote: { findFirst: vi.fn(), update: vi.fn() },
    auditLog: { count: vi.fn() },
  },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
// The actions' signed-in halves are not under test here.
vi.mock('@/lib/with-auth', () => ({ withAuth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/notify', () => ({ notify: vi.fn() }))
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
import { RESTORE_IN_PROGRESS_MESSAGE } from '@/lib/backup/freeze'
import { createInspectionHandoffToken, createPhotoHandoffToken } from '@/lib/photo-handoff'
import { POST as inspectionHandoffPost } from '@/app/api/public/inspection-handoff/[token]/route'
import { POST as photoHandoffPost } from '@/app/api/public/photo-handoff/[token]/route'
import {
  DELETE as quoteRequestDelete,
  POST as quoteRequestPost,
} from '@/app/api/public/forms/inspection-quote-request/route'
import { POST as quoteResponsePost } from '@/app/api/public/forms/quote-response/route'
import { POST as trackViewPost } from '@/app/api/public/track-view/route'

const ORG = 'org-frozen'

function upload(url: string, token: string, post: typeof inspectionHandoffPost) {
  const body = new FormData()
  body.append(
    'file',
    new File([new Uint8Array([0xff, 0xd8, 0xff])], 'a.jpg', { type: 'image/jpeg' })
  )
  return post(new Request(url, { method: 'POST', body }), {
    params: Promise.resolve({ token }),
  })
}

function json(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.BETTER_AUTH_SECRET = 'test-secret-for-freeze-public-routes'
  state.frozen.clear()
  state.frozen.add(ORG)
})

describe('phone handoff routes during a restore', () => {
  it('inspection handoff answers 409 with the restore message and writes nothing', async () => {
    const { token } = createInspectionHandoffToken({
      organizationId: ORG,
      inspectionId: 'insp-1',
      userId: 'user-1',
    })
    const res = await upload(
      `http://app.test/api/public/inspection-handoff/${token}`,
      token,
      inspectionHandoffPost
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ code: 'restoring', error: RESTORE_IN_PROGRESS_MESSAGE })
    expect(db.inspection.findFirst).not.toHaveBeenCalled()
    expect(db.inspectionAttachment.create).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('inspection handoff goes on for a workshop that is not frozen', async () => {
    state.frozen.clear()
    vi.mocked(db.inspection.findFirst).mockResolvedValue(null)
    const { token } = createInspectionHandoffToken({
      organizationId: ORG,
      inspectionId: 'insp-1',
      userId: 'user-1',
    })
    const res = await upload(
      `http://app.test/api/public/inspection-handoff/${token}`,
      token,
      inspectionHandoffPost
    )
    // Past the freeze check: the (missing) inspection is what answers.
    expect(res.status).toBe(404)
    expect(db.inspection.findFirst).toHaveBeenCalledTimes(1)
  })

  it('work order photo handoff answers 409 and writes nothing', async () => {
    const { token } = createPhotoHandoffToken({
      organizationId: ORG,
      serviceRecordId: 'job-1',
      concernId: null,
      purpose: 'photos',
      userId: 'user-1',
    })
    const res = await upload(
      `http://app.test/api/public/photo-handoff/${token}`,
      token,
      photoHandoffPost
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ code: 'restoring', error: RESTORE_IN_PROGRESS_MESSAGE })
    expect(db.serviceRecord.findFirst).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })
})

describe('customer forms during a restore', () => {
  it('a quote request from an inspection answers 409 and creates nothing', async () => {
    vi.mocked(db.inspection.findFirst).mockResolvedValue({
      id: 'insp-1',
      organizationId: ORG,
      vehicle: null,
      items: [],
    } as never)
    const res = await quoteRequestPost(
      json('http://app.test/api/public/forms/inspection-quote-request', {
        inspectionId: 'insp-1',
        publicToken: 'tok-1',
        selectedItemIds: ['item-1'],
      })
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ success: false, error: RESTORE_IN_PROGRESS_MESSAGE })
    expect(db.inspectionQuoteRequest.create).not.toHaveBeenCalled()
  })

  it('cancelling a quote request answers 409 and deletes nothing', async () => {
    vi.mocked(db.inspection.findFirst).mockResolvedValue({
      id: 'insp-1',
      organizationId: ORG,
    } as never)
    vi.mocked(db.inspectionQuoteRequest.findFirst).mockResolvedValue({ id: 'req-1' } as never)
    const res = await quoteRequestDelete(
      json(
        'http://app.test/api/public/forms/inspection-quote-request',
        { inspectionId: 'insp-1', publicToken: 'tok-1' },
        'DELETE'
      )
    )
    expect(res.status).toBe(409)
    expect(db.inspectionQuoteRequest.delete).not.toHaveBeenCalled()
  })

  it('answering a shared quote answers 409 and changes nothing', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue({
      id: 'quote-1',
      organizationId: ORG,
      status: 'sent',
      customer: null,
    } as never)
    const res = await quoteResponsePost(
      json('http://app.test/api/public/forms/quote-response', {
        quoteId: 'quote-1',
        publicToken: 'tok-1',
        action: 'accepted',
      })
    )
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ success: false, error: RESTORE_IN_PROGRESS_MESSAGE })
    expect(db.quote.update).not.toHaveBeenCalled()
  })

  it('a view stamp is skipped for a frozen workshop and written for another', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      id: 'job-1',
      organizationId: ORG,
    } as never)
    const frozenRes = await trackViewPost(
      json('http://app.test/api/public/track-view', { type: 'invoice', token: 'tok-1' }) as never
    )
    expect(frozenRes.status).toBe(409)
    expect(db.serviceRecord.update).not.toHaveBeenCalled()

    vi.mocked(db.quote.findFirst).mockResolvedValue({
      id: 'q-1',
      organizationId: 'org-live',
    } as never)
    vi.mocked(db.quote.update).mockResolvedValue({} as never)
    const liveRes = await trackViewPost(
      json('http://app.test/api/public/track-view', { type: 'quote', token: 'tok-2' }) as never
    )
    expect(liveRes.status).toBe(200)
    expect(db.quote.update).toHaveBeenCalledTimes(1)
  })
})
