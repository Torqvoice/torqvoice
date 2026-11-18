// @vitest-environment node
/**
 * Whose a customer's upload is. A file in a workshop's portal folder has no
 * row until it is sent, so its name says who uploaded it: only that customer
 * can attach it to a message or a request, or take it out again. Another
 * customer who learnt the address cannot, and so can never get the file
 * route to serve it to them.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  isOwnPortalUpload,
  ownPortalUploadUrl,
  portalUploadFileName,
} from '@/features/portal/Lib/portalUploadOwner.server'
import { isGeneratedName, parseStoredFileUrl } from '@/lib/files/manager'

const url = (name: string, org = 'org1', folder = 'portal-uploads') =>
  `/api/protected/files/${org}/${folder}/${name}`

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = 'a-secret-for-portal-upload-names'
})

describe("a customer's upload", () => {
  it('is theirs, and stored under a name every other part of the app accepts', () => {
    const name = portalUploadFileName('org1', 'kari', 'jpg')
    // The sweep of unsent files, the backup and the file routes go by this shape.
    expect(isGeneratedName(name)).toBe(true)
    expect(parseStoredFileUrl(url(name))).toMatchObject({ folder: 'portal-uploads', name })
    expect(isOwnPortalUpload(url(name), 'org1', 'kari')).toBe(true)
    expect(ownPortalUploadUrl(url(name), 'org1', 'kari')).toBe(url(name))
  })

  it('gets a different name every time', () => {
    const names = new Set(
      Array.from({ length: 50 }, () => portalUploadFileName('org1', 'kari', 'jpg'))
    )
    expect(names.size).toBe(50)
  })

  it("is not another customer's, though both are customers of the same workshop", () => {
    const karis = url(portalUploadFileName('org1', 'kari', 'jpg'))
    expect(isOwnPortalUpload(karis, 'org1', 'ola')).toBe(false)
    expect(ownPortalUploadUrl(karis, 'org1', 'ola')).toBeNull()
  })

  it('is not theirs at another workshop', () => {
    const name = portalUploadFileName('org1', 'kari', 'jpg')
    expect(isOwnPortalUpload(url(name, 'org2'), 'org2', 'kari')).toBe(false)
    expect(isOwnPortalUpload(url(name), 'org2', 'kari')).toBe(false)
  })

  it('cannot be forged by changing a name that is theirs', () => {
    const name = portalUploadFileName('org1', 'kari', 'jpg')
    const flipped = (name[0] === 'a' ? 'b' : 'a') + name.slice(1)
    expect(isOwnPortalUpload(url(flipped), 'org1', 'kari')).toBe(false)
  })

  it('is nobody’s when the workshop’s staff uploaded it, or it is from before names said whose', () => {
    // An ordinary random name, as the staff's upload route and older uploads have.
    const random = url('11111111-1111-4111-8111-111111111111.jpg')
    expect(isOwnPortalUpload(random, 'org1', 'kari')).toBe(false)
  })

  it.each([
    [
      'another folder of the workshop',
      url('11111111-1111-4111-8111-111111111111.jpg', 'org1', 'services'),
    ],
    ['a name that is not a generated one', url('holiday.jpg')],
    ['a path that climbs out of the folder', url('../services/job.jpg')],
    ['an address on another site', 'https://example.com/a.jpg'],
    ['nothing', ''],
    ['not a string', 42],
    ['null', null],
  ])('refuses %s without failing', (_what, value) => {
    expect(isOwnPortalUpload(value, 'org1', 'kari')).toBe(false)
  })
})
