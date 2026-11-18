import ExcelJS from 'exceljs'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CodeFileError,
  EXAMPLE_HEADERS,
  EXAMPLE_ROWS,
  exampleJson,
  exampleSheetRows,
  readCauses,
  readCodeFile,
} from '@/features/fault-codes/Lib/codeImportFile.server'

/**
 * Importing fault codes from a file: the spreadsheet or JSON a workshop fills in from the
 * example is read into codes, each code is checked before anything is sent, and only what is
 * new or adds to ours goes for review, once the sender says they may share it.
 */

const h = vi.hoisted(() => ({ imports: vi.fn(), track: vi.fn() }))
vi.mock('@/lib/analytics', async (original) => ({
  ...(await original<typeof import('@/lib/analytics')>()),
  track: h.track,
}))
// Radix measures the picker's anchor and cmdk scrolls to the active item; jsdom does neither.
class NoResize {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
Element.prototype.scrollIntoView = vi.fn()
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/features/fault-codes/Actions/getCodeImports', () => ({ getCodeImports: h.imports }))

async function workbook(rows: string[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Codes')
  for (const row of rows) sheet.addRow(row)
  return Buffer.from(await book.xlsx.writeBuffer())
}

describe('reading a file of codes', () => {
  it('reads the example spreadsheet back into the example codes', async () => {
    const file = await readCodeFile(
      await workbook([[...EXAMPLE_HEADERS], ...exampleSheetRows()]),
      'ford.xlsx'
    )
    expect(file.rows).toEqual(
      EXAMPLE_ROWS.map((r) => ({
        description: undefined,
        commonIssues: undefined,
        resolution: undefined,
        advisory: undefined,
        ...r,
      }))
    )
  })

  it('reads the example JSON, with what it says of itself', async () => {
    const file = await readCodeFile(Buffer.from(exampleJson()), 'codes.json')
    expect(file.make).toBe('Ford')
    expect(file.language).toBe('en')
    expect(file.rows[0]).toMatchObject({
      code: 'P1000',
      resolution: EXAMPLE_ROWS[0].resolution,
      advisory: EXAMPLE_ROWS[0].advisory,
      causes: EXAMPLE_ROWS[0].causes,
    })
    // A bare list of codes reads too.
    const list = await readCodeFile(
      Buffer.from(JSON.stringify([{ dtc: 'P1001', name: 'KOER test not complete' }])),
      'list.json'
    )
    expect(list.rows).toEqual([
      expect.objectContaining({ code: 'P1001', title: 'KOER test not complete', causes: [] }),
    ])
  })

  it('knows a column by other words, and causes by line or semicolon', async () => {
    const csv = [
      'DTC;Short text;How to fix it;Possible causes',
      'P1260;Theft detected;Code the key again;"Key not coded (HIGH)\nTransponder broken"',
      'P1261;Other;;"Wiring (low); Module"',
    ].join('\r\n')
    const file = await readCodeFile(Buffer.from(csv), 'codes.csv')
    expect(file.rows[0]).toMatchObject({
      code: 'P1260',
      title: 'Theft detected',
      resolution: 'Code the key again',
      causes: [{ label: 'Key not coded', likelihood: 'high' }, { label: 'Transponder broken' }],
    })
    expect(file.rows[1].causes).toEqual([
      { label: 'Wiring', likelihood: 'low' },
      { label: 'Module' },
    ])
    expect(readCauses('- Spark plug (medium)')).toEqual([
      { label: 'Spark plug', likelihood: 'medium' },
    ])
  })

  it('says what is wrong with a file that is not one', async () => {
    const problem = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e) => (e instanceof CodeFileError ? e.problem : 'other')
      )
    expect(await problem(readCodeFile(Buffer.from('name,price\nbolt,2\n'), 'parts.csv'))).toBe(
      'no_code_column'
    )
    expect(await problem(readCodeFile(Buffer.from('{ not json'), 'codes.json'))).toBe('unreadable')
    expect(await problem(readCodeFile(Buffer.from('{"codes": 3}'), 'codes.json'))).toBe('format')
    expect(await problem(readCodeFile(Buffer.from('x'), 'codes.xls'))).toBe('legacy_xls')
    expect(await problem(readCodeFile(Buffer.from('[]'), 'codes.json'))).toBe('empty')
  })
})

const { ImportCodesDialog } = await import('@/features/fault-codes/Components/ImportCodesDialog')
const fetchMock = vi.fn()

function reply(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body)))
}

const CHECKED = {
  success: true,
  data: {
    counts: { new: 1, change: 1, same: 1, problem: 1 },
    rows: [
      {
        n: 1,
        code: 'P1000',
        title: 'OBD readiness tests not complete',
        state: 'new',
        problem: null,
        fields: ['title', 'description'],
        addedCauses: 1,
      },
      {
        n: 2,
        code: 'X',
        title: 'Not a code',
        state: 'problem',
        problem: 'code',
        fields: [],
        addedCauses: 0,
      },
      {
        n: 3,
        code: 'P1260',
        title: null,
        state: 'change',
        problem: null,
        fields: ['resolution', 'causes'],
        addedCauses: 2,
      },
      {
        n: 4,
        code: 'P1261',
        title: 'Same as ours',
        state: 'same',
        problem: null,
        fields: [],
        addedCauses: 0,
      },
    ],
    meta: { make: 'Ford', language: 'en', source: null },
  },
}

describe('the import dialog', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('ResizeObserver', NoResize)
    h.imports.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'a',
          make: 'ford',
          lang: 'en',
          source: null,
          fileName: 'old.xlsx',
          createdAt: '2026-11-01T10:00:00Z',
          counts: { new: 30, change: 2, pending: 2, published: 30, rejected: 0 },
          reviewedAt: '2026-11-02T10:00:00Z',
        },
      ],
    })
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('offers the examples, checks a dropped file and sends what adds to ours', async () => {
    render(<ImportCodesDialog open onOpenChange={vi.fn()} />)
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('link', { name: /Example spreadsheet/ })).toHaveAttribute(
      'href',
      '/api/protected/fault-codes/import/example?format=xlsx'
    )
    expect(dialog.getByRole('link', { name: /Example JSON/ })).toHaveAttribute(
      'href',
      '/api/protected/fault-codes/import/example?format=json'
    )
    // Earlier imports and how far their review has come.
    await waitFor(() => expect(dialog.getByText('Your imports')).toBeInTheDocument())
    expect(dialog.getByText(/30 published · 2 waiting/)).toBeInTheDocument()
    expect(dialog.getByText('Pick the make first')).toBeInTheDocument()

    // A JSON file names its make, so the check runs at once.
    fetchMock.mockImplementationOnce(() => reply(CHECKED))
    const file = new File([exampleJson()], 'ford.json', { type: 'application/json' })
    fireEvent.change(dialog.getByTestId('import-file-input'), { target: { files: [file] } })
    await waitFor(() => expect(dialog.getByText('1 new')).toBeInTheDocument())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/protected/fault-codes/import/check')
    expect((init.body as FormData).get('make')).toBe('ford')
    expect(dialog.getByText('1 add to ours')).toBeInTheDocument()
    expect(h.track).toHaveBeenCalledWith('fault_code:import_check', {
      make: 'ford',
      file_type: 'json',
      rows: 4,
      new: 1,
      change: 1,
      same: 1,
      problem: 1,
    })
    expect(dialog.getByText('1 need a fix')).toBeInTheDocument()
    expect(dialog.getByText('1 already the same')).toBeInTheDocument()
    // Problems first, in words; a change says what it adds.
    const rows = within(dialog.getByRole('list', { name: 'Codes in the file' })).getAllByRole(
      'listitem'
    )
    expect(rows[0]).toHaveTextContent('Row 2: Not a code Ford uses')
    expect(rows[2]).toHaveTextContent('Adds how to fix and 2 causes')
    expect(dialog.queryByText('Same as ours')).not.toBeInTheDocument()

    const send = dialog.getByRole('button', { name: 'Send 2 codes for review' })
    expect(send).toBeDisabled()
    expect(dialog.getByText('Tick the box to send')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('checkbox'))
    expect(send).toBeEnabled()

    fetchMock.mockImplementationOnce(() =>
      reply({
        success: true,
        data: { id: 'b', counts: { new: 1, change: 1, same: 1, problem: 1 }, imports: [] },
      })
    )
    fireEvent.click(send)
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Sent. 2 codes wait for review.')
    )
    expect(h.track).toHaveBeenCalledWith('fault_code:import_send', {
      make: 'ford',
      codes: 2,
      new: 1,
      change: 1,
      source: true,
    })
    const [sendUrl, sendInit] = fetchMock.mock.calls[1]
    expect(sendUrl).toBe('/api/protected/fault-codes/import')
    const form = sendInit.body as FormData
    expect(form.get('rights')).toBe('yes')
    expect(form.get('make')).toBe('ford')
    expect((form.get('file') as File).name).toBe('ford.json')
  })

  it('finds the make by typing, and takes one that is not listed as typed', async () => {
    render(<ImportCodesDialog open onOpenChange={vi.fn()} />)
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('combobox', { name: 'Make' }))
    const search = await screen.findByPlaceholderText('Search makes')
    fireEvent.change(search, { target: { value: 'rover' } })
    expect(screen.getByRole('option', { name: /Land Rover/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Toyota/ })).not.toBeInTheDocument()
    // A listed make matches, so the typed letters are not offered as a make of their own.
    expect(screen.queryByRole('option', { name: 'Use rover' })).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'for' } })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Ford'])
    // Written with a space instead of the dash, the make is still found.
    fireEvent.change(search, { target: { value: 'Mercedes Benz' } })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Mercedes-Benz'])
    fireEvent.change(search, { target: { value: 'Ferrari' } })
    fireEvent.click(screen.getByRole('option', { name: 'Use Ferrari' }))
    expect(dialog.getByRole('combobox', { name: 'Make' })).toHaveTextContent('Ferrari')

    fetchMock.mockImplementationOnce(() => reply(CHECKED))
    const csv = new File(['Code,Title\nP1000,Readiness\n'], 'ferrari.csv', { type: 'text/csv' })
    fireEvent.change(dialog.getByTestId('import-file-input'), { target: { files: [csv] } })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect((fetchMock.mock.calls[0][1].body as FormData).get('make')).toBe('ferrari')
  })

  it('says what is wrong with a file and keeps the dialog open when sending is paused', async () => {
    render(<ImportCodesDialog open onOpenChange={vi.fn()} />)
    const dialog = within(screen.getByRole('dialog'))
    fetchMock.mockImplementationOnce(() =>
      reply({ success: false, error: 'file', problem: 'no_code_column' })
    )
    fireEvent.change(dialog.getByTestId('import-file-input'), {
      target: { files: [new File(['{"make":"Ford","codes":[]}'], 'a.json')] },
    })
    await waitFor(() =>
      expect(
        dialog.getByText('No Code column was found. Start from the example spreadsheet.')
      ).toBeInTheDocument()
    )

    fireEvent.click(dialog.getByRole('button', { name: 'Remove the file' }))
    fetchMock.mockImplementationOnce(() => reply(CHECKED))
    fireEvent.change(dialog.getByTestId('import-file-input'), {
      target: { files: [new File([exampleJson()], 'ford.json')] },
    })
    await waitFor(() => expect(dialog.getByText('1 new')).toBeInTheDocument())
    fireEvent.click(dialog.getByRole('checkbox'))
    fetchMock.mockImplementationOnce(() => reply({ success: false, error: 'paused' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Send 2 codes for review' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Sending codes is paused right now. Try again later.'
      )
    )
    expect(dialog.getByText('ford.json')).toBeInTheDocument()
  })
})
