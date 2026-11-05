import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FaultCodeView } from '@/features/fault-codes/Lib/types'

/**
 * The fault code screens as a technician reads them: codes typed into the
 * work order turn into chips with their meaning, a service that is down
 * says so without stopping anything, the code sheet's text comes in its
 * labelled parts when the service cuts it so, and a finding with a code
 * says when it was seen before and when its meaning has changed.
 */

const h = vi.hoisted(() => ({
  lookup: vi.fn(),
  add: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: h.refresh }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/features/fault-codes/Actions/lookupFaultCodes', () => ({ lookupFaultCodes: h.lookup }))
vi.mock('@/features/fault-codes/Actions/addFaultCodeFindings', () => ({
  addFaultCodeFindings: h.add,
}))
vi.mock('@/features/fault-codes/Actions/checkFindingMeanings', () => ({
  checkFindingMeanings: vi.fn(async () => ({
    success: true,
    data: { available: true, findings: [] },
  })),
}))
vi.mock('@/features/fault-codes/Actions/takeFindingMeaning', () => ({
  takeFindingMeaning: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/features/fault-codes/Actions/getFaultCodeDetail', () => ({
  getFaultCodeDetail: vi.fn(async () => ({ success: false })),
}))

const { DescriptionSections } = await import(
  '@/features/fault-codes/Components/DescriptionSections'
)
const { MeaningText } = await import('@/features/fault-codes/Components/FaultCodeChip')
const { FaultCodeEntryDialog } = await import(
  '@/features/fault-codes/Components/FaultCodeEntryDialog'
)
const { FaultCodeFindingLine, FaultCodesJobProvider } = await import(
  '@/features/fault-codes/Components/FaultCodesOnJob'
)

function view(code: string, patch: Partial<FaultCodeView> = {}): FaultCodeView {
  return {
    code,
    state: 'found',
    range: 'standard',
    title: null,
    source: 'generic',
    make: null,
    lang: 'en',
    machineTranslated: false,
    verified: true,
    version: 1,
    flags: null,
    ...patch,
  }
}

beforeEach(() => {
  h.lookup.mockReset()
  h.add.mockReset()
  h.refresh.mockReset()
})

describe('typing codes into a work order', () => {
  function open() {
    return render(
      <FaultCodeEntryDialog
        open
        onOpenChange={vi.fn()}
        serviceRecordId="job1"
        vehicleId="veh1"
        concerns={[]}
      />
    )
  }

  it('turns pasted text into code chips with their meaning, and adds them to the job', async () => {
    h.lookup.mockResolvedValueOnce({
      success: true,
      data: {
        available: true,
        results: [
          view('P0420', { title: 'Catalyst efficiency below threshold (bank 1)' }),
          view('P0171', { title: 'System too lean (bank 1)' }),
        ],
      },
    })
    h.add.mockResolvedValueOnce({ success: true, data: { added: 2, skipped: 0, findings: [] } })
    open()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'p0420, P0171 stored' } })
    expect(screen.getByText('P0420')).toBeInTheDocument()
    expect(screen.getByText('P0171')).toBeInTheDocument()
    expect(screen.getByText('Stored')).toBeInTheDocument()

    expect(
      await screen.findByText('Catalyst efficiency below threshold (bank 1)')
    ).toBeInTheDocument()
    expect(screen.getByText('System too lean (bank 1)')).toBeInTheDocument()
    expect(h.lookup).toHaveBeenCalledWith({
      codes: ['P0420', 'P0171'],
      vehicleId: 'veh1',
      language: 'document',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add 2 codes' }))
    await waitFor(() =>
      expect(h.add).toHaveBeenCalledWith({
        serviceRecordId: 'job1',
        codes: [
          { code: 'P0420', status: null },
          { code: 'P0171', status: 'stored' },
        ],
        concernId: null,
      })
    )
    await waitFor(() => expect(h.refresh).toHaveBeenCalled())
  })

  it('says a meaning is not available while the service is down, and still lets the codes be added', async () => {
    h.lookup.mockResolvedValueOnce({
      success: true,
      data: { available: false, results: [view('P0420', { state: 'unavailable', title: null })] },
    })
    open()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'P0420' } })
    expect(await screen.findByText('Not available right now')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add 1 code' })).toBeEnabled()
  })

  it('lets a code be taken out before adding', async () => {
    h.lookup.mockResolvedValue({ success: true, data: { available: true, results: [] } })
    open()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'P0420 P0171' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove P0420' }))
    expect(screen.queryByText('P0420')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add 1 code' })).toBeInTheDocument()
  })
})

describe('a code the service has no meaning for', () => {
  it('says a manufacturer code depends on the make', () => {
    render(<MeaningText view={view('P1570', { state: 'unknown', range: 'manufacturer' })} />)
    expect(
      screen.getByText('Manufacturer-specific code: the meaning depends on the make.')
    ).toBeInTheDocument()
  })

  it('says a standard code is not in the list yet', () => {
    render(<MeaningText view={view('P0420', { state: 'unknown', range: 'standard' })} />)
    expect(screen.getByText('Not in our code list yet')).toBeInTheDocument()
  })
})

describe('what it means, on the code sheet', () => {
  it('shows each section under its own heading when the service sends sections', () => {
    render(
      <DescriptionSections
        description="The catalyst stores oxygen. The code sets when it no longer does."
        sections={[
          { kind: 'how_it_works', text: 'The catalyst stores oxygen.' },
          { kind: 'causes', text: 'Oil consumption, a misfire, an aged catalyst.' },
          { kind: 'meaning', text: 'The code sets when it no longer does.' },
          { kind: 'from_the_future' as never, text: 'Bank 2 exists only on V and boxer engines.' },
        ]}
      />
    )
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Typical causes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What the code means' })).toBeInTheDocument()
    // A kind the app does not know yet reads under "Good to know".
    expect(screen.getByRole('heading', { name: 'Good to know' })).toBeInTheDocument()
    expect(screen.getByText('Bank 2 exists only on V and boxer engines.')).toBeInTheDocument()
    expect(screen.queryByText(/The catalyst stores oxygen. The code sets/)).not.toBeInTheDocument()
  })

  it('shows the description as one paragraph when there are no sections', () => {
    render(
      <DescriptionSections
        description="The catalyst stores oxygen. The code sets when it no longer does."
        sections={[]}
      />
    )
    expect(
      screen.getByText('The catalyst stores oxygen. The code sets when it no longer does.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('folds a long section away behind Show more', () => {
    render(
      <DescriptionSections
        description={null}
        sections={[{ kind: 'diagnosis', text: 'x'.repeat(400) }]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })
})

describe('a finding that is a fault code', () => {
  function line(
    props: Partial<React.ComponentProps<typeof FaultCodeFindingLine>> = {},
    seenBefore: Record<string, string> = {}
  ) {
    return render(
      <FaultCodesJobProvider
        info={{ connected: true, seenBefore }}
        vehicleId="veh1"
        serviceRecordId="job1"
        concerns={[]}
        locked={false}
      >
        <FaultCodeFindingLine
          finding={{
            faultCode: 'P0420',
            faultStatus: 'stored',
            faultMeaning: 'Catalyst efficiency below threshold (bank 1)',
            faultMeaningSource: 'generic',
            description: 'P0420 Catalyst efficiency below threshold (bank 1)',
          }}
          {...props}
        />
      </FaultCodesJobProvider>
    )
  }

  it('shows the code, its status and the meaning saved with it', () => {
    line()
    expect(screen.getByRole('button', { name: 'Open P0420' })).toBeInTheDocument()
    expect(screen.getByText('Stored')).toBeInTheDocument()
    expect(screen.getByText('Catalyst efficiency below threshold (bank 1)')).toBeInTheDocument()
    expect(screen.queryByText(/^Seen /)).not.toBeInTheDocument()
  })

  it('says when the vehicle had the code in an earlier job', () => {
    line({}, { P0420: '2026-03-12T10:00:00.000Z' })
    expect(screen.getByText(/^Seen /)).toBeInTheDocument()
  })

  it('offers the updated meaning in one tap when the service has changed it', () => {
    const onTake = vi.fn()
    line({
      update: { current: 'Catalyst system efficiency below threshold', source: 'generic' },
      onTake,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Updated meaning' }))
    expect(onTake).toHaveBeenCalled()
  })
})
