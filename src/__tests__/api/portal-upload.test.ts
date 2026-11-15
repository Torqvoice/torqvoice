/**
 * @vitest-environment node
 *
 * The one route a customer's files arrive through: a photo for the chat,
 * photos and a short video with a request for a visit. A customer is signed
 * in to one workshop's portal and nothing more, so who may write, what, how
 * large and how often are all decided here; and a file that is never sent is
 * let go through the file manager, never left for good.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/customer-session', () => ({ getCustomerSession: vi.fn() }))
vi.mock('@/lib/portal-slug', () => ({ resolvePortalOrg: vi.fn() }))
vi.mock('@/features/portal/Lib/portalLive', () => ({ isPortalLive: vi.fn() }))
vi.mock('@/lib/backup/freeze', () => ({
  isRestoring: vi.fn(() => false),
  RESTORE_IN_PROGRESS_MESSAGE: 'A restore is running',
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('@/lib/image-upload.server', () => ({ compressPhoto: vi.fn() }))
vi.mock('@/lib/files/manager', () => ({
  discardUnsavedUpload: vi.fn(async () => undefined),
  releaseFiles: vi.fn(),
}))
vi.mock('@/lib/upload-root', () => ({ uploadsRoot: () => '/tmp/uploads' }))
vi.mock('node:fs/promises', () => {
  const fs = { mkdir: vi.fn(), writeFile: vi.fn() }
  return { ...fs, default: fs }
})

import { writeFile } from 'node:fs/promises'
import { isPortalLive } from '@/features/portal/Lib/portalLive'
import { PORTAL_PHOTO_MAX_BYTES, PORTAL_VIDEO_MAX_BYTES } from '@/features/portal/Lib/portalUploads'
import { isRestoring } from '@/lib/backup/freeze'
import { getCustomerSession } from '@/lib/customer-session'
import { discardUnsavedUpload, releaseFiles } from '@/lib/files/manager'
import { compressPhoto } from '@/lib/image-upload.server'
import { resolvePortalOrg } from '@/lib/portal-slug'

const ADDRESS = 'http://app.test/portal/fjordside/upload'
const STORED = /^\/api\/protected\/files\/org-1\/portal-uploads\/[0-9a-f-]{36}\.(jpg|mp4|webm)$/
const stored = (name: string, org = 'org-1') => `/api/protected/files/${org}/portal-uploads/${name}`

/** The route keeps a count per customer in memory, so each test gets a fresh module. */
async function route() {
  vi.resetModules()
  return import('@/app/(public)/portal/[orgId]/upload/route')
}

const params = { params: Promise.resolve({ orgId: 'fjordside' }) }

async function post(file?: File, headers?: Record<string, string>) {
  const { POST } = await route()
  const body = new FormData()
  if (file) body.append('file', file)
  return POST(new Request(ADDRESS, { method: 'POST', body, headers }), params)
}

async function remove(body: unknown) {
  const { DELETE } = await route()
  return DELETE(
    new Request(ADDRESS, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params
  )
}

const photo = (name = 'IMG_0001.HEIC', type = 'image/heic') =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type })
/** The first bytes of an MP4 or a QuickTime file: a box whose type is "ftyp". */
const MP4 = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]
const video = (type = 'video/mp4', bytes = MP4) =>
  new File([new Uint8Array(bytes)], 'noise.MOV', { type })
beforeEach(() => {
  vi.mocked(getCustomerSession)
    .mockReset()
    .mockResolvedValue({ customerId: 'cust-1', organizationId: 'org-1' } as never)
  vi.mocked(resolvePortalOrg)
    .mockReset()
    .mockResolvedValue({ id: 'org-1', name: 'Fjordside Auto' } as never)
  vi.mocked(isPortalLive).mockReset().mockResolvedValue(true)
  vi.mocked(isRestoring).mockReset().mockReturnValue(false)
  vi.mocked(compressPhoto)
    .mockReset()
    .mockResolvedValue({ data: Buffer.from('a smaller jpeg'), width: 1600, height: 1200 })
  vi.mocked(writeFile).mockReset()
  vi.mocked(discardUnsavedUpload).mockClear()
  vi.mocked(releaseFiles)
    .mockReset()
    .mockImplementation(async (urls) => ({ removed: [...urls] as string[], kept: [], skipped: [] }))
})

describe('who may upload', () => {
  it('refuses a visitor who is not signed in', async () => {
    vi.mocked(getCustomerSession).mockResolvedValue(null)
    const response = await post(photo())
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'signedOut' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('refuses a customer of another workshop, whatever the address says', async () => {
    vi.mocked(getCustomerSession).mockResolvedValue({
      customerId: 'cust-9',
      organizationId: 'org-other',
    } as never)
    const response = await post(photo())
    expect(response.status).toBe(403)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('refuses when the workshop has closed its portal, and while a restore runs', async () => {
    vi.mocked(isPortalLive).mockResolvedValue(false)
    expect((await post(photo())).status).toBe(403)

    vi.mocked(isPortalLive).mockResolvedValue(true)
    vi.mocked(isRestoring).mockReturnValue(true)
    const response = await post(photo())
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'restoring' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('answers 404 for a portal that does not exist', async () => {
    vi.mocked(resolvePortalOrg).mockResolvedValue(null as never)
    expect((await post(photo())).status).toBe(404)
  })
})

describe('what may be uploaded', () => {
  it("stores a photo as a smaller JPEG in the workshop's portal-uploads folder", async () => {
    const response = await post(photo())
    expect(response.status).toBe(201)
    const answer = await response.json()
    expect(answer.url).toMatch(STORED)
    expect(answer).toMatchObject({ name: 'IMG_0001.jpg', type: 'image/jpeg', size: 14 })

    const [target, data] = vi.mocked(writeFile).mock.calls[0]
    expect(String(target)).toMatch(/^\/tmp\/uploads\/org-1\/portal-uploads\/[0-9a-f-]{36}\.jpg$/)
    // What was decoded and saved again, never the bytes as sent.
    expect(Buffer.from(data as Uint8Array).toString()).toBe('a smaller jpeg')
  })

  it('keeps a video as it came, named for the container its bytes hold', async () => {
    const response = await post(video('video/quicktime'))
    expect(response.status).toBe(201)
    const answer = await response.json()
    expect(answer.url).toMatch(/\.mp4$/)
    expect(answer).toMatchObject({ name: 'noise.mp4', type: 'video/mp4', size: MP4.length })
    expect(compressPhoto).not.toHaveBeenCalled()
  })

  it('refuses a document, a script and an SVG by their type', async () => {
    for (const type of ['application/pdf', 'text/html', 'image/svg+xml', 'application/zip']) {
      const response = await post(new File(['x'], 'file', { type }))
      expect(response.status, type).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'type' })
    }
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('refuses a file that only calls itself a photo or a video', async () => {
    vi.mocked(compressPhoto).mockRejectedValue(new Error('Not an image we can read'))
    expect((await post(photo('page.jpg', 'image/jpeg'))).status).toBe(400)

    // A playlist labelled as a video: its bytes are not a container.
    const playlist = new File(['#EXTM3U\n/etc/passwd\n'], 'clip.mp4', { type: 'video/mp4' })
    const response = await post(playlist)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'type' })
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('refuses an empty file, and a request without one', async () => {
    const empty = await post(new File([], 'nothing.jpg', { type: 'image/jpeg' }))
    expect(await empty.json()).toMatchObject({ code: 'empty' })
    const none = await post()
    expect(none.status).toBe(400)
    expect(await none.json()).toMatchObject({ code: 'noFile' })
  })

  it('refuses a photo over 15 MB and a video over 100 MB', async () => {
    const { POST } = await route()
    // A file that says how large it is without holding the bytes: the size
    // is read from the parsed form, so the form is handed over parsed.
    const send = (file: File, size: number) => {
      Object.defineProperty(file, 'size', { value: size })
      const request = {
        url: ADDRESS,
        headers: new Headers(),
        formData: async () => ({ get: () => file }),
      } as unknown as Request
      return POST(request, params)
    }

    const bigPhoto = await send(photo(), PORTAL_PHOTO_MAX_BYTES + 1)
    expect(bigPhoto.status).toBe(400)
    expect(await bigPhoto.json()).toMatchObject({ code: 'tooLarge' })

    // A video may be larger than a photo, up to its own limit.
    expect((await send(video(), PORTAL_PHOTO_MAX_BYTES + 1)).status).toBe(201)
    const bigVideo = await send(video(), PORTAL_VIDEO_MAX_BYTES + 1)
    expect(bigVideo.status).toBe(400)
    expect(await bigVideo.json()).toMatchObject({ code: 'tooLarge' })
    expect(writeFile).toHaveBeenCalledTimes(1)
  })

  it('refuses an oversized request from its header, before reading the body', async () => {
    const { POST } = await route()
    const formData = vi.fn()
    const request = {
      url: ADDRESS,
      headers: new Headers({ 'content-length': String(PORTAL_VIDEO_MAX_BYTES + 5 * 1024 * 1024) }),
      formData,
    } as unknown as Request
    const response = await POST(request, params)
    expect(response.status).toBe(413)
    expect(formData).not.toHaveBeenCalled()
  })

  it('leaves no half-written file behind when the disk refuses it', async () => {
    vi.mocked(writeFile).mockRejectedValue(new Error('ENOSPC'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = await post(photo())
    expect(response.status).toBe(500)
    expect(discardUnsavedUpload).toHaveBeenCalledWith(
      'org-1',
      'portal-uploads',
      expect.stringMatching(/^[0-9a-f-]{36}\.jpg$/)
    )
    error.mockRestore()
  })
})

describe('how often', () => {
  it('stops one customer after forty files in a quarter of an hour, and not the next customer', async () => {
    const { POST } = await route()
    const send = () => {
      const body = new FormData()
      body.append('file', photo())
      return POST(new Request(ADDRESS, { method: 'POST', body }), params)
    }
    for (let i = 0; i < 40; i++) expect((await send()).status).toBe(201)

    const over = await send()
    expect(over.status).toBe(429)
    expect(await over.json()).toMatchObject({ code: 'tooMany' })
    expect(writeFile).toHaveBeenCalledTimes(40)

    vi.mocked(getCustomerSession).mockResolvedValue({
      customerId: 'cust-2',
      organizationId: 'org-1',
    } as never)
    expect((await send()).status).toBe(201)
  })
})

describe('a file that is never sent', () => {
  it('is released through the file manager when the customer takes it out', async () => {
    const response = await remove({ url: stored('a.jpg') })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ removed: 1, kept: 0 })
    expect(releaseFiles).toHaveBeenCalledWith(
      [stored('a.jpg')],
      expect.objectContaining({ organizationId: 'org-1' })
    )
  })

  it('releases everything left in a form the customer walked away from', async () => {
    await remove({ urls: [stored('a.jpg'), stored('b.mp4')] })
    expect(vi.mocked(releaseFiles).mock.calls[0][0]).toEqual([stored('a.jpg'), stored('b.mp4')])
  })

  it('says so when the file is already part of a request or a message, and keeps it', async () => {
    vi.mocked(releaseFiles).mockResolvedValue({
      removed: [],
      kept: [stored('a.jpg')],
      skipped: [],
    })
    expect(await (await remove({ url: stored('a.jpg') })).json()).toEqual({ removed: 0, kept: 1 })
  })

  it("never touches another workshop's file, or anything outside portal-uploads", async () => {
    const response = await remove({
      urls: [
        stored('a.jpg', 'org-other'),
        '/api/protected/files/org-1/services/job-photo.jpg',
        '/api/protected/files/org-1/logos/logo.png',
        '/api/protected/files/org-1/portal-uploads/../services/x.jpg',
        'https://example.com/a.jpg',
        42,
      ],
    })
    expect(response.status).toBe(400)
    expect(releaseFiles).not.toHaveBeenCalled()
  })

  it('refuses a visitor who is not signed in', async () => {
    vi.mocked(getCustomerSession).mockResolvedValue(null)
    expect((await remove({ url: stored('a.jpg') })).status).toBe(401)
    expect(releaseFiles).not.toHaveBeenCalled()
  })
})
