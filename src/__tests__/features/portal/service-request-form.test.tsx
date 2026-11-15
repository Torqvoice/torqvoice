/**
 * The portal's "book a visit" form, as a customer fills it in.
 *
 * Problems are said at the field they are about, not in a toast that is gone
 * before it is read; the first day that can be picked is the workshop's today;
 * a year that is not a year is refused here instead of quietly becoming this
 * year on the server. Photos and video upload as they are added, each with
 * its own progress, and go with the request; one taken out again, or left in
 * a form the customer walks away from, is handed back to the server. After
 * sending, the form gives way to what happens next.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/features/portal/Actions/portalActions', () => ({ createServiceRequest: vi.fn() }))
vi.mock('@/features/portal/Lib/portalUploadClient', () => {
  class PortalUploadError extends Error {
    constructor(public readonly code: string) {
      super(code)
    }
  }
  return { PortalUploadError, uploadPortalFile: vi.fn(), releasePortalUploads: vi.fn() }
})

import { createServiceRequest } from '@/features/portal/Actions/portalActions'
import { openDayParts, ServiceRequestForm } from '@/features/portal/Components/ServiceRequestForm'
import {
  PortalUploadError,
  releasePortalUploads,
  uploadPortalFile,
} from '@/features/portal/Lib/portalUploadClient'

// Late on 31 December in UTC is already New Year's Day in Auckland: the
// browser's UTC day would still offer the 31st.
const TODAY = '2027-01-01'

const stored = (name: string) => `/api/protected/files/org-1/portal-uploads/${name}`
const KUGA = { id: 'v1', make: 'Ford', model: 'Kuga', year: 2019, licensePlate: 'EL 12345' }
const V60 = { id: 'v2', make: 'Volvo', model: 'V60', year: 2021, licensePlate: 'EK 54321' }

/** Each upload the form starts, held open until the test settles it. */
let pending: {
  file: File
  progress: (fraction: number) => void
  arrive: (name: string) => void
  fail: (code: string) => void
}[]

beforeEach(() => {
  pending = []
  vi.mocked(createServiceRequest).mockReset()
  vi.mocked(releasePortalUploads).mockReset()
  vi.mocked(uploadPortalFile)
    .mockReset()
    .mockImplementation(
      (_org, file, options) =>
        new Promise((resolve, reject) => {
          pending.push({
            file,
            progress: (fraction) => options?.onProgress?.(fraction),
            arrive: (name) =>
              resolve({ url: stored(name), name: file.name, type: file.type, size: file.size }),
            fail: (code) => reject(new PortalUploadError(code)),
          })
        })
    )
  let serial = 0
  URL.createObjectURL = vi.fn(() => `blob:preview-${++serial}`)
  URL.revokeObjectURL = vi.fn()
})

const form = (props: Partial<Parameters<typeof ServiceRequestForm>[0]> = {}) =>
  render(
    <ServiceRequestForm
      orgId="shop"
      workshopName="Fjordside Auto"
      vehicles={[]}
      today={TODAY}
      {...props}
    />
  )

const words = () => screen.getByLabelText(/Describe it in your own words/)
const describeIssue = (text: string) => fireEvent.change(words(), { target: { value: text } })
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send to Fjordside Auto' }))
const dayField = () => screen.getByLabelText(/Day that suits you/)
const photo = (name = 'warning-light.jpg') =>
  new File([new Uint8Array(2048)], name, { type: 'image/jpeg' })
const video = (name = 'noise.mp4') => new File([new Uint8Array(4096)], name, { type: 'video/mp4' })
const add = (...files: File[]) =>
  fireEvent.change(screen.getByTestId('portal-file-picker'), { target: { files } })
const fillNewCar = () => {
  fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Ford' } })
  fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Kuga' } })
}

describe('choosing the car', () => {
  it('offers each car with its plate, and another car', () => {
    form({ vehicles: [KUGA, { ...V60, inWorkshop: true }] })
    expect(screen.getByRole('radio', { name: /Ford Kuga.*EL 12345/ })).not.toBeChecked()
    expect(
      screen.getByRole('radio', { name: /Volvo V60.*EK 54321 · in the workshop now/ })
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Another car' })).not.toBeChecked()
    expect(screen.queryByLabelText('Make')).not.toBeInTheDocument()
  })

  it('starts on the car the customer came from, and on the only car there is', () => {
    const { unmount } = form({ vehicles: [KUGA, V60], initialVehicleId: 'v2' })
    expect(screen.getByRole('radio', { name: /Volvo V60/ })).toBeChecked()
    unmount()
    form({ vehicles: [KUGA] })
    expect(screen.getByRole('radio', { name: /Ford Kuga/ })).toBeChecked()
  })

  it('asks which car when the customer has several and picked none', () => {
    form({ vehicles: [KUGA, V60] })
    describeIssue('Brakes squeal')
    send()
    expect(screen.getByText('Choose which one this is about')).toBeInTheDocument()
    expect(createServiceRequest).not.toHaveBeenCalled()
  })

  it('asks about the car itself for another car, and says a boat for a boat yard', () => {
    form({ vehicles: [KUGA], marine: true })
    fireEvent.click(screen.getByRole('radio', { name: 'Another boat' }))
    expect(screen.getByLabelText('Make')).toBeInTheDocument()
    expect(screen.getByLabelText(/Registration/)).toBeInTheDocument()
    // A boat yard is not asked about tyres or brakes.
    expect(screen.queryByRole('button', { name: 'Tyre change' })).not.toBeInTheDocument()
  })
})

describe('what is needed', () => {
  it('says what is missing at each field and sends nothing', () => {
    form()
    send()

    expect(screen.getByText('Enter the make')).toBeInTheDocument()
    expect(screen.getByText('Enter the model')).toBeInTheDocument()
    expect(
      screen.getByText('Pick what you need above, or tell us in a few words')
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Make')).toHaveAttribute('aria-invalid', 'true')
    expect(createServiceRequest).not.toHaveBeenCalled()
  })

  it('takes a quick choice as enough, and sends it ahead of the customer words', async () => {
    vi.mocked(createServiceRequest).mockResolvedValue({ success: true, data: {} as never })
    form({ vehicles: [KUGA] })

    const brakes = screen.getByRole('button', { name: 'Brakes' })
    fireEvent.click(brakes)
    expect(brakes).toHaveAttribute('aria-pressed', 'true')
    send()
    await screen.findByText('Sent to Fjordside Auto')
    expect(createServiceRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ vehicleId: 'v1', description: 'Brakes' })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ask for something else' }))
    fireEvent.click(screen.getByRole('button', { name: 'Something is wrong' }))
    describeIssue('A knocking noise from the front left')
    send()
    await waitFor(() =>
      expect(createServiceRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          description: 'Something is wrong\n\nA knocking noise from the front left',
        })
      )
    )
  })

  it('refuses a year that is not a year rather than sending this year', () => {
    form()
    fillNewCar()
    fireEvent.change(screen.getByLabelText(/Year/), { target: { value: '1850' } })
    describeIssue('Brakes squeal')

    send()

    expect(screen.getByText('Enter a year between 1900 and 2028')).toBeInTheDocument()
    expect(createServiceRequest).not.toHaveBeenCalled()
  })
})

describe('the day', () => {
  it('starts the date picker at the workshop today', () => {
    form()
    expect(dayField()).toHaveAttribute('min', TODAY)
  })

  it('refuses a closed day at the date, naming it', () => {
    form({ closedDays: [{ date: '2027-01-26', name: 'Australia Day' }], closedWeekdays: [0] })
    fillNewCar()
    describeIssue('Brakes squeal')
    fireEvent.change(dayField(), { target: { value: '2027-01-26' } })

    send()
    expect(screen.getByText(/closed on that day \(Australia Day\)/)).toBeInTheDocument()

    // A Sunday, when the workshop never opens.
    fireEvent.change(dayField(), { target: { value: '2027-01-24' } })
    send()
    expect(
      screen.getByText('The workshop is closed on that day. Please pick another day.')
    ).toBeInTheDocument()
    expect(createServiceRequest).not.toHaveBeenCalled()
  })

  it('offers the parts of the day the workshop is open, once a day is picked', async () => {
    vi.mocked(createServiceRequest).mockResolvedValue({ success: true, data: {} as never })
    const open = { open: true, start: '07:30', end: '17:00' }
    // Saturday closes at noon; Sunday is shut.
    const week = [
      { open: false, start: '08:00', end: '17:00' },
      open,
      open,
      open,
      open,
      open,
      { open: true, start: '09:00', end: '12:00' },
    ]
    form({ vehicles: [KUGA], week })
    const morning = screen.getByRole('button', { name: 'Morning' })
    const afternoon = screen.getByRole('button', { name: 'Afternoon' })
    expect(morning).toBeDisabled()
    expect(screen.getByText('Pick a day first to say which part of it suits.')).toBeInTheDocument()

    // Saturday 2 January 2027.
    fireEvent.change(dayField(), { target: { value: '2027-01-02' } })
    expect(morning).toBeEnabled()
    expect(afternoon).toBeDisabled()

    // Monday the 4th: both, and the afternoon goes with the request.
    fireEvent.change(dayField(), { target: { value: '2027-01-04' } })
    fireEvent.click(afternoon)
    expect(afternoon).toHaveAttribute('aria-pressed', 'true')
    describeIssue('Service')
    send()
    await screen.findByText('Sent to Fjordside Auto')
    expect(createServiceRequest).toHaveBeenCalledWith(
      expect.objectContaining({ preferredDate: '2027-01-04', preferredTime: 'afternoon' })
    )
  })

  it('reads a day part from the opening hours', () => {
    expect(openDayParts({ open: true, start: '07:30', end: '17:00' })).toEqual([
      'morning',
      'afternoon',
    ])
    expect(openDayParts({ open: true, start: '13:00', end: '20:00' })).toEqual(['afternoon'])
    expect(openDayParts(undefined)).toEqual(['morning', 'afternoon'])
  })
})

describe('photos and video', () => {
  it('says how many can be added and how large, and opens the camera on a phone', () => {
    form()
    expect(
      screen.getByText('0 of 6 added · photos up to 15 MB, video up to 100 MB')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add photos or video/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeInTheDocument()
    expect(screen.getByTestId('portal-camera')).toHaveAttribute('capture', 'environment')
    expect(screen.getByTestId('portal-file-picker')).toHaveAttribute(
      'accept',
      expect.stringContaining('video/mp4')
    )
  })

  it('shows each file with its own progress while it uploads, then as added', async () => {
    form()
    add(photo(), video())

    expect(uploadPortalFile).toHaveBeenCalledTimes(2)
    expect(vi.mocked(uploadPortalFile).mock.calls[0][0]).toBe('shop')
    expect(screen.getByText(/2 of 6 added/)).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: 'Uploading noise.mp4' })
    act(() => pending[1].progress(0.7))
    expect(bar).toHaveAttribute('aria-valuenow', '70')

    await act(async () => pending[0].arrive('a.jpg'))
    expect(
      screen.queryByRole('progressbar', { name: 'Uploading warning-light.jpg' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('warning-light.jpg, added')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Uploading noise.mp4' })).toBeInTheDocument()
  })

  it('refuses a file that is not a photo or a video, and a seventh file, before uploading', () => {
    form()
    add(new File(['%PDF'], 'old-invoice.pdf', { type: 'application/pdf' }))
    expect(
      screen.getByText('old-invoice.pdf is not a photo or a video we can take.')
    ).toBeInTheDocument()
    expect(uploadPortalFile).not.toHaveBeenCalled()

    add(...Array.from({ length: 7 }, (_, i) => photo(`p${i}.jpg`)))
    expect(uploadPortalFile).toHaveBeenCalledTimes(6)
    expect(
      screen.getByText('You can add up to 6 files. Take one out to add another.')
    ).toBeInTheDocument()
    // Full: nothing more can be added.
    expect(screen.queryByRole('button', { name: /Add photos or video/ })).not.toBeInTheDocument()
  })

  it('says why an upload failed on the file itself, and lets it be tried again', async () => {
    form()
    add(photo())
    await act(async () => pending[0].fail('tooLarge'))

    expect(screen.getByText('warning-light.jpg is too large.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(uploadPortalFile).toHaveBeenCalledTimes(2)
    await act(async () => pending[1].arrive('a.jpg'))
    expect(screen.getByText('warning-light.jpg, added')).toBeInTheDocument()
  })

  it('hands a file back to the server when the customer takes it out again', async () => {
    form()
    add(photo())
    await act(async () => pending[0].arrive('a.jpg'))

    fireEvent.click(screen.getByRole('button', { name: 'Remove warning-light.jpg' }))

    expect(releasePortalUploads).toHaveBeenCalledWith('shop', [stored('a.jpg')])
    expect(screen.getByText(/0 of 6 added/)).toBeInTheDocument()
  })

  it('does not send while a file is still on its way', () => {
    form({ vehicles: [KUGA] })
    describeIssue('Brakes squeal')
    add(video())
    send()
    expect(
      screen.getByText('Wait until your files have finished uploading, then send.')
    ).toBeInTheDocument()
    expect(createServiceRequest).not.toHaveBeenCalled()
  })

  it('sends the request with its files, and keeps them', async () => {
    vi.mocked(createServiceRequest).mockResolvedValue({ success: true, data: {} as never })
    const { unmount } = form({ vehicles: [KUGA] })
    describeIssue('A warning light came on yesterday')
    add(photo(), video())
    await act(async () => {
      pending[0].arrive('a.jpg')
      pending[1].arrive('b.mp4')
    })

    send()

    await screen.findByText('Sent to Fjordside Auto')
    expect(createServiceRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId: 'v1',
        description: 'A warning light came on yesterday',
        attachments: [stored('a.jpg'), stored('b.mp4')],
      })
    )
    // They belong to the request now: leaving the page hands nothing back.
    unmount()
    for (const [, urls] of vi.mocked(releasePortalUploads).mock.calls) expect(urls).toEqual([])
  })

  it('hands back what was uploaded when the customer leaves without sending', async () => {
    const { unmount } = form({ vehicles: [KUGA] })
    add(photo(), video())
    await act(async () => pending[0].arrive('a.jpg'))

    // Closing the tab or going elsewhere, with one file up and one on its way.
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(releasePortalUploads).toHaveBeenCalledWith('shop', [stored('a.jpg')], {
      leaving: true,
    })

    vi.mocked(releasePortalUploads).mockClear()
    unmount()
    expect(releasePortalUploads).toHaveBeenCalledWith('shop', [stored('a.jpg')], {
      leaving: true,
    })
  })
})

describe('after sending', () => {
  it('says what happens next and where to go, in place of the form', async () => {
    vi.mocked(createServiceRequest).mockResolvedValue({ success: true, data: {} as never })
    form()
    fillNewCar()
    fireEvent.change(screen.getByLabelText(/Year/), { target: { value: '2019' } })
    describeIssue('Brakes squeal')

    send()

    const sent = (await screen.findByText('Sent to Fjordside Auto')).closest('section')
    expect(sent).not.toBeNull()
    expect(screen.queryByLabelText(/Describe it in your own words/)).not.toBeInTheDocument()
    expect(createServiceRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Brakes squeal',
        newVehicle: expect.objectContaining({ make: 'Ford', model: 'Kuga', year: 2019 }),
      })
    )
    const links = within(sent as HTMLElement)
    expect(links.getByRole('link', { name: 'Go to Messages' })).toHaveAttribute(
      'href',
      '/portal/shop/messages'
    )
    expect(links.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      '/portal/shop/dashboard'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ask for something else' }))
    expect(words()).toHaveValue('')
  })

  it('does not point at Messages when the workshop turned the chat off', async () => {
    vi.mocked(createServiceRequest).mockResolvedValue({ success: true, data: {} as never })
    form({ vehicles: [KUGA], messagesEnabled: false })
    describeIssue('Brakes squeal')
    send()
    await screen.findByText('Sent to Fjordside Auto')
    expect(screen.queryByRole('link', { name: 'Go to Messages' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument()
  })

  it('says plainly when sending failed, without the server words', async () => {
    vi.mocked(createServiceRequest).mockResolvedValue({
      success: false,
      error: 'Organization has no members',
    })
    form()
    fillNewCar()
    describeIssue('Brakes squeal')

    send()

    expect(
      await screen.findByText('We could not send that just now. Try again in a moment.')
    ).toBeInTheDocument()
    expect(screen.queryByText('Organization has no members')).not.toBeInTheDocument()
  })
})

describe('in a dark theme', () => {
  it('takes every colour from the portal theme, none from the app', () => {
    const { container } = form({
      vehicles: [KUGA],
      closedDays: [{ date: '2027-01-26', name: 'Australia Day' }],
    })
    add(photo())
    expect(container.innerHTML).not.toMatch(
      /\b(?:text|bg|border)-(?:muted-foreground|foreground|primary|destructive|card|muted|background|border|accent|secondary)\b/
    )
  })
})
