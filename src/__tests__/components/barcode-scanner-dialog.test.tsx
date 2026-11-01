/**
 * The barcode scanner when the camera is not there for it.
 *
 * People who refuse the camera, or whose browser refuses it for them, fall
 * back to typing the code. That path has to work on the first press, say
 * plainly why the camera is missing, and offer the camera again once it is
 * allowed, without asking the browser a second time after a refusal.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const start = vi.fn()
const getCameras = vi.fn()

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    static getCameras = getCameras
    start = start
    stop = vi.fn().mockResolvedValue(undefined)
    clear = vi.fn()
    getState = () => 1
  },
  Html5QrcodeSupportedFormats: {
    CODE_128: 0,
    CODE_39: 1,
    EAN_13: 2,
    EAN_8: 3,
    UPC_A: 4,
    UPC_E: 5,
    ITF: 6,
    QR_CODE: 7,
  },
}))

const { BarcodeScannerDialog } = await import('@/components/barcode-scanner-dialog')

/** What html5-qrcode rejects with when the browser refuses the camera. */
const DENIED = 'Error getting userMedia, error = NotAllowedError: Permission denied'

function setSecure(secure: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true })
}

function renderDialog() {
  const onScan = vi.fn()
  const onOpenChange = vi.fn()
  render(<BarcodeScannerDialog open onOpenChange={onOpenChange} onScan={onScan} title="Scan" />)
  return { onScan, onOpenChange }
}

beforeEach(() => {
  start.mockReset()
  getCameras.mockReset()
  setSecure(true)
})

describe('BarcodeScannerDialog', () => {
  it('says the camera is blocked and offers typing at once, asking only once', async () => {
    start.mockRejectedValue(DENIED)
    renderDialog()

    expect(await screen.findByText('Camera access is blocked')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Enter barcode...' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(start).toHaveBeenCalledTimes(1)
    expect(getCameras).not.toHaveBeenCalled()
  })

  it('takes a typed code on the first press', async () => {
    start.mockRejectedValue(DENIED)
    const { onScan, onOpenChange } = renderDialog()
    const user = userEvent.setup()

    await user.type(await screen.findByRole('textbox'), ' 7031234567890 ')
    await user.click(screen.getByRole('button', { name: 'Go' }))

    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith('7031234567890')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('starts the camera again from Try again', async () => {
    start.mockRejectedValueOnce(DENIED).mockResolvedValue(null)
    renderDialog()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Camera access is blocked')).not.toBeInTheDocument()
  })

  it('falls back to any camera when the rear one fails for another reason', async () => {
    start.mockRejectedValueOnce('Error getting userMedia, error = OverconstrainedError')
    start.mockResolvedValue(null)
    getCameras.mockResolvedValue([{ id: 'usb-cam', label: 'USB camera' }])
    renderDialog()

    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2))
    expect(start.mock.calls[1][0]).toBe('usb-cam')
  })

  it('explains HTTPS without asking for the camera on an insecure page', async () => {
    setSecure(false)
    renderDialog()

    expect(await screen.findByText('The camera needs HTTPS')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(start).not.toHaveBeenCalled()
  })
})
