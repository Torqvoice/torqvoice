/**
 * The search inside the document designer. Somebody types "PO" and is shown
 * the customer's reference with the section it lives in; choosing it opens
 * that section and points the field's row out, with the keyboard on its
 * switch. The search only shows the way: a field that is off stays off, and
 * one the workshop has not switched on in settings is still found, with
 * where to switch it on.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { CustomerReferenceProvider } from '@/components/customer-reference-context'
import { DateSettingsProvider } from '@/components/date-settings-context'
import { FleetNumberProvider } from '@/components/fleet-number-context'
import { MeterTypesProvider } from '@/components/meter-types-context'
import { InvoiceDesigner } from '@/features/invoice-designer/Components/InvoiceDesigner'
import type { DesignerTemplate, DocumentType } from '@/features/invoice-designer/Components/types'
import {
  buildDesignerSearchIndex,
  DOCUMENT_STYLING_GROUPS,
  searchDesigner,
} from '@/features/invoice-designer/Lib/designerSearch'
import { fieldOffered, resolveSectionFields } from '@/features/invoice-designer/Lib/sectionFields'
import {
  getDefaultLayout,
  SECTIONS_WITH_FIELDS,
} from '@/features/settings/Schema/invoiceLayoutSchema'

const noop = () => undefined
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)
Element.prototype.scrollIntoView = noop

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/settings/Actions/timezoneActions', () => ({ adoptDetectedTimezone: vi.fn() }))
vi.mock('@/features/settings/Actions/settingsActions', () => ({ setSettings: vi.fn() }))
vi.mock('@/features/settings/Actions/invoiceLayoutActions', () => ({
  saveInvoiceLayoutConfig: vi.fn(),
  saveQuoteLayoutConfig: vi.fn(),
  saveCertificateLayoutConfig: vi.fn(),
  saveWorkOrderLayoutConfig: vi.fn(),
}))
vi.mock('@/features/invoice-designer/Actions/documentDesignActions', () => ({
  saveDocumentDesign: vi.fn(),
  getDocumentDesignUsage: vi.fn(),
  deleteDocumentDesign: vi.fn(),
  applyDocumentDesign: vi.fn(),
  setDocumentDesignRule: vi.fn(),
}))

const template: DesignerTemplate = {
  primaryColor: '#475569',
  fontFamily: 'Helvetica',
  headerStyle: 'compact',
  logoSize: 100,
  logoUrl: '',
  backgroundColor: '',
  textColor: '',
  companyTextColor: '',
  frameBorderColor: '',
  frameShadow: 'true',
  frameRadius: 0,
  frameSide: 'left',
}

const costCentre = { id: 'cf-cost', label: 'Cost centre', name: 'cost_centre', isActive: true }

function renderDesigner({
  reference = true,
  fleet = true,
  documentType = 'invoice' as DocumentType,
} = {}) {
  return render(
    <CustomerReferenceProvider enabled={reference}>
      <FleetNumberProvider enabled={fleet}>
        <MeterTypesProvider value={[]}>
          <DateSettingsProvider dateFormat="yyyy-MM-dd" timezone="UTC">
            <ConfirmProvider>
              <InvoiceDesigner
                initialDocumentType={documentType}
                initialView="designer"
                invoiceTemplate={template}
                quoteTemplate={template}
                initialSavedDesigns={[]}
                workshop={{
                  name: 'Fjord Bil',
                  address: '',
                  phone: '',
                  email: '',
                  slogan: '',
                  orgNumber: '',
                  paymentTerms: '',
                  logoUrl: '',
                }}
                customFields={[costCentre]}
              />
            </ConfirmProvider>
          </DateSettingsProvider>
        </MeterTypesProvider>
      </FleetNumberProvider>
    </CustomerReferenceProvider>
  )
}

const box = () => screen.getByRole('combobox', { name: 'Search the designer' })
/** The search's own list: the typeface picker has options of its own. */
const list = () => within(screen.getByRole('listbox', { name: 'Search results' }))
/** The result that reads as this, by the words on it. */
const result = (title: string) => {
  const found = list()
    .getAllByRole('option')
    .find((option) => option.textContent?.includes(title))
  if (!found) throw new Error(`no result reads "${title}"`)
  return found
}
const railButton = (id: string, name: string) =>
  within(screen.getByTestId(`rail-${id}`)).getByRole('button', { name })

vi.setConfig({ testTimeout: 30000 })

describe('searching the designer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the reference under Customer for "PO", whatever the case', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()

    await user.type(box(), 'PO')
    const options = list().getAllByRole('option')
    // The best match first: the field whose name carries the word itself.
    expect(options[0]).toHaveTextContent('Your reference / PO')
    expect(options[0]).toHaveTextContent('Customer')
    expect(options[0]).toHaveTextContent('Shown')

    await user.clear(box())
    await user.type(box(), 'purchase order')
    // Found by a word the label does not carry.
    expect(list().getAllByRole('option')[0]).toHaveTextContent('Your reference / PO')
  })

  it('opens Customer and marks the row when the result is chosen, and switches nothing', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()

    await user.type(box(), 'po')
    await user.click(result('Your reference / PO'))

    expect(railButton('customer', 'Customer')).toHaveAttribute('aria-current', 'true')
    const row = screen.getByTestId('field-row-customer_reference')
    expect(row).toHaveAttribute('data-search-marked', 'true')
    // No other row wears the mark.
    expect(screen.getByTestId('field-row-customer_name')).not.toHaveAttribute('data-search-marked')
    // The switch is as it was, and the keyboard is on it.
    const toggle = within(row).getByRole('switch', { name: 'Your reference / PO' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(toggle).toHaveFocus()
    // The list has gone and the box is empty for the next search.
    expect(box()).toHaveAttribute('aria-expanded', 'false')
    expect(box()).toHaveValue('')
  })

  it('lets the mark fade after a moment', () => {
    vi.useFakeTimers()
    renderDesigner()

    fireEvent.change(box(), { target: { value: 'po' } })
    fireEvent.click(result('Your reference / PO'))
    const row = () => screen.getByTestId('field-row-customer_reference')
    expect(row()).toHaveAttribute('data-search-marked', 'true')

    act(() => {
      vi.advanceTimersByTime(4100)
    })
    expect(row()).not.toHaveAttribute('data-search-marked')
    // The section stays open.
    expect(railButton('customer', 'Customer')).toHaveAttribute('aria-current', 'true')
  })

  it('leaves a field that is off as it is, and says so in the list', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()

    // Switched off by hand first.
    await user.click(railButton('customer', 'Customer'))
    await user.click(screen.getByTestId('field-customer_reference'))
    expect(screen.getByTestId('field-customer_reference')).toHaveAttribute('aria-checked', 'false')
    await user.click(railButton('vehicle', 'Vehicle'))

    await user.type(box(), 'po')
    const option = result('Your reference / PO')
    expect(option).toHaveTextContent('Off')
    await user.click(option)

    expect(railButton('customer', 'Customer')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByTestId('field-customer_reference')).toHaveAttribute('aria-checked', 'false')
  })

  it('still finds a field the workshop has not switched on, and says where to switch it on', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner({ reference: false })

    await user.type(box(), 'po')
    const option = result('Your reference / PO')
    expect(option).toHaveTextContent('Customer · Not switched on in Settings')
    expect(option).toHaveTextContent('Needs setting')
    await user.click(option)

    expect(railButton('customer', 'Customer')).toHaveAttribute('aria-current', 'true')
    // There is no row to switch: the note stands where it would be.
    expect(screen.queryByTestId('field-row-customer_reference')).not.toBeInTheDocument()
    const note = screen.getByTestId('field-needs-setting')
    expect(note).toHaveTextContent('Your reference / PO')
    expect(note).toHaveTextContent('Switch it on under Settings, Custom fields')
    const link = within(note).getByRole('link', { name: 'Open Settings' })
    expect(link).toHaveAttribute('href', '/settings/invoice?tab=customFields#reference-po')
    // A new tab, so a design in progress is not lost.
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveFocus()

    // Looking at another section puts the note away.
    await user.click(railButton('vehicle', 'Vehicle'))
    await user.click(railButton('customer', 'Customer'))
    expect(screen.queryByTestId('field-needs-setting')).not.toBeInTheDocument()
  })

  it('works from the keyboard alone, from the shortcut to the switch', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()

    // Somewhere else first, so there is a place to come back to.
    railButton('totals', 'Totals').focus()
    await user.keyboard('{Control>}k{/Control}')
    expect(box()).toHaveFocus()

    await user.keyboard('fleet')
    expect(box()).toHaveAttribute('aria-expanded', 'true')
    const first = list().getAllByRole('option')[0]
    expect(first).toHaveTextContent('Fleet / unit number')
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(box()).toHaveAttribute('aria-activedescendant', first.id)

    // Down past the end comes round to the top again.
    const count = list().getAllByRole('option').length
    for (let i = 0; i < count; i++) await user.keyboard('{ArrowDown}')
    expect(list().getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Enter}')
    expect(railButton('vehicle', 'Vehicle')).toHaveAttribute('aria-current', 'true')
    const toggle = screen.getByRole('switch', { name: 'Fleet / unit number' })
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    // Space on the switch is the person's own choice, not the search's.
    await user.keyboard(' ')
    expect(screen.getByRole('switch', { name: 'Fleet / unit number' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  it('opens on a slash, except where a slash is being typed, and Escape hands the keyboard back', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()

    const totals = railButton('totals', 'Totals')
    totals.focus()
    await user.keyboard('/')
    expect(box()).toHaveFocus()
    expect(box()).toHaveValue('')

    // Typed into the box, a slash is a slash.
    await user.keyboard('a/b')
    expect(box()).toHaveValue('a/b')

    await user.keyboard('{Escape}')
    expect(box()).toHaveValue('')
    expect(totals).toHaveFocus()
  })

  it('keeps to what carries the word, and still forgives a slip of the keys', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()
    const titles = () =>
      list()
        .getAllByRole('option')
        .map((option) => option.textContent ?? '')

    // "font" is the typeface, not the Footer Note its letters happen to be in.
    await user.type(box(), 'font')
    expect(titles().some((title) => title.includes('Typography'))).toBe(true)
    expect(titles().some((title) => title.includes('Footer Note'))).toBe(false)

    // Two letters start a word: "po" is not the middle of Typography.
    await user.clear(box())
    await user.type(box(), 'po')
    expect(titles().some((title) => title.includes('Typography'))).toBe(false)

    // A misspelling with nothing better to offer still finds its field.
    await user.clear(box())
    await user.type(box(), 'milage')
    expect(titles()[0]).toContain('Mileage')
  })

  it('says so when nothing matches', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()

    await user.type(box(), 'torque spec')
    expect(list().queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByTestId('designer-search-empty')).toHaveTextContent(
      'Nothing in this document matches "torque spec"'
    )
    // Enter with nothing to choose does nothing.
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('designer-search-empty')).toBeInTheDocument()
  })

  it('finds a section by name and takes the keyboard to it in the list', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()

    await user.type(box(), 'totals')
    await user.keyboard('{Enter}')
    expect(railButton('totals', 'Totals')).toHaveAttribute('aria-current', 'true')
    expect(railButton('totals', 'Totals')).toHaveFocus()
  })

  it('finds the document styling groups', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()
    await user.click(railButton('customer', 'Customer'))

    await user.type(box(), 'font')
    const option = result('Typography')
    expect(option).toHaveTextContent('Document styling')
    await user.click(option)

    // Back on the document's own settings, with the group pointed out.
    expect(screen.getByRole('button', { name: /Document styling/ })).toHaveAttribute(
      'aria-current',
      'true'
    )
    const marked = document.querySelector('[data-search-marked]')
    expect(marked).toHaveAttribute('data-search-target', 'styling:typography')
    expect(marked).toHaveTextContent('Typography')
  })

  it("points out a field of the workshop's own that no section has placed yet", async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()

    await user.type(box(), 'cost')
    const option = result('Cost centre')
    expect(option).toHaveTextContent('Your custom fields')
    expect(option).toHaveTextContent('Not placed')
    await user.click(option)

    // Nothing was open, so the customer's list is where it is shown.
    expect(railButton('customer', 'Customer')).toHaveAttribute('aria-current', 'true')
    const chip = screen.getByRole('button', { name: '+ Cost centre' })
    expect(chip).toHaveAttribute('data-search-marked', 'true')
    expect(chip).toHaveFocus()
    // Still only offered: the search placed nothing.
    expect(screen.queryByTestId('field-row-cf_cf-cost')).not.toBeInTheDocument()
  })

  it('searches the document that is open', async () => {
    const user = userEvent.setup({ delay: null })
    renderDesigner()

    // A certificate has no reference to print, so it has none to find.
    await user.click(screen.getByRole('button', { name: 'Inspection certificate' }))
    await user.type(box(), 'purchase order')
    expect(
      list()
        .queryAllByRole('option')
        .some((option) => option.textContent?.includes('Your reference'))
    ).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Work order' }))
    await user.clear(box())
    await user.type(box(), 'purchase order')
    expect(result('Your reference / PO')).toBeInTheDocument()
  })
})

describe('what the search knows', () => {
  const gates = {
    typeKeyEnabled: false,
    customerReferenceEnabled: true,
    fleetNumberEnabled: true,
    metersDefined: true,
  }
  const indexFor = (documentType: 'invoice' | 'quote' | 'certificate' | 'work_order') => {
    const rail = getDefaultLayout(documentType).sections
    return {
      rail,
      index: buildDesignerSearchIndex({
        rail,
        documentType,
        customFields: [],
        gates,
        framed: true,
        sectionName: (id) => `section ${id}`,
        fieldName: (fieldId, sectionId) => `${sectionId} ${fieldId}`,
        stylingName: (id) => `styling ${id}`,
        stylingContext: 'Document styling',
        customFieldContext: 'Your custom fields',
        aliases: () => undefined,
      }),
    }
  }

  it.each([
    'invoice',
    'quote',
    'certificate',
    'work_order',
  ] as const)('has every section of the rail and every row the inspector offers on a %s', (documentType) => {
    const { rail, index } = indexFor(documentType)
    const keys = new Set(index.entries.map((e) => e.item.key))
    for (const section of rail) {
      expect(keys).toContain(`section:${section.id}`)
      if (!SECTIONS_WITH_FIELDS.has(section.id)) continue
      const { resolvedFields } = resolveSectionFields(section, documentType, [])
      for (const field of resolvedFields) {
        if (!fieldOffered(section.id, field.id, documentType, gates)) continue
        expect(keys).toContain(`field:${section.id}:${field.id}`)
      }
    }
    for (const group of DOCUMENT_STYLING_GROUPS) expect(keys).toContain(`styling:${group.id}`)
  })

  it('keeps the type key to the workshops that record it', () => {
    const { index } = indexFor('invoice')
    expect(index.entries.some((e) => e.item.key === 'field:vehicle:hsn_tsn')).toBe(false)
  })

  it('finds nothing for nothing typed', () => {
    expect(searchDesigner(indexFor('invoice').index, '   ')).toEqual([])
  })
})
