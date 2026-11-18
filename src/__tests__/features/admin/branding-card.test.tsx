/**
 * The admin card that names the install in the browser: tab title, favicon,
 * installed app. The name saves through the settings action, the icon goes
 * straight to its own upload route.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const setSystemSettings = vi.fn()
vi.mock('@/features/admin/Actions/setSystemSettings', () => ({
  setSystemSettings: (input: Record<string, string>) => setSystemSettings(input),
}))

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

const { BrandingCard } = await import('@/features/admin/Components/branding-card')

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  setSystemSettings.mockReset()
  refresh.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BrandingCard', () => {
  it('shows everything but allows nothing without a licence', () => {
    render(<BrandingCard locked initialName="" initialIconUrl={null} />)
    expect(screen.getByText('Needs a licence')).toBeInTheDocument()
    expect(screen.getByLabelText('App name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Open the License page' })).toHaveAttribute(
      'href',
      '/settings/license'
    )
  })

  it('shows no lock once licensed', () => {
    render(<BrandingCard initialName="" initialIconUrl={null} />)
    expect(screen.queryByText('Needs a licence')).not.toBeInTheDocument()
    expect(screen.getByLabelText('App name')).toBeEnabled()
  })

  it('shows the saved name and icon', () => {
    render(<BrandingCard initialName="Bilverksted" initialIconUrl="/api/public/app-icon?v=a.png" />)
    expect(screen.getByLabelText('App name')).toHaveValue('Bilverksted')
    expect(screen.getByAltText('Current app icon')).toHaveAttribute(
      'src',
      '/api/public/app-icon?v=a.png'
    )
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument()
  })

  it('keeps Save disabled until the name changes', async () => {
    const user = userEvent.setup()
    render(<BrandingCard initialName="Bilverksted" initialIconUrl={null} />)
    const save = screen.getByRole('button', { name: 'Save name' })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText('App name'), ' AS')
    expect(save).toBeEnabled()
  })

  it('saves the name through the settings action', async () => {
    setSystemSettings.mockResolvedValue({ success: true, data: { updated: 1 } })
    const user = userEvent.setup()
    render(<BrandingCard initialName="" initialIconUrl={null} />)

    await user.type(screen.getByLabelText('App name'), '  Bilverksted  ')
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('App name saved'))
    expect(setSystemSettings).toHaveBeenCalledWith({ 'branding.appName': 'Bilverksted' })
    expect(refresh).toHaveBeenCalled()
  })

  it('shows the server error when an upload is refused', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'The image must be square' }, 400))
    const user = userEvent.setup()
    render(<BrandingCard initialName="" initialIconUrl={null} />)

    const file = new File(['x'], 'icon.png', { type: 'image/png' })
    await user.upload(screen.getByTestId('branding-icon-input'), file)

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('The image must be square'))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/protected/admin/app-icon')
    expect(init.method).toBe('POST')
    expect((init.body as FormData).get('file')).toBeInstanceOf(File)
    expect(screen.queryByAltText('Current app icon')).not.toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('swaps the preview to the uploaded icon', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ fileName: 'b.png', url: '/api/public/app-icon?v=b.png' })
    )
    const user = userEvent.setup()
    render(<BrandingCard initialName="" initialIconUrl={null} />)

    await user.upload(
      screen.getByTestId('branding-icon-input'),
      new File(['x'], 'icon.png', { type: 'image/png' })
    )

    await waitFor(() =>
      expect(screen.getByAltText('Current app icon')).toHaveAttribute(
        'src',
        '/api/public/app-icon?v=b.png'
      )
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('removes the icon and clears the preview', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    const user = userEvent.setup()
    render(<BrandingCard initialName="" initialIconUrl="/api/public/app-icon?v=a.png" />)

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByAltText('Current app icon')).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/protected/admin/app-icon', { method: 'DELETE' })
    expect(toastSuccess).toHaveBeenCalledWith('App icon removed')
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument()
  })
})
