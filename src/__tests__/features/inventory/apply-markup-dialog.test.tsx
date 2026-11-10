/**
 * Tests for the Apply Markup dialog on the inventory list.
 *
 * The dialog used to take a bare multiplier, next to a workshop setting called
 * Default Markup % that takes a percentage. A workshop typed 30 for "30%" and
 * had a part that cost 10 priced at 300. These tests hold the dialog to what a
 * person reading it would expect: a percentage in, cost plus that percentage
 * out, and the result on screen before anything is applied.
 */

import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const applyMarkupToAll = vi.fn()
const setSetting = vi.fn()
const openModal = vi.fn()

vi.mock('@/features/inventory/Actions/inventoryActions', () => ({
  applyMarkupToAll: (...args: unknown[]) => applyMarkupToAll(...args),
}))
vi.mock('@/features/settings/Actions/settingsActions', () => ({
  setSetting: (...args: unknown[]) => setSetting(...args),
}))
vi.mock('@/components/glass-modal', () => ({
  useGlassModal: () => ({ open: openModal }),
}))

import { ApplyMarkupDialog } from '@/features/inventory/Components/ApplyMarkupDialog'

const noop = vi.fn()

function Harness({
  initialPercent = 0,
  onApplied = noop,
}: {
  initialPercent?: number
  onApplied?: () => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open dialog
      </button>
      <ApplyMarkupDialog
        open={open}
        onOpenChange={setOpen}
        initialPercent={initialPercent}
        onApplied={onApplied}
      />
    </>
  )
}

const percentField = () => screen.getByLabelText('Markup %') as HTMLInputElement

async function typePercent(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.clear(percentField())
  if (value) await user.type(percentField(), value)
}

beforeEach(() => {
  applyMarkupToAll.mockReset().mockResolvedValue({ success: true, data: { updated: 3 } })
  setSetting.mockReset().mockResolvedValue({ success: true })
  openModal.mockReset()
})

describe('ApplyMarkupDialog', () => {
  it('asks for a percentage and opens with the markup the workshop already uses', () => {
    render(<Harness initialPercent={30} />)

    expect(percentField().value).toBe('30')
    expect(screen.getByText('Enter 30 to add 30% on top of the cost.')).toBeInTheDocument()
  })

  it('shows what a part will sell for before anything is applied', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await typePercent(user, '30')
    expect(screen.getByText('Markup 30%')).toBeInTheDocument()
    expect(screen.getByText(/100\.00/)).toBeInTheDocument()
    expect(screen.getByText(/130\.00/)).toBeInTheDocument()

    // The mistake is visible the moment it is typed, not after the catalog is repriced.
    await typePercent(user, '300')
    expect(screen.getByText(/400\.00/)).toBeInTheDocument()
    expect(applyMarkupToAll).not.toHaveBeenCalled()
  })

  it('applies 30 as cost plus 30 percent, not thirty times the cost', async () => {
    const user = userEvent.setup()
    const onApplied = vi.fn()
    render(<Harness onApplied={onApplied} />)

    await typePercent(user, '30')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(applyMarkupToAll).toHaveBeenCalledWith({ multiplier: 1.3, overrideExisting: false })
    expect(setSetting).toHaveBeenCalledWith('inventory.markupMultiplier', '1.3')
    // The list prices the next new part with this at once, without waiting
    // for the page to be read again.
    expect(onApplied).toHaveBeenCalledWith(1.3)
    expect(screen.queryByLabelText('Markup %')).not.toBeInTheDocument()
  })

  it('leaves priced parts alone unless told to override them', async () => {
    const user = userEvent.setup()
    render(<Harness initialPercent={25} />)

    expect(screen.getByText('Only parts without a sell price will be updated.')).toBeInTheDocument()

    await user.click(screen.getByRole('switch'))
    expect(
      screen.getByText('All parts will be updated, including those with an existing sell price.')
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(applyMarkupToAll).toHaveBeenCalledWith({ multiplier: 1.25, overrideExisting: true })
  })

  it('cannot be applied with the field empty', async () => {
    const user = userEvent.setup()
    render(<Harness initialPercent={30} />)

    await typePercent(user, '')

    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(screen.queryByText('Example')).not.toBeInTheDocument()
  })

  it('refuses a markup that would give parts away, and says why', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await typePercent(user, '-100')

    expect(screen.getByText('The markup must be higher than -100%.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('forgets a percentage that was typed and then cancelled', async () => {
    const user = userEvent.setup()
    render(<Harness initialPercent={30} />)

    await typePercent(user, '300')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(applyMarkupToAll).not.toHaveBeenCalled()
    expect(setSetting).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'open dialog' }))
    expect(percentField().value).toBe('30')
  })

  it('says how this markup differs from the one in the workshop settings', () => {
    render(<Harness initialPercent={30} />)

    expect(
      screen.getByText(
        'Default Markup % under Settings > Workshop is a separate setting, added when parts go on a job.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText('New parts fill in Sell Price at this markup when you enter the Unit Cost.')
    ).toBeInTheDocument()
  })

  it('keeps the dialog open and reports it when the catalog could not be repriced', async () => {
    applyMarkupToAll.mockResolvedValue({ success: false, error: 'No permission' })
    const user = userEvent.setup()
    const onApplied = vi.fn()
    render(<Harness initialPercent={30} onApplied={onApplied} />)

    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(openModal).toHaveBeenCalledWith('error', 'Error', 'No permission')
    expect(onApplied).not.toHaveBeenCalled()
    expect(percentField()).toBeInTheDocument()
  })
})
