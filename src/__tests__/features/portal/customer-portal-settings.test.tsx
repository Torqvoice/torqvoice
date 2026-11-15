/**
 * The Customer Portal settings page: one form with one Save. Daylight is the
 * theme of a workshop that never chose, nothing is stored until Save is
 * pressed, a colour that is not a colour is refused in words, and the tyres
 * switch is only there for a workshop with a tyre hotel.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/portal/Actions/saveCustomerPortalSettings', () => ({
  saveCustomerPortalSettings: vi.fn(),
}))
vi.mock('@/components/upgrade-gate', () => ({ handleGated: vi.fn(() => false) }))

const { CustomerPortalSettings } = await import(
  '@/features/portal/Components/CustomerPortalSettings'
)
const { saveCustomerPortalSettings } = await import(
  '@/features/portal/Actions/saveCustomerPortalSettings'
)
const { resolvePortalTheme } = await import('@/features/portal/Lib/theme')

type Props = ComponentProps<typeof CustomerPortalSettings>

/** A workshop that turned the portal on and chose nothing else. */
const untouched: Props['initial'] = {
  enabled: true,
  slug: 'fjordside',
  description: '',
  // What the page hands over when no theme is stored.
  theme: resolvePortalTheme(undefined),
  accent: '',
  cover: '',
  messages: true,
  showTires: true,
}

function renderSettings(overrides: Partial<Props> = {}) {
  return render(
    <CustomerPortalSettings
      orgId="org-1"
      appUrl="https://app.example"
      initial={untouched}
      tireHotel={false}
      typedHours={null}
      {...overrides}
    />
  )
}

const saveButton = () => screen.getByRole('button', { name: 'Save changes' })
const theme = (name: RegExp) => screen.getByRole('radio', { name })

beforeEach(() => {
  vi.mocked(saveCustomerPortalSettings).mockReset()
  vi.mocked(saveCustomerPortalSettings).mockResolvedValue({
    success: true,
    data: { saved: true, slug: 'fjordside' },
  })
})

describe('the customer portal settings', () => {
  it('has Daylight selected for a workshop that never chose a theme', () => {
    renderSettings()
    expect(theme(/Daylight/)).toBeChecked()
    expect(theme(/Garage/)).not.toBeChecked()
    expect(theme(/Print/)).not.toBeChecked()
    expect(theme(/Colour/)).not.toBeChecked()
    expect(screen.getByText(/Using the colour that comes with Daylight, #C2410C/)).toBeVisible()
  })

  it('cannot be saved while nothing has changed, and says so', () => {
    renderSettings()
    expect(saveButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
    expect(screen.getByText('Everything is saved')).toBeVisible()
  })

  it('stores the chosen theme only when Save is pressed', async () => {
    renderSettings()
    fireEvent.click(theme(/Garage/))
    expect(theme(/Garage/)).toBeChecked()
    expect(screen.getByText('You have changes that are not saved')).toBeVisible()
    expect(saveCustomerPortalSettings).not.toHaveBeenCalled()

    fireEvent.click(saveButton())
    await waitFor(() => expect(saveCustomerPortalSettings).toHaveBeenCalledTimes(1))
    expect(saveCustomerPortalSettings).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'garage', accent: '', enabled: true, slug: 'fjordside' })
    )
    await waitFor(() => expect(screen.getByText('Everything is saved')).toBeVisible())
    expect(saveButton()).toBeDisabled()
  })

  it('refuses a colour that is not a colour, in words, and saves nothing', () => {
    renderSettings()
    fireEvent.change(screen.getByLabelText('Colour as a hex code'), {
      target: { value: '#12ZZ' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That is not a colour. Write it as a hex code, like #1D4ED8.'
    )
    fireEvent.click(saveButton())
    expect(saveCustomerPortalSettings).not.toHaveBeenCalled()
  })

  it('saves a typed colour as a full hex code and says which ink sits on it', async () => {
    renderSettings()
    fireEvent.change(screen.getByLabelText('Colour as a hex code'), { target: { value: 'fd0' } })
    expect(screen.getByText(/drawn in black/)).toBeVisible()
    fireEvent.click(saveButton())
    await waitFor(() =>
      expect(saveCustomerPortalSettings).toHaveBeenCalledWith(
        expect.objectContaining({ accent: '#FFDD00' })
      )
    )
  })

  it("goes back to the theme's colour on request", () => {
    renderSettings({ initial: { ...untouched, accent: '#1D4ED8' } })
    expect(screen.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: "Use the theme's colour" }))
    expect(screen.getByLabelText('Colour as a hex code')).toHaveValue('')
    expect(screen.getByText(/Using the colour that comes with Daylight/)).toBeVisible()
    expect(saveButton()).toBeEnabled()
  })

  it('warns when the colour is faint against the theme', () => {
    renderSettings({ initial: { ...untouched, theme: 'garage' } })
    expect(screen.queryByText(/faint against the background of Garage/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Black' }))
    expect(screen.getByText(/faint against the background of Garage/)).toBeVisible()
  })

  it('offers the tyres switch only to a workshop with a tyre hotel', () => {
    const { unmount } = renderSettings({ tireHotel: false })
    expect(screen.getByRole('switch', { name: 'Messages in the portal' })).toBeChecked()
    expect(screen.queryByRole('switch', { name: 'Show stored tyres' })).toBeNull()
    unmount()

    renderSettings({ tireHotel: true })
    expect(screen.getByRole('switch', { name: 'Show stored tyres' })).toBeChecked()
  })

  it('leaves the tyres setting alone for a workshop without a tyre hotel', async () => {
    renderSettings({ tireHotel: false })
    fireEvent.click(screen.getByRole('switch', { name: 'Messages in the portal' }))
    fireEvent.click(saveButton())
    await waitFor(() => expect(saveCustomerPortalSettings).toHaveBeenCalled())
    const sent = vi.mocked(saveCustomerPortalSettings).mock.calls[0][0] as Record<string, unknown>
    expect(sent.messages).toBe(false)
    expect(sent.showTires).toBeUndefined()
  })

  it('puts everything back on Discard', () => {
    renderSettings()
    fireEvent.click(theme(/Print/))
    fireEvent.change(screen.getByLabelText('About your workshop'), {
      target: { value: 'Family workshop since 1984' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(theme(/Daylight/)).toBeChecked()
    expect(screen.getByLabelText('About your workshop')).toHaveValue('')
    expect(saveButton()).toBeDisabled()
  })

  it('says why an address was refused and keeps the changes', async () => {
    vi.mocked(saveCustomerPortalSettings).mockResolvedValue({
      success: true,
      data: { saved: false, problem: 'slugTaken' },
    })
    renderSettings()
    fireEvent.change(screen.getByLabelText('Portal address'), { target: { value: 'taken-shop' } })
    expect(screen.getByLabelText('Link to your portal')).toHaveValue(
      'https://app.example/portal/taken-shop'
    )
    fireEvent.click(saveButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Another workshop already uses that address'
    )
    expect(saveButton()).toBeEnabled()
  })

  it('opens the saved portal address in a new tab', () => {
    renderSettings()
    const bar = screen.getByRole('region', { name: 'Save the customer portal settings' })
    const link = within(bar).getByRole('link', { name: 'Open the portal as a customer' })
    expect(link).toHaveAttribute('href', 'https://app.example/portal/fjordside')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('points at the calendar for opening hours, and shows hours typed before', () => {
    const { unmount } = renderSettings()
    expect(screen.getByRole('link', { name: 'Opening hours settings' })).toHaveAttribute(
      'href',
      '/settings/opening-hours'
    )
    expect(screen.queryByText('Shown on the sign-in page today')).toBeNull()
    unmount()

    renderSettings({ typedHours: 'Mon-Fri 8-16' })
    expect(screen.getByText('Mon-Fri 8-16')).toBeVisible()
  })
})
