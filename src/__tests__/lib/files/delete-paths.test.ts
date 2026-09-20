/**
 * Every delete hands its files to the file manager, in the right order and
 * for the right workshop:
 *
 * 1. the files are read while the rows still exist (collect),
 * 2. the rows are deleted,
 * 3. only then are the files released, with the caller's own workshop.
 *
 * Releasing before the delete would take a file from rows that, if the delete
 * failed, still need it; and a file is only safe to judge "unused" once the
 * rows are gone. The database here is a stand-in that records the order of
 * every call, and the manager and the collectors record theirs into the same
 * log.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const log = vi.hoisted(() => ({ calls: [] as string[] }))
const rows = vi.hoisted(() => ({ findFirst: {} as Record<string, unknown> }))

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(async () => ({ user: { id: 'user-a', email: 'a@x.test' } })),
  getCachedMembership: vi.fn(async () => ({
    organizationId: 'org-a',
    role: 'owner',
    roleId: null,
    customRole: null,
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(), auditDetails: vi.fn(() => undefined) }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { emit: vi.fn() } }))
vi.mock('@/lib/demo', () => ({
  demoGuard: vi.fn(),
  demoGuardSettingKey: vi.fn(),
  isDemoMode: vi.fn(() => false),
}))
vi.mock('@/lib/features', () => ({
  requireFeature: vi.fn(),
  getFeatures: vi.fn(async () => ({})),
}))
vi.mock('@/lib/document-lock.server', () => ({
  assertInvoiceEditable: vi.fn(),
  assertQuoteEditable: vi.fn(),
  getDocumentLockSettings: vi.fn(async () => ({})),
}))
vi.mock('@/features/tire-hotel/Lib/tireHotelSettings', () => ({ requireTireHotel: vi.fn() }))
vi.mock('@/features/inventory/Lib/onInventoryChanged', () => ({ onInventoryChanged: vi.fn() }))
vi.mock('@/features/inventory/Lib/reconcileStock', () => ({
  reconcileInventoryForParts: vi.fn(),
}))
vi.mock('@/features/settings/Lib/armFeatureHints', () => ({ armFeatureHints: vi.fn() }))
vi.mock('@/lib/torqvoice-com', () => ({
  billingRequest: vi.fn(),
  isTorqvoiceComBillingConfigured: vi.fn(() => false),
}))

vi.mock('@/lib/files/collect', () => {
  const collector = (name: string) =>
    vi.fn(async (organizationId: string, ids: string[]) => {
      log.calls.push(`collect:${name}:${organizationId}:${ids.join(',')}`)
      return [`/api/protected/files/${organizationId}/services/${name}.jpg`]
    })
  return {
    serviceRecordFileUrls: collector('serviceRecord'),
    inspectionFileUrls: collector('inspection'),
    vehicleFileUrls: collector('vehicle'),
    quoteFileUrls: collector('quote'),
    tireSetFileUrls: collector('tireSet'),
    inventoryPartFileUrls: collector('inventoryPart'),
  }
})
const releaseFiles = vi.hoisted(() =>
  vi.fn(async (urls: Iterable<string | null | undefined>, opts: { organizationId: string }) => {
    log.calls.push(
      `release:${opts.organizationId}:${[...urls].filter(Boolean).join(',') || '(none)'}`
    )
    return { removed: [], kept: [], skipped: [] }
  })
)
const removeOrganizationFiles = vi.hoisted(() =>
  vi.fn(async (organizationId: string) => {
    log.calls.push(`removeOrganizationFiles:${organizationId}`)
  })
)
vi.mock('@/lib/files/manager', () => ({
  releaseFiles,
  removeOrganizationFiles,
  parseStoredFileUrl: (url: string) =>
    url?.includes('/inventory/') ? { folder: 'inventory' } : null,
}))

/**
 * A database stand-in: every model method is a recorded mock. `findFirst`
 * answers from `rows.findFirst[model]`; lists answer empty, writes answer
 * with one row changed.
 */
vi.mock('@/lib/db', () => {
  const methods = new Map<string, ReturnType<typeof vi.fn>>()
  const method = (model: string, name: string) => {
    const key = `${model}.${name}`
    if (!methods.has(key)) {
      methods.set(
        key,
        vi.fn(async () => {
          log.calls.push(key)
          if (name === 'findFirst' || name === 'findUnique') return rows.findFirst[model] ?? null
          if (name === 'findMany') return []
          if (name === 'count') return 0
          if (name.endsWith('Many')) return { count: 1 }
          return {}
        })
      )
    }
    return methods.get(key)
  }
  const client: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_, model: string) => {
        if (model === '$transaction') {
          return async (arg: unknown) =>
            typeof arg === 'function' ? arg(client) : Promise.all(arg as Promise<unknown>[])
        }
        if (model === 'then') return undefined
        return new Proxy({}, { get: (__, name: string) => method(model, name) })
      },
    }
  )
  return { db: client }
})

const ORG = 'org-a'

beforeEach(() => {
  log.calls = []
  releaseFiles.mockClear()
  removeOrganizationFiles.mockClear()
  rows.findFirst = { user: { isSuperAdmin: false } }
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

/** The index of the first log entry starting with `prefix`, or -1. */
const at = (prefix: string) => log.calls.findIndex((call) => call.startsWith(prefix))

/** Asserts collect → delete → release, all for this workshop. */
function expectCollectDeleteRelease(collect: string, deleteCall: string) {
  const collected = at(`collect:${collect}:${ORG}`)
  const deleted = at(deleteCall)
  const released = at(`release:${ORG}:`)
  expect(collected, `${collect} collected`).toBeGreaterThanOrEqual(0)
  expect(deleted, `${deleteCall} ran`).toBeGreaterThan(collected)
  expect(released, 'files released after the delete').toBeGreaterThan(deleted)
  expect(log.calls[released]).toContain(`/${collect}.jpg`)
}

describe('deletes that take files with them', () => {
  it('a vehicle, from the vehicles list', async () => {
    rows.findFirst.vehicle = { year: 2020, make: 'Ford', model: 'F-150', licensePlate: null }
    const { deleteVehicle } = await import('@/features/vehicles/Actions/vehicleActions')
    expect((await deleteVehicle('v-1')).success).toBe(true)
    expectCollectDeleteRelease('vehicle', 'vehicle.deleteMany')
    expect(at('collect:vehicle:org-a:v-1')).toBeGreaterThanOrEqual(0)
  })

  it('a vehicle, from its own page (which used to leave every file behind)', async () => {
    const { deleteVehicle } = await import('@/features/vehicles/Actions/deleteVehicle')
    expect((await deleteVehicle('v-1')).success).toBe(true)
    expectCollectDeleteRelease('vehicle', 'vehicle.deleteMany')
  })

  it('a work order: collected first, released after its transaction', async () => {
    rows.findFirst.serviceRecord = { id: 'sr-1', vehicleId: 'v-1', invoiceNumber: 'WO-1' }
    const { deleteServiceRecord } = await import('@/features/vehicles/Actions/serviceActions')
    expect((await deleteServiceRecord('sr-1')).success).toBe(true)
    expectCollectDeleteRelease('serviceRecord', 'serviceRecord.delete')
  })

  it('one attachment: the row first, then its file (kept by the manager if shared)', async () => {
    const fileUrl = `/api/protected/files/${ORG}/tire-hotel/shared.jpg`
    rows.findFirst.serviceAttachment = {
      id: 'att-1',
      fileUrl,
      category: 'tire_hotel',
      serviceRecord: { id: 'sr-1', vehicleId: 'v-1' },
    }
    const { deleteServiceAttachment } = await import('@/features/vehicles/Actions/serviceActions')
    expect((await deleteServiceAttachment('att-1')).success).toBe(true)
    expect(at('release:')).toBeGreaterThan(at('serviceAttachment.delete'))
    // A tire hotel copy is handed over too; the manager keeps it for the set.
    expect(log.calls[at('release:')]).toBe(`release:${ORG}:${fileUrl}`)
  })

  it('a quote and a quote attachment', async () => {
    rows.findFirst.quote = { id: 'q-1', organizationId: ORG }
    const { deleteQuote } = await import('@/features/quotes/Actions/quoteActions')
    expect((await deleteQuote('q-1')).success).toBe(true)
    expectCollectDeleteRelease('quote', 'quote.deleteMany')

    log.calls = []
    rows.findFirst.quoteAttachment = {
      id: 'qa-1',
      fileUrl: `/api/protected/files/${ORG}/quotes/a.pdf`,
      quote: { id: 'q-1' },
    }
    const { deleteQuoteAttachment } = await import(
      '@/features/quotes/Actions/deleteQuoteAttachment'
    )
    expect((await deleteQuoteAttachment('qa-1')).success).toBe(true)
    expect(at('release:')).toBeGreaterThan(at('quoteAttachment.delete'))
  })

  it('a tire set, and one of its files', async () => {
    rows.findFirst.tireSet = { id: 't-1', reference: 'T-1', status: 'returned' }
    const { deleteTireSet } = await import('@/features/tire-hotel/Actions/tireSetActions')
    expect((await deleteTireSet('t-1')).success).toBe(true)
    expectCollectDeleteRelease('tireSet', 'tireSet.delete')

    log.calls = []
    rows.findFirst.tireSetAttachment = {
      id: 'ta-1',
      tireSetId: 't-1',
      fileName: 'rim.jpg',
      fileUrl: `/api/protected/files/${ORG}/tire-hotel/rim.jpg`,
    }
    const { deleteTireSetAttachment } = await import(
      '@/features/tire-hotel/Actions/attachmentActions'
    )
    expect((await deleteTireSetAttachment('ta-1')).success).toBe(true)
    expect(at('release:')).toBeGreaterThan(at('tireSetAttachment.delete'))
  })

  it('an inspection; a photo taken off an item is left for the sweep', async () => {
    rows.findFirst.inspection = { id: 'in-1', vehicleId: 'v-1' }
    const { deleteInspection, updateInspectionItem } = await import(
      '@/features/inspections/Actions/inspectionActions'
    )
    expect((await deleteInspection('in-1')).success).toBe(true)
    expectCollectDeleteRelease('inspection', 'inspection.deleteMany')

    log.calls = []
    const kept = `/api/protected/files/${ORG}/services/kept.jpg`
    const removed = `/api/protected/files/${ORG}/services/removed.jpg`
    rows.findFirst.inspectionItem = { id: 'it-1', imageUrls: [kept, removed] }
    expect((await updateInspectionItem('it-1', { imageUrls: [kept] })).success).toBe(true)
    // Not released on save: the page sends its whole list, and a stale one
    // must not cost a file. The sweep collects a really unused photo later.
    expect(at('inspectionItem.update')).toBeGreaterThanOrEqual(0)
    expect(at('release:')).toBe(-1)
  })

  it('inventory parts, one and many', async () => {
    const { deleteInventoryPart, deleteInventoryParts } = await import(
      '@/features/inventory/Actions/inventoryActions'
    )
    expect((await deleteInventoryPart('p-1')).success).toBe(true)
    expectCollectDeleteRelease('inventoryPart', 'inventoryPart.deleteMany')

    log.calls = []
    expect((await deleteInventoryParts(['p-1', 'p-2'])).success).toBe(true)
    expectCollectDeleteRelease('inventoryPart', 'inventoryPart.deleteMany')
    expect(at('collect:inventoryPart:org-a:p-1,p-2')).toBeGreaterThanOrEqual(0)
  })

  it('a status report and its video', async () => {
    const videoUrl = `/api/protected/files/${ORG}/services/clip.mp4`
    rows.findFirst.statusReport = { id: 'sr-1', videoUrl, organizationId: ORG }
    const { deleteStatusReport } = await import(
      '@/features/status-reports/Actions/deleteStatusReport'
    )
    expect((await deleteStatusReport('sr-1')).success).toBe(true)
    expect(at('release:')).toBeGreaterThan(at('statusReport.delete'))
    expect(log.calls[at('release:')]).toBe(`release:${ORG}:${videoUrl}`)
  })

  it('a WhatsApp message with a picture', async () => {
    const mediaUrl = `/api/protected/files/${ORG}/vehicles/sent.jpg`
    rows.findFirst.whatsappMessage = { id: 'm-1', mediaUrl }
    const { deleteWhatsappMessage } = await import('@/features/whatsapp/Actions/whatsappActions')
    expect((await deleteWhatsappMessage('m-1')).success).toBe(true)
    expect(at('release:')).toBeGreaterThan(at('whatsappMessage.delete'))
    expect(log.calls[at('release:')]).toBe(`release:${ORG}:${mediaUrl}`)
  })

  it('an invoice design, and its logo', async () => {
    const logoUrl = `/api/protected/files/${ORG}/logos/design.png`
    rows.findFirst.documentDesign = { id: 'd-1', name: 'Plain', template: { logoUrl } }
    const { deleteDocumentDesign } = await import(
      '@/features/invoice-designer/Actions/documentDesignActions'
    )
    expect((await deleteDocumentDesign('d-1')).success).toBe(true)
    expect(at('release:')).toBeGreaterThan(at('documentDesign.delete'))
    expect(log.calls[at('release:')]).toBe(`release:${ORG}:${logoUrl}`)
  })
})

describe('everything at once', () => {
  it('delete content: every chosen kind, released once at the end', async () => {
    const { deleteContent } = await import('@/features/settings/Actions/deleteContent')
    const result = await deleteContent({
      vehicles: true,
      quotes: true,
      inspections: true,
      inventory: true,
    } as never)
    expect(result.success).toBe(true)
    const released = at('release:')
    expect(released).toBeGreaterThan(at('vehicle.deleteMany'))
    expect(released).toBeGreaterThan(at('quote.deleteMany'))
    expect(released).toBeGreaterThan(at('inspection.deleteMany'))
    expect(released).toBeGreaterThan(at('inventoryPart.deleteMany'))
    for (const kind of ['vehicle', 'quote', 'inspection', 'inventoryPart']) {
      expect(at(`collect:${kind}:${ORG}`), kind).toBeLessThan(released)
    }
  })

  it('a whole workshop: its own folder, after the rows, never file by file', async () => {
    const { deleteOrganizationWithData } = await import('@/lib/delete-user-data')
    await deleteOrganizationWithData(ORG)
    expect(at('removeOrganizationFiles:org-a')).toBeGreaterThan(at('organization.delete'))
    expect(releaseFiles).not.toHaveBeenCalled()
  })
})

describe('deleting a user', () => {
  it('gives the rows they left behind in a workshop they no longer belong to to a member there', async () => {
    const { db } = await import('@/lib/db')
    const mocked = db as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
    // Not a member anywhere any more, but still the owner of a vehicle in org-b.
    mocked.organizationMember.findMany.mockResolvedValueOnce([])
    mocked.vehicle.findMany.mockResolvedValueOnce([{ organizationId: 'org-b' }])
    rows.findFirst.organizationMember = { userId: 'user-b' }
    const { deleteUserOrganizations } = await import('@/lib/delete-user-data')

    await deleteUserOrganizations('user-a')

    // Reassigned, so deleting the user cascades nothing of org-b's.
    for (const model of ['vehicle', 'quote', 'tireSet', 'tireWarehouse', 'appSetting']) {
      expect(mocked[model].updateMany, model).toHaveBeenCalledWith({
        where: { userId: 'user-a', organizationId: 'org-b' },
        data: { userId: 'user-b' },
      })
    }
    expect(removeOrganizationFiles).not.toHaveBeenCalled()
  })
})

describe('settings that point at a file', () => {
  it('a replaced or removed logo is released after the save, an unchanged one is not', async () => {
    const oldLogo = `/api/protected/files/${ORG}/logos/old.png`
    const { setSetting, setSettings } = await import('@/features/settings/Actions/settingsActions')

    const findMany = (await import('@/lib/db')).db.appSetting.findMany as ReturnType<typeof vi.fn>
    findMany.mockResolvedValueOnce([{ key: 'workshop.logo', value: oldLogo }])
    expect((await setSetting('workshop.logo' as never, '')).success).toBe(true)
    expect(at('release:')).toBeGreaterThan(at('appSetting.upsert'))
    expect(log.calls[at('release:')]).toBe(`release:${ORG}:${oldLogo}`)

    log.calls = []
    findMany.mockResolvedValueOnce([{ key: 'workshop.logo', value: oldLogo }])
    expect((await setSettings({ 'workshop.logo': oldLogo })).success).toBe(true)
    expect(at('release:')).toBe(-1)
  })
})
