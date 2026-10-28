import { beforeEach, describe, expect, it, vi } from 'vitest'

const lookupVehicle = vi.fn()
vi.mock('@/features/integrations/Lib/connections', () => ({
  loadConnection: vi.fn(async () => ({
    ctx: { connection: { organizationId: 'org1' } },
    server: { manifest: { id: 'checkcardetails', name: 'Check Car Details' }, lookupVehicle },
  })),
}))
vi.mock('@/lib/db', () => ({
  db: { appSetting: { findUnique: vi.fn() } },
}))

import { askRegistry } from '@/features/integrations/Lib/vehicle-lookup'
import { db } from '@/lib/db'

function workshopUnit(value: string | null) {
  vi.mocked(db.appSetting.findUnique).mockResolvedValue(
    (value === null ? null : { value }) as never
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // A 649 cc motorcycle, as a registry answers it.
  lookupVehicle.mockResolvedValue({ make: 'Kawasaki', engineSize: '0.6 L', engineCc: 649 })
})

describe('askRegistry writes engine size in the workshop unit', () => {
  it('writes cubic centimetres for a workshop that chose them', async () => {
    workshopUnit('cc')
    const { result } = await askRegistry('conn1', { plate: 'EA65AMX' })
    expect(result?.engineSize).toBe('649 cc')
  })

  it('writes exact litres by default, never a rounded 0.6 L', async () => {
    workshopUnit(null)
    const { result } = await askRegistry('conn1', { plate: 'EA65AMX' })
    expect(result?.engineSize).toBe('0.649 L')
  })

  it("keeps the registry's own text when it has no exact figure", async () => {
    workshopUnit('cc')
    lookupVehicle.mockResolvedValue({ make: 'Ford', engineSize: '3.0' })
    const { result } = await askRegistry('conn1', { vin: '1FA6P8TH0J5100000' })
    expect(result?.engineSize).toBe('3.0')
    expect(db.appSetting.findUnique).not.toHaveBeenCalled()
  })
})
