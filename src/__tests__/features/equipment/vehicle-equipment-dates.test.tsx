/**
 * The Equipment card writes its dates the way the workshop writes dates, as
 * the rest of the vehicle page does. A day off a plate or a certificate is
 * that day on any clock; the day an item left is the workshop's day.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/equipment/Actions/equipmentItemActions', () => ({
  deleteEquipmentItem: vi.fn(),
  refitEquipmentItem: vi.fn(),
  removeEquipmentItem: vi.fn(),
  addEquipmentItem: vi.fn(),
  updateEquipmentItem: vi.fn(),
  discardEquipmentReport: vi.fn(),
}))
vi.mock('@/features/settings/Actions/timezoneActions', () => ({
  adoptDetectedTimezone: vi.fn(async () => undefined),
}))
vi.mock('@/features/meters/Components/VehicleMeters', () => ({ VehicleMeters: () => null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { ConfirmProvider } from '@/components/confirm-dialog'
import { DateSettingsProvider } from '@/components/date-settings-context'
import type {
  EquipmentItemView,
  VehicleEquipmentView,
} from '@/features/equipment/Lib/equipment.server'
import { VehicleEquipment } from '@/features/equipment/Components/VehicleEquipment'

// A browser far west of UTC: a day read at UTC midnight would show the day before.
const originalTz = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles'
})
afterAll(() => {
  process.env.TZ = originalTz
})

const item = (extra: Partial<EquipmentItemView> = {}): EquipmentItemView => ({
  id: 'item-1',
  typeId: 'et-crane',
  typeName: 'Crane',
  label: 'Crane HIAB X-HiPro 192',
  make: 'HIAB',
  model: 'X-HiPro 192',
  serialNumber: '4471',
  manufactureYear: 2019,
  manufactureDay: '2019-05-14',
  installDate: '2020-01-31',
  notes: null,
  ratedCapacity: null,
  nextExaminationDue: '2027-03-01',
  lastExaminedAt: '2026-03-01',
  certificateReference: null,
  report: null,
  removedAt: null,
  vehicleId: 'veh-A',
  meters: [],
  ...extra,
})

const equipment: VehicleEquipmentView = {
  types: [{ id: 'et-crane', name: 'Crane', isActive: true }],
  meterTypes: [],
  items: [item()],
  history: [
    {
      fittingId: 'fit-old',
      item: item({ id: 'item-2', label: 'Tail lift', removedAt: '2026-11-19T22:30:00.000Z' }),
      fittedAt: '2024-01-01T10:00:00.000Z',
      // 11:30 on 20 November in Auckland, still the 19th in UTC.
      endedAt: '2026-11-19T22:30:00.000Z',
      endReason: 'removed',
      movedTo: null,
    },
  ],
}

function renderCard() {
  render(
    <DateSettingsProvider dateFormat="dd/MM/yyyy" timezone="Pacific/Auckland">
      <ConfirmProvider>
        <VehicleEquipment vehicleId="veh-A" equipment={equipment} today="2026-11-20" />
      </ConfirmProvider>
    </DateSettingsProvider>
  )
}

describe('the Equipment card on the vehicle page', () => {
  it('writes the examination due date in the workshop’s date format', () => {
    renderCard()
    expect(screen.getByTestId('equipment-examination')).toHaveTextContent('01/03/2027')
  })

  it('writes the days in an item’s details in the workshop’s date format, on their own day', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Show details of Crane HIAB X-HiPro 192' }))
    expect(screen.getByText('14/05/2019')).toBeInTheDocument()
    expect(screen.getByText('31/01/2020')).toBeInTheDocument()
    expect(screen.getByText('01/03/2026')).toBeInTheDocument()
    expect(screen.queryByText(/May 14, 2019/)).not.toBeInTheDocument()
  })

  it('writes the day an item left on the workshop’s calendar and in its format', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: /Earlier equipment/ }))
    expect(screen.getByTestId('equipment-history')).toHaveTextContent('20/11/2026')
  })
})
