/**
 * @vitest-environment node
 *
 * A share link opens the files its document shows the customer, and nothing
 * else of the workshop: not another job's photos, not another workshop's,
 * even with a valid token and a real file name. And it does so cheaply: a
 * share page asks once per picture, so each file is one lookup of the token
 * and one narrow question, never a load of everything the document holds.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('@/lib/db', () => ({
  db: {
    statusReport: { findFirst: vi.fn() },
    serviceAttachment: { findFirst: vi.fn() },
    quoteAttachment: { findFirst: vi.fn() },
    inspectionItem: { findFirst: vi.fn() },
    inspectionAttachment: { findFirst: vi.fn() },
    appSetting: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/share-link.server', () => ({ findSharedDocumentOfAnyKind: vi.fn() }))

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { findSharedDocumentOfAnyKind } from '@/lib/share-link.server'
import {
  isSharedFile,
  resolveSharedFileToken,
  type SharedFileDocument,
  storedFileKey,
  storedFileUrls,
} from '@/lib/shared-files.server'
import { GET } from '@/app/api/public/files/[token]/[...path]/route'

const ORG = 'org_a'
const OTHER_ORG = 'org_b'
const url = (category: string, file: string, org = ORG) =>
  `/api/protected/files/${org}/${category}/${file}`

type Row = Record<string, unknown>

/** Every link of the two workshops: which document a token opens, and whether it is open. */
const shared: Record<
  string,
  { kind: 'invoice' | 'quote' | 'inspection'; id: string; organizationId: string; open: boolean }
> = {
  'job-token': { kind: 'invoice', id: 'job', organizationId: ORG, open: true },
  'other-job-token': { kind: 'invoice', id: 'other-job', organizationId: ORG, open: true },
  'closed-job-token': { kind: 'invoice', id: 'closed-job', organizationId: ORG, open: false },
  'stranger-job-token': {
    kind: 'invoice',
    id: 'stranger-job',
    organizationId: OTHER_ORG,
    open: true,
  },
  'quote-token': { kind: 'quote', id: 'quote', organizationId: ORG, open: true },
  'inspection-token': { kind: 'inspection', id: 'inspection', organizationId: ORG, open: true },
}

const serviceAttachments: Row[] = [
  { serviceRecordId: 'job', fileUrl: url('services', 'job-photo.jpg'), includeInInvoice: true },
  { serviceRecordId: 'job', fileUrl: url('services', 'job-report.pdf'), includeInInvoice: true },
  { serviceRecordId: 'job', fileUrl: url('tire-hotel', 'tire-set.jpg'), includeInInvoice: true },
  { serviceRecordId: 'job', fileUrl: url('services', 'job-video.mp4'), includeInInvoice: true },
  // Kept off the invoice by the workshop: the page does not list it.
  {
    serviceRecordId: 'job',
    fileUrl: url('services', 'job-internal.jpg'),
    includeInInvoice: false,
  },
  {
    serviceRecordId: 'other-job',
    fileUrl: url('services', 'other-job-photo.jpg'),
    includeInInvoice: true,
  },
  {
    serviceRecordId: 'stranger-job',
    fileUrl: url('services', 'stranger-photo.jpg', OTHER_ORG),
    includeInInvoice: true,
  },
]

const quoteAttachments: Row[] = [
  { quoteId: 'quote', fileUrl: url('quotes', 'quote-photo.jpg'), category: 'image' },
  { quoteId: 'quote', fileUrl: url('quotes', 'quote-terms.pdf'), category: 'document' },
  // A category the share page does not list.
  { quoteId: 'quote', fileUrl: url('quotes', 'quote-other.jpg'), category: 'internal' },
]

const inspectionItems: Row[] = [
  {
    inspectionId: 'inspection',
    imageUrls: [url('inspections', 'brake-pads.jpg'), url('inspections', 'noise.mp4')],
  },
  // The older address form is still on records.
  { inspectionId: 'inspection', imageUrls: [`/api/files/${ORG}/inspections/tyre-tread.jpg`] },
]

const inspectionAttachments: Row[] = [
  { inspectionId: 'inspection', fileUrl: url('documents', 'overview.jpg'), includeInReport: true },
  {
    inspectionId: 'inspection',
    fileUrl: url('documents', 'hidden-paperwork.pdf'),
    includeInReport: false,
  },
]

const statusReports: Record<
  string,
  { id: string; organizationId: string; videoUrl: string | null; expiresAt: Date | null }
> = {
  'report-token': {
    id: 'report',
    organizationId: ORG,
    videoUrl: url('services', 'walkaround.mp4'),
    expiresAt: null,
  },
  'expired-report-token': {
    id: 'old-report',
    organizationId: ORG,
    videoUrl: url('services', 'old-walkaround.mp4'),
    expiresAt: new Date('2000-01-01'),
  },
}

const settings = [
  { organizationId: ORG, key: 'workshop.logo', value: url('logos', 'company.png') },
  { organizationId: ORG, key: 'quote.logo', value: ` ${url('logos', 'quote-letterhead.png')} ` },
  {
    organizationId: OTHER_ORG,
    key: 'workshop.logo',
    value: url('logos', 'stranger.png', OTHER_ORG),
  },
]

/** Applies a Prisma `where` of the shapes the helper uses to one row. */
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const actual = row[key]
    if (condition && typeof condition === 'object') {
      if ('in' in condition) return (condition.in as unknown[]).includes(actual)
      if ('hasSome' in condition) {
        return (condition.hasSome as unknown[]).some((value) =>
          (actual as unknown[]).includes(value)
        )
      }
    }
    return actual === condition
  })
}

/** A `findFirst` over fixture rows that honours the query's filters. */
function findFirstIn(rows: Row[]) {
  return (async (args: { where: Record<string, unknown> }) =>
    rows.find((row) => matches(row, args.where)) ? { id: 'row' } : null) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(findSharedDocumentOfAnyKind).mockImplementation(async (token: string) => {
    const doc = shared[token]
    return doc ? ({ ...doc, expiry: {} } as never) : null
  })
  vi.mocked(db.statusReport.findFirst).mockImplementation(
    (async (args: { where: { publicToken: string } }) =>
      statusReports[args.where.publicToken] ?? null) as never
  )
  vi.mocked(db.serviceAttachment.findFirst).mockImplementation(findFirstIn(serviceAttachments))
  vi.mocked(db.quoteAttachment.findFirst).mockImplementation(findFirstIn(quoteAttachments))
  vi.mocked(db.inspectionItem.findFirst).mockImplementation(findFirstIn(inspectionItems))
  vi.mocked(db.inspectionAttachment.findFirst).mockImplementation(
    findFirstIn(inspectionAttachments)
  )
  vi.mocked(db.appSetting.findMany).mockImplementation((async (args: {
    where: { organizationId: string; key: { in: string[] } }
  }) =>
    settings.filter(
      (row) =>
        row.organizationId === args.where.organizationId && args.where.key.in.includes(row.key)
    )) as never)
})

async function opens(token: string, category: string, file: string) {
  const resolved = await resolveSharedFileToken(token)
  return resolved.status === 'open' && (await isSharedFile(resolved.document, category, file))
}

describe('stored addresses', () => {
  it('reads both address forms of this workshop', () => {
    expect(storedFileKey(url('services', 'a.jpg'), ORG)).toBe('services/a.jpg')
    expect(storedFileKey(`/api/files/${ORG}/services/a.jpg`, ORG)).toBe('services/a.jpg')
  })

  it('refuses another workshop’s address and anything that is not an upload', () => {
    expect(storedFileKey(url('services', 'a.jpg', OTHER_ORG), ORG)).toBeNull()
    expect(storedFileKey('https://example.com/a.jpg', ORG)).toBeNull()
    expect(storedFileKey('/uploads/services/a.jpg', ORG)).toBeNull()
    expect(storedFileKey(null, ORG)).toBeNull()
  })

  it('asks the database for exactly the addresses that read back as the file', () => {
    for (const stored of storedFileUrls(ORG, 'services', 'a.jpg')) {
      expect(storedFileKey(stored, ORG)).toBe('services/a.jpg')
    }
  })
})

describe('a work order or invoice link', () => {
  it('opens every file the invoice lists, in every folder they live in', async () => {
    expect(await opens('job-token', 'services', 'job-photo.jpg')).toBe(true)
    expect(await opens('job-token', 'services', 'job-report.pdf')).toBe(true)
    expect(await opens('job-token', 'services', 'job-video.mp4')).toBe(true)
    expect(await opens('job-token', 'tire-hotel', 'tire-set.jpg')).toBe(true)
  })

  it('opens the workshop’s logos, a stored value with stray spaces included', async () => {
    expect(await opens('job-token', 'logos', 'company.png')).toBe(true)
    expect(await opens('job-token', 'logos', 'quote-letterhead.png')).toBe(true)
  })

  it('does not open a file the workshop kept off the invoice', async () => {
    expect(await opens('job-token', 'services', 'job-internal.jpg')).toBe(false)
  })

  it('does not open another job’s file of the same workshop', async () => {
    expect(await opens('job-token', 'services', 'other-job-photo.jpg')).toBe(false)
  })

  it('does not open a file under another folder than the one it was stored in', async () => {
    expect(await opens('job-token', 'inventory', 'job-photo.jpg')).toBe(false)
  })

  it('does not open another workshop’s file or logo', async () => {
    expect(await opens('job-token', 'services', 'stranger-photo.jpg')).toBe(false)
    expect(await opens('job-token', 'logos', 'stranger.png')).toBe(false)
  })
})

describe('a quote link', () => {
  it('opens its photos, its documents and the logos', async () => {
    expect(await opens('quote-token', 'quotes', 'quote-photo.jpg')).toBe(true)
    expect(await opens('quote-token', 'quotes', 'quote-terms.pdf')).toBe(true)
    expect(await opens('quote-token', 'logos', 'quote-letterhead.png')).toBe(true)
  })

  it('opens nothing the page does not list, and no job’s files', async () => {
    expect(await opens('quote-token', 'quotes', 'quote-other.jpg')).toBe(false)
    expect(await opens('quote-token', 'services', 'job-photo.jpg')).toBe(false)
    expect(await opens('quote-token', 'services', 'stranger-photo.jpg')).toBe(false)
  })
})

describe('an inspection link', () => {
  it('opens every check’s photos and videos, in either address form', async () => {
    expect(await opens('inspection-token', 'inspections', 'brake-pads.jpg')).toBe(true)
    expect(await opens('inspection-token', 'inspections', 'noise.mp4')).toBe(true)
    expect(await opens('inspection-token', 'inspections', 'tyre-tread.jpg')).toBe(true)
  })

  it('opens the files shown on the report, and the logos', async () => {
    expect(await opens('inspection-token', 'documents', 'overview.jpg')).toBe(true)
    expect(await opens('inspection-token', 'logos', 'company.png')).toBe(true)
  })

  it('opens nothing the workshop kept back, and no other document’s files', async () => {
    expect(await opens('inspection-token', 'documents', 'hidden-paperwork.pdf')).toBe(false)
    expect(await opens('inspection-token', 'services', 'job-photo.jpg')).toBe(false)
    expect(await opens('inspection-token', 'logos', 'stranger.png')).toBe(false)
  })
})

describe('a status report link', () => {
  it('opens its video and the logos', async () => {
    expect(await opens('report-token', 'services', 'walkaround.mp4')).toBe(true)
    expect(await opens('report-token', 'logos', 'company.png')).toBe(true)
  })

  it('opens no other file of the workshop', async () => {
    expect(await opens('report-token', 'services', 'job-photo.jpg')).toBe(false)
    expect(await opens('report-token', 'services', 'stranger-photo.jpg')).toBe(false)
  })

  it('is closed once the report has expired', async () => {
    expect(await resolveSharedFileToken('expired-report-token')).toEqual({ status: 'expired' })
  })
})

describe('a token no document carries', () => {
  it('opens nothing', async () => {
    expect(await resolveSharedFileToken('no-such-token')).toEqual({ status: 'unknown' })
  })
})

describe('what one file costs', () => {
  const invoice: SharedFileDocument = { kind: 'invoice', id: 'job', organizationId: ORG }

  it('asks one narrow question for a document’s own file, and reads no logos', async () => {
    expect(await isSharedFile(invoice, 'services', 'job-photo.jpg')).toBe(true)
    expect(db.serviceAttachment.findFirst).toHaveBeenCalledTimes(1)
    expect(db.appSetting.findMany).not.toHaveBeenCalled()
    // Only the addresses that name the file, on this document, shown on it.
    expect(vi.mocked(db.serviceAttachment.findFirst).mock.calls[0][0]).toEqual({
      where: {
        serviceRecordId: 'job',
        includeInInvoice: true,
        fileUrl: { in: storedFileUrls(ORG, 'services', 'job-photo.jpg') },
      },
      select: { id: true },
    })
  })

  it('reads the logos first for a logo, and nothing of the document', async () => {
    expect(await isSharedFile(invoice, 'logos', 'company.png')).toBe(true)
    expect(db.appSetting.findMany).toHaveBeenCalledTimes(1)
    expect(db.serviceAttachment.findFirst).not.toHaveBeenCalled()
  })

  it('asks an inspection about the one file, never for every check’s photos', async () => {
    const inspection: SharedFileDocument = {
      kind: 'inspection',
      id: 'inspection',
      organizationId: ORG,
    }
    expect(await isSharedFile(inspection, 'inspections', 'brake-pads.jpg')).toBe(true)
    expect(vi.mocked(db.inspectionItem.findFirst).mock.calls[0][0]).toEqual({
      where: {
        inspectionId: 'inspection',
        imageUrls: { hasSome: storedFileUrls(ORG, 'inspections', 'brake-pads.jpg') },
      },
      select: { id: true },
    })
    expect(db.inspectionAttachment.findFirst).not.toHaveBeenCalled()
  })

  it('needs no query at all for a status report’s video', async () => {
    const resolved = await resolveSharedFileToken('report-token')
    vi.mocked(db.statusReport.findFirst).mockClear()
    expect(resolved.status).toBe('open')
    if (resolved.status !== 'open') return
    expect(await isSharedFile(resolved.document, 'services', 'walkaround.mp4')).toBe(true)
    expect(db.statusReport.findFirst).not.toHaveBeenCalled()
  })
})

describe('the public file route', () => {
  let root: string
  const previousRoot = process.env.DATA_ROOT

  beforeAll(() => {
    root = mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'shared-files-'))
    process.env.DATA_ROOT = root
    const write = (org: string, category: string, file: string, body: string) => {
      mkdirSync(path.join(root, 'uploads', org, category), { recursive: true })
      writeFileSync(path.join(root, 'uploads', org, category, file), body)
    }
    write(ORG, 'services', 'job-photo.jpg', 'job photo')
    write(ORG, 'services', 'other-job-photo.jpg', 'other job photo')
    write(ORG, 'services', 'old-walkaround.mp4', 'old video')
    write(ORG, 'logos', 'company.png', 'logo')
    write(OTHER_ORG, 'services', 'stranger-photo.jpg', 'stranger photo')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
    if (previousRoot === undefined) delete process.env.DATA_ROOT
    else process.env.DATA_ROOT = previousRoot
  })

  const get = (token: string, category: string, file: string) =>
    GET(new NextRequest(`http://localhost/api/public/files/${token}/${category}/${file}`), {
      params: Promise.resolve({ token, path: [category, file] }),
    })

  it('serves the document’s own file, never cached, looking the token up once', async () => {
    const response = await get('job-token', 'services', 'job-photo.jpg')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('job photo')
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(findSharedDocumentOfAnyKind).toHaveBeenCalledTimes(1)
  })

  it('answers another job’s real file exactly as a missing one', async () => {
    const refused = await get('job-token', 'services', 'other-job-photo.jpg')
    const missing = await get('job-token', 'services', 'never-uploaded.jpg')
    expect(refused.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(await refused.json()).toEqual(await missing.json())
  })

  it('does not serve a file of another workshop', async () => {
    const response = await get('job-token', 'services', 'stranger-photo.jpg')
    expect(response.status).toBe(404)
  })

  it('serves the workshop logo on any of its links', async () => {
    for (const token of ['job-token', 'quote-token', 'inspection-token', 'report-token']) {
      const response = await get(token, 'logos', 'company.png')
      expect(response.status, token).toBe(200)
    }
  })

  it('says a closed link is closed, for a document and a status report alike', async () => {
    const closedJob = await get('closed-job-token', 'logos', 'company.png')
    const closedReport = await get('expired-report-token', 'services', 'old-walkaround.mp4')
    expect(closedJob.status).toBe(410)
    expect(closedReport.status).toBe(410)
    expect(await closedReport.json()).toEqual(await closedJob.json())
  })

  it('serves a stored SVG logo only as a sandboxed download', async () => {
    mkdirSync(path.join(root, 'uploads', ORG, 'logos'), { recursive: true })
    writeFileSync(path.join(root, 'uploads', ORG, 'logos', 'mark.svg'), '<svg/>')
    settings.push({ organizationId: ORG, key: 'invoice.logo', value: url('logos', 'mark.svg') })
    try {
      const response = await get('job-token', 'logos', 'mark.svg')
      expect(response.status).toBe(200)
      expect(response.headers.get('content-disposition')).toBe('attachment')
      expect(response.headers.get('content-security-policy')).toContain('sandbox')
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    } finally {
      settings.pop()
    }
  })

  it('opens nothing for a token no document carries', async () => {
    const response = await get('no-such-token', 'logos', 'company.png')
    expect(response.status).toBe(404)
  })
})
