import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ImportWizard } from '@/features/import/Components/ImportWizard'
import { type ExistingData, type ImportOptions, planImport } from '@/features/import/Lib/pipeline'
import type { ColumnMapping } from '@/features/import/Lib/suggest'
import type { AnalyzeResponse } from '@/features/import/Lib/types'
import { CurrencySettingsProvider } from '@/components/currency-settings-context'

/**
 * The dry run table says who owns each vehicle and what each past job cost
 * the way the rest of the app does. A vehicle file that names its owner by
 * email showed "-" under Owner on every row, though each row was linked to a
 * customer, and job totals showed as bare numbers.
 */

const existing: ExistingData = {
  customers: [
    {
      id: 'c1',
      name: 'Laura Castillo',
      customerNumber: null,
      email: 'laura@example.com',
      phone: null,
    },
  ],
  vehicles: [
    {
      id: 'v1',
      make: 'Ford',
      model: 'F-150',
      year: 2019,
      vin: null,
      licensePlate: 'BKT-4407',
      customerId: 'c1',
    },
  ],
  invoiceNumbers: [],
}

let file: { columns: string[]; rows: string[][]; mapping: ColumnMapping }

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/import/Actions/importActions', () => ({
  dryRunImport: vi.fn(async (input: { options: ImportOptions }) => {
    const plan = planImport(file.rows, file.mapping, input.options, existing)
    return {
      success: true,
      data: {
        summary: plan.summary,
        limit: null,
        issues: [],
        page: { rows: plan.rows, total: plan.rows.length, page: 0, pageSize: 100 },
      },
    }
  }),
  commitImport: vi.fn(),
  getImportPlanPage: vi.fn(),
  getImportProgress: vi.fn(),
  getImportReportCsv: vi.fn(),
  suggestMappingWithAi: vi.fn(),
  undoImportBatch: vi.fn(),
}))

const analyze = (entity: string): AnalyzeResponse => ({
  token: 't',
  fileName: `${entity}.csv`,
  format: 'csv',
  sheetName: null,
  delimiter: ',',
  encoding: 'UTF-8',
  columns: file.columns,
  sampleRows: file.rows.slice(0, 3),
  totalRows: file.rows.length,
  suggestion: {
    mapping: file.mapping,
    source: {},
    presetId: null,
    dateFormat: 'MDY',
    decimalSeparator: '.',
  },
  fields: [],
  presets: [],
  defaults: { countryCode: '+1' },
  aiAvailable: false,
})

async function dryRun(entity: 'vehicles' | 'services'): Promise<void> {
  globalThis.fetch = vi.fn(
    async () => new Response(JSON.stringify(analyze(entity)))
  ) as typeof fetch
  const { container } = render(
    <CurrencySettingsProvider currencyCode="USD" currencyFormat="symbol">
      <ImportWizard open onOpenChange={vi.fn()} entity={entity} lockEntity />
    </CurrencySettingsProvider>
  )
  const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['x'], `${entity}.csv`)] } })
  fireEvent.click(await screen.findByRole('button', { name: /run dry run/i }))
  await screen.findByText(/will be created/i)
}

describe('the import dry run table', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('shows the customer a vehicle is linked to when the file names the owner by email', async () => {
    file = {
      columns: ['Owner E-mail', 'Vehicle', 'Tag'],
      rows: [['laura@example.com', '2021 Toyota Camry', 'HWB-4362']],
      mapping: { '0': 'customer.email', '1': 'vehicle.description', '2': 'vehicle.licensePlate' },
    }
    await dryRun('vehicles')
    const row = (await screen.findByText('2021 Toyota Camry')).closest('tr') as HTMLElement
    const cells = within(row).getAllByRole('cell')
    // Columns: #, action, vehicle, plate, owner, details.
    expect(cells[4]).toHaveTextContent('Laura Castillo')
  })

  it('shows what each past job cost as money', async () => {
    file = {
      columns: ['Date', 'Tag', 'Job', 'Total'],
      rows: [['03/14/2025', 'BKT-4407', 'State inspection', '$25.00']],
      mapping: {
        '0': 'service.date',
        '1': 'vehicle.licensePlate',
        '2': 'service.title',
        '3': 'service.total',
      },
    }
    await dryRun('services')
    const row = (await screen.findByText('State inspection')).closest('tr') as HTMLElement
    expect(within(row).getByText('$25.00')).toBeInTheDocument()
  })
})
