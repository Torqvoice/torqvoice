/**
 * @vitest-environment node
 *
 * The manual export streams a zip: data.json from the writer, then the
 * workshop's own upload folders, with photos and PDFs stored as they are.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  uploads: '',
  pages: {} as Record<string, unknown[][]>,
}))

vi.mock('@/lib/db', () => ({
  db: new Proxy(
    {},
    {
      get: (_target, model: string) => ({
        findMany: async () => state.pages[model]?.shift() ?? [],
      }),
    }
  ),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: vi.fn(async () => ({ organizationId: 'org-1', userId: 'user-1', isAdmin: true })),
}))
vi.mock('@/lib/upload-root', () => ({ uploadsRoot: () => state.uploads }))

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/protected/backup/export/route'
import { REDACTED } from '@/lib/backup/secrets'

state.uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-export-'))
fs.mkdirSync(path.join(state.uploads, 'org-1', 'services'), { recursive: true })
fs.writeFileSync(path.join(state.uploads, 'org-1', 'services', 'photo.jpg'), Buffer.alloc(2048, 7))
fs.writeFileSync(path.join(state.uploads, 'org-1', 'services', 'notes.txt'), 'a'.repeat(2048))
fs.mkdirSync(path.join(state.uploads, 'org-2', 'services'), { recursive: true })
fs.writeFileSync(path.join(state.uploads, 'org-2', 'services', 'other.jpg'), 'not ours')

afterAll(() => fs.rmSync(state.uploads, { recursive: true, force: true }))

/** Compression method per entry, from the local file headers. */
function methods(buffer: Buffer): Record<string, number> {
  const out: Record<string, number> = {}
  let at = buffer.indexOf('PK\x03\x04', 0, 'latin1')
  while (at !== -1) {
    const method = buffer.readUInt16LE(at + 8)
    const nameLength = buffer.readUInt16LE(at + 26)
    out[buffer.toString('utf8', at + 30, at + 30 + nameLength)] = method
    at = buffer.indexOf('PK\x03\x04', at + 30 + nameLength, 'latin1')
  }
  return out
}

async function exportWith(include?: Record<string, unknown>) {
  const response = await POST(
    new NextRequest('http://app.test/api/protected/backup/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(include ? { include } : {}),
    })
  )
  const buffer = Buffer.from(await response.arrayBuffer())
  const zip = await JSZip.loadAsync(buffer)
  const data = JSON.parse(await zip.file('data.json')!.async('string'))
  return { response, buffer, zip, data }
}

beforeEach(() => {
  state.pages = {}
})

describe('backup export', () => {
  it('streams data.json and only this workshop’s files', async () => {
    state.pages.customer = [[{ id: 'c1', name: 'Ada' }]]
    const { response, zip, data } = await exportWith()

    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="torqvoice-backup-\d{4}-\d{2}-\d{2}\.zip"$/
    )
    expect(data.version).toBe(2)
    expect(data.data.customers).toEqual([{ id: 'c1', name: 'Ada' }])
    expect(Object.keys(zip.files).sort()).toEqual([
      'data.json',
      'files/services/notes.txt',
      'files/services/photo.jpg',
    ])
  })

  it('stores photos without compression and deflates the rest', async () => {
    const { buffer } = await exportWith()
    const byName = methods(buffer)
    expect(byName['files/services/photo.jpg']).toBe(0)
    expect(byName['files/services/notes.txt']).toBe(8)
    expect(byName['data.json']).toBe(8)
  })

  it('leaves secrets out unless include.secrets is true', async () => {
    const settings = [{ id: 's1', key: 'ai.apiKey', value: 'sk-x' }]

    state.pages.appSetting = [settings]
    const redacted = await exportWith({ files: false })
    expect(redacted.data.data.settings).toEqual([{ ...settings[0], value: REDACTED }])
    expect(Object.keys(redacted.zip.files)).toEqual(['data.json'])
    expect(redacted.data.contents).toBe('data')

    state.pages.appSetting = [settings]
    const truthy = await exportWith({ files: false, secrets: 'yes' })
    expect(truthy.data.data.settings[0].value).toBe(REDACTED)

    state.pages.appSetting = [settings]
    const full = await exportWith({ files: false, secrets: true })
    expect(full.data.data.settings).toEqual(settings)
    expect(full.data.contents).toBe('dataAndSecrets')
    // `secrets` is a request flag, never a dataset.
    expect(Object.keys(full.data.data)).not.toContain('secrets')
  })
})
