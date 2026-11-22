/**
 * The status stepper on the modern work order page. The stage the job is in
 * opens its menu of statuses when it has one; without one it is not a
 * control at all. The other stages move the job, as they always have.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StatusStepper } from '@/features/vehicles/Components/service-page/modern/StatusStepper'
import type { WorkOrderStatusOption } from '@/features/work-order-statuses/Lib/stages'

const noop = () => undefined
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)
Element.prototype.scrollIntoView = noop
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = noop

const QC: WorkOrderStatusOption = {
  id: 'qc',
  name: 'Quality check',
  stage: 'completed',
  color: 'blue',
  notifyCustomer: false,
  messageTemplate: null,
}

function renderStepper(props: Partial<Parameters<typeof StatusStepper>[0]> = {}) {
  const onChange = vi.fn()
  render(<StatusStepper status="pending" onChange={onChange} {...props} />)
  return { onChange, stepper: screen.getByTestId('status-stepper') }
}

describe('StatusStepper', () => {
  it('opens the menu of the stage the job is in when that stage is clicked', () => {
    const { onChange, stepper } = renderStepper({ status: 'in-progress', canAddStatus: true })
    const current = within(stepper).getByRole('button', { name: 'In Progress' })
    expect(current).toHaveAttribute('aria-current', 'step')
    expect(current).toHaveAttribute('aria-haspopup', 'menu')

    fireEvent.click(current)

    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Waiting Parts' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Add status' })).toHaveAttribute(
      'href',
      '/settings/work-order-statuses'
    )
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Waiting Parts' }))
    expect(onChange).toHaveBeenCalledWith('waiting-parts', null)
  })

  it('opens the same menu from the keyboard', async () => {
    const user = userEvent.setup()
    renderStepper({ status: 'in-progress' })
    const current = screen.getByRole('button', { name: 'In Progress' })

    current.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('menuitem', { name: 'Waiting Parts' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(current).toHaveFocus()

    await user.keyboard(' ')
    expect(screen.getByRole('menuitem', { name: 'Waiting Parts' })).toBeInTheDocument()
  })

  it('opens the menu with "add a status" only for somebody who may change settings', () => {
    renderStepper({ status: 'in-progress', canAddStatus: false })
    fireEvent.click(screen.getByRole('button', { name: 'In Progress' }))
    expect(screen.getByRole('menuitem', { name: 'Waiting Parts' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Add status' })).not.toBeInTheDocument()
  })

  it('opens the menu of a current stage with a status shown under it, instead of lifting it', () => {
    const { onChange } = renderStepper({ status: 'waiting-parts' })
    fireEvent.click(screen.getByRole('button', { name: 'In Progress: Waiting Parts' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()

    // The plain stage at the top of the menu is how the hold is lifted.
    fireEvent.click(screen.getByRole('menuitem', { name: 'In Progress' }))
    expect(onChange).toHaveBeenCalledWith('in-progress', null)
  })

  it('does not make a current stage without a menu a control', async () => {
    const user = userEvent.setup()
    const { onChange, stepper } = renderStepper({ status: 'pending' })

    expect(within(stepper).queryByRole('button', { name: 'Pending' })).not.toBeInTheDocument()
    const current = within(stepper).getByRole('group', { name: 'Pending' })
    expect(current).toHaveAttribute('aria-current', 'step')
    expect(current).not.toHaveAttribute('tabindex')
    expect(current.className).not.toContain('cursor-pointer')

    fireEvent.click(current)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    // The tab order starts at the next stage.
    await user.tab()
    expect(screen.getByRole('button', { name: 'In Progress' })).toHaveFocus()
  })

  it('makes the completed stage a menu once the workshop files a status under it', () => {
    renderStepper({ status: 'completed', options: [QC] })
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }))
    expect(screen.getByRole('menuitem', { name: 'Quality check' })).toBeInTheDocument()
  })

  it('still lifts an archived status when its stage has no menu', () => {
    const { onChange } = renderStepper({
      status: 'completed',
      customStatus: { id: 'old', name: 'Old status', color: 'blue' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Completed: Old status' }))
    expect(onChange).toHaveBeenCalledWith('completed', null)
  })

  it('moves the job when another stage is clicked, without opening a menu', () => {
    const { onChange } = renderStepper({ status: 'in-progress' })
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }))
    expect(onChange).toHaveBeenCalledWith('completed', null)
    fireEvent.click(screen.getByRole('button', { name: 'Pending' }))
    expect(onChange).toHaveBeenCalledWith('pending', null)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // The stepper takes no lock: it moves a locked invoice along too, so the
  // locked page shows exactly these controls. None is new; the current stage
  // opens only the menu its arrow already opened, and one control is gone.
  it.each([
    ['pending', ['In Progress', 'More statuses', 'Completed']],
    ['in-progress', ['Pending', 'In Progress', 'More statuses', 'Completed']],
    ['completed', ['Pending', 'In Progress', 'More statuses']],
  ])('adds no control on a %s job', (status, names) => {
    renderStepper({ status })
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(names)
  })

  it('keeps the arrow opening the menu', async () => {
    const user = userEvent.setup()
    renderStepper({ status: 'pending' })
    await user.click(screen.getByTestId('status-menu-in-progress'))
    expect(screen.getByRole('menuitem', { name: 'Waiting Parts' })).toBeInTheDocument()
  })
})
