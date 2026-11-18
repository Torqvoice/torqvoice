import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DEFAULT_PREFS, type RepairDataPrefs } from '@/features/integrations/Lib/repair-prefs'
import type { LaborTime } from '@/features/integrations/Lib/types'
import {
  type LaborView,
  LaborTimesPanel,
} from '@/features/vehicles/Components/labor-guide/LaborTimesPanel'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

function job(
  id: string,
  name: string,
  category: string,
  extra: Partial<LaborTime> = {}
): LaborTime {
  return {
    id,
    name,
    category,
    hours: 1.2,
    low: 1,
    high: 1.6,
    confidence: 'high',
    locked: false,
    ...extra,
  }
}

function view(over: Partial<LaborView> = {}, prefs: Partial<RepairDataPrefs> = {}): LaborView {
  return {
    connector: 'openlaborproject',
    source: 'Open Labor Project',
    logo: null,
    region: 'US',
    variants: [
      { ref: { engineId: '5.0l-v8', drivetrain: '4wd', vehicleId: null }, label: '5.0L V8, 4WD' },
    ],
    selected: 0,
    match: 'engine',
    items: [
      job('water-pump', 'Water Pump', 'cooling'),
      job('thermostat', 'Thermostat', 'cooling', { confidence: 'estimated' }),
      job('pads-front', 'Brake Pads - Front', 'brakes'),
      job('alternator', 'Alternator', 'electrical', {
        hours: null,
        low: null,
        high: null,
        confidence: null,
        locked: true,
      }),
    ],
    hidden: 0,
    prefs: { ...DEFAULT_PREFS, ...prefs },
    ...over,
  }
}

function renderPanel(v: LaborView, onAdd = vi.fn(), onUnlock = vi.fn()) {
  render(
    <TooltipProvider>
      <LaborTimesPanel
        view={v}
        settingsHref="/settings/integrations/openlaborproject"
        added={new Set()}
        unlocking={new Set()}
        onAdd={onAdd}
        onUnlock={onUnlock}
      />
    </TooltipProvider>
  )
  return { onAdd, onUnlock }
}

describe('LaborTimesPanel', () => {
  it('groups jobs under their category and counts them', () => {
    renderPanel(view())
    expect(screen.getByText('4 jobs')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cooling' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Brakes' })).toBeInTheDocument()
  })

  it('adds the hours the workshop settings work out, not the raw book time', () => {
    const { onAdd } = renderPanel(view({}, { adjustPercent: 10, rounding: '0.1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Water Pump as a labor line' }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'water-pump' }), 1.4)
    // The book time stays in view beside the adjusted figure.
    expect(screen.getAllByText('Book 1.2 h').length).toBeGreaterThan(0)
  })

  it('narrows the list as the person types, and says when nothing matches', () => {
    renderPanel(view())
    const search = screen.getByRole('searchbox', { name: 'Search jobs, such as brake pads' })
    fireEvent.change(search, { target: { value: 'pump' } })
    expect(screen.getByText('1 job')).toBeInTheDocument()
    expect(screen.queryByText('Thermostat')).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByText('No jobs match “zzz”')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show all jobs' }))
    expect(screen.getByText('4 jobs')).toBeInTheDocument()
  })

  it('shows one category from the rail', () => {
    renderPanel(view())
    const rail = screen.getByRole('navigation', { name: 'Job categories' })
    fireEvent.click(within(rail).getByRole('button', { name: /Brakes/ }))
    expect(screen.getByText('1 job')).toBeInTheDocument()
    expect(screen.queryByText('Water Pump')).not.toBeInTheDocument()
  })

  it('offers to show the hours of a job the key has not unlocked', () => {
    const { onUnlock } = renderPanel(view())
    fireEvent.click(screen.getByRole('button', { name: 'Show hours' }))
    expect(onUnlock).toHaveBeenCalledWith(expect.objectContaining({ id: 'alternator' }))
  })

  it('warns when the engine may not be the one on file, and says what the settings hide', () => {
    renderPanel(view({ match: 'none', hidden: 3 }))
    expect(screen.getByRole('alert')).toHaveTextContent('None of the engines listed matches')
    expect(screen.getByText(/3 times below your minimum confidence are hidden/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change' })).toHaveAttribute(
      'href',
      '/settings/integrations/openlaborproject'
    )
  })
})
