import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Building2 } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { type ConfirmOptions, ConfirmProvider, useConfirm } from '@/components/confirm-dialog'

/**
 * The shared confirmation dialog, as someone at a keyboard or on a phone
 * meets it: which button has focus, what Escape and Enter do, and that the
 * key drawn on a button is the key that presses it.
 */

function Asker({ options, onAnswer }: { options: ConfirmOptions; onAnswer: (v: boolean) => void }) {
  const confirm = useConfirm()
  return (
    <button type="button" onClick={async () => onAnswer(await confirm(options))}>
      Ask
    </button>
  )
}

async function ask(options: ConfirmOptions) {
  const onAnswer = vi.fn()
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <ConfirmProvider>
      <Asker options={options} onAnswer={onAnswer} />
    </ConfirmProvider>
  )
  await user.click(screen.getByRole('button', { name: 'Ask' }))
  const dialog = await screen.findByRole('alertdialog')
  return { user, onAnswer, dialog }
}

const removeLinks: ConfirmOptions = {
  title: 'Remove 5 links?',
  description: 'Customers who open these links will see that they are no longer available.',
  confirmLabel: 'Remove 5 links',
  destructive: true,
}

const sendInvoice: ConfirmOptions = {
  title: 'Send invoice to customer?',
  description: 'Invoice 2026-0412 goes to Maria Jensen.',
  confirmLabel: 'Send invoice',
}

describe('confirm dialog: destructive', () => {
  it('opens with focus on Cancel, so Enter does not delete by accident', async () => {
    const { user, onAnswer, dialog } = await ask(removeLinks)

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()

    await user.keyboard('{Enter}')
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false))
    expect(onAnswer).toHaveBeenCalledTimes(1)
  })

  it('shows Esc on Cancel and no Enter hint on the red button', async () => {
    const { dialog } = await ask(removeLinks)

    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    const remove = within(dialog).getByRole('button', { name: 'Remove 5 links' })
    expect(cancel).toHaveTextContent('Esc')
    expect(remove).not.toHaveTextContent('↵')
  })

  it('removes once the red button is reached and pressed', async () => {
    const { user, onAnswer, dialog } = await ask(removeLinks)

    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Remove 5 links' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(true))
  })
})

describe('confirm dialog: neutral', () => {
  it('opens with focus on the action, shows the Enter hint there, and Enter confirms', async () => {
    const { user, onAnswer, dialog } = await ask(sendInvoice)

    const send = within(dialog).getByRole('button', { name: 'Send invoice' })
    expect(send).toHaveFocus()
    expect(send).toHaveTextContent('↵')

    await user.keyboard('{Enter}')
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(true))
  })

  it('keeps focus on the safe choice when the caller asks for it, with no Enter hint on the action', async () => {
    const { user, onAnswer, dialog } = await ask({
      title: 'Leave without saving?',
      description: 'Your changes have not been saved.',
      confirmLabel: 'Leave',
      cancelLabel: 'Keep editing',
      defaultFocus: 'cancel',
    })

    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Leave' })).not.toHaveTextContent('↵')

    await user.keyboard('{Enter}')
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false))
  })
})

describe('confirm dialog: closing without deciding', () => {
  it('cancels on Escape', async () => {
    const { user, onAnswer } = await ask(sendInvoice)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('cancels on a tap outside', async () => {
    const { user, onAnswer } = await ask(removeLinks)

    const backdrop = document.querySelector('[data-slot="alert-dialog-overlay"]')
    expect(backdrop).not.toBeNull()
    await user.click(backdrop as Element)
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false))
  })
})

describe('confirm dialog: what is announced', () => {
  it('falls back to translated labels when the caller passes none', async () => {
    const { dialog } = await ask({ description: 'Delete the reminder "Oil change"?' })

    expect(dialog).toHaveAccessibleName('Are you sure?')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('names the buttons by their labels alone, without the key hints', async () => {
    const { dialog } = await ask(sendInvoice)

    // getByRole matches the whole accessible name: "Cancel Esc" would not be found.
    expect(within(dialog).getByRole('button', { name: /^Cancel$/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^Send invoice$/ })).toBeInTheDocument()
  })

  it('reads the affected things and the consequences as the description', async () => {
    const { dialog } = await ask({
      ...removeLinks,
      description: undefined,
      subject: [
        { label: 'Invoice 2026-0412', detail: 'Maria Jensen' },
        { label: 'Quote 2026-0098', detail: 'Nordby Transport AS' },
      ],
      subjectMore: 3,
      consequences: ['Customers who open them see that the link is no longer available.'],
      irreversible: true,
    })

    expect(dialog).toHaveAccessibleName('Remove 5 links?')
    const description = dialog.getAttribute('aria-describedby')
    const described = document.getElementById(description as string)
    expect(described).toHaveTextContent('Invoice 2026-0412')
    expect(described).toHaveTextContent('Maria Jensen')
    expect(described).toHaveTextContent('and 3 more')
    expect(described).toHaveTextContent('no longer available')
    expect(described).toHaveTextContent('This cannot be undone.')
  })
})

describe('confirm dialog: type to confirm', () => {
  const deleteWorkshop: ConfirmOptions = {
    title: 'Delete Organization',
    description: 'Permanently delete "Nordby Auto" and all its data?',
    confirmLabel: 'Delete',
    destructive: true,
    subject: [{ label: 'Nordby Auto', icon: Building2 }],
    requireText: 'Nordby Auto',
  }

  it('keeps the red button off until the name is typed', async () => {
    const { user, onAnswer, dialog } = await ask(deleteWorkshop)

    const field = within(dialog).getByRole('textbox', { name: 'Type Nordby Auto to confirm' })
    const del = within(dialog).getByRole('button', { name: 'Delete' })
    expect(field).toHaveFocus()
    expect(del).toBeDisabled()

    // Enter on a half-typed name does nothing.
    await user.type(field, 'Nordby A{Enter}')
    expect(del).toBeDisabled()
    expect(onAnswer).not.toHaveBeenCalled()
    expect(del).not.toHaveTextContent('↵')
  })

  it('confirms on Enter once the name matches, and says so on the button', async () => {
    const { user, onAnswer, dialog } = await ask(deleteWorkshop)

    const field = within(dialog).getByRole('textbox')
    await user.type(field, 'nordby auto')
    const del = within(dialog).getByRole('button', { name: 'Delete' })
    expect(del).toBeEnabled()
    expect(del).toHaveTextContent('↵')

    await user.keyboard('{Enter}')
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(true))
  })
})

describe('confirm dialog: phone sheet', () => {
  function drag(handle: Element, from: number, to: number) {
    const at = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', y: number) => {
      const event = createEvent[type](handle)
      Object.defineProperty(event, 'clientY', { value: y })
      fireEvent(handle, event)
    }
    at('pointerDown', from)
    at('pointerMove', to)
    at('pointerUp', to)
  }

  it('draws the sheet handle and stacks the action above Cancel for the thumb', async () => {
    const { dialog } = await ask(removeLinks)

    expect(dialog.querySelector('[data-slot="confirm-grab"]')).not.toBeNull()
    // One column on a phone, reversed, so the action is on top and Cancel is
    // the button nearest the bottom edge.
    const footer = within(dialog).getByRole('button', { name: 'Cancel' }).parentElement
    expect(footer).toHaveClass('flex-col-reverse')
    const buttons = within(dialog).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['CancelEsc', 'Remove 5 links'])
  })

  it('cancels when the sheet is dragged down and let go', async () => {
    const { onAnswer, dialog } = await ask(removeLinks)

    drag(dialog.querySelector('[data-slot="confirm-grab"]') as Element, 300, 460)
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(false))
  })

  it('stays open after a short nudge', async () => {
    const { onAnswer, dialog } = await ask(removeLinks)

    drag(dialog.querySelector('[data-slot="confirm-grab"]') as Element, 300, 320)
    expect(onAnswer).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})
