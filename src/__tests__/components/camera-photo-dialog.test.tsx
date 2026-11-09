/**
 * Taking a photo with the desk computer's own camera.
 *
 * A desk browser ignores `capture` on a file input and shows the file picker,
 * so the page takes the photo itself: the camera starts, the photo is looked
 * at, and the one kept is handed over as a JPEG like an uploaded file. When the
 * camera cannot be used, the person is told why and can still upload a file.
 * A desk with a webcam plugged in keeps using that webcam.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CameraPhotoDialog } from '@/components/camera-photo-dialog'

type FakeTrack = { stop: ReturnType<typeof vi.fn>; getSettings: () => { deviceId: string } }

function fakeStream(deviceId: string) {
  const track: FakeTrack = { stop: vi.fn(), getSettings: () => ({ deviceId }) }
  return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } }
}

const getUserMedia = vi.fn()
const enumerateDevices = vi.fn()

function setSecure(secure: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true })
}

function renderDialog() {
  const onCaptured = vi.fn()
  const onOpenChange = vi.fn()
  const onUploadInstead = vi.fn()
  render(
    <CameraPhotoDialog
      open
      onOpenChange={onOpenChange}
      onCaptured={onCaptured}
      onUploadInstead={onUploadInstead}
    />
  )
  return { onCaptured, onOpenChange, onUploadInstead }
}

/** The live picture arriving: the browser now knows the camera's size. */
async function pictureArrives() {
  const video = await screen.findByLabelText('Camera preview')
  Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true })
  Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true })
  fireEvent.loadedMetadata(video)
}

beforeEach(() => {
  setSecure(true)
  getUserMedia.mockReset()
  enumerateDevices
    .mockReset()
    .mockResolvedValue([{ kind: 'videoinput', deviceId: 'laptop', label: 'FaceTime HD Camera' }])
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia, enumerateDevices },
    configurable: true,
  })
  window.localStorage.clear()
  URL.createObjectURL = vi.fn(() => 'blob:photo')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string
  ) {
    callback(new Blob(['jpeg'], { type }))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CameraPhotoDialog', () => {
  it('takes a photo, shows it, and hands it over as a JPEG when it is used', async () => {
    const { track, stream } = fakeStream('laptop')
    getUserMedia.mockResolvedValue(stream)
    const { onCaptured, onOpenChange } = renderDialog()

    const take = screen.getByRole('button', { name: 'Take photo' })
    expect(take).toBeDisabled()
    await pictureArrives()
    await waitFor(() => expect(take).toBeEnabled())

    await userEvent.click(take)
    expect(await screen.findByAltText('The photo you just took')).toBeInTheDocument()
    // The camera is off while the photo is looked at.
    expect(track.stop).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Use this photo' }))
    expect(onCaptured).toHaveBeenCalledTimes(1)
    const file = onCaptured.mock.calls[0][0] as File
    expect(file.type).toBe('image/jpeg')
    expect(file.name).toMatch(/^photo-\d+\.jpg$/)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('starts the camera again for another try, and keeps nothing from the first', async () => {
    getUserMedia.mockImplementation(async () => fakeStream('laptop').stream)
    const { onCaptured } = renderDialog()
    await pictureArrives()
    await userEvent.click(await screen.findByRole('button', { name: 'Take photo' }))

    await userEvent.click(await screen.findByRole('button', { name: 'Take again' }))
    expect(screen.queryByAltText('The photo you just took')).not.toBeInTheDocument()
    expect(await screen.findByLabelText('Camera preview')).toBeInTheDocument()
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
    expect(onCaptured).not.toHaveBeenCalled()
  })

  it('says the camera is blocked and still lets a file be uploaded', async () => {
    getUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
    const { onUploadInstead, onOpenChange } = renderDialog()

    expect(await screen.findByRole('alert')).toHaveTextContent('Camera access is blocked')
    expect(screen.queryByRole('button', { name: 'Take photo' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Upload a file instead' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onUploadInstead).toHaveBeenCalledTimes(1)
  })

  it('tries the camera again once it is allowed', async () => {
    getUserMedia
      .mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
      .mockResolvedValue(fakeStream('laptop').stream)
    renderDialog()

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await pictureArrives()
    expect(await screen.findByRole('button', { name: 'Take photo' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says when no camera is connected', async () => {
    getUserMedia.mockRejectedValue(new DOMException('Requested device not found', 'NotFoundError'))
    renderDialog()
    expect(await screen.findByRole('alert')).toHaveTextContent('No camera found')
  })

  it('explains that the camera needs HTTPS without asking the browser for it', async () => {
    setSecure(false)
    renderDialog()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The camera needs HTTPS')
    expect(alert).toHaveTextContent(`HTTP (${window.location.hostname})`)
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload a file instead' })).toBeInTheDocument()
  })

  it('uses the webcam picked last time', async () => {
    window.localStorage.setItem('torqvoice.photo-camera', 'usb-webcam')
    getUserMedia.mockResolvedValue(fakeStream('usb-webcam').stream)
    renderDialog()

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    expect(getUserMedia.mock.calls[0][0].video.deviceId).toEqual({ exact: 'usb-webcam' })
  })

  it('falls back to the default camera when the webcam picked last time is unplugged', async () => {
    window.localStorage.setItem('torqvoice.photo-camera', 'usb-webcam')
    getUserMedia.mockImplementation(async (constraints: MediaStreamConstraints) => {
      const video = constraints.video as MediaTrackConstraints
      if (video.deviceId) throw new DOMException('gone', 'OverconstrainedError')
      return fakeStream('laptop').stream
    })
    renderDialog()

    await pictureArrives()
    expect(await screen.findByRole('button', { name: 'Take photo' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('torqvoice.photo-camera')).toBeNull()
  })

  it('offers a choice of camera when a webcam is plugged in beside the built-in one', async () => {
    getUserMedia.mockResolvedValue(fakeStream('laptop').stream)
    enumerateDevices.mockResolvedValue([
      { kind: 'videoinput', deviceId: 'laptop', label: 'FaceTime HD Camera' },
      { kind: 'videoinput', deviceId: 'usb-webcam', label: 'Logitech C920' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Microphone' },
    ])
    renderDialog()

    const picker = await screen.findByRole('combobox', { name: 'Camera' })
    expect(picker).toHaveTextContent('FaceTime HD Camera')
  })
})
