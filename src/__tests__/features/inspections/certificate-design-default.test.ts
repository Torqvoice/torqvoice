/**
 * Which design a certificate prints from. Until a workshop designs its own,
 * the default is the Regulatory preset; a certificate completed on the
 * built-in sheet before that keeps the sheet it was issued on; a workshop's
 * own design always wins.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: { documentDesignSnapshot: { findFirst: vi.fn(async () => null) } },
}))

import {
  certificateDesignSource,
  liveCertificateDesign,
} from '@/features/inspections/Pdf/certificateDesign'
import {
  DEFAULT_CERTIFICATE_PRESET_ID,
  defaultCertificateDesign,
} from '@/features/inspections/Lib/defaultCertificateDesign'
import { isDesignerLayout } from '@/features/settings/Schema/invoiceLayoutSchema'
import { buildLayoutFromPreset, certificatePresets } from '@/features/settings/Schema/layoutPresets'

const visibleOrder = (layout: { sections?: { id: string; visible?: boolean; order?: number }[] }) =>
  [...(layout.sections ?? [])]
    .filter((s) => s.visible !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => s.id)

const regulatory = certificatePresets.find((p) => p.id === 'certificate-regulator')!

describe('the default certificate design', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is the Regulatory preset', () => {
    expect(DEFAULT_CERTIFICATE_PRESET_ID).toBe('certificate-regulator')
    expect(visibleOrder(defaultCertificateDesign().layout)).toEqual(
      visibleOrder(buildLayoutFromPreset(regulatory))
    )
  })

  it('prints an open inspection in Regulatory when the workshop designed nothing', async () => {
    const source = await certificateDesignSource('org', { designSnapshotId: null }, {})
    expect(source).not.toBeNull()
    expect(isDesignerLayout(source!.layout)).toBe(true)
    expect(visibleOrder(source!.layout)).toEqual(visibleOrder(buildLayoutFromPreset(regulatory)))
    expect(source!.template.fontFamily).toBe('Times-Roman')
    expect(source!.template.primaryColor).toBe('#111827')
  })

  it('keeps a workshop’s own certificate colour and logo on the default', () => {
    const source = liveCertificateDesign({
      'certificate.primaryColor': '#0055aa',
      'certificate.logo': '/api/protected/files/org/logos/a.png',
    })
    expect(source.template.primaryColor).toBe('#0055aa')
    expect(source.template.logoUrl).toBe('/api/protected/files/org/logos/a.png')
    expect(source.template.fontFamily).toBe('Times-Roman')
  })

  it('leaves a certificate completed on the built-in sheet as it was issued', async () => {
    const source = await certificateDesignSource(
      'org',
      { designSnapshotId: null, completedAt: new Date('2026-09-01T10:00:00Z') },
      {}
    )
    expect(source).toBeNull()
  })

  it('prints the workshop’s own design when it has one', async () => {
    const own = { ...buildLayoutFromPreset(certificatePresets[0]), version: 3 }
    const source = await certificateDesignSource(
      'org',
      { designSnapshotId: null },
      {
        'certificate.layoutConfig': JSON.stringify(own),
      }
    )
    expect(visibleOrder(source!.layout)).toEqual(visibleOrder(own))
  })
})
