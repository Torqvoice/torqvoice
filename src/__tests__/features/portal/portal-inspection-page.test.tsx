/**
 * The inspection read in the portal: the odometer reading carries the
 * workshop's unit, the way the vehicle page prints it, so a customer is not
 * left to guess between miles and kilometres.
 */
import fs from 'node:fs'
import path from 'node:path'
import { IntlMessageFormat } from 'intl-messageformat'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  resolvePortalOrg: vi.fn(async () => ({ id: 'org-real', name: 'Riverside' })),
}))
vi.mock('@/lib/db', () => ({ db: { appSetting: { findFirst: vi.fn() } } }))
vi.mock('@/features/portal/Actions/getPortalInspection', () => ({ getPortalInspection: vi.fn() }))
vi.mock('@/features/portal/Lib/portalFormat', () => ({
  portalFormat: async () => ({ day: (iso: string) => iso.slice(0, 10) }),
}))

import PortalInspectionPage from '@/app/(public)/portal/[orgId]/inspections/[inspectionId]/page'
import { getPortalInspection } from '@/features/portal/Actions/getPortalInspection'
import { db } from '@/lib/db'

const inspection = (serviceType: 'automotive' | 'marine') => ({
  id: 'i1',
  status: 'completed',
  mileage: 18240,
  publicToken: null,
  completedAt: '2026-11-05T21:40:00.000Z',
  createdAt: '2026-11-05T20:30:00.000Z',
  nextTestDue: null,
  certificateNumber: null,
  notes: null,
  serviceType,
  vehicle: { year: 2022, make: 'Porsche', model: '911', licensePlate: 'TN-9911' },
  template: { name: 'Multi-point inspection', severityScale: 'basic', country: null },
  items: [],
})

const renderPage = async () =>
  render(
    await PortalInspectionPage({
      params: Promise.resolve({ orgId: 'riverside', inspectionId: 'i1' }),
    })
  )

describe('the inspection page odometer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is in miles for a workshop on imperial units', async () => {
    vi.mocked(getPortalInspection).mockResolvedValue({
      success: true,
      data: inspection('automotive'),
    } as never)
    vi.mocked(db.appSetting.findFirst).mockResolvedValue({ value: 'imperial' } as never)
    await renderPage()
    expect(screen.getByText('18,240 mi')).toBeInTheDocument()
  })

  it('is in kilometres for a workshop on metric units', async () => {
    vi.mocked(getPortalInspection).mockResolvedValue({
      success: true,
      data: inspection('automotive'),
    } as never)
    vi.mocked(db.appSetting.findFirst).mockResolvedValue({ value: 'metric' } as never)
    await renderPage()
    expect(screen.getByText('18,240 km')).toBeInTheDocument()
  })

  it('leads back to the list and takes its colours from the portal theme', async () => {
    vi.mocked(getPortalInspection).mockResolvedValue({
      success: true,
      data: { ...inspection('automotive'), status: 'in-progress', notes: 'Rear pads next time' },
    } as never)
    vi.mocked(db.appSetting.findFirst).mockResolvedValue({ value: 'metric' } as never)
    const { container } = await renderPage()
    expect(screen.getByRole('link', { name: /Back to inspections/ })).toHaveAttribute(
      'href',
      '/portal/riverside/inspections'
    )
    expect(screen.getByRole('heading', { name: 'Multi-point inspection' })).toBeInTheDocument()
    expect(screen.getByText('Rear pads next time')).toBeInTheDocument()
    expect(
      screen.getByText('The workshop is still working on this inspection. Results may change.')
    ).toBeInTheDocument()
    // The app's own colour classes are dark text on the dark theme's black.
    expect(container.innerHTML).not.toMatch(
      /\b(?:text|bg|border)-(?:muted-foreground|foreground|primary|destructive|card|muted|background|border)\b/
    )
  })

  it('stays a bare number under Engine hours on a boat', async () => {
    vi.mocked(getPortalInspection).mockResolvedValue({
      success: true,
      data: inspection('marine'),
    } as never)
    vi.mocked(db.appSetting.findFirst).mockResolvedValue({ value: 'metric' } as never)
    await renderPage()
    expect(screen.getByText('Engine hours')).toBeInTheDocument()
    expect(screen.getByText('18,240')).toBeInTheDocument()
  })
})
