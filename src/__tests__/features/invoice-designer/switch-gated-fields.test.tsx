/**
 * The Reference / PO, the fleet number and the meter readings in the
 * designer. Each is behind a workshop switch, so a design shows it unless it
 * says not: the field list offers it switched on to a workshop that has the
 * switch on, and the canvas and the gallery's pictures, drawn from the same
 * sample a workshop with the switch off gets without those values, look
 * exactly as they did.
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CustomerReferenceProvider } from '@/components/customer-reference-context'
import { FleetNumberProvider } from '@/components/fleet-number-context'
import { MeterTypesProvider } from '@/components/meter-types-context'
import { DesignerInspector } from '@/features/invoice-designer/Components/DesignerInspector'
import { specForDesign, specForPreset } from '@/features/invoice-designer/Components/presetSpec'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import type { DocumentType } from '@/features/invoice-designer/Components/types'
import { sectionFields } from '@/features/invoice-designer/Spec/buildSpec'
import {
  DESIGNER_LAYOUT_VERSION,
  type InvoiceLayoutConfig,
  SWITCH_GATED_FIELDS,
  fieldShownUnasked,
  getDefaultInvoiceLayout,
  getDefaultLayout,
  unmentionedShownFields,
  withUnmentionedSwitchGatedOff,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { buildLayoutFromPreset, presetsFor } from '@/features/settings/Schema/layoutPresets'

const GATED = ['customer_reference', 'fleet_number', 'meter_readings']

/** A design saved before the three existed: its lists name every other line. */
function savedBefore(layout: InvoiceLayoutConfig): InvoiceLayoutConfig {
  return {
    ...layout,
    version: DESIGNER_LAYOUT_VERSION,
    sections: layout.sections.map((s) =>
      s.fields ? { ...s, fields: s.fields.filter((f) => !GATED.includes(f.id)) } : s
    ),
  }
}

/** The same design with the three stored as off, as a workshop that switched them off saves it. */
function storedOff(layout: InvoiceLayoutConfig): InvoiceLayoutConfig {
  return {
    ...layout,
    sections: layout.sections.map((s) =>
      s.fields
        ? {
            ...s,
            fields: s.fields.map((f) => (GATED.includes(f.id) ? { ...f, visible: false } : f)),
          }
        : s
    ),
  }
}

describe('the rule', () => {
  it('covers the reference, the fleet number and the readings, and leaves the photo opt-in', () => {
    expect(SWITCH_GATED_FIELDS).toEqual({
      customer: ['customer_reference'],
      vehicle: ['fleet_number', 'meter_readings'],
    })
    expect(fieldShownUnasked('vehicle', 'vehicle_photo')).toBe(false)
    expect(fieldShownUnasked('vehicle', 'fleet_number')).toBe(true)
    expect(fieldShownUnasked('vehicle', 'fleet_number', 'certificate')).toBe(false)
  })

  it('appends them after the lines a saved design lists, in order, but not on a certificate', () => {
    const vehicle = savedBefore(getDefaultInvoiceLayout()).sections.find((s) => s.id === 'vehicle')
    if (!vehicle?.fields) throw new Error('no vehicle fields')
    expect(unmentionedShownFields('vehicle', vehicle.fields)).toEqual([
      'fleet_number',
      'meter_readings',
    ])
    expect(sectionFields(vehicle).slice(-2)).toEqual(['fleet_number', 'meter_readings'])
    expect(sectionFields(vehicle)).not.toContain('vehicle_photo')
    expect(unmentionedShownFields('vehicle', vehicle.fields, 'certificate')).toEqual([])
  })

  it('writes them in as off on a frozen copy that never mentioned them, and leaves the rest', () => {
    const frozen = withUnmentionedSwitchGatedOff(savedBefore(getDefaultInvoiceLayout()))
    const vehicle = frozen.sections.find((s) => s.id === 'vehicle')
    expect(sectionFields(vehicle!)).not.toContain('fleet_number')
    expect(sectionFields(vehicle!)).not.toContain('meter_readings')
    // A frozen copy that placed one keeps it.
    const placed = withUnmentionedSwitchGatedOff(getDefaultInvoiceLayout())
    expect(sectionFields(placed.sections.find((s) => s.id === 'customer')!)).toContain(
      'customer_reference'
    )
  })

  it('keeps every other line of a frozen block that never listed its lines', () => {
    const layout = getDefaultInvoiceLayout()
    const bare = {
      ...layout,
      sections: layout.sections.map((s) =>
        s.id === 'vehicle' || s.id === 'customer' ? { ...s, fields: undefined } : s
      ),
    }
    const frozen = withUnmentionedSwitchGatedOff(bare)
    for (const id of ['vehicle', 'customer']) {
      const before = sectionFields(bare.sections.find((s) => s.id === id)!)
      const after = sectionFields(frozen.sections.find((s) => s.id === id)!)
      const gated = ['customer_reference', 'fleet_number', 'meter_readings']
      expect(after).toEqual(before.filter((field) => !gated.includes(field)))
      expect(after.length).toBeGreaterThan(2)
    }
  })
})

describe('the designer’s field list', () => {
  const inspector = (
    layout: InvoiceLayoutConfig,
    selected: 'customer' | 'vehicle',
    enabled = true
  ) => {
    const noop = () => undefined
    return render(
      <CustomerReferenceProvider enabled={enabled}>
        <FleetNumberProvider enabled={enabled}>
          <MeterTypesProvider
            value={enabled ? [{ id: 'm1', name: 'Engine hours', unit: 'hrs' }] : []}
          >
            <DesignerInspector
              layout={layout}
              template={{} as never}
              customFields={[]}
              selected={selected}
              onSelect={noop}
              onSection={noop}
              onPlaceInFlow={noop}
              onSectionStyle={noop}
              onDocument={noop}
              onTemplate={noop}
              logoUrl=""
              ownLogo={false}
              onLogo={noop}
              sloganSet={false}
              paymentTermsSet={false}
              documentTitleDefault=""
              equipmentTitleDefault=""
              orgNumberLabel=""
              orgNumberLabelDefault=""
              onOrgNumberLabel={noop}
              signatureSet={false}
            />
          </MeterTypesProvider>
        </FleetNumberProvider>
      </CustomerReferenceProvider>
    )
  }
  const switchOf = (id: string) => within(screen.getByTestId(`field-row-${id}`)).getByRole('switch')

  it('lists them switched on in a design saved before they existed', () => {
    const layout = savedBefore(getDefaultInvoiceLayout())
    inspector(layout, 'customer')
    expect(switchOf('customer_reference')).toHaveAttribute('aria-checked', 'true')
  })

  it('lists the vehicle’s two switched on, and the photo still off', () => {
    inspector(savedBefore(getDefaultInvoiceLayout()), 'vehicle')
    expect(switchOf('fleet_number')).toHaveAttribute('aria-checked', 'true')
    expect(switchOf('meter_readings')).toHaveAttribute('aria-checked', 'true')
  })

  it('lists them on where the section never listed its fields', () => {
    const layout = getDefaultInvoiceLayout()
    const bare = {
      ...layout,
      sections: layout.sections.map((s) => (s.id === 'vehicle' ? { ...s, fields: undefined } : s)),
    }
    inspector(bare, 'vehicle')
    expect(switchOf('fleet_number')).toHaveAttribute('aria-checked', 'true')
  })

  it('lists them off in a design that switched them off', () => {
    inspector(storedOff(getDefaultInvoiceLayout()), 'vehicle')
    expect(switchOf('fleet_number')).toHaveAttribute('aria-checked', 'false')
    expect(switchOf('meter_readings')).toHaveAttribute('aria-checked', 'false')
  })

  it('lists none of them to a workshop with the switches off', () => {
    inspector(getDefaultInvoiceLayout(), 'vehicle', false)
    expect(screen.getByTestId('field-row-license_plate')).toBeInTheDocument()
    expect(screen.queryByTestId('field-row-fleet_number')).not.toBeInTheDocument()
    expect(screen.queryByTestId('field-row-meter_readings')).not.toBeInTheDocument()
  })

  it('lists the certificate’s fleet number off in a design saved before it existed', () => {
    inspector(savedBefore(getDefaultLayout('certificate')), 'vehicle')
    expect(switchOf('fleet_number')).toHaveAttribute('aria-checked', 'false')
  })
})

describe('the canvas and the gallery', () => {
  const sample = (docType: DocumentType, on: boolean) =>
    buildSampleData(
      {
        name: 'Shop',
        address: '',
        phone: '',
        email: '',
        slogan: '',
        orgNumber: '',
        paymentTerms: '',
        logoUrl: '',
        customerReferenceEnabled: on,
        fleetNumberEnabled: on,
        meterTypes: on ? [{ id: 'm1', name: 'Engine hours', unit: 'hrs' }] : [],
      } as never,
      [],
      ((key: string) => key) as never,
      {},
      docType
    )
  const SAMPLE_VALUES = ['PO-48213', 'T-208', 'Engine hours']
  const DOCS: DocumentType[] = ['invoice', 'quote', 'work_order', 'certificate']

  it('carry no sample reference, number or reading for a workshop with the switches off', () => {
    for (const docType of DOCS) {
      const fields = sample(docType, false).fields
      for (const id of GATED) expect(fields[id] ?? '', `${docType} ${id}`).toBe('')
    }
  })

  it('draw every starting point exactly as with the lines off, for a workshop with the switches off', () => {
    for (const docType of DOCS) {
      const data = sample(docType, false)
      for (const preset of presetsFor(docType)) {
        const shown = JSON.stringify(specForPreset(preset, data))
        for (const text of SAMPLE_VALUES) expect(shown, `${preset.id}`).not.toContain(text)
        const design = { layout: storedOff(buildLayoutFromPreset(preset)), template: {} }
        const off = JSON.stringify(specForDesign(design as never, data))
        const asIs = JSON.stringify(
          specForDesign({ layout: buildLayoutFromPreset(preset), template: {} } as never, data)
        )
        expect(asIs, preset.id).toBe(off)
      }
    }
  })

  it('draw a saved design exactly as with the lines off, for a workshop with the switches off', () => {
    const data = sample('invoice', false)
    const design = { layout: savedBefore(getDefaultInvoiceLayout()), template: {} } as never
    const off = { layout: storedOff(getDefaultInvoiceLayout()), template: {} } as never
    expect(JSON.stringify(specForDesign(design, data))).toBe(
      JSON.stringify(specForDesign(off, data))
    )
  })

  it('draw the lines on the invoice’s starting points for a workshop with the switches on', () => {
    const data = sample('invoice', true)
    for (const preset of presetsFor('invoice')) {
      const shown = JSON.stringify(specForPreset(preset, data))
      for (const text of SAMPLE_VALUES) expect(shown, preset.id).toContain(text)
    }
  })

  it('leave the certificate’s fleet number off, even for a workshop with the switch on', () => {
    const data = sample('certificate', true)
    for (const preset of presetsFor('certificate')) {
      expect(JSON.stringify(specForPreset(preset, data)), preset.id).not.toContain('T-208')
    }
  })
})
