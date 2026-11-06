import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { CodeWaveforms, FaultCodePageData } from '@/features/fault-codes/Lib/types'
import { previewCsv } from '@/features/fault-codes/Lib/waveformCsv'
import type {
  FaultCodeOwnWaveform,
  FaultCodeWaveform,
  WaveformPreview,
} from '@/features/integrations/Lib/types'

/**
 * Waveforms on a code's page as a technician uses them: other workshops' scope recordings,
 * known good and faulty, opened full size beside a known good one with their files to
 * download, and sharing one from the bench with whatever files are at hand.
 */

const h = vi.hoisted(() => ({
  withdraw: vi.fn(),
  phoneLink: vi.fn(),
  draftPhotos: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/features/support/Lib/supportVisibility', () => ({ openSupport: vi.fn() }))
vi.mock('@/features/fault-codes/Actions/researchFaultCode', () => ({ researchFaultCode: vi.fn() }))
vi.mock('@/features/fault-codes/Actions/rateFaultCodeResearch', () => ({
  rateFaultCodeResearch: vi.fn(),
}))
vi.mock('@/features/fault-codes/Actions/withdrawFaultCodeFix', () => ({
  withdrawFaultCodeFix: vi.fn(),
}))
vi.mock('@/features/fault-codes/Actions/withdrawFaultCodeWaveform', () => ({
  withdrawFaultCodeWaveform: h.withdraw,
}))
vi.mock('@/features/fault-codes/Actions/reportFaultCodeMeaning', () => ({
  reportFaultCodeMeaning: vi.fn(),
}))
vi.mock('@/features/fault-codes/Actions/createFixPhoneLink', () => ({
  createFixPhoneLink: h.phoneLink,
}))
vi.mock('@/features/fault-codes/Actions/listFixDraftPhotos', () => ({
  listFixDraftPhotos: h.draftPhotos,
}))
vi.mock('@/features/fault-codes/Actions/removeFixDraftPhoto', () => ({
  removeFixDraftPhoto: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/features/vehicles/Components/service-edit/RichTextEditor', () => ({
  RichTextEditor: () => null,
}))

const { FaultCodeDetail } = await import('@/features/fault-codes/Components/FaultCodeDetail')

/** A browser upload that answers with `reply`, keeping what was sent. */
class FakeXhr {
  static reply: unknown = null
  static sent: { url: string; body: FormData }[] = []
  upload: {
    onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null
  } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  responseText = ''
  private url = ''
  open(_method: string, url: string) {
    this.url = url
  }
  send(body: FormData) {
    FakeXhr.sent.push({ url: this.url, body })
    setTimeout(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 1 })
      this.responseText = JSON.stringify(FakeXhr.reply)
      this.onload?.()
    }, 0)
  }
}

function exportCsv(): string {
  let csv = 'Time,Channel A,Channel B\n(ms),(V),(V)\n\n'
  for (let i = 0; i < 600; i++) {
    csv += `${(i * 0.05).toFixed(3)},${Math.floor(i / 25) % 2 === 0 ? 0.2 : 4.8},${Math.sin(i / 40).toFixed(3)}\n`
  }
  return csv
}
const PREVIEW = previewCsv(exportCsv()) as WaveformPreview
const GOLF = { id: 'v1', make: 'Volkswagen', model: 'Golf', year: 2014, engine: 'CAXA' }

function waveform(patch: Partial<FaultCodeWaveform> = {}): FaultCodeWaveform {
  return {
    id: '0190f3c2-7d1a-7000-8000-0000000000a1',
    code: 'P0420',
    meaning: null,
    kind: 'good',
    title: 'Crankshaft sensor',
    condition: 'idle',
    note: 'Back-probed pin 2 at the sensor plug.',
    lang: 'en',
    vehicle: { make: 'Skoda', model: 'Octavia', year: 2016 },
    preview: PREVIEW,
    files: [
      { role: 'csv', name: 'export.csv', size: 24_000, width: null, height: null },
      { role: 'psdata', name: 'crank idle.psdata', size: 1_200_000, width: null, height: null },
    ],
    createdAt: '2026-11-04T08:00:00Z',
    ...patch,
  }
}

function pageData(waveforms: CodeWaveforms, patch: Partial<FaultCodePageData> = {}) {
  return {
    code: 'P0420',
    connected: true,
    connectable: true,
    available: true,
    detail: {
      code: 'P0420',
      state: 'found',
      range: 'standard',
      title: 'Catalyst System Efficiency Below Threshold Bank 1',
      source: 'generic',
      make: null,
      lang: 'en',
      machineTranslated: false,
      verified: true,
      version: 2,
      flags: { warningLight: true, emissions: true, driveCycle: false, limpMode: false },
      description: null,
      sections: [],
      causes: [],
      related: [],
      pendingCheck: false,
    },
    jobs: [],
    fixes: { available: true, published: [], own: [] },
    report: null,
    vehicle: null,
    waveforms,
    ...patch,
  } as FaultCodePageData
}

const renderPage = (data: FaultCodePageData) =>
  render(
    <ConfirmProvider>
      <TooltipProvider>
        <FaultCodeDetail data={data} layout="page" />
      </TooltipProvider>
    </ConfirmProvider>
  )

function card() {
  return within(
    screen.getByRole('heading', { name: /^Waveforms/ }).closest('[data-slot="card"]') as HTMLElement
  )
}

beforeEach(() => {
  FakeXhr.reply = null
  FakeXhr.sent = []
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  vi.mocked(toast.error).mockReset()
  vi.mocked(toast.success).mockReset()
  h.withdraw.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('waveforms on a code page', () => {
  it('lists known good and faulty recordings, and filters by which', () => {
    const faulty = waveform({
      id: '0190f3c2-7d1a-7000-8000-0000000000a2',
      kind: 'faulty',
      title: 'Crankshaft sensor, missing tooth',
      condition: 'cranking',
    })
    renderPage(pageData({ available: true, published: [faulty, waveform()], own: [] }))
    const waves = card()
    // Known good first, each with how the engine ran and on what.
    const titles = waves.getAllByText(/^Crankshaft sensor/).map((el) => el.textContent)
    expect(titles).toEqual(['Crankshaft sensor', 'Crankshaft sensor, missing tooth'])
    expect(waves.getByText('Idle · 2016 Skoda Octavia')).toBeInTheDocument()
    expect(waves.getByText('Cranking · 2016 Skoda Octavia')).toBeInTheDocument()
    expect(waves.getAllByText('PicoScope file to download')).toHaveLength(2)

    fireEvent.click(waves.getByRole('button', { name: 'Faulty' }))
    expect(waves.queryByText('Crankshaft sensor')).not.toBeInTheDocument()
    expect(waves.getByText('Crankshaft sensor, missing tooth')).toBeInTheDocument()
  })

  it('opens a faulty one beside a known good, with its notes and files to download', () => {
    const good = waveform()
    const faulty = waveform({
      id: '0190f3c2-7d1a-7000-8000-0000000000a2',
      kind: 'faulty',
      title: 'Crankshaft sensor, missing tooth',
    })
    renderPage(pageData({ available: true, published: [good, faulty], own: [] }))
    fireEvent.click(card().getByRole('button', { name: /missing tooth/ }))
    const dialog = within(screen.getByRole('dialog'))
    expect(
      dialog.getByRole('heading', { name: 'Crankshaft sensor, missing tooth' })
    ).toBeInTheDocument()
    // The known good one is drawn under it to compare.
    expect(dialog.getByRole('combobox')).toHaveTextContent('Known good · Crankshaft sensor')
    expect(dialog.getAllByRole('img', { name: /Waveform of Channel A, Channel B/ })).toHaveLength(2)
    expect(dialog.getByText('Back-probed pin 2 at the sensor plug.')).toBeInTheDocument()
    const recording = dialog.getByRole('link', { name: /PicoScope recording/ })
    expect(recording).toHaveAttribute(
      'href',
      `/api/protected/fault-codes/waveforms/${faulty.id}/files/psdata`
    )
    expect(recording).toHaveAttribute('download', 'crank idle.psdata')
    // Not this workshop's: nothing to withdraw.
    expect(dialog.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument()
  })

  it('invites sharing when there is none, and says so when the service does not answer', () => {
    const { unmount } = renderPage(pageData({ available: true, published: [], own: [] }))
    expect(card().getByText('No waveforms for P0420 yet')).toBeInTheDocument()
    unmount()
    renderPage(pageData({ available: false, published: [], own: [] }))
    expect(screen.getByText('Waveforms are not available right now.')).toBeInTheDocument()
  })

  it("withdraws this workshop's own, waiting for review", async () => {
    h.withdraw.mockResolvedValueOnce({ success: true, data: { withdrawn: true } })
    const own: FaultCodeOwnWaveform = {
      ...waveform(),
      status: 'pending',
      reason: null,
      reviewedAt: null,
    }
    renderPage(pageData({ available: true, published: [], own: [own] }))
    expect(card().getByText('Waiting for review')).toBeInTheDocument()
    fireEvent.click(card().getByRole('button', { name: /Crankshaft sensor/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Withdraw' }))
    const confirm = await screen.findByRole('alertdialog')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Withdraw' }))
    await waitFor(() => expect(card().getByText('No waveforms for P0420 yet')).toBeInTheDocument())
    expect(h.withdraw).toHaveBeenCalledWith({ code: 'P0420', id: own.id })
    expect(toast.success).toHaveBeenCalledWith('Waveform withdrawn')
  })
})

describe('sharing a waveform', () => {
  async function openShare(data: FaultCodePageData) {
    renderPage(data)
    fireEvent.click(card().getByRole('button', { name: 'Share a waveform' }))
    return within(await screen.findByRole('dialog'))
  }

  it('says what is missing, sorts the files as they land, draws the CSV and sends it all', async () => {
    const shared: FaultCodeOwnWaveform = {
      ...waveform({ id: '0190f3c2-7d1a-7000-8000-0000000000b1' }),
      status: 'pending',
      reason: null,
      reviewedAt: null,
    }
    FakeXhr.reply = { success: true, data: shared }
    const dialog = await openShare(
      pageData({ available: true, published: [], own: [] }, { vehicle: GOLF })
    )
    expect(dialog.getByText('Share a waveform for P0420')).toBeInTheDocument()
    // The car comes from the job.
    expect(dialog.getByText('2014 Volkswagen Golf · CAXA')).toBeInTheDocument()
    const send = dialog.getByRole('button', { name: 'Share waveform' })
    expect(send).toBeDisabled()
    expect(dialog.getByText('Pick known good or faulty')).toBeInTheDocument()

    fireEvent.click(dialog.getByRole('button', { name: /Known good/ }))
    expect(dialog.getByText('Say what you measured')).toBeInTheDocument()
    // A tap fills in what was measured.
    fireEvent.click(dialog.getByRole('button', { name: 'Crankshaft sensor' }))
    expect(dialog.getByLabelText('What did you measure?')).toHaveValue('Crankshaft sensor')
    expect(dialog.getByText('Add a file or a picture')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Idle' }))

    const recording = new File(['pico'], 'crank idle.psdata')
    const csv = new File([exportCsv()], 'export.csv', { type: 'text/csv' })
    fireEvent.change(dialog.getByTestId('waveform-file-input'), {
      target: { files: [recording, csv] },
    })
    // Each file is named for what it is, and the CSV is drawn as others will see it.
    await waitFor(() =>
      expect(dialog.getByText('This is how other workshops will see it.')).toBeInTheDocument()
    )
    expect(dialog.getByText('PicoScope recording')).toBeInTheDocument()
    expect(dialog.getByText('CSV export')).toBeInTheDocument()
    expect(dialog.getByRole('img', { name: /Waveform of Channel A, Channel B/ })).toBeVisible()
    expect(send).toBeEnabled()

    fireEvent.click(send)
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Thanks. Your waveform is waiting for review.')
    const [{ url, body }] = FakeXhr.sent
    expect(url).toBe('/api/protected/fault-codes/waveforms')
    expect(body.get('code')).toBe('P0420')
    expect(body.get('kind')).toBe('good')
    expect(body.get('title')).toBe('Crankshaft sensor')
    expect(body.get('condition')).toBe('idle')
    expect(body.get('vehicleId')).toBe('v1')
    expect((body.get('psdata') as File).name).toBe('crank idle.psdata')
    expect((body.get('csv') as File).name).toBe('export.csv')
    expect(body.get('image')).toBeNull()
    // The dialog closes and the waveform waits for review on the page.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(card().getByText('Waiting for review')).toBeInTheDocument()
  })

  it('turns away a CSV that is not a scope export and a file that is none of the kinds', async () => {
    const dialog = await openShare(pageData({ available: true, published: [], own: [] }))
    fireEvent.click(dialog.getByRole('button', { name: /Faulty/ }))
    fireEvent.change(dialog.getByLabelText('What did you measure?'), {
      target: { value: 'Injector 3' },
    })
    fireEvent.change(dialog.getByTestId('waveform-file-input'), {
      target: {
        files: [
          new File(['name,price\nbolt,2\n'], 'parts.csv', { type: 'text/csv' }),
          new File(['x'], 'notes.docx'),
        ],
      },
    })
    await waitFor(() =>
      expect(
        dialog.getByText('This is not a scope export. Save it again from PicoScope as CSV.')
      ).toBeInTheDocument()
    )
    expect(toast.error).toHaveBeenCalledWith(
      'notes.docx is not a PicoScope file, a CSV export or a picture'
    )
    expect(dialog.getByText('Remove the CSV that is not a scope export')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Share waveform' })).toBeDisabled()
    fireEvent.click(dialog.getByRole('button', { name: 'Remove parts.csv' }))
    expect(dialog.getByText('Add a file or a picture')).toBeInTheDocument()
  })

  it('keeps what was filled in when sharing is paused', async () => {
    FakeXhr.reply = { success: false, error: 'paused' }
    const dialog = await openShare(pageData({ available: true, published: [], own: [] }))
    fireEvent.click(dialog.getByRole('button', { name: /Known good/ }))
    fireEvent.click(dialog.getByRole('button', { name: 'Lambda sensor' }))
    fireEvent.change(dialog.getByTestId('waveform-file-input'), {
      target: { files: [new File(['pico'], 'lambda.psdata')] },
    })
    await waitFor(() => expect(dialog.getByText('PicoScope recording')).toBeInTheDocument())
    // Without a CSV, a tip says how others could see it without PicoScope.
    expect(dialog.getByText(/add a CSV export too/)).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: 'Share waveform' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Sharing waveforms is paused right now. Try again later.'
      )
    )
    expect(dialog.getByLabelText('What did you measure?')).toHaveValue('Lambda sensor')
    expect(dialog.getByText('PicoScope recording')).toBeInTheDocument()
  })
})
