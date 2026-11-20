/**
 * @vitest-environment node
 *
 * The places a workshop that never switched Reference / PO on must not see
 * it, and the places a workshop that did must: integration settings, the
 * settings search, the model's column lists, the customer portal, and every
 * page that reads the switch from a hand-picked list of settings.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { appSetting: { findMany: vi.fn() }, serviceRecord: { findFirst: vi.fn() } },
}))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn() }))

import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import {
  invoiceHeldFromCustomer,
  notAwaitingReference,
} from '@/features/customer-reference/Lib/referenceSetting'
import {
  manifestForWorkshop,
  trimManifest,
  withoutGatedChoices,
} from '@/features/integrations/Lib/workshop-manifest'
import { manifest as fiken } from '@/integrations/fiken/manifest'
import { manifest as quickbooks } from '@/integrations/quickbooks/manifest'
import { manifest as xero } from '@/integrations/xero/manifest'
import { manifest as zoho } from '@/integrations/zoho-books/manifest'
import { listManifests } from '@/integrations/registry'
import { REFERENCE_COLUMNS, TABLE_COLUMNS, columnsFor } from '@/features/ai/tools/workshop-columns'
import { SETTINGS_SEARCH_INDEX } from '@/features/settings/Lib/searchIndex'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

function workshop({ field, plan = true }: { field: boolean; plan?: boolean }) {
  vi.mocked(db.appSetting.findMany).mockResolvedValue(
    (field ? [{ key: SETTING_KEYS.CUSTOMER_REFERENCE_ENABLED, value: 'true' }] : []) as never
  )
  vi.mocked(getFeatures).mockResolvedValue({ customFields: plan } as never)
}

beforeEach(() => vi.clearAllMocks())

const NONE = new Set<never>()
const ON = new Set(['customerReference'] as const)
const keys = (m: { settings: { key: string }[] }) => m.settings.map((s) => s.key)
const referenceOptions = (m: typeof xero) =>
  m.settings.find((s) => s.key === 'reference')?.options?.map((o) => o.value)

describe('integration settings', () => {
  it('are what they were before the field existed, for a workshop that has it off', () => {
    expect(keys(trimManifest(quickbooks, NONE))).not.toContain('customerReference')
    expect(keys(trimManifest(quickbooks, NONE))).not.toContain('customerReferenceField')
    expect(keys(trimManifest(fiken, NONE))).not.toContain('customerReferenceInText')
    for (const m of [xero, zoho]) {
      expect(referenceOptions(trimManifest(m, NONE))).toEqual([
        'vehicle',
        'title',
        'invoiceNumber',
        'none',
      ])
    }
  })

  it('gain the new settings and the new choice once it is on', () => {
    expect(keys(trimManifest(quickbooks, ON))).toEqual(keys(quickbooks))
    expect(keys(trimManifest(fiken, ON))).toContain('customerReferenceInText')
    expect(referenceOptions(trimManifest(xero, ON))).toContain('customerReference')
    expect(referenceOptions(trimManifest(zoho, ON))).toContain('customerReference')
  })

  it('touch no connector that asks for no workshop feature', () => {
    for (const m of listManifests()) {
      const gated = m.settings.some((s) => s.requires || s.options?.some((o) => o.requires))
      if (!gated) expect(trimManifest(m, NONE), m.id).toBe(m)
    }
  })

  it('follow the switch and the plan, asked on the server', async () => {
    workshop({ field: false })
    expect(keys(await manifestForWorkshop(fiken, 'org1'))).not.toContain('customerReferenceInText')
    workshop({ field: true })
    expect(keys(await manifestForWorkshop(fiken, 'org1'))).toContain('customerReferenceInText')
    workshop({ field: true, plan: false })
    expect(keys(await manifestForWorkshop(fiken, 'org1'))).not.toContain('customerReferenceInText')
  })

  it('do not take a setting or a choice the workshop is not offered', () => {
    const offered = trimManifest(xero, NONE)
    // A crafted or stale save: the gated choice is left as stored.
    expect(withoutGatedChoices(xero, offered, { reference: 'customerReference' })).toEqual({})
    expect(withoutGatedChoices(xero, offered, { reference: 'title' })).toEqual({
      reference: 'title',
    })
    expect(
      withoutGatedChoices(quickbooks, trimManifest(quickbooks, NONE), {
        customerReference: 'memo',
        includeVehicle: true,
      })
    ).toEqual({ includeVehicle: true })
    expect(
      withoutGatedChoices(xero, trimManifest(xero, ON), { reference: 'customerReference' })
    ).toEqual({ reference: 'customerReference' })
  })
})

describe('the settings search', () => {
  it('ties the entry to the plan the switch is drawn for', () => {
    const entry = SETTINGS_SEARCH_INDEX.find((e) => e.id === 'invoice.customerReference')
    expect(entry?.requires).toBe('customFields')
  })
})

describe('the model’s column lists', () => {
  it('leave the reference and "PO required" out for a workshop that has the field off', () => {
    for (const table of ['service_records', 'quotes', 'customers']) {
      const off = columnsFor(table, { customerReference: false, fleetNumber: true })
      for (const column of REFERENCE_COLUMNS) expect(off, table).not.toContain(column)
      // Nothing else goes with them.
      expect(off).toEqual(TABLE_COLUMNS[table].filter((c) => !REFERENCE_COLUMNS.includes(c)))
      expect(columnsFor(table, { customerReference: true, fleetNumber: true })).toEqual([
        ...TABLE_COLUMNS[table],
      ])
    }
  })

  it('leave every other table alone', () => {
    expect(columnsFor('vehicles', { customerReference: false, fleetNumber: true })).toEqual([
      ...TABLE_COLUMNS.vehicles,
    ])
  })
})

describe('the customer portal', () => {
  it('filters nothing for a workshop that has the field off', async () => {
    workshop({ field: false })
    expect(await notAwaitingReference('org1')).toEqual({})
    expect(await invoiceHeldFromCustomer('org1', 'svc1')).toBe(false)
    expect(db.serviceRecord.findFirst).not.toHaveBeenCalled()
  })

  it('holds back a job never issued, without a reference, for a customer who needs one', async () => {
    workshop({ field: true })
    const where = await notAwaitingReference('org1')
    expect(where).toEqual({
      NOT: {
        issuedAt: null,
        AND: [
          { OR: [{ customerReference: null }, { customerReference: '' }] },
          {
            OR: [
              { customer: { poRequired: true } },
              { customerId: null, vehicle: { customer: { poRequired: true } } },
            ],
          },
        ],
      },
    })
  })

  it('asks the same of one job, in the caller’s own workshop', async () => {
    workshop({ field: true })
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValueOnce({ id: 'svc1' } as never)
    expect(await invoiceHeldFromCustomer('org1', 'svc1')).toBe(true)
    expect(vi.mocked(db.serviceRecord.findFirst).mock.calls[0][0]?.where).toMatchObject({
      id: 'svc1',
      organizationId: 'org1',
      issuedAt: null,
    })
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValueOnce(null)
    expect(await invoiceHeldFromCustomer('org1', 'svc1')).toBe(false)
  })
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === '__tests__' || name === 'generated' || name === 'node_modules') return []
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('pages that read the switch from a list of settings they chose', () => {
  it('have the switch on that list', () => {
    // A page that loads only named settings and then asks whether the field
    // is on gets "off" for ever if the switch is not one of the names: the
    // quote share page did exactly that.
    const offenders = sourceFiles('src')
      .filter((path) => !path.includes('customer-reference/Lib/referenceSetting'))
      .filter((path) => {
        const source = readFileSync(path, 'utf8')
        if (!source.includes('customerReferenceEnabledIn(')) return false
        const picksKeys = /appSetting\.findMany\(\{[\s\S]{0,200}?key:\s*\{\s*in:/.test(source)
        return picksKeys && !source.includes('SETTING_KEYS.CUSTOMER_REFERENCE_ENABLED')
      })
    expect(offenders).toEqual([])
  })
})
