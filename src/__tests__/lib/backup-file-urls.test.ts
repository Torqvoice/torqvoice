/**
 * @vitest-environment node
 *
 * A backup's file URLs on the way back in.
 *
 * Every stored URL names the workshop the file belongs to, and a restore
 * writes the files into the restoring workshop's folder. A column whose URLs
 * are not rewritten keeps naming the workshop the backup came from: the photo
 * or document stops showing, and this workshop's own copy of the file is
 * orphaned on disk. The second half of this file reads the import route and
 * fails when a column that can hold a file URL is restored without a rewrite,
 * so a new one cannot be forgotten.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { rewriteFileUrl, rewriteFileUrlsWithin, withFileUrls } from '@/lib/backup/file-urls'
import { FILE_REFERENCES } from '@/lib/files/references'

const OLD = 'orgFromTheBackup'
const NEW = 'orgRestoringIt'
const stored = (org: string, folder: string, name: string) =>
  `/api/protected/files/${org}/${folder}/${name}`

describe('rewriteFileUrl', () => {
  it('points every shape an upload URL has had at this workshop', () => {
    expect(rewriteFileUrl(stored(OLD, 'services', 'a.jpg'), NEW)).toBe(
      stored(NEW, 'services', 'a.jpg')
    )
    expect(rewriteFileUrl(`/api/files/${OLD}/vehicles/b.png`, NEW)).toBe(
      stored(NEW, 'vehicles', 'b.png')
    )
    expect(rewriteFileUrl('/uploads/logos/c.png', NEW)).toBe(stored(NEW, 'logos', 'c.png'))
  })

  it('restoring into the same workshop leaves the URL as it was', () => {
    const url = stored(NEW, 'services', 'a.jpg')
    expect(rewriteFileUrl(url, NEW)).toBe(url)
  })

  it('leaves anything that is not one of the app’s own uploads', () => {
    for (const value of [
      'https://supplier.example/parts/filter.jpg',
      'Replaced the filter',
      '/work-orders/123',
      '',
    ]) {
      expect(rewriteFileUrl(value, NEW)).toBe(value || null)
    }
    expect(rewriteFileUrl(null, NEW)).toBeNull()
    expect(rewriteFileUrl(undefined, NEW)).toBeNull()
  })
})

describe('withFileUrls', () => {
  it('rewrites the named columns and touches nothing else', () => {
    const row = {
      id: 'sa-1',
      fileUrl: stored(OLD, 'quotes', 'offer.pdf'),
      fileName: 'offer.pdf',
      description: null,
    }
    const columns = { ...row, organizationId: NEW }

    expect(withFileUrls(row, columns, ['fileUrl'], NEW)).toEqual({
      id: 'sa-1',
      fileUrl: stored(NEW, 'quotes', 'offer.pdf'),
      fileName: 'offer.pdf',
      description: null,
      organizationId: NEW,
    })
  })

  it('brings back a text[] of photos, which columnsOf drops', () => {
    // columnsOf skips arrays, because in a backup row an array is normally
    // the nested rows of another table. An inspection item's or a finding's
    // photos are an array of URLs, and were lost with the rest.
    const row = { id: 'f-1', imageUrls: [stored(OLD, 'services', 'p1.jpg'), 'not-an-upload'] }

    expect(withFileUrls(row, { id: 'f-1' }, ['imageUrls'], NEW)).toEqual({
      id: 'f-1',
      imageUrls: [stored(NEW, 'services', 'p1.jpg'), 'not-an-upload'],
    })
  })

  it('leaves a column the backup does not carry absent, rather than null', () => {
    const columns = withFileUrls({ id: 'sr-1' }, { id: 'sr-1' }, ['videoUrl'], NEW)
    expect('videoUrl' in columns).toBe(false)
  })

  it('keeps an empty or null value as it is', () => {
    expect(withFileUrls({ videoUrl: null }, { videoUrl: null }, ['videoUrl'], NEW)).toEqual({
      videoUrl: null,
    })
    expect(withFileUrls({ videoUrl: '' }, { videoUrl: '' }, ['videoUrl'], NEW)).toEqual({
      videoUrl: '',
    })
  })
})

describe('rewriteFileUrlsWithin', () => {
  it('finds stored URLs at any depth, and keeps the rest of the value', () => {
    const template = {
      primaryColor: '#d97706',
      logoUrl: stored(OLD, 'logos', 'logo.png'),
      logoSize: 100,
      showLogo: true,
      blocks: [
        { type: 'image', src: `/api/files/${OLD}/email-images/head.png` },
        { type: 'text', value: 'Thanks for your visit' },
        { type: 'link', href: 'https://torqvoice.com' },
      ],
      missing: null,
    }

    expect(rewriteFileUrlsWithin(template, NEW)).toEqual({
      primaryColor: '#d97706',
      logoUrl: stored(NEW, 'logos', 'logo.png'),
      logoSize: 100,
      showLogo: true,
      blocks: [
        { type: 'image', src: stored(NEW, 'email-images', 'head.png') },
        { type: 'text', value: 'Thanks for your visit' },
        { type: 'link', href: 'https://torqvoice.com' },
      ],
      missing: null,
    })
  })

  it('a design restored into its own workshop comes back unchanged', () => {
    const template = { logoUrl: stored(NEW, 'logos', 'logo.png'), fontFamily: 'Helvetica' }
    expect(rewriteFileUrlsWithin(template, NEW)).toEqual(template)
  })
})

/**
 * The columns that can hold a file URL are listed once, in FILE_REFERENCES
 * (the file manager keeps a file while any of them mentions it). Each one the
 * import route restores has to rewrite it.
 */
describe('the import route rewrites every restored file column', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/protected/backup/import/route.ts'),
    'utf-8'
  )

  /** Where each column is restored, and what proves it is rewritten there. */
  const RESTORED: Record<string, RegExp> = {
    'ServiceAttachment.fileUrl': /fileUrl: rewriteFileUrl\(a\.fileUrl/,
    'QuoteAttachment.fileUrl': /quoteAttachment[\s\S]{0,400}?fields: \['fileUrl'\]/,
    'TireSetAttachment.fileUrl': /fileUrl: rewriteFileUrl\(att\.fileUrl/,
    'Vehicle.imageUrl': /imageUrl: rewriteFileUrl\(v\.imageUrl/,
    'InventoryPart.imageUrl': /imageUrl: rewriteFileUrl\(p\.imageUrl/,
    'StoredImage.url': /storedImage[\s\S]{0,400}?fields: \['url'\]/,
    'InspectionItem.imageUrls': /imageUrls: \(\(item\.imageUrls[\s\S]{0,200}?rewriteFileUrl/,
    'InspectionAttachment.fileUrl': /rewriteFileUrl\(file\.fileUrl as string/,
    'VehicleFinding.imageUrls': /imageUrls: \(\(finding\.imageUrls[\s\S]{0,200}?rewriteFileUrl/,
    'StatusReport.videoUrl': /statusReport[\s\S]{0,400}?fields: \['videoUrl'\]/,
    'WhatsappMessage.mediaUrl': /whatsappMessage[\s\S]{0,400}?fields: \['mediaUrl'\]/,
    'AppSetting.value': /const value = \(rewriteFileUrl\(s\.value/,
    'DocumentDesign.template': /template: rewriteFileUrlsWithin\(/,
    'EmailTemplate.theme': /theme: rewriteAssets\(/,
    'EmailTemplate.blocks': /blocks: rewriteAssets\(/,
  }

  /**
   * The one column deliberately restored as it was: the look an invoice was
   * issued with. Its row is keyed by a hash of its own content, and the logo
   * an issued document prints comes from the frozen bytes beside it
   * (DocumentAssetSnapshot), not from the URL inside it.
   */
  const FROZEN = ['DocumentDesignSnapshot.template']

  it('covers every column in FILE_REFERENCES', () => {
    const listed = FILE_REFERENCES.map((ref) => `${ref.model}.${ref.field}`)
    expect(listed.sort()).toEqual([...Object.keys(RESTORED), ...FROZEN].sort())
  })

  it.each(Object.entries(RESTORED))('%s is rewritten on restore', (column, proof) => {
    expect(source, `${column} is restored without rewriting its workshop`).toMatch(proof)
  })

  it('leaves the frozen issued design alone, and says why', () => {
    expect(source).toMatch(/hash is taken over its own content[\s\S]{0,400}?documentDesignSnapshot/)
  })
})
