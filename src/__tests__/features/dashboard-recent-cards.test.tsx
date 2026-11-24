/**
 * The dashboard's Recent Activity and Recent Observations cards speak the
 * workshop's words: a record by a name somebody knows it by, never by its
 * database id ("— cmwuyxad"), and a severity as High, Medium or Low rather
 * than the stored key ("needs_work").
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// The grid waits for a measured width jsdom never reports; the cards are what
// is under test, so they are drawn as a plain list.
vi.mock('@/features/dashboard/Components/DashboardGrid', () => ({
  DashboardGrid: ({ cardNodes }: { cardNodes: Record<string, React.ReactNode> }) => (
    <div>
      {Object.entries(cardNodes).map(([id, node]) => (
        <section key={id}>{node}</section>
      ))}
    </div>
  ),
}))

import { DashboardClient } from '@/app/(authenticated)/(dashboard)/dashboard-client'
import { ConfirmProvider } from '@/components/confirm-dialog'

const show = (ui: React.ReactElement) => render(<ConfirmProvider>{ui}</ConfirmProvider>)

const stats = {
  isAdmin: true,
  activeJobs: 0,
  pendingJobs: 0,
  totalParts: 0,
  lowStockParts: 0,
  totalCustomers: 0,
  todaysServices: [],
  recentServices: [],
}

const vehicle = { id: 'v-1', make: 'Ford', model: 'Ranger', year: 2022, licensePlate: 'ZZ22 WLK' }

describe('the dashboard', () => {
  it('names a record without printing its id', () => {
    show(
      <DashboardClient
        stats={stats}
        recentAuditLogs={[
          {
            id: 'log-1',
            timestamp: new Date('2026-11-24T10:00:00Z'),
            action: 'serviceRecord.update',
            entity: 'ServiceRecord',
            entityId: 'cmwuyxad0000abcd',
            message: 'Updated service record 2026-1002',
            user: { id: 'u-1', name: 'ZZ Agent Walker', email: null },
          },
        ]}
      />
    )
    expect(screen.getByText('Updated service record 2026-1002')).toBeInTheDocument()
    expect(screen.queryByText(/cmwuyxad/)).not.toBeInTheDocument()
  })

  it('shows an observation’s severity in words', () => {
    show(
      <DashboardClient
        stats={stats}
        recentObservations={[
          {
            id: 'o-1',
            description: 'ZZ P0300',
            severity: 'needs_work',
            notes: null,
            createdAt: new Date(),
            vehicle,
          },
          {
            id: 'o-2',
            description: 'ZZ Rear pads at 3 mm',
            severity: 'urgent',
            notes: null,
            createdAt: new Date(),
            vehicle,
          },
        ]}
      />
    )
    expect(screen.getAllByText('Medium').length).toBeGreaterThan(0)
    expect(screen.getAllByText('High').length).toBeGreaterThan(0)
    expect(screen.queryByText('needs_work')).not.toBeInTheDocument()
    expect(screen.queryByText('urgent')).not.toBeInTheDocument()
  })
})
