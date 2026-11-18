/**
 * @vitest-environment node
 *
 * A document attached to a job from the technician app.
 *
 * A technician is handed paper that belongs with the job: a supplier's
 * delivery note, an alignment printout, a calibration report. From the phone
 * it arrives as a PDF and has to land where the desk looks for it, under the
 * job's documents, not among its photos.
 *
 * The type on the upload is the phone's word for it. A file that only claims
 * to be a PDF is refused, because the desk opens whatever is filed there.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = {
  job: { id: 'rec-1' } as { id: string } | null,
  documentsOnJob: 0,
  created: null as Record<string, unknown> | null,
}

vi.mock('@/lib/db', () => ({
  db: {
    serviceRecord: { findFirst: vi.fn(async () => state.job) },
    serviceAttachment: {
      count: vi.fn(async () => state.documentsOnJob),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.created = data
        return { id: 'att-1', ...data, createdAt: new Date('2026-11-15T10:00:00Z') }
      }),
    },
  },
}))

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  stat: vi.fn(async () => ({ size: 1234 })),
}))

vi.mock('@/lib/features', async () => ({
  ...(await vi.importActual<typeof import('@/lib/features')>('@/lib/features')),
  getFeatures: vi.fn(async () => ({
    maxImagesPerService: 20,
    maxDiagnosticsPerService: 5,
    maxDocumentsPerService: 5,
  })),
}))

vi.mock('@/lib/video-downscale', () => ({ queueVideoDownscale: vi.fn() }))

vi.mock('@/lib/with-api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/with-api-auth')>('@/lib/with-api-auth')
  return {
    ...actual,
    withApiAuth: vi.fn(
      async (
        _request: Request,
        handler: (ctx: {
          organizationId: string
          technicianIds: string[]
          isAdmin: boolean
        }) => Promise<Response>
      ) => handler({ organizationId: 'org-1', technicianIds: ['tech-1'], isAdmin: false })
    ),
  }
})

import { POST } from '@/app/api/v1/tech/jobs/[id]/attachments/route'
import { TECH_API_FEATURES } from '@/lib/tech-api-features'

const PDF = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'

function upload(content: string, name: string, type: string) {
  const form = new FormData()
  form.set('file', new File([content], name, { type }))
  return POST(
    new Request('https://app.test/api/v1/tech/jobs/rec-1/attachments', {
      method: 'POST',
      body: form,
    }),
    { params: Promise.resolve({ id: 'rec-1' }) }
  )
}

beforeEach(() => {
  state.job = { id: 'rec-1' }
  state.documentsOnJob = 0
  state.created = null
})

describe('a technician attaching a document from the app', () => {
  it('files a PDF with the job’s documents, under the name it had on the phone', async () => {
    const response = await upload(PDF, 'alignment-report.pdf', 'application/pdf')

    expect(response.status).toBe(201)
    expect(state.created).toMatchObject({
      category: 'document',
      fileName: 'alignment-report.pdf',
      fileType: 'application/pdf',
      serviceRecordId: 'rec-1',
    })
    // Stored under a name of the server's own making, never the phone's.
    expect(state.created?.fileUrl).toMatch(
      /^\/api\/protected\/files\/org-1\/services\/[0-9a-f-]{36}\.pdf$/
    )
  })

  it('refuses a file that only says it is a PDF', async () => {
    const response = await upload(
      '<html><script>alert(1)</script></html>',
      'report.pdf',
      'application/pdf'
    )

    expect(response.status).toBe(400)
    expect(await response.text()).toContain('not a PDF')
    expect(state.created).toBeNull()
  })

  it('still refuses the formats a phone in a bay has no use for', async () => {
    const response = await upload('a,b\n1,2\n', 'parts.csv', 'text/csv')

    expect(response.status).toBe(400)
    expect(state.created).toBeNull()
  })

  it('stops at the number of documents the plan allows on one job', async () => {
    state.documentsOnJob = 5

    const response = await upload(PDF, 'sixth.pdf', 'application/pdf')

    expect(response.status).toBe(409)
    expect(await response.text()).toContain('maximum of 5 documents')
    expect(state.created).toBeNull()
  })

  it('tells the app it can, so an older server is never offered a document', () => {
    expect(TECH_API_FEATURES).toContain('job-documents')
  })
})
