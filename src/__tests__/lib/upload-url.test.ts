import path from 'path'
import { describe, expect, it } from 'vitest'
import { resolveUploadPath, safeUploadPath, UploadPathError } from '@/lib/resolve-upload-path'
import {
  assertOwnUploads,
  extensionForType,
  isOwnUploadUrl,
  optionalUploadUrlSchema,
  parseUploadUrl,
  svgDownloadHeaders,
  uploadUrlSchema,
} from '@/lib/upload-url'
import { createVehicleSchema } from '@/features/vehicles/Schema/vehicleSchema'
import { quoteAttachmentSchema } from '@/features/quotes/Schema/quoteSchema'

const root = path.join(process.cwd(), 'data', 'uploads')

describe('resolveUploadPath', () => {
  it('resolves the three stored shapes inside their roots', () => {
    expect(resolveUploadPath('/api/protected/files/org1/vehicles/a.png')).toBe(
      path.join(root, 'org1', 'vehicles', 'a.png')
    )
    expect(resolveUploadPath('/api/files/org1/logos/b.png')).toBe(
      path.join(root, 'org1', 'logos', 'b.png')
    )
    expect(resolveUploadPath('/uploads/logos/c.png')).toBe(
      path.join(process.cwd(), 'public', 'uploads', 'logos', 'c.png')
    )
  })

  it('refuses a path that climbs out of its root', () => {
    for (const bad of [
      '/api/protected/files/org1/vehicles/../../../.env',
      '/api/protected/files/../../.env',
      '/api/files/org1/../../../etc/passwd',
      '/../.env',
      '/uploads/../../.env',
    ]) {
      expect(() => resolveUploadPath(bad), bad).toThrow(UploadPathError)
      expect(safeUploadPath(bad), bad).toBeNull()
    }
  })

  it('still resolves what it used to resolve', () => {
    expect(safeUploadPath('/api/protected/files/org1/vehicles/a.png')).not.toBeNull()
    expect(safeUploadPath('')).toBeNull()
    expect(safeUploadPath(null)).toBeNull()
  })
})

describe('parseUploadUrl', () => {
  it('accepts our own upload URLs', () => {
    expect(parseUploadUrl('/api/protected/files/cmx1/vehicles/f1.jpg')).toEqual({
      organizationId: 'cmx1',
      category: 'vehicles',
      file: 'f1.jpg',
    })
  })

  it('rejects anything that is not one', () => {
    for (const bad of [
      '/api/protected/files/cmx1/vehicles/../x.jpg',
      '/api/protected/files/cmx1/vehicles/sub/x.jpg',
      '/api/protected/files/cmx1/secrets/x.jpg',
      '/api/protected/files/cmx1/vehicles/.env',
      'https://evil.example/api/protected/files/cmx1/vehicles/x.jpg',
      'javascript:alert(1)',
      '/uploads/logos/legacy.png',
      '',
    ]) {
      expect(parseUploadUrl(bad), bad).toBeNull()
    }
  })

  it('knows whose file a URL names', () => {
    expect(isOwnUploadUrl('/api/protected/files/a/vehicles/x.jpg', 'a')).toBe(true)
    expect(isOwnUploadUrl('/api/protected/files/b/vehicles/x.jpg', 'a')).toBe(false)
  })

  it("refuses a request that carries another workshop's file anywhere in it", () => {
    const own = { gallery: [{ url: '/api/protected/files/a/inventory/x.jpg' }], note: 'hi' }
    expect(() => assertOwnUploads(own, 'a')).not.toThrow()
    const foreign = { gallery: [{ url: '/api/protected/files/b/inventory/x.jpg' }] }
    expect(() => assertOwnUploads(foreign, 'a')).toThrow(/not an upload of this workshop/)
    // The older route form is checked the same way.
    expect(() => assertOwnUploads('/api/files/b/logos/x.png', 'a')).toThrow()
    // Plain text and legacy values pass; the shape checks own those.
    expect(() => assertOwnUploads({ text: '/uploads/logos/old.png' }, 'a')).not.toThrow()
  })
})

describe('upload schemas', () => {
  it('only store our own upload URLs', () => {
    expect(uploadUrlSchema.safeParse('/api/protected/files/a/quotes/x.pdf').success).toBe(true)
    expect(uploadUrlSchema.safeParse('/api/protected/files/../../.env').success).toBe(false)
    expect(uploadUrlSchema.safeParse('').success).toBe(false)
    expect(optionalUploadUrlSchema.safeParse('').success).toBe(true)
  })

  it('reach the vehicle image and the quote attachment', () => {
    expect(
      createVehicleSchema.shape.imageUrl.safeParse('/api/protected/files/../../.env').success
    ).toBe(false)
    expect(createVehicleSchema.shape.imageUrl.safeParse('').success).toBe(true)
    expect(quoteAttachmentSchema.shape.fileUrl.safeParse('/../.env').success).toBe(false)
    expect(
      quoteAttachmentSchema.shape.fileUrl.safeParse('/api/protected/files/a/quotes/q.pdf').success
    ).toBe(true)
  })
})

describe('serving uploads', () => {
  it('names the stored file by its type, never by the name it arrived with', () => {
    expect(extensionForType('image/png')).toBe('png')
    expect(extensionForType('image/svg+xml')).toBe('bin')
    expect(extensionForType('IMAGE/JPEG')).toBe('jpg')
  })

  it('offers an svg only as a sandboxed download', () => {
    const headers = svgDownloadHeaders('public, max-age=1')
    expect(headers['Content-Disposition']).toBe('attachment')
    expect(headers['Content-Security-Policy']).toContain('sandbox')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
  })
})
