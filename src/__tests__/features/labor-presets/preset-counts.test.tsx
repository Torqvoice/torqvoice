/**
 * The counts beside a labor preset read as English: "1 item", not "1 items",
 * and a quarter hour is not rounded away ("1.25h", not "1.3h").
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  type LaborPresetOption,
  LaborPresetPickerDialog,
} from '@/features/labor-presets/Components/LaborPresetPickerDialog'
import { presetTotals } from '@/features/labor-presets/Lib/presetTotals'

const preset = (over: Partial<LaborPresetOption>): LaborPresetOption => ({
  id: 'p-1',
  name: 'ZZ Brake service',
  description: null,
  items: [],
  parts: [],
  ...over,
})

const item = (hours: number, pricingType = 'hourly', sortOrder = 0) => ({
  description: 'ZZ line',
  hours,
  rate: 90,
  pricingType,
  sortOrder,
})

const part = {
  name: 'ZZ pad set',
  partNumber: null,
  quantity: 1,
  unit: null,
  unitPrice: 40,
  inventoryPartId: null,
  sortOrder: 0,
}

function showPicker(presets: LaborPresetOption[]) {
  render(
    <LaborPresetPickerDialog
      open
      onOpenChange={vi.fn()}
      laborPresets={presets}
      onSelectPreset={vi.fn()}
    />
  )
}

describe('the labor preset picker', () => {
  it('counts one item, one part and one unit in the singular', () => {
    showPicker([preset({ items: [item(1, 'service')], parts: [part] })])
    expect(screen.getByText('1 item')).toBeInTheDocument()
    expect(screen.getByText('1 part')).toBeInTheDocument()
    expect(screen.getByText('1 unit')).toBeInTheDocument()
  })

  it('counts more than one in the plural', () => {
    showPicker([
      preset({ items: [item(1, 'service'), item(1, 'service', 1)], parts: [part, part] }),
    ])
    expect(screen.getByText('2 items')).toBeInTheDocument()
    expect(screen.getByText('2 parts')).toBeInTheDocument()
    expect(screen.getByText('2 units')).toBeInTheDocument()
  })

  it('shows a quarter hour as it is', () => {
    showPicker([preset({ items: [item(0.75), item(0.5, 'hourly', 1)] })])
    expect(screen.getByText('1.25h total')).toBeInTheDocument()
  })
})

describe('a preset’s totals', () => {
  it('keeps two decimals and drops float noise', () => {
    expect(presetTotals([item(0.1), item(0.2)])).toEqual({ totalHours: 0.3, totalUnits: 0 })
    expect(presetTotals([item(1.125), item(0.004)])).toEqual({ totalHours: 1.13, totalUnits: 0 })
    expect(presetTotals([item(2, 'service'), item(1.25)])).toEqual({
      totalHours: 1.25,
      totalUnits: 2,
    })
  })
})
