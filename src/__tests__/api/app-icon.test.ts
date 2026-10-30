/**
 * @vitest-environment node
 *
 * The install's app icon: a public route that joins a stored setting onto a
 * path, and an admin upload route that only a super admin on a licensed
 * self-hosted install may use.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

vi.mock('@/lib/db', () => ({
  db: {
    systemSetting: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/features', () => ({ isCloudMode: vi.fn(), installHasLicense: vi.fn() }))
vi.mock('@/lib/cached-session', () => ({ getCachedSession: vi.fn() }))
vi.mock('@/lib/session-scope', () => ({ sessionOrganizationScope: vi.fn(() => null) }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const fs = { ...actual, readFile: vi.fn(actual.readFile) }
  return { ...fs, default: fs }
})

import { readFile } from 'node:fs/promises'
import { db } from '@/lib/db'
import { installHasLicense, isCloudMode } from '@/lib/features'
import { getCachedSession } from '@/lib/cached-session'
import { sessionOrganizationScope } from '@/lib/session-scope'
import { brandingDir } from '@/lib/branding'
import { GET } from '@/app/api/public/app-icon/route'
import { DELETE, POST } from '@/app/api/protected/admin/app-icon/route'

const mockSetting = vi.mocked(db.systemSetting.findUnique)
const mockUpsert = vi.mocked(db.systemSetting.upsert)
const mockDeleteMany = vi.mocked(db.systemSetting.deleteMany)
const mockUser = vi.mocked(db.user.findUnique)
const mockSession = vi.mocked(getCachedSession)
const mockScope = vi.mocked(sessionOrganizationScope)
const mockCloud = vi.mocked(isCloudMode)
const mockLicensed = vi.mocked(installHasLicense)
const mockReadFile = vi.mocked(readFile)

const dataRoot = mkdtempSync(path.join(os.tmpdir(), 'app-icon-test-'))
// The same path the routes write to, under this test's own data root.
vi.stubEnv('DATA_ROOT', dataRoot)
const iconDir = brandingDir()
const trashDir = path.join(dataRoot, 'uploads', '.trash')

afterAll(() => rmSync(dataRoot, { recursive: true, force: true }))

function storedIcon(value: string | null) {
  mockSetting.mockResolvedValue(value === null ? null : ({ value } as never))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('DATA_ROOT', dataRoot)
  rmSync(path.join(dataRoot, 'uploads'), { recursive: true, force: true })
  mkdirSync(iconDir, { recursive: true })
  // Something worth stealing, one directory above the icons.
  writeFileSync(path.join(dataRoot, 'uploads', 'system', 'secret.png'), 'secret')

  mockCloud.mockReturnValue(false)
  mockLicensed.mockResolvedValue(true)
  mockScope.mockReturnValue(null)
  mockSession.mockResolvedValue({ user: { id: 'u1' } } as never)
  mockUser.mockResolvedValue({ isSuperAdmin: true } as never)
  storedIcon(null)
})

describe('GET /api/public/app-icon', () => {
  it('404s when no icon is set', async () => {
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('serves the stored icon with safe headers', async () => {
    writeFileSync(path.join(iconDir, 'abc.png'), 'png-bytes')
    storedIcon('abc.png')

    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('png-bytes')
  })

  it('404s when the setting names a file that is gone', async () => {
    storedIcon('gone.png')
    expect((await GET()).status).toBe(404)
  })

  it.each([
    '../secret.png',
    '../../etc/passwd',
    'x/y.png',
    '..\\secret.png',
    'icon.svg',
    '/etc/passwd',
  ])('refuses %s without reading anything', async (value) => {
    storedIcon(value)

    const res = await GET()
    expect([400, 404]).toContain(res.status)
    expect(mockReadFile).not.toHaveBeenCalled()
  })
})

function upload(file: File | null) {
  const form = new FormData()
  if (file) form.append('file', file)
  return new Request('http://localhost/api/protected/admin/app-icon', {
    method: 'POST',
    body: form,
  })
}

async function pngFile(width: number, height: number) {
  const data = await sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer()
  return new File([new Uint8Array(data)], 'icon.png', { type: 'image/png' })
}

describe('POST /api/protected/admin/app-icon', () => {
  it('refuses a signed-out caller', async () => {
    mockSession.mockResolvedValue(null as never)
    expect((await POST(upload(await pngFile(10, 10)))).status).toBe(401)
  })

  it('refuses someone who is not a super admin', async () => {
    mockUser.mockResolvedValue({ isSuperAdmin: false } as never)
    expect((await POST(upload(await pngFile(10, 10)))).status).toBe(403)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('refuses a super admin on a workshop-bound session', async () => {
    mockScope.mockReturnValue('org-1' as never)
    expect((await POST(upload(await pngFile(10, 10)))).status).toBe(403)
  })

  it('refuses in cloud mode', async () => {
    mockCloud.mockReturnValue(true)
    expect((await POST(upload(await pngFile(10, 10)))).status).toBe(403)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('refuses on an unlicensed install', async () => {
    mockLicensed.mockResolvedValue(false)
    expect((await POST(upload(await pngFile(10, 10)))).status).toBe(403)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('refuses an SVG', async () => {
    const svg = new File(['<svg/>'], 'icon.svg', { type: 'image/svg+xml' })
    expect((await POST(upload(svg))).status).toBe(400)
  })

  it('refuses bytes that are not an image', async () => {
    const fake = new File(['not a png'], 'icon.png', { type: 'image/png' })
    expect((await POST(upload(fake))).status).toBe(400)
  })

  it('stores a square PNG, saves the name and removes the previous icon', async () => {
    writeFileSync(path.join(iconDir, 'old.png'), 'old')
    storedIcon('old.png')

    const res = await POST(upload(await pngFile(300, 100)))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fileName).toMatch(/^[0-9a-f-]{36}\.png$/)
    expect(body.url).toBe(`/api/public/app-icon?v=${body.fileName}`)

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: body.fileName } })
    )
    expect(readdirSync(iconDir)).toEqual([body.fileName])

    const meta = await sharp(path.join(iconDir, body.fileName)).metadata()
    expect(meta).toMatchObject({ width: 512, height: 512, format: 'png' })
  })
})

describe('DELETE /api/protected/admin/app-icon', () => {
  it('refuses someone who is not a super admin', async () => {
    mockUser.mockResolvedValue({ isSuperAdmin: false } as never)
    expect((await DELETE()).status).toBe(403)
    expect(mockDeleteMany).not.toHaveBeenCalled()
  })

  it('removes the file and the setting', async () => {
    writeFileSync(path.join(iconDir, 'old.png'), 'old')
    storedIcon('old.png')

    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockDeleteMany).toHaveBeenCalled()
    expect(readdirSync(iconDir)).toEqual([])
    // Released through the file manager, so it waits in the trash like any upload.
    const [day] = readdirSync(trashDir)
    expect(readdirSync(path.join(trashDir, day, 'system', 'branding'))).toEqual(['old.png'])
  })
})
