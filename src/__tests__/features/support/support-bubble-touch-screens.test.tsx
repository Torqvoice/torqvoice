import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SupportBubble } from '@/features/support/Components/SupportBubble'
import { SupportSettingsControls } from '@/features/support/Components/SupportSettingsControls'
import {
  SUPPORT_OPEN_EVENT,
  openSupport,
  setSupportBubbleHidden,
} from '@/features/support/Lib/supportVisibility'

// On a phone or tablet the floating support button sat on top of the buttons
// being tapped. It is not drawn there, and neither is the edge tab a dismissed
// button collapses to. Support stays reachable from Settings, which opens the
// form through openSupport().

function onDevice(kind: 'touch' | 'desktop') {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: kind === 'touch' && query.includes('pointer: coarse'),
      // The sidebar's own phone check still uses the older listener pair.
      addListener: vi.fn(),
      removeListener: vi.fn(),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  )
}

async function contactSupportFromSettings() {
  await act(async () => {
    openSupport()
    await new Promise((resolve) => requestAnimationFrame(resolve))
  })
}

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('The support button on a phone or tablet', () => {
  it('is not on screen', () => {
    onDevice('touch')
    render(<SupportBubble userId="anna" />)

    expect(screen.queryByRole('button', { name: 'Contact support' })).not.toBeInTheDocument()
  })

  it('leaves no edge tab behind for someone who dismissed it on a computer', () => {
    onDevice('touch')
    setSupportBubbleHidden(true)
    const { container } = render(<SupportBubble userId="anna" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('still opens the form when Settings asks for it, and is gone again once closed', async () => {
    onDevice('touch')
    render(<SupportBubble userId="anna" />)

    await contactSupportFromSettings()
    expect(screen.getByLabelText('Subject')).toBeInTheDocument()

    act(() => screen.getByRole('button', { name: 'Close' }).click())
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Contact support' })).not.toBeInTheDocument()
  })

  it('is still there on a computer', () => {
    onDevice('desktop')
    render(<SupportBubble userId="anna" />)

    expect(screen.getByRole('button', { name: 'Contact support' })).toBeInTheDocument()
  })

  it('opens the form for someone who dismissed the button on a computer', async () => {
    onDevice('touch')
    setSupportBubbleHidden(true)
    render(<SupportBubble userId="anna" />)

    await contactSupportFromSettings()

    expect(screen.getByLabelText('Subject')).toBeInTheDocument()
  })

  it('opens the form from the backup page, which asks for it without a subject', async () => {
    onDevice('touch')
    render(<SupportBubble userId="anna" />)

    await act(async () => {
      window.dispatchEvent(new Event(SUPPORT_OPEN_EVENT))
    })

    expect(screen.getByLabelText('Subject')).toBeInTheDocument()
  })

  it('opens the form with the subject a page hands over', async () => {
    onDevice('touch')
    render(<SupportBubble userId="anna" />)

    await act(async () => {
      openSupport({ subject: 'Fault code P0420' })
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })

    expect(screen.getByLabelText('Subject')).toHaveValue('Fault code P0420')
  })

  it('does not offer to hide a button that is not there', async () => {
    onDevice('touch')
    render(<SupportBubble userId="anna" />)

    await contactSupportFromSettings()

    expect(
      screen.queryByRole('button', { name: 'Hide the support button' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send request' })).toBeInTheDocument()
  })

  it('still offers to hide the button on a computer', async () => {
    onDevice('desktop')
    render(<SupportBubble userId="anna" />)

    act(() => screen.getByRole('button', { name: 'Contact support' }).click())

    expect(screen.getByRole('button', { name: 'Hide the support button' })).toBeInTheDocument()
  })
})

describe('Settings > Support on a phone or tablet', () => {
  it('has no switch for the button, and Open form opens the form', async () => {
    onDevice('touch')
    render(
      <>
        <SupportSettingsControls />
        <SupportBubble userId="anna" />
      </>
    )

    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText('Show the support button')).not.toBeInTheDocument()

    await act(async () => {
      screen.getByRole('button', { name: 'Open form' }).click()
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(screen.getByLabelText('Subject')).toBeInTheDocument()
  })

  it('keeps the switch on a computer', () => {
    onDevice('desktop')
    render(<SupportSettingsControls />)

    expect(screen.getByRole('switch', { name: 'Show the support button' })).toBeInTheDocument()
  })
})
