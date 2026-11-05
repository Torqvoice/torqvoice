import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isGeneratedName } from '@/lib/files/manager'

vi.mock('server-only', () => ({}))
const roots = vi.hoisted(() => ({ current: '' }))
vi.mock('@/lib/upload-root', () => ({
  uploadsRoot: () => roots.current,
  uploadsRoots: () => [roots.current],
}))
// Discarding needs no database: nothing references a draft photo.
vi.mock('@/lib/files/references', () => ({
  referencedSuffixes: async () => new Set<string>(),
  allReferencedSuffixes: async () => new Set<string>(),
  existingOrganizationIds: async (ids: string[]) => new Set(ids),
  hasAnyOrganization: async () => true,
}))

const drafts = await import('@/features/fault-codes/Lib/fixDrafts.server')

const DRAFT = '3f2b1c4d-5e6f-4a7b-8c9d-0123456789ab'
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-ba9876543210'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

beforeEach(async () => {
  roots.current = await mkdtemp(path.join(os.tmpdir(), 'torqvoice-fix-drafts-'))
})
afterEach(async () => {
  await rm(roots.current, { recursive: true, force: true })
})

describe('phone photos waiting in a fix draft', () => {
  it("are ordinary uploads in the workshop's fix-drafts folder, named for the sweep", async () => {
    const added = await drafts.addDraftPhoto('org1', DRAFT, JPEG)
    expect(added?.count).toBe(1)
    const files = await readdir(path.join(roots.current, 'org1', 'fix-drafts'))
    expect(files).toEqual([added?.name])
    // Named like any generated upload, so the orphan sweep cleans up an abandoned draft.
    expect(isGeneratedName(files[0])).toBe(true)
    expect(drafts.draftPhotoUrl('org1', files[0])).toBe(
      `/api/protected/files/org1/fix-drafts/${files[0]}`
    )
  })

  it("lists only this draft's photos, and holds at most four", async () => {
    for (let i = 0; i < 4; i++) await drafts.addDraftPhoto('org1', DRAFT, JPEG)
    await drafts.addDraftPhoto('org1', OTHER, JPEG)
    expect(await drafts.addDraftPhoto('org1', DRAFT, JPEG)).toBeNull()
    expect(await drafts.listDraftPhotos('org1', DRAFT)).toHaveLength(4)
    expect(await drafts.listDraftPhotos('org1', OTHER)).toHaveLength(1)
    expect(await drafts.listDraftPhotos('org2', DRAFT)).toHaveLength(0)
  })

  it('are discarded through the file manager once the fix is shared', async () => {
    await drafts.addDraftPhoto('org1', DRAFT, JPEG)
    await drafts.addDraftPhoto('org1', DRAFT, JPEG)
    const kept = await drafts.addDraftPhoto('org1', OTHER, JPEG)
    expect(await drafts.readDraftPhotos('org1', DRAFT)).toHaveLength(2)
    await drafts.discardDraft('org1', DRAFT)
    expect(await drafts.listDraftPhotos('org1', DRAFT)).toEqual([])
    expect(await drafts.listDraftPhotos('org1', OTHER)).toEqual([kept?.name])
  })

  it("never touches a name outside the draft, or another workshop's folder", async () => {
    const added = await drafts.addDraftPhoto('org1', DRAFT, JPEG)
    await drafts.removeDraftPhoto('org1', OTHER, added?.name as string)
    await drafts.removeDraftPhoto('org1', DRAFT, '../org2/fix-drafts/x.jpg')
    expect(await drafts.listDraftPhotos('org1', DRAFT)).toHaveLength(1)
    expect(await drafts.addDraftPhoto('../org1', DRAFT, JPEG)).toBeNull()
  })
})
