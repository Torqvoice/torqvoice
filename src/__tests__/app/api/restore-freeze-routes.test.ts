/**
 * @vitest-environment node
 *
 * While a workshop is being restored, the API routes that write rows or
 * files for it answer 409 and write nothing. Server actions get the same
 * answer from withAuth; these routes authenticate on their own.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  uploads: '',
  frozen: new Set<string>(),
}))

vi.mock('@/lib/backup/freeze', () => ({
  isRestoring: (organizationId: string) => state.frozen.has(organizationId),
  RESTORE_IN_PROGRESS_MESSAGE: 'A restore of this workshop is in progress.',
}))
vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: vi.fn() }))
vi.mock('@/lib/upload-root', () => ({
  uploadsRoot: () => state.uploads,
  uploadsRoots: () => [state.uploads],
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('@/lib/demo', () => ({ isDemoMode: false }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: vi.fn(async () => 'UTC') }))
vi.mock('@/features/integrations/Lib/backup', () => ({
  canRestoreBackups: vi.fn(async () => true),
}))
vi.mock('@/lib/backup/engine', () => ({ backupLockHolder: vi.fn(() => null) }))
vi.mock('@/lib/backup/tenancy', () => ({
  RestoreRefusedError: class RestoreRefusedError extends Error {},
  restoreLockHolder: vi.fn(() => null),
}))
vi.mock('@/lib/backup/import', () => ({
  assertSupportedBackup: vi.fn(),
  restoreBackup: vi.fn(async () => ({ redactedSettings: [] })),
  zipFileSource: vi.fn(),
}))
vi.mock('@/lib/backup/zip-file', () => ({
  openZip: vi.fn(),
  readEntryJson: vi.fn(),
  readJsonFile: vi.fn(),
  extractEntry: vi.fn(),
  spoolUpload: vi.fn(),
}))

import { NextRequest } from 'next/server'
import { POST as uploadPost } from '@/app/api/protected/upload/route'
import { POST as importPost } from '@/app/api/protected/backup/import/route'
import { POST as lubelogPost } from '@/app/api/protected/backup/import-lubelog/route'
import { POST as invoiceNinjaPost } from '@/app/api/protected/backup/import-invoice-ninja/route'
import { getAuthContext } from '@/lib/get-auth-context'
import { restoreBackup } from '@/lib/backup/import'
import { spoolUpload } from '@/lib/backup/zip-file'

const ORG = 'org-frozen'

state.uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-freeze-routes-'))
afterAll(() => fs.rmSync(state.uploads, { recursive: true, force: true }))

function imageUpload() {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(64)], 'car.png', { type: 'image/png' }))
  return new NextRequest('http://app.test/api/protected/upload', { method: 'POST', body: form })
}

function backupUpload(url: string) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, data: {} }),
  })
}

beforeEach(() => {
  state.frozen.clear()
  fs.rmSync(path.join(state.uploads, ORG), { recursive: true, force: true })
  vi.mocked(getAuthContext).mockReset()
  vi.mocked(getAuthContext).mockResolvedValue({
    organizationId: ORG,
    userId: 'user-1',
    role: 'owner',
    isAdmin: true,
    isSuperAdmin: false,
  } as never)
  vi.mocked(restoreBackup).mockClear()
  vi.mocked(spoolUpload).mockClear()
})

describe('upload route during a restore', () => {
  it('answers 409 and writes no file while the workshop is frozen', async () => {
    state.frozen.add(ORG)
    const res = await uploadPost(imageUpload())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'A restore of this workshop is in progress.' })
    expect(fs.existsSync(path.join(state.uploads, ORG))).toBe(false)
  })

  it('still stores the file for a workshop that is not frozen', async () => {
    state.frozen.add('org-other')
    const res = await uploadPost(imageUpload())
    expect(res.status).toBe(200)
    expect(fs.readdirSync(path.join(state.uploads, ORG, 'vehicles'))).toHaveLength(1)
  })
})

describe('backup import route during a restore', () => {
  it('answers 409 without reading the upload or restoring anything', async () => {
    state.frozen.add(ORG)
    const res = await importPost(backupUpload('http://app.test/api/protected/backup/import'))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'A restore of this workshop is in progress.' })
    expect(restoreBackup).not.toHaveBeenCalled()
  })

  it('restores when the workshop is not frozen', async () => {
    const res = await importPost(backupUpload('http://app.test/api/protected/backup/import'))
    expect(res.status).toBe(200)
    expect(restoreBackup).toHaveBeenCalledTimes(1)
  })
})

describe('third-party imports during a restore', () => {
  it.each([
    ['LubeLogger', lubelogPost, 'import-lubelog'],
    ['Invoice Ninja', invoiceNinjaPost, 'import-invoice-ninja'],
  ])('%s answers 409 before the upload is spooled', async (_name, post, slug) => {
    state.frozen.add(ORG)
    const res = await post(backupUpload(`http://app.test/api/protected/backup/${slug}`))
    expect(res.status).toBe(409)
    expect(spoolUpload).not.toHaveBeenCalled()
  })
})
