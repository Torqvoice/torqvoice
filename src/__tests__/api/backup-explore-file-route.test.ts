/**
 * @vitest-environment node
 *
 * One upload out of an open restore point: who may ask, what a refusal
 * looks like, and how the file is served (inline for what a browser shows,
 * a download for the rest, never cached).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: vi.fn() }))
vi.mock('@/lib/backup/explore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/backup/explore')>()
  return {
    RestorePointClosedError: actual.RestorePointClosedError,
    extractRestorePointFile: vi.fn(),
  }
})

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/protected/backup/explore/[snapshotId]/file/route'
import { extractRestorePointFile, RestorePointClosedError } from '@/lib/backup/explore'
import { getAuthContext } from '@/lib/get-auth-context'

const mockAuth = vi.mocked(getAuthContext)
const mockExtract = vi.mocked(extractRestorePointFile)

const SNAP = '28891c8f448a3c36'
const dir = mkdtempSync(path.join(os.tmpdir(), 'explore-file-route-'))
const photo = path.join(dir, 'photo.jpg')
writeFileSync(photo, Buffer.alloc(1234, 7))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function call(query: Record<string, string>, snapshotId = SNAP) {
  const url = new URL(`http://app.test/api/protected/backup/explore/${snapshotId}/file`)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return GET(new NextRequest(url), { params: Promise.resolve({ snapshotId }) })
}

const admin = { organizationId: 'org1', userId: 'u1', isAdmin: true }

beforeEach(() => {
  mockAuth.mockReset()
  mockExtract.mockReset()
  mockAuth.mockResolvedValue(admin as never)
  mockExtract.mockResolvedValue({ file: photo, bytes: 1234 })
})

describe('GET /api/protected/backup/explore/[snapshotId]/file', () => {
  it('is 401 without a session', async () => {
    mockAuth.mockResolvedValue(null as never)
    const res = await call({ category: 'services', name: 'photo.jpg' })
    expect(res.status).toBe(401)
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('is 403 for someone who is not an owner or administrator', async () => {
    mockAuth.mockResolvedValue({ ...admin, isAdmin: false } as never)
    const res = await call({ category: 'services', name: 'photo.jpg' })
    expect(res.status).toBe(403)
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('is 400 for a snapshot id that is not a restic id', async () => {
    for (const bad of ['short', 'ABCDEF1234', '..%2F..%2Fetc', 'zzzzzzzzzz']) {
      const res = await call({ category: 'services', name: 'photo.jpg' }, bad)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Invalid snapshot id' })
    }
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('asks the explorer with the session’s organisation, never one from the request', async () => {
    await call({ category: 'services', name: 'photo.jpg', organizationId: 'org2' })
    expect(mockExtract).toHaveBeenCalledWith('org1', SNAP, 'services', 'photo.jpg')
  })

  it('is 409 restorePointClosed when the restore point has to be opened again', async () => {
    mockExtract.mockRejectedValue(new RestorePointClosedError())
    const res = await call({ category: 'services', name: 'photo.jpg' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'restorePointClosed' })
  })

  it('is 404 when the file is not in the restore point', async () => {
    mockExtract.mockRejectedValue(new Error('That file is not in this restore point'))
    const res = await call({ category: 'services', name: 'photo.jpg' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'That file is not in this restore point' })
  })

  it('is 400 for any other refusal', async () => {
    mockExtract.mockRejectedValue(new Error('Invalid file name'))
    const res = await call({ category: 'services', name: '../x' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid file name' })
  })

  it('streams a photo inline, never cached', async () => {
    const res = await call({ category: 'services', name: 'photo.jpg' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('content-length')).toBe('1234')
    expect(res.headers.get('content-disposition')).toBe('inline; filename="photo.jpg"')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    const body = Buffer.from(await res.arrayBuffer())
    expect(body.length).toBe(1234)
    expect(body.every((b) => b === 7)).toBe(true)
  })

  it('matches the extension without regard to case', async () => {
    const res = await call({ category: 'services', name: 'SCAN.PDF' })
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toMatch(/^inline;/)
    await res.arrayBuffer()
  })

  it('serves anything else as a download', async () => {
    for (const name of ['export.zip', 'drawing.svg', 'page.html', 'README']) {
      const res = await call({ category: 'services', name })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/octet-stream')
      expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${name}"`)
      expect(res.headers.get('cache-control')).toBe('private, no-store')
      await res.arrayBuffer()
    }
  })

  it('sanitises the file name in Content-Disposition', async () => {
    const res = await call({ category: 'services', name: 'a "b";c\r\nd.zip' })
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="a__b__c__d.zip"')
    await res.arrayBuffer()
  })
})
