// @vitest-environment node
/**
 * A customer reading a photo from their chat or their booking. The file is
 * theirs when one of their own messages or requests mentions it; a name
 * alone opens nothing, and another customer's photo answers exactly as a
 * file that does not exist.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { portalMessage, serviceRequest, getCustomerSession, stat, readFile } = vi.hoisted(() => ({
  portalMessage: { findFirst: vi.fn() },
  serviceRequest: { findFirst: vi.fn() },
  getCustomerSession: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: { portalMessage, serviceRequest } }))
vi.mock('@/lib/customer-session', () => ({ getCustomerSession: () => getCustomerSession() }))
vi.mock('@/lib/portal-slug', () => ({
  resolvePortalOrg: async (param: string) =>
    param === 'fjordside' || param === 'org1' ? { id: 'org1', name: 'Fjordside Auto' } : null,
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => null }))
vi.mock('@/lib/upload-root', () => ({ uploadsRoot: () => '/data/uploads' }))
vi.mock('@/lib/files/manager', () => ({
  isGeneratedName: (name: string) => /^[0-9a-f-]{36}\.[a-z0-9]{1,8}$/.test(name),
}))
vi.mock('node:fs/promises', () => ({
  stat: (path: string) => stat(path),
  readFile: (path: string) => readFile(path),
  open: vi.fn(),
}))

import { GET } from '@/app/(public)/portal/[orgId]/files/[name]/route'

const NAME = '11111111-1111-4111-8111-111111111111.jpg'
const STORED = `/api/protected/files/org1/portal-uploads/${NAME}`
const read = (name = NAME, orgId = 'fjordside') =>
  GET(new Request(`https://app.test/portal/${orgId}/files/${name}`), {
    params: Promise.resolve({ orgId, name }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  getCustomerSession.mockResolvedValue({ customerId: 'kari', organizationId: 'org1' })
  portalMessage.findFirst.mockResolvedValue(null)
  serviceRequest.findFirst.mockResolvedValue(null)
  stat.mockResolvedValue({ size: 3 })
  readFile.mockResolvedValue(Buffer.from('jpg'))
})

describe("reading a file from the customer's portal", () => {
  it('serves a photo one of their own messages mentions', async () => {
    portalMessage.findFirst.mockResolvedValue({ id: 'pm1' })
    const response = await read()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Cache-Control')).toContain('private')
    expect(readFile).toHaveBeenCalledWith(`/data/uploads/org1/portal-uploads/${NAME}`)
    // Looked up as this customer's, in this workshop, by the stored url.
    expect(portalMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org1', customerId: 'kari', attachments: { has: STORED } },
      })
    )
  })

  it('serves a photo they sent with a request for a visit', async () => {
    serviceRequest.findFirst.mockResolvedValue({ id: 'sr1' })
    expect((await read()).status).toBe(200)
    expect(serviceRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org1', customerId: 'kari', attachments: { has: STORED } },
      })
    )
  })

  it('refuses a file none of their own records mentions, without touching the disk', async () => {
    // The file exists and belongs to another customer of the same workshop.
    const response = await read()
    expect(response.status).toBe(404)
    expect(stat).not.toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
  })

  it('refuses a visitor who is not signed in', async () => {
    getCustomerSession.mockResolvedValue(null)
    expect((await read()).status).toBe(401)
    expect(portalMessage.findFirst).not.toHaveBeenCalled()
  })

  it('refuses a customer of another workshop, whatever the address says', async () => {
    getCustomerSession.mockResolvedValue({ customerId: 'eve', organizationId: 'org2' })
    portalMessage.findFirst.mockResolvedValue({ id: 'pm1' })
    expect((await read()).status).toBe(404)
    expect(readFile).not.toHaveBeenCalled()
  })

  it('refuses a name that is not one the upload route makes', async () => {
    portalMessage.findFirst.mockResolvedValue({ id: 'pm1' })
    for (const name of ['..%2F..%2Fsecret.jpg', '../logo.png', 'logo.png', '.env']) {
      expect((await read(name)).status).toBe(404)
    }
    expect(readFile).not.toHaveBeenCalled()
  })

  it('answers 404 for a mentioned file that is no longer on disk', async () => {
    portalMessage.findFirst.mockResolvedValue({ id: 'pm1' })
    stat.mockRejectedValue(new Error('ENOENT'))
    expect((await read()).status).toBe(404)
  })
})
