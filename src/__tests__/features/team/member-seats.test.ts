import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { organizationMember: { count: vi.fn() } },
}))
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn() }))

import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { memberSeats, seatsFrom } from '@/features/team/Lib/memberSeats'

describe('seatsFrom', () => {
  it('is full once every seat is taken', () => {
    expect(seatsFrom(1, 1)).toEqual({ used: 1, limit: 1, full: true })
  })

  it('stays full past the limit, as after a downgrade', () => {
    expect(seatsFrom(3, 1).full).toBe(true)
  })

  it('has room while a seat is free', () => {
    expect(seatsFrom(4, 5)).toEqual({ used: 4, limit: 5, full: false })
  })
})

describe('memberSeats', () => {
  beforeEach(() => {
    vi.mocked(db.organizationMember.count).mockReset()
    vi.mocked(getFeatures).mockReset()
  })

  it("counts the workshop's members against its plan", async () => {
    vi.mocked(db.organizationMember.count).mockResolvedValue(1)
    vi.mocked(getFeatures).mockResolvedValue({ maxUsers: 1 } as Awaited<
      ReturnType<typeof getFeatures>
    >)

    await expect(memberSeats('org-1')).resolves.toEqual({ used: 1, limit: 1, full: true })
    expect(db.organizationMember.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    })
    expect(getFeatures).toHaveBeenCalledWith('org-1')
  })
})
