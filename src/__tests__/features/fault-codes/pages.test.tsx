import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { FaultCodePageData, OwnFix, SharedFix } from '@/features/fault-codes/Lib/types'

/**
 * The two fault code pages as a technician uses them: a code's own page
 * spread over two columns with the likeliest cause first, a way to ask
 * support about the code on screen, sharing what fixed it and reading what
 * fixed it elsewhere, and a lookup page that remembers what this person
 * opened and searched, and lists matches while they type.
 */

const h = vi.hoisted(() => ({
  push: vi.fn(),
  openSupport: vi.fn(),
  suggest: vi.fn(),
  withdraw: vi.fn(),
  report: vi.fn(),
  phoneLink: vi.fn(),
  draftPhotos: vi.fn(),
  research: vi.fn(),
  rate: vi.fn(),
  track: vi.fn(),
}))
vi.mock('@/lib/analytics', async (original) => ({
  ...(await original<typeof import('@/lib/analytics')>()),
  track: h.track,
}))
vi.mock('@/features/fault-codes/Actions/researchFaultCode', () => ({
  researchFaultCode: h.research,
}))
vi.mock('@/features/fault-codes/Actions/rateFaultCodeResearch', () => ({
  rateFaultCodeResearch: h.rate,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push, refresh: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))
vi.mock('@/features/support/Lib/supportVisibility', () => ({ openSupport: h.openSupport }))
vi.mock('@/features/fault-codes/Actions/suggestFaultCodes', () => ({
  suggestFaultCodes: h.suggest,
}))
vi.mock('@/features/fault-codes/Actions/withdrawFaultCodeFix', () => ({
  withdrawFaultCodeFix: h.withdraw,
}))
// The browser's half of the compression is the app's own, tested on its own.
vi.mock('@/lib/compress-image', () => ({ compressImage: async (file: File) => file }))
// The notes editor is tiptap, which jsdom cannot type into; a text box stands
// in, handing back the same HTML the editor would.
vi.mock('@/features/vehicles/Components/service-edit/RichTextEditor', () => ({
  RichTextEditor: ({
    content,
    onChange,
    ariaLabel,
  }: {
    content: string
    onChange: (html: string) => void
    ariaLabel?: string
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={content.replace(/<\/?p>/g, '')}
      onChange={(e) => onChange(e.target.value ? `<p>${e.target.value}</p>` : '')}
    />
  ),
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
vi.mock('@/features/fault-codes/Actions/reportFaultCodeMeaning', () => ({
  reportFaultCodeMeaning: h.report,
}))

const { FaultCodeDetail } = await import('@/features/fault-codes/Components/FaultCodeDetail')
const { FaultCodeLookup } = await import('@/features/fault-codes/Components/FaultCodeLookup')
const { FaultCodeOemView } = await import('@/features/fault-codes/Components/FaultCodeOemView')
const { readRecentLookups, pushRecentLookup } = await import('@/features/fault-codes/Lib/lookups')

function pageData(patch: Partial<FaultCodePageData> = {}): FaultCodePageData {
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
      sections: [{ kind: 'how_it_works', text: 'x'.repeat(500) }],
      causes: [
        { key: 'sensor', likelihood: 'low', label: 'Rear oxygen sensor slow' },
        { key: 'aged', likelihood: 'high', label: 'Catalyst aged' },
        { key: 'leak', likelihood: 'medium', label: 'Exhaust leak before the sensor' },
      ],
      related: [{ code: 'P0430', title: 'Catalyst System Efficiency Below Threshold Bank 2' }],
      pendingCheck: false,
    },
    jobs: [],
    fixes: { available: true, published: [], own: [] },
    report: null,
    vehicle: null,
    ...patch,
  }
}

const renderPage = (ui: React.ReactElement) =>
  render(
    <ConfirmProvider>
      <TooltipProvider>{ui}</TooltipProvider>
    </ConfirmProvider>
  )

const fetchMock = vi.fn()

beforeEach(() => {
  window.localStorage.clear()
  h.push.mockReset()
  h.openSupport.mockReset()
  h.suggest.mockReset()
  h.withdraw.mockReset()
  h.report.mockReset()
  fetchMock.mockReset()
  vi.mocked(toast.error).mockReset()
  vi.mocked(toast.success).mockReset()
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("a code's own page", () => {
  it('lays the code out in cards, says it is in development, and reads in full', () => {
    renderPage(<FaultCodeDetail data={pageData()} layout="page" />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Catalyst System Efficiency Below Threshold Bank 1',
      })
    ).toBeInTheDocument()
    expect(screen.getByText('Powertrain')).toBeInTheDocument()
    // Says plainly that codes are still being added, and only OBD codes for now.
    expect(screen.getByText('Fault codes are new')).toBeInTheDocument()
    expect(screen.getByText(/standard OBD-II codes/)).toBeInTheDocument()
    // A card's heading carries its count, as in "Related codes 1".
    for (const title of [
      'What it means',
      'Likely causes',
      'Related codes',
      'Fixes from other workshops',
      'Share your fix',
    ])
      expect(screen.getByRole('heading', { name: new RegExp(`^${title}`) })).toBeInTheDocument()
    expect(screen.queryByText(/Your note/)).not.toBeInTheDocument()
    // There is room on the page: no folding behind Show more.
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
  })

  it('lists the likeliest cause first', () => {
    renderPage(<FaultCodeDetail data={pageData()} layout="page" />)
    const causes = screen
      .getByRole('heading', { name: 'Likely causes' })
      .closest('[data-slot="card"]')
    const items = within(causes as HTMLElement).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Catalyst aged'),
      expect.stringContaining('Exhaust leak before the sensor'),
      expect.stringContaining('Rear oxygen sensor slow'),
    ])
  })

  it('opens support with the code and its meaning already written in', () => {
    renderPage(<FaultCodeDetail data={pageData()} layout="page" supportEnabled />)
    fireEvent.click(screen.getByRole('button', { name: 'Contact support' }))
    expect(h.openSupport).toHaveBeenCalledWith({
      subject: 'Fault code P0420',
      message: expect.stringContaining('P0420: Catalyst System Efficiency Below Threshold Bank 1'),
    })
  })

  it('reports a wrong meaning with a reason and what was found, nothing more', async () => {
    h.report.mockResolvedValueOnce({
      success: true,
      data: {
        sent: true,
        report: {
          code: 'P0420',
          reportedAt: '2026-11-05T10:00:00Z',
          reason: 'wrong_for_vehicle',
          status: 'open',
          outcome: null,
          message: null,
        },
      },
    })
    renderPage(<FaultCodeDetail data={pageData()} layout="page" />)
    fireEvent.click(screen.getByRole('button', { name: 'Report a problem' }))
    expect(screen.queryByText('What does your scan tool say?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Wrong for this car' }))
    fireEvent.change(screen.getByPlaceholderText('What you found'), {
      target: { value: 'Rear O2 sensor, not the catalyst' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByText('Reported by you')).toBeInTheDocument())
    expect(h.report).toHaveBeenCalledWith({
      code: 'P0420',
      version: 2,
      lang: 'en',
      reason: 'wrong_for_vehicle',
      note: 'Rear O2 sensor, not the catalyst',
      vehicleId: null,
    })
  })

  it('offers no support button where there is no support desk', () => {
    renderPage(<FaultCodeDetail data={pageData()} layout="page" />)
    expect(screen.queryByRole('button', { name: 'Contact support' })).not.toBeInTheDocument()
  })

  it('remembers the code as a recent lookup', () => {
    renderPage(<FaultCodeDetail data={pageData()} layout="page" />)
    expect(readRecentLookups()[0]).toMatchObject({
      kind: 'code',
      code: 'P0420',
      title: 'Catalyst System Efficiency Below Threshold Bank 1',
    })
  })

  it('stays one quiet column beside a job', () => {
    renderPage(<FaultCodeDetail data={pageData({ fixes: null })} />)
    expect(screen.queryByText('Fault codes are new')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    expect(screen.queryByText('Share your fix')).not.toBeInTheDocument()
    expect(readRecentLookups()).toEqual([])
  })
})

const GOLF = { id: 'v1', make: 'Volkswagen', model: 'Golf', year: 2014, engine: 'CAXA' }
const FIXED_IT =
  'Chafed wire at the rear O2 sensor plug behind the gearbox. Repaired it, code cleared after a test drive.'

function ownFix(patch: Partial<OwnFix> = {}): OwnFix {
  return {
    id: '0190f3c2-7d1a-7000-8000-000000000001',
    meaning: null,
    lang: 'en',
    text: FIXED_IT,
    vehicle: { make: 'Volkswagen', model: 'Golf', year: 2014, engine: 'CAXA' },
    photos: [],
    createdAt: '2026-11-05T10:00:00Z',
    status: 'pending',
    reason: null,
    reviewedAt: null,
    edited: false,
    ...patch,
  }
}

function card(title: string) {
  return within(
    screen
      .getByRole('heading', { name: new RegExp(`^${title}`) })
      .closest('[data-slot="card"]') as HTMLElement
  )
}

const vanos = {
  id: 'einlass-vanos',
  title: 'Inlet camshaft adjustment (VANOS)',
  titleLang: 'en',
  ownTitle: true,
  text: 'Einlass-VANOS',
  textLang: 'de',
  textEn: null,
  description: 'Most often a sticking solenoid. Clean or replace the solenoid.',
  sections: [
    { kind: 'common_issues' as const, text: 'Most often a sticking solenoid.' },
    { kind: 'resolution' as const, text: 'Clean or replace the solenoid.' },
  ],
  causes: [
    { key: 'chain', likelihood: 'low' as const, label: 'Stretched timing chain' },
    { key: 'solenoid', likelihood: 'high' as const, label: 'VANOS solenoid' },
  ],
  modules: [
    { ref: 'msd80', family: 'DME', name: 'MSD80' },
    { ref: 'msd81', family: 'DME', name: null },
  ],
  vehicles: [
    { chassis: 'E90', model: '3 Series', body: 'Sedan', yearFrom: 2005, yearTo: 2013 },
    { chassis: 'E92', model: '3 Series', body: 'Coupé', yearFrom: 2006, yearTo: 2013 },
  ],
  engines: ['N54'],
  matches: true,
}
const lambda = {
  ...vanos,
  id: 'lambdasonden-nach-katalysator-vertauscht',
  title: 'Lambdasonden nach Katalysator, vertauscht',
  titleLang: 'de',
  ownTitle: false,
  text: 'Lambdasonden nach Katalysator, vertauscht',
  description: null,
  sections: [],
  causes: [],
  modules: [{ ref: 'mev17n46', family: 'DME', name: null }],
  vehicles: [{ chassis: 'F30', model: '3 Series', body: 'Sedan', yearFrom: 2012, yearTo: null }],
  engines: ['N46'],
  matches: false,
}

function bmwPage(meanings = [vanos, lambda]) {
  return {
    ...pageData({ code: '2A82', report: null, oemMakes: ['bmw'] }),
    oem: { make: 'bmw', makeName: 'BMW', fixCode: 'BMW-2A82', served: true, meanings },
  }
}

describe("a BMW code's own page", () => {
  it("reads like every code page: our title, BMW's words, the parts and where BMW uses it", () => {
    renderPage(<FaultCodeOemView data={bmwPage()} layout="page" />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Inlet camshaft adjustment (VANOS)' })
    ).toBeInTheDocument()
    expect(screen.getByText('BMW code')).toBeInTheDocument()
    expect(screen.getByText("BMW's text: Einlass-VANOS")).toBeInTheDocument()
    // The OBD page's cards, the description under its headings.
    expect(screen.getByRole('heading', { name: 'What it means' })).toBeInTheDocument()
    expect(screen.getByText('Common issues')).toBeInTheDocument()
    expect(screen.getByText('How to fix it')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Likely causes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Where BMW uses it' })).toBeInTheDocument()
    expect(screen.getByText('E90, E92')).toBeInTheDocument()
    expect(screen.getByText('2005 to 2013')).toBeInTheDocument()
    expect(screen.getByText('DME · msd80')).toBeInTheDocument()
    // Shared fixes and the jobs here, as on any code.
    expect(screen.getByRole('heading', { name: 'Share your fix' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'In your workshop' })).toBeInTheDocument()
    // No "report this meaning": BMW's own data has nothing of ours to correct.
    expect(screen.queryByRole('button', { name: /Report/ })).not.toBeInTheDocument()
    // The notice says BMW's codes are covered.
    expect(screen.getByText(/and BMW's own codes/)).toBeInTheDocument()
    expect(readRecentLookups()[0]).toMatchObject({ kind: 'oem', make: 'bmw', code: '2A82' })
  })

  it('switches between the meanings a code has in different control units', () => {
    renderPage(<FaultCodeOemView data={bmwPage()} layout="page" />)
    expect(screen.getByText(/2 meanings/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Lambdasonden nach Katalysator/ }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Lambdasonden nach Katalysator, vertauscht' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Likely causes' })).not.toBeInTheDocument()
    expect(screen.getByText('F30')).toBeInTheDocument()
    expect(screen.getByText('from 2012')).toBeInTheDocument()
  })

  it('shares a fix for the meaning on screen, the make already BMW, and lists fixes per meaning', async () => {
    const lambdaFix = {
      ...ownFix({
        id: '0190f3c2-7d1a-7000-8000-00000000000a',
        text: 'Swapped the lambda plugs back.',
      }),
      meaning: 'lambdasonden-nach-katalysator-vertauscht',
    }
    const data = bmwPage()
    data.fixes = { available: true, published: [], own: [lambdaFix] }
    renderPage(<FaultCodeOemView data={data} layout="page" />)
    // The VANOS meaning is on screen: the lambda fix is not its.
    expect(screen.queryByText('Swapped the lambda plugs back.')).not.toBeInTheDocument()
    expect(screen.getByText(/Tell other workshops what fixed BMW 2A82/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Share your fix/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Share your fix for BMW 2A82')).toBeInTheDocument()
    expect(within(dialog).getByText('Inlet camshaft adjustment (VANOS)')).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Make' })).toHaveTextContent('BMW')

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: ownFix({ meaning: 'einlass-vanos' }) }))
    )
    fireEvent.change(within(dialog).getByLabelText('What fixed it'), {
      target: { value: FIXED_IT },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Share fix' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const sent = fetchMock.mock.calls[0][1].body as FormData
    expect(sent.get('code')).toBe('BMW-2A82')
    expect(sent.get('meaning')).toBe('einlass-vanos')
    expect(sent.get('make')).toBe('BMW')

    // On the lambda meaning, the lambda fix shows.
    fireEvent.click(screen.getByRole('button', { name: /Lambdasonden nach Katalysator/ }))
    expect(screen.getByText('Swapped the lambda plugs back.')).toBeInTheDocument()
  })

  it('says so when BMW codes are not served, or BMW has no such code', () => {
    const off = bmwPage([])
    off.oem.served = false
    const { unmount } = renderPage(<FaultCodeOemView data={off} layout="page" />)
    expect(screen.getByText('BMW codes are not available yet.')).toBeInTheDocument()
    unmount()
    renderPage(<FaultCodeOemView data={bmwPage([])} layout="page" />)
    expect(screen.getByText("2A82 is not in BMW's data.")).toBeInTheDocument()
  })
})

const RESEARCHED = {
  id: '0190f3c2-7d1a-7000-8000-0000000000aa',
  code: 'P0420',
  meaning: null,
  status: 'pending' as const,
  findings: {
    title: 'Catalyst efficiency below threshold, bank 1',
    meaning: 'The rear oxygen sensor shows the catalyst no longer stores enough oxygen.',
    commonIssues: ['Exhaust leak before the rear sensor'],
    steps: [
      'Check for exhaust leaks between the front pipe and the rear sensor.',
      'Compare front and rear sensor voltages at 2500 rpm.',
    ],
    causes: [
      { label: 'Rear sensor slow', likelihood: 'low' as const },
      { label: 'Worn catalyst', likelihood: 'high' as const },
    ],
    advice: 'Fix misfires first.',
    sources: [
      { url: 'https://www.obd-codes.com/p0420', title: 'P0420' },
      { url: 'https://forum.example.org/t/1', title: null },
    ],
  },
  reason: null,
  requests: 1,
  helpful: 0,
  notHelpful: 0,
  createdAt: '2026-11-06T10:00:00Z',
}

describe('a make known only from what workshops imported', () => {
  const readiness = {
    ...vanos,
    id: '',
    title: 'OBD readiness tests not complete',
    titleLang: 'en',
    ownTitle: true,
    text: '',
    textLang: '',
    description: 'The self tests have not run.\n\nDrive a full drive cycle.',
    sections: [
      { kind: 'meaning' as const, text: 'The self tests have not run.' },
      { kind: 'resolution' as const, text: 'Drive a full drive cycle.' },
    ],
    modules: [],
    vehicles: [],
    engines: [],
    matches: false,
  }
  const FOCUS = { id: 'v2', make: 'Ford', model: 'Focus', year: 2015, engine: null }

  it("reads like any make's code, without control units or the make's own words", () => {
    renderPage(
      <FaultCodeOemView
        data={{
          ...pageData({ code: 'P1000', report: null, oemMakes: ['bmw', 'ford'], vehicle: FOCUS }),
          oem: {
            make: 'ford',
            makeName: 'Ford',
            fixCode: 'FORD-P1000',
            served: true,
            meanings: [readiness],
          },
        }}
        layout="page"
      />
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'OBD readiness tests not complete' })
    ).toBeInTheDocument()
    expect(screen.getByText('Ford code')).toBeInTheDocument()
    expect(screen.getByText('Drive a full drive cycle.')).toBeInTheDocument()
    expect(screen.queryByText(/Ford's text/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Where Ford uses it' })).not.toBeInTheDocument()
    // No units to match the car against, so no warning that none matches.
    expect(screen.queryByText(/None of these meanings/)).not.toBeInTheDocument()
    expect(screen.getByText(/own codes of BMW and Ford/)).toBeInTheDocument()
  })

  it('counts each code opened, and whether we had a meaning for it', () => {
    h.track.mockReset()
    const { unmount } = renderPage(<FaultCodeDetail data={pageData()} layout="page" />)
    expect(h.track).toHaveBeenCalledWith('fault_code:page_view', {
      code: 'P0420',
      kind: 'obd',
      make: null,
      found: true,
      layout: 'page',
      on_job: false,
    })
    unmount()
    h.track.mockReset()
    const missing = pageData({ code: 'P1999' })
    missing.detail = { ...missing.detail, code: 'P1999', title: null, state: 'missing' as never }
    renderPage(<FaultCodeDetail data={missing} layout="sheet" />)
    expect(h.track).toHaveBeenCalledWith(
      'fault_code:page_view',
      expect.objectContaining({ code: 'P1999', found: false, layout: 'sheet' })
    )
  })

  it("shows a make's own meaning on the standard code's page, the car's make first", () => {
    renderPage(
      <FaultCodeDetail
        data={pageData({
          code: 'P1000',
          vehicle: FOCUS,
          makeCodes: [
            {
              make: 'ford',
              makeName: 'Ford',
              code: 'P1000',
              title: 'OBD readiness tests not complete',
              meanings: 1,
            },
            {
              make: 'mazda',
              makeName: 'Mazda',
              code: 'P1000',
              title: 'OBD-II monitor testing not complete',
              meanings: 1,
            },
          ],
        })}
        layout="page"
      />
    )
    expect(screen.getByText('Makes with their own meaning for P1000')).toBeInTheDocument()
    const ford = screen.getByRole('link', { name: /Ford.*OBD readiness tests not complete/ })
    expect(ford).toHaveAttribute('href', '/fault-codes/oem/ford/P1000')
    expect(within(ford).getByText("This car's make")).toBeInTheDocument()
    h.track.mockReset()
    fireEvent.click(ford)
    expect(h.track).toHaveBeenCalledWith('fault_code:make_code_open', {
      code: 'P1000',
      make: 'ford',
      own_make: true,
    })
    expect(screen.getByRole('link', { name: /Mazda/ })).toHaveAttribute(
      'href',
      '/fault-codes/oem/mazda/P1000'
    )
  })
})

describe('researching a fix online', () => {
  it('offers to research when there is none, then shows what was found for a person to check', async () => {
    h.research.mockResolvedValueOnce({
      success: true,
      data: { outcome: 'done', research: RESEARCHED },
    })
    h.rate.mockResolvedValueOnce({ success: true, data: { rated: true } })
    renderPage(
      <FaultCodeDetail
        data={pageData({ research: { available: true, items: [] } })}
        layout="page"
      />
    )
    expect(screen.getByRole('heading', { name: 'Research a fix online' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Research a fix' }))
    expect(screen.getByText('Researching P0420')).toBeInTheDocument()
    expect(h.research).toHaveBeenCalledWith({ code: 'P0420', meaning: undefined, vehicleId: null })

    await waitFor(() =>
      expect(screen.getByText('Catalyst efficiency below threshold, bank 1')).toBeInTheDocument()
    )
    expect(screen.getByText('Waiting for a person to check it')).toBeInTheDocument()
    expect(screen.getByText(/Check it against the car/)).toBeInTheDocument()
    expect(
      screen.getByText('Compare front and rear sensor voltages at 2500 rpm.')
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /obd-codes.com/ })).toHaveAttribute(
      'href',
      'https://www.obd-codes.com/p0420'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Yes, it fixed it' }))
    await waitFor(() => expect(screen.getByText('Thanks, noted')).toBeInTheDocument())
    expect(h.rate).toHaveBeenCalledWith({ id: RESEARCHED.id, helpful: true })
  })

  it('shows the finished research when the page is read again', () => {
    const running = { ...RESEARCHED, status: 'running' as const, findings: null }
    const { rerender } = renderPage(
      <FaultCodeDetail
        data={pageData({ research: { available: true, items: [running] } })}
        layout="page"
      />
    )
    expect(screen.getByText('Being researched right now')).toBeInTheDocument()
    // "Check again" reads the page again; the card takes what it brings.
    rerender(
      <ConfirmProvider>
        <TooltipProvider>
          <FaultCodeDetail
            data={pageData({ research: { available: true, items: [RESEARCHED] } })}
            layout="page"
          />
        </TooltipProvider>
      </ConfirmProvider>
    )
    expect(screen.getByText('Catalyst efficiency below threshold, bank 1')).toBeInTheDocument()
    expect(screen.queryByText('Being researched right now')).not.toBeInTheDocument()
  })

  it('says plainly when nothing reliable was found, and is not there when research is off', () => {
    const missed = { ...RESEARCHED, status: 'missed' as const, findings: null }
    const { unmount } = renderPage(
      <FaultCodeDetail
        data={pageData({ research: { available: true, items: [missed] } })}
        layout="page"
      />
    )
    expect(screen.getByText('No reliable fix found online')).toBeInTheDocument()
    expect(screen.getByText(/so nothing was saved/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Research a fix' })).not.toBeInTheDocument()
    unmount()
    renderPage(
      <FaultCodeDetail
        data={pageData({ research: { available: false, items: [] } })}
        layout="page"
      />
    )
    expect(screen.queryByText('Research a fix online')).not.toBeInTheDocument()
  })

  it('shows a checked research to every workshop, and a busy one as such', () => {
    const checked = { ...RESEARCHED, status: 'published' as const }
    const { unmount } = renderPage(
      <FaultCodeDetail
        data={pageData({ research: { available: false, items: [checked] } })}
        layout="page"
      />
    )
    expect(screen.getByText('Checked by Torqvoice')).toBeInTheDocument()
    expect(screen.queryByText(/Check it against the car/)).not.toBeInTheDocument()
    unmount()
    h.research.mockResolvedValueOnce({ success: true, data: { outcome: 'busy' } })
    renderPage(
      <FaultCodeDetail
        data={pageData({ research: { available: true, items: [] } })}
        layout="page"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Research a fix' }))
    return waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This code is being researched right now. Check again in a minute.'
      )
    )
  })

  it("researches a BMW code's meaning on screen, each meaning its own", () => {
    const data = bmwPage()
    data.research = {
      available: true,
      items: [
        {
          ...RESEARCHED,
          code: 'BMW-2A82',
          meaning: 'lambdasonden-nach-katalysator-vertauscht',
          findings: { ...RESEARCHED.findings, title: 'Lambda sensor plugs swapped' },
        },
      ],
    }
    renderPage(<FaultCodeOemView data={data} layout="page" />)
    // The VANOS meaning has no research yet: it can be asked for.
    expect(screen.getByText(/BMW 2A82 · Inlet camshaft adjustment/)).toBeInTheDocument()
    expect(screen.queryByText('Lambda sensor plugs swapped')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Lambdasonden nach Katalysator/ }))
    expect(screen.getByText('Lambda sensor plugs swapped')).toBeInTheDocument()
  })
})

describe('sharing what fixed a code', () => {
  /** Opens the share dialog from the card's invitation. */
  async function openShare() {
    const share = card('Share your fix')
    fireEvent.click(share.getByRole('button', { name: 'Share your fix' }))
    return { share, dialog: within(await screen.findByRole('dialog')) }
  }

  it("sends the text, the photos and the job's vehicle, and shows the fix waiting for review", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: ownFix({ photos: [] }) }))
    )
    renderPage(<FaultCodeDetail data={pageData({ vehicle: GOLF })} layout="page" />)
    const { share, dialog } = await openShare()
    expect(dialog.getByText('Share your fix for P0420')).toBeInTheDocument()
    // The vehicle comes from the job: shown, never asked for.
    expect(dialog.getByText('2014 Volkswagen Golf · CAXA')).toBeInTheDocument()
    expect(dialog.queryByLabelText('Make')).not.toBeInTheDocument()

    fireEvent.change(dialog.getByLabelText('What fixed it'), { target: { value: FIXED_IT } })
    const photo = new File(['jpeg'], 'plug.jpg', { type: 'image/jpeg' })
    fireEvent.change(dialog.getByTestId('fix-photo-input'), { target: { files: [photo] } })
    await waitFor(() =>
      expect(dialog.getByRole('button', { name: 'Remove photo 1' })).toBeVisible()
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Share fix' }))

    await waitFor(() => expect(share.getByText('Waiting for review')).toBeInTheDocument())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/protected/fault-codes/fixes')
    const form = init.body as FormData
    expect(form.get('code')).toBe('P0420')
    expect(form.get('text')).toBe(FIXED_IT)
    expect(form.get('vehicleId')).toBe('v1')
    expect(form.get('make')).toBeNull()
    expect(form.get('draftId')).toBeNull()
    expect(form.getAll('photo')).toHaveLength(1)
    expect(share.getByText(FIXED_IT)).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Thanks. Your fix is waiting for review.')
    // The dialog closes, and another fix starts from the card's header.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(share.getByRole('button', { name: 'Share another fix' })).toBeInTheDocument()
  })

  it('sends formatting as Markdown', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: ownFix() })))
    renderPage(<FaultCodeDetail data={pageData()} layout="page" />)
    const { dialog } = await openShare()
    fireEvent.change(dialog.getByLabelText('What fixed it'), {
      target: { value: '<strong>Chafed wire</strong> behind the gearbox' },
    })
    fireEvent.click(dialog.getByRole('button', { name: 'Share fix' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const form = fetchMock.mock.calls[0][1].body as FormData
    expect(form.get('text')).toBe('**Chafed wire** behind the gearbox')
  })

  it('asks for make, model and year when the page was not opened from a job', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: ownFix() })))
    renderPage(<FaultCodeDetail data={pageData()} layout="page" />)
    const { dialog } = await openShare()
    fireEvent.change(dialog.getByLabelText('What fixed it'), { target: { value: FIXED_IT } })
    fireEvent.change(dialog.getByLabelText('Make'), { target: { value: 'Volkswagen' } })
    fireEvent.change(dialog.getByLabelText('Year'), { target: { value: '2014' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Share fix' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const form = fetchMock.mock.calls[0][1].body as FormData
    expect(form.get('make')).toBe('Volkswagen')
    expect(form.get('year')).toBe('2014')
    expect(form.get('model')).toBeNull()
    expect(form.get('vehicleId')).toBeNull()
  })

  it('shows a phone code, shows the photos the phone adds, and sends them with the fix', async () => {
    h.phoneLink.mockResolvedValue({
      success: true,
      data: { token: 'fx1.abc.sig', expiresAt: '2026-11-05T20:00:00Z' },
    })
    const name = '3f2b1c4d-5e6f-4a7b-8c9d-0123456789ab.jpg'
    h.draftPhotos.mockResolvedValue({
      success: true,
      data: [{ id: name, url: `/api/protected/files/org1/fix-drafts/${name}` }],
    })
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: ownFix() })))
    renderPage(<FaultCodeDetail data={pageData()} layout="page" />)
    const { dialog } = await openShare()

    fireEvent.click(dialog.getByRole('button', { name: 'Add from phone' }))
    expect(await dialog.findByText('Take photos with your phone')).toBeInTheDocument()
    await waitFor(() => expect(dialog.getByText('1 photo from your phone')).toBeInTheDocument())
    expect(dialog.getByText('Phone')).toBeInTheDocument()
    const draftId = h.phoneLink.mock.calls[0][0].draftId as string
    expect(h.phoneLink).toHaveBeenCalledWith({ code: 'P0420', draftId, purpose: 'fix' })

    fireEvent.change(dialog.getByLabelText('What fixed it'), { target: { value: FIXED_IT } })
    fireEvent.click(dialog.getByRole('button', { name: 'Share fix' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const form = fetchMock.mock.calls[0][1].body as FormData
    // The phone's photos are on the server already; the draft says which.
    expect(form.get('draftId')).toBe(draftId)
    expect(form.getAll('photo')).toHaveLength(0)
  })

  it('keeps what was written when sharing is paused', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'paused' }), { status: 503 })
    )
    renderPage(<FaultCodeDetail data={pageData()} layout="page" />)
    const { dialog } = await openShare()
    fireEvent.change(dialog.getByLabelText('What fixed it'), { target: { value: FIXED_IT } })
    fireEvent.click(dialog.getByRole('button', { name: 'Share fix' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Sharing fixes is paused right now. Try again later.'
      )
    )
    expect(dialog.getByLabelText('What fixed it')).toHaveValue(FIXED_IT)
  })

  it('says when a reviewer corrected the fix', () => {
    renderPage(
      <FaultCodeDetail
        data={pageData({
          fixes: {
            available: true,
            published: [],
            own: [ownFix({ status: 'published', edited: true })],
          },
        })}
        layout="page"
      />
    )
    expect(card('Share your fix').getByText(/Edited during review/)).toBeInTheDocument()
  })

  it('says why a fix was not published, and withdraws it', async () => {
    h.withdraw.mockResolvedValueOnce({ success: true, data: { withdrawn: true } })
    const rejected = ownFix({ status: 'rejected', reason: 'The photo shows a number plate.' })
    renderPage(
      <FaultCodeDetail
        data={pageData({ fixes: { available: true, published: [], own: [rejected] } })}
        layout="page"
      />
    )
    const share = card('Share your fix')
    expect(share.getByText('Not published')).toBeInTheDocument()
    expect(share.getByText('Reason: The photo shows a number plate.')).toBeInTheDocument()

    fireEvent.click(share.getByRole('button', { name: 'Withdraw' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw' }))
    await waitFor(() => expect(share.queryByText('Not published')).not.toBeInTheDocument())
    expect(h.withdraw).toHaveBeenCalledWith({ code: 'P0420', id: rejected.id })
    expect(toast.success).toHaveBeenCalledWith('Fix withdrawn')
  })

  it("lists other workshops' fixes with the vehicle and photos, never the workshop", () => {
    const theirs: SharedFix = {
      id: '0190f3c2-7d1a-7000-8000-000000000002',
      meaning: null,
      lang: 'en',
      text: 'Replaced the rear O2 sensor; the plug was fine.',
      vehicle: { make: 'Skoda', model: 'Octavia', year: 2016, engine: null },
      photos: [{ n: 0, width: 1200, height: 900 }],
      createdAt: '2026-11-04T08:00:00Z',
    }
    renderPage(
      <FaultCodeDetail
        data={pageData({ fixes: { available: true, published: [theirs], own: [] } })}
        layout="page"
      />
    )
    const fixes = card('Fixes from other workshops')
    expect(fixes.getByText('2016 Skoda Octavia')).toBeInTheDocument()
    expect(fixes.getByText(theirs.text)).toBeInTheDocument()
    const thumb = fixes.getByRole('button', { name: 'Open photo 1' })
    expect(thumb.querySelector('img')).toHaveAttribute(
      'src',
      `/api/protected/fault-codes/fixes/${theirs.id}/photos/0?size=thumb`
    )
  })

  it('says when no other workshop has shared one, and when the service does not answer', () => {
    const { unmount } = renderPage(<FaultCodeDetail data={pageData()} layout="page" />)
    expect(
      card('Fixes from other workshops').getByText(
        'No other workshop has shared a fix for P0420 yet.'
      )
    ).toBeInTheDocument()
    unmount()
    renderPage(
      <FaultCodeDetail
        data={pageData({ fixes: { available: false, published: [], own: [] } })}
        layout="page"
      />
    )
    expect(
      screen.getByText('Fixes from other workshops are not available right now.')
    ).toBeInTheDocument()
    expect(screen.getByText('Sharing fixes is not available right now.')).toBeInTheDocument()
  })
})

const overview = {
  connected: true,
  connectable: true,
  query: '',
  available: true,
  hits: [],
  oemHits: [],
  oemMakes: [],
  recent: [],
}

describe('the lookup page', () => {
  it('shows what this person opened and searched lately, and clears it', () => {
    pushRecentLookup({ kind: 'words', query: 'lean bank 1' })
    pushRecentLookup({ kind: 'code', code: 'P0171', title: 'System Too Lean Bank 1' })
    renderPage(<FaultCodeLookup overview={overview} />)
    const card = screen
      .getByRole('heading', { name: 'Your recent lookups' })
      .closest('[data-slot="card"]')
    const rows = within(card as HTMLElement).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('P0171')
    expect(rows[0]).toHaveTextContent('System Too Lean Bank 1')
    expect(rows[1]).toHaveTextContent('lean bank 1')

    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Clear' }))
    expect(screen.getByText(/show up here, on this device/)).toBeInTheDocument()
    expect(readRecentLookups()).toEqual([])
  })

  it('lists matches while typing', async () => {
    vi.useFakeTimers()
    try {
      h.suggest.mockResolvedValue({
        success: true,
        data: {
          query: 'catalyst',
          available: true,
          hits: [{ code: 'P0420', title: 'Catalyst System Efficiency Below Threshold Bank 1' }],
          oemHits: [],
        },
      })
      renderPage(<FaultCodeLookup overview={overview} />)
      fireEvent.change(screen.getByLabelText('Code or words'), { target: { value: 'catalyst' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(h.suggest).toHaveBeenCalledWith('catalyst')
      expect(screen.getByText('Codes matching “catalyst”')).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: /P0420.*Catalyst System Efficiency/ })
      ).toHaveAttribute('href', '/fault-codes/P0420')
    } finally {
      vi.useRealTimers()
    }
  })

  it('goes straight to a code, and remembers searched words', () => {
    renderPage(<FaultCodeLookup overview={overview} />)
    const box = screen.getByLabelText('Code or words')
    fireEvent.change(box, { target: { value: 'p0420' } })
    fireEvent.submit(box.closest('form') as HTMLFormElement)
    expect(h.push).toHaveBeenLastCalledWith('/fault-codes/P0420')

    fireEvent.change(box, { target: { value: 'lean bank 1' } })
    fireEvent.submit(box.closest('form') as HTMLFormElement)
    expect(h.push).toHaveBeenLastCalledWith('/fault-codes?q=lean%20bank%201')
    expect(readRecentLookups()[0]).toMatchObject({ kind: 'words', query: 'lean bank 1' })
  })

  it('shows a BMW code as a result of its own, and opens it on Enter', () => {
    const bmw = {
      ...overview,
      query: '283700',
      oemMakes: ['bmw'],
      oemHits: [
        {
          make: 'bmw',
          makeName: 'BMW',
          code: '283700',
          title: 'Oxygen sensor, heater: temperature too low',
          meanings: 2,
        },
      ],
    }
    renderPage(<FaultCodeLookup overview={bmw} />)
    expect(screen.getByText('Codes matching “283700”')).toBeInTheDocument()
    const row = screen.getByRole('link', { name: /283700.*BMW code.*Oxygen sensor/ })
    expect(row).toHaveAttribute('href', '/fault-codes/oem/bmw/283700')
    expect(row).toHaveTextContent('and 1 other meaning')
    expect(screen.queryByText(/No code matches/)).not.toBeInTheDocument()
    // The notice says BMW's codes are in.
    expect(screen.getByText(/and BMW's own codes/)).toBeInTheDocument()

    const box = screen.getByLabelText('Code or words')
    fireEvent.submit(box.closest('form') as HTMLFormElement)
    expect(h.push).toHaveBeenLastCalledWith('/fault-codes/oem/bmw/283700')
  })

  it('lists the makes, rather than guessing one, when two makes have the code', () => {
    const shared = {
      ...overview,
      query: '4A10',
      oemMakes: ['bmw', 'ford'],
      oemHits: [
        { make: 'bmw', makeName: 'BMW', code: '4A10', title: 'Fuel pump', meanings: 1 },
        { make: 'ford', makeName: 'Ford', code: '4A10', title: 'Body module', meanings: 1 },
      ],
    }
    renderPage(<FaultCodeLookup overview={shared} />)
    const box = screen.getByLabelText('Code or words')
    fireEvent.submit(box.closest('form') as HTMLFormElement)
    expect(h.push).toHaveBeenLastCalledWith('/fault-codes?q=4A10')
  })

  it('searches words for a BMW-looking number when BMW codes are not served', () => {
    renderPage(<FaultCodeLookup overview={overview} />)
    const box = screen.getByLabelText('Code or words')
    fireEvent.change(box, { target: { value: '283700' } })
    fireEvent.submit(box.closest('form') as HTMLFormElement)
    expect(h.push).toHaveBeenLastCalledWith('/fault-codes?q=283700')
    // Without BMW served, the notice says makes' own codes are still to come.
    expect(screen.getByText(/working on adding makes' own codes/)).toBeInTheDocument()
  })
})

describe('recent lookups', () => {
  it('keeps each lookup once, newest first, and at most ten', () => {
    for (let i = 0; i < 12; i++)
      pushRecentLookup({ kind: 'code', code: `P01${10 + i}`, title: null })
    pushRecentLookup({ kind: 'code', code: 'P0115', title: null })
    const codes = readRecentLookups().map((r) => (r.kind === 'words' ? r.query : r.code))
    expect(codes).toHaveLength(10)
    expect(codes[0]).toBe('P0115')
    expect(codes.filter((c) => c === 'P0115')).toHaveLength(1)
  })

  it('treats a damaged store as empty', () => {
    window.localStorage.setItem('torqvoice.faultCodes.recent', '{not json')
    expect(readRecentLookups()).toEqual([])
  })
})
