/**
 * The plan row at the foot of the sidebar.
 *
 * A free workshop used to learn it was on a plan only when a limit refused
 * something. The row says which plan it is on, how many of its customers it
 * has used, and leads to the plans, counted in analytics like the upgrade
 * dialog's button.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'

const track = vi.fn()
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => track(...args) }))

const { SidebarPlan } = await import('@/features/subscription/Components/SidebarPlan')

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

beforeEach(() => track.mockClear())

function renderRow(plan: Parameters<typeof SidebarPlan>[0]['plan']) {
  return render(
    <SidebarProvider>
      <ul>
        <SidebarPlan plan={plan} />
      </ul>
    </SidebarProvider>
  )
}

describe('SidebarPlan', () => {
  it('shows a free workshop its plan and customers used, linking to the plans', () => {
    renderRow({ kind: 'free', customers: 14, customerLimit: 20 })

    expect(screen.getByText('Free plan')).toBeInTheDocument()
    expect(screen.getByText('14 / 20 customers')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Upgrade/ })
    expect(link).toHaveAttribute('href', '/settings/subscription')
  })

  it('records the click with how much of the plan was used', () => {
    renderRow({ kind: 'free', customers: 14, customerLimit: 20 })

    fireEvent.click(screen.getByRole('link', { name: /Upgrade/ }))

    expect(track).toHaveBeenCalledWith('plan:sidebar_upgrade_click', {
      kind: 'free',
      customers: 14,
      customer_limit: 20,
    })
  })

  it('marks the count once the workshop is over its limit', () => {
    renderRow({ kind: 'free', customers: 23, customerLimit: 20 })

    expect(screen.getByText('23 / 20 customers')).toHaveClass('text-destructive')
  })

  it('tells a demo which plan it is trying and how long is left', () => {
    renderRow({ kind: 'demo', plan: 'pro', daysLeft: 5 })

    expect(screen.getByText('Torq Pro demo')).toBeInTheDocument()
    expect(screen.getByText('Ends in 5 days')).toBeInTheDocument()
    expect(screen.queryByText(/customers/)).toBeNull()

    fireEvent.click(screen.getByRole('link', { name: /Upgrade/ }))
    expect(track).toHaveBeenCalledWith('plan:sidebar_upgrade_click', { kind: 'demo' })
  })
})
