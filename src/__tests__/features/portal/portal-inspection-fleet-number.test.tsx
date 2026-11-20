/**
 * An inspection read in the portal names the vehicle the way the shared
 * report does: with its fleet / unit number on a line beside the plate, for a
 * workshop that has the field on and a vehicle that has one. Otherwise the
 * page, and the answer the portal action gives, are what they were.
 */
import fs from 'node:fs'
import path from 'node:path'
import { IntlMessageFormat } from 'intl-messageformat'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: [] as { key: string; value: string }[],
  features: { customFields: true },
  fleetNumber: 'T-208' as string | null,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace: string) => {
    const [file, ...rest] = namespace.split('.')
    let messages: unknown = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), `messages/en/${file}.json`), 'utf-8')
    )
    for (const seg of rest) messages = (messages as Record<string, unknown>)[seg]
    return (key: string, values?: Record<string, unknown>) => {
      let tpl: unknown = messages
      for (const seg of key.split('.')) tpl = (tpl as Record<string, unknown> | undefined)?.[seg]
      if (typeof tpl !== 'string') return key
      return String(new IntlMessageFormat(tpl, 'en').format(values as never))
    }
  },
}))
vi.mock('@/features/portal/Components/PortalShell', () => ({
  PortalShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/features/portal/Components/Detail/PortalInspectionResults', () => ({
  PortalInspectionResults: () => null,
}))
vi.mock('@/lib/portal-slug', () => ({
  resolvePortalOrg: vi.fn(async () => ({ id: 'org1', name: 'Riverside' })),
}))
vi.mock('@/features/portal/Lib/portalFormat', () => ({
  portalFormat: async () => ({ day: (iso: string) => iso.slice(0, 10) }),
}))
vi.mock('@/lib/customer-session', () => ({
  getCustomerSession: async () => ({ customerId: 'cust1', organizationId: 'org1' }),
}))
vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn(async () => state.features),
  isCloudMode: () => false,
}))
vi.mock('@/lib/db', () => ({
  db: {
    inspection: {
      findFirst: vi.fn(async () => ({
        id: 'i1',
        status: 'completed',
        mileage: 18240,
        notes: null,
        completedAt: new Date('2026-11-05T21:40:00.000Z'),
        createdAt: new Date('2026-11-05T20:30:00.000Z'),
        publicToken: null,
        severityScale: 'basic',
        country: null,
        nextTestDue: null,
        certificateNumber: null,
        vehicle: {
          make: 'Volvo',
          model: 'FH16',
          year: 2021,
          vin: null,
          licensePlate: 'EL12345',
          hsn: null,
          tsn: null,
          fleetNumber: state.fleetNumber,
        },
        template: { name: 'Winter check', severityScale: 'basic', country: null },
        items: [],
      })),
    },
    appSetting: {
      findMany: vi.fn(async ({ where }: { where: { key: unknown } }) =>
        state.settings.filter((row) =>
          typeof where.key === 'string'
            ? row.key === where.key
            : (where.key as { in: string[] }).in.includes(row.key)
        )
      ),
      findFirst: vi.fn(async () => null),
    },
  },
}))

import PortalInspectionPage from '@/app/(public)/portal/[orgId]/inspections/[inspectionId]/page'
import { getPortalInspection } from '@/features/portal/Actions/getPortalInspection'

const FLEET_SWITCH = { key: 'vehicle.fleetNumberEnabled', value: 'true' }

const renderPage = async () =>
  render(
    await PortalInspectionPage({
      params: Promise.resolve({ orgId: 'riverside', inspectionId: 'i1' }),
    })
  )

async function vehicleAnswered() {
  const result = await getPortalInspection('i1')
  expect(result.success).toBe(true)
  return result.data?.vehicle as Record<string, unknown>
}

beforeEach(() => {
  state.settings = [FLEET_SWITCH]
  state.features = { customFields: true }
  state.fleetNumber = 'T-208'
})

describe('the fleet number on an inspection in the portal', () => {
  it('shows beside the plate for a workshop that has it on', async () => {
    expect(await vehicleAnswered()).toMatchObject({ fleetNumber: 'T-208' })
    await renderPage()
    expect(screen.getByText('EL12345')).toBeInTheDocument()
    expect(screen.getByText('Fleet no.: T-208')).toBeInTheDocument()
  })

  it('wraps a long number rather than push the column wider', async () => {
    state.fleetNumber = 'NORDMANN-TRANSPORT-NORTH-DEPOT-UNIT-0042'
    await renderPage()
    expect(
      screen.getByText('Fleet no.: NORDMANN-TRANSPORT-NORTH-DEPOT-UNIT-0042').className
    ).toContain('wrap-anywhere')
  })

  it('is absent, key and all, while the switch is off', async () => {
    state.settings = []
    expect(await vehicleAnswered()).not.toHaveProperty('fleetNumber')
    await renderPage()
    expect(screen.queryByText(/Fleet no\./)).not.toBeInTheDocument()
  })

  it('is absent, key and all, for a vehicle without a number', async () => {
    state.fleetNumber = null
    expect(await vehicleAnswered()).not.toHaveProperty('fleetNumber')
    await renderPage()
    expect(screen.queryByText(/Fleet no\./)).not.toBeInTheDocument()
  })

  it('is absent after the plan loses custom fields, whatever the switch says', async () => {
    state.features = { customFields: false }
    expect(await vehicleAnswered()).not.toHaveProperty('fleetNumber')
    await renderPage()
    expect(screen.queryByText(/Fleet no\./)).not.toBeInTheDocument()
    expect(screen.queryByText(/T-208/)).not.toBeInTheDocument()
  })
})
