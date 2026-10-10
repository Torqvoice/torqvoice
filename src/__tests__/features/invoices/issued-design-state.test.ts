/**
 * Which design an issued invoice says it was sent with.
 *
 * The Invoice design menu ticks the design whose look is the one frozen on
 * the invoice. A section added to every design after the invoice was issued
 * must not make an invoice nobody redesigned read as sent with a design the
 * workshop no longer has.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contentHash } from '@/features/invoice-designer/Lib/designHash'
import {
  designSourceFromStored,
  materializeDesignSource,
} from '@/features/invoice-designer/Lib/designSource'
import { getDefaultLayout } from '@/features/settings/Schema/invoiceLayoutSchema'
import { buildLayoutFromPreset, layoutPresets } from '@/features/settings/Schema/layoutPresets'

const { serviceRecord, documentDesign, appSetting, currentLook } = vi.hoisted(() => ({
  serviceRecord: { findFirst: vi.fn() },
  documentDesign: { findMany: vi.fn() },
  appSetting: { findMany: vi.fn() },
  currentLook: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: { serviceRecord, documentDesign, appSetting } }))
vi.mock('@/features/invoice-designer/Lib/designSnapshots', () => ({
  ensureAssetSnapshot: vi.fn(),
  ensureDesignSnapshot: vi.fn(),
}))
vi.mock('@/features/invoices/Lib/assembleInvoicePrint', () => ({
  currentLook: (...args: unknown[]) => currentLook(...args),
  designLook: vi.fn(),
}))

const { issuedDesignState } = await import('@/features/invoices/Lib/reapplyDesign')

const TEMPLATE = { primaryColor: '#111827', headerStyle: 'standard' }
/** Sections that did not exist when the invoice was issued. */
const ADDED_SINCE = new Set(['defects', 'results_table'])

/**
 * A design as an invoice froze it before those sections existed: read the way
 * issuing reads it, every default written out, less what has been added since.
 */
function frozenBefore(layout: unknown) {
  const source = designSourceFromStored(layout, TEMPLATE)
  if (!source) throw new Error('unreadable design')
  const frozen = materializeDesignSource(source)
  const sections = [...(frozen.layout.sections ?? [])]
    .sort((a, b) => a.order - b.order)
    .filter((s) => !ADDED_SINCE.has(s.id))
    .map((s, order) => ({ ...s, order }))
  return { layout: { ...frozen.layout, sections }, template: frozen.template }
}

function issuedWith({ layout, template }: ReturnType<typeof frozenBefore>) {
  serviceRecord.findFirst.mockResolvedValue({
    id: 'rec-1',
    designId: null,
    vehicleId: 'veh-1',
    customer: null,
    vehicle: null,
    issuedAt: new Date('2026-09-01T10:00:00Z'),
    issuedDesignSnapshot: {
      hash: contentHash({ layout, template }),
      layout,
      template,
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  appSetting.findMany.mockResolvedValue([])
  documentDesign.findMany.mockResolvedValue([])
  currentLook.mockResolvedValue({ designSource: null })
})

describe('an invoice issued before a section was added to every design', () => {
  // A design row saved before the sections existed: a starting point as it
  // was stored then, built-in list order and all.
  const preset = buildLayoutFromPreset(layoutPresets[0])
  const stored = { ...preset, sections: preset.sections.filter((s) => !ADDED_SINCE.has(s.id)) }

  it('still follows the default it was sent with', async () => {
    const layout = getDefaultLayout('invoice')
    issuedWith(frozenBefore(layout))
    currentLook.mockResolvedValue({ designSource: designSourceFromStored(layout, TEMPLATE) })

    const state = await issuedDesignState('org-1', 'rec-1')
    expect(state).toMatchObject({ followsDefault: true, unknown: false })
  })

  it('still matches the named design it was sent with', async () => {
    issuedWith(frozenBefore(stored))
    documentDesign.findMany.mockResolvedValue([
      { id: 'design-1', name: 'Ours', layout: stored, template: TEMPLATE },
    ])

    const state = await issuedDesignState('org-1', 'rec-1')
    expect(state).toMatchObject({ followsDefault: false, matchedDesignId: 'design-1' })
  })

  it('says so when the design really has been changed since', async () => {
    issuedWith(frozenBefore(getDefaultLayout('invoice')))
    documentDesign.findMany.mockResolvedValue([
      {
        id: 'design-1',
        name: 'Ours',
        layout: stored,
        template: { ...TEMPLATE, primaryColor: '#ff0000' },
      },
    ])

    const state = await issuedDesignState('org-1', 'rec-1')
    expect(state).toMatchObject({ followsDefault: false, matchedDesignId: null, unknown: true })
  })
})
