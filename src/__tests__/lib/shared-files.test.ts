/**
 * @vitest-environment node
 *
 * A share link opens the files its document shows the customer, and nothing
 * else of the workshop: not another job's photos, not another workshop's,
 * even with a valid token and a real file name.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('@/lib/db', () => ({
  db: {
    serviceRecord: { findUnique: vi.fn() },
    quote: { findFirst: vi.fn() },
    inspection: { findFirst: vi.fn() },
    statusReport: { findFirst: vi.fn() },
    appSetting: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/share-link-route', () => ({ refuseExpiredShareToken: vi.fn(async () => null) }))

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isSharedFile, loadSharedDocumentFiles, storedFileKey } from '@/lib/shared-files.server'
import { GET } from '@/app/api/public/files/[token]/[...path]/route'

const ORG = 'org_a'
const OTHER_ORG = 'org_b'
const url = (category: string, file: string, org = ORG) =>
  `/api/protected/files/${org}/${category}/${file}`

type Attachment = {
  fileUrl: string
  includeInInvoice?: boolean
  includeInReport?: boolean
  category?: string
}

/** Two workshops, each with one document of every kind and a second job. */
const serviceRecords: Record<string, { organizationId: string; attachments: Attachment[] }> = {
  'job-token': {
    organizationId: ORG,
    attachments: [
      { fileUrl: url('services', 'job-photo.jpg'), includeInInvoice: true },
      { fileUrl: url('services', 'job-report.pdf'), includeInInvoice: true },
      { fileUrl: url('tire-hotel', 'tire-set.jpg'), includeInInvoice: true },
      { fileUrl: url('services', 'job-video.mp4'), includeInInvoice: true },
      // Kept off the invoice by the workshop: the page does not list it.
      { fileUrl: url('services', 'job-internal.jpg'), includeInInvoice: false },
    ],
  },
  'other-job-token': {
    organizationId: ORG,
    attachments: [{ fileUrl: url('services', 'other-job-photo.jpg'), includeInInvoice: true }],
  },
  'stranger-job-token': {
    organizationId: OTHER_ORG,
    attachments: [
      { fileUrl: url('services', 'stranger-photo.jpg', OTHER_ORG), includeInInvoice: true },
    ],
  },
}

const quotes: Record<string, { organizationId: string; attachments: Attachment[] }> = {
  'quote-token': {
    organizationId: ORG,
    attachments: [
      { fileUrl: url('quotes', 'quote-photo.jpg'), category: 'image' },
      { fileUrl: url('quotes', 'quote-terms.pdf'), category: 'document' },
      // A category the share page does not list.
      { fileUrl: url('quotes', 'quote-other.jpg'), category: 'internal' },
    ],
  },
}

const inspections: Record<
  string,
  { organizationId: string; items: { imageUrls: string[] }[]; attachments: Attachment[] }
> = {
  'inspection-token': {
    organizationId: ORG,
    items: [
      { imageUrls: [url('inspections', 'brake-pads.jpg'), url('inspections', 'noise.mp4')] },
      // The older address form is still on records.
      { imageUrls: [`/api/files/${ORG}/inspections/tyre-tread.jpg`] },
    ],
    attachments: [
      { fileUrl: url('documents', 'overview.jpg'), includeInReport: true },
      { fileUrl: url('documents', 'hidden-paperwork.pdf'), includeInReport: false },
    ],
  },
}

const statusReports: Record<
  string,
  { organizationId: string; videoUrl: string | null; expiresAt: Date | null }
> = {
  'report-token': {
    organizationId: ORG,
    videoUrl: url('services', 'walkaround.mp4'),
    expiresAt: null,
  },
  'expired-report-token': {
    organizationId: ORG,
    videoUrl: url('services', 'old-walkaround.mp4'),
    expiresAt: new Date('2000-01-01'),
  },
}

const settings = [
  { organizationId: ORG, key: 'workshop.logo', value: url('logos', 'company.png') },
  { organizationId: ORG, key: 'quote.logo', value: url('logos', 'quote-letterhead.png') },
  {
    organizationId: OTHER_ORG,
    key: 'workshop.logo',
    value: url('logos', 'stranger.png', OTHER_ORG),
  },
]

/** Applies an attachment `where` the way Prisma would. */
function filterAttachments(rows: Attachment[], where?: Record<string, unknown>) {
  if (!where) return rows
  return rows.filter((row) =>
    Object.entries(where).every(([key, value]) => {
      const actual = (row as Record<string, unknown>)[key]
      if (value && typeof value === 'object' && 'in' in value) {
        return (value.in as unknown[]).includes(actual)
      }
      return (actual ?? true) === value
    })
  )
}

type Args = { where: { publicToken: string }; select: Record<string, any> }

beforeEach(() => {
  vi.mocked(db.serviceRecord.findUnique).mockImplementation((async (args: Args) => {
    const row = serviceRecords[args.where.publicToken]
    if (!row) return null
    return {
      organizationId: row.organizationId,
      attachments: filterAttachments(row.attachments, args.select.attachments.where),
    }
  }) as never)
  vi.mocked(db.quote.findFirst).mockImplementation((async (args: Args) => {
    const row = quotes[args.where.publicToken]
    if (!row) return null
    return {
      organizationId: row.organizationId,
      attachments: filterAttachments(row.attachments, args.select.attachments.where),
    }
  }) as never)
  vi.mocked(db.inspection.findFirst).mockImplementation((async (args: Args) => {
    const row = inspections[args.where.publicToken]
    if (!row) return null
    return {
      organizationId: row.organizationId,
      items: row.items,
      attachments: filterAttachments(row.attachments, args.select.attachments.where),
    }
  }) as never)
  vi.mocked(db.statusReport.findFirst).mockImplementation((async (args: Args) => {
    return statusReports[args.where.publicToken] ?? null
  }) as never)
  vi.mocked(db.appSetting.findMany).mockImplementation((async (args: {
    where: { organizationId: string; key: { in: string[] } }
  }) =>
    settings.filter(
      (row) =>
        row.organizationId === args.where.organizationId && args.where.key.in.includes(row.key)
    )) as never)
})

async function opens(token: string, category: string, file: string) {
  const shared = await loadSharedDocumentFiles(token)
  return !!shared && isSharedFile(shared, category, file)
}

describe('storedFileKey', () => {
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
})

describe('a work order or invoice link', () => {
  it('opens every file the invoice lists, in every folder they live in', async () => {
    expect(await opens('job-token', 'services', 'job-photo.jpg')).toBe(true)
    expect(await opens('job-token', 'services', 'job-report.pdf')).toBe(true)
    expect(await opens('job-token', 'services', 'job-video.mp4')).toBe(true)
    expect(await opens('job-token', 'tire-hotel', 'tire-set.jpg')).toBe(true)
  })

  it('opens the workshop’s logos', async () => {
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

  it('stops opening its video once the report has expired', async () => {
    expect(await opens('expired-report-token', 'services', 'old-walkaround.mp4')).toBe(false)
  })
})

describe('a token no document carries', () => {
  it('opens nothing', async () => {
    expect(await loadSharedDocumentFiles('no-such-token')).toBeNull()
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

  it('serves the document’s own file, never cached', async () => {
    const response = await get('job-token', 'services', 'job-photo.jpg')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('job photo')
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
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
