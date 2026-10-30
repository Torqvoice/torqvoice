/**
 * @vitest-environment node
 *
 * The transaction client a restore writes through refuses any call that
 * could reach another workshop: a delete or update that does not name the
 * organisation, a create that stamps another one, an update by id alone.
 * Checked on the call as written, so it needs no database.
 */
import { describe, expect, it, vi } from 'vitest'
import { assertTenantScopedCall, TenantGuardError, tenantScoped } from '@/lib/backup/tenant-guard'

const ORG = 'org-a'

describe('assertTenantScopedCall', () => {
  it('lets a correct delete, update, create and read through', () => {
    const ok = [
      ['customer', 'deleteMany', { where: { organizationId: ORG } }],
      ['serviceRecord', 'deleteMany', { where: { organizationId: ORG, vehicleId: null } }],
      [
        'serviceRecord',
        'updateMany',
        { where: { id: 's1', organizationId: ORG }, data: { inspectionId: 'i1' } },
      ],
      ['customer', 'update', { where: { id: 'c1', organizationId: ORG }, data: {} }],
      ['customer', 'create', { data: { id: 'c1', name: 'Kari', organizationId: ORG } }],
      [
        'customer',
        'createMany',
        {
          data: [
            { id: 'c1', organizationId: ORG },
            { id: 'c2', organizationId: ORG },
          ],
        },
      ],
      ['customer', 'createMany', { data: [] }],
      // A child row has no organisation column; its parent id is checked elsewhere.
      ['servicePart', 'createMany', { data: [{ id: 'p1', serviceRecordId: 's1' }] }],
      ['customer', 'findMany', { where: { id: { in: ['x'] } } }],
      ['appSetting', 'findMany', { where: { organizationId: ORG } }],
      // A child's delete names the organisation through its parent.
      ['servicePart', 'deleteMany', { where: { serviceRecord: { organizationId: ORG } } }],
    ] as const
    for (const [delegate, op, args] of ok) {
      expect(
        () => assertTenantScopedCall(delegate, op, args, ORG),
        `${delegate}.${op}`
      ).not.toThrow()
    }
  })

  it('refuses a delete without the organisation', () => {
    expect(() => assertTenantScopedCall('customer', 'deleteMany', {}, ORG)).toThrow(
      TenantGuardError
    )
    expect(() =>
      assertTenantScopedCall('customer', 'deleteMany', { where: { vehicleId: null } }, ORG)
    ).toThrow(/must name the organisation/)
  })

  it('refuses an update by id alone', () => {
    expect(() =>
      assertTenantScopedCall('customer', 'update', { where: { id: 'c1' }, data: {} }, ORG)
    ).toThrow(/must name the organisation/)
    expect(() =>
      assertTenantScopedCall('quote', 'updateMany', { where: { id: 'q1' }, data: {} }, ORG)
    ).toThrow(/must name the organisation/)
  })

  it('refuses a where that names another organisation, even beside the right one', () => {
    expect(() =>
      assertTenantScopedCall('customer', 'deleteMany', { where: { organizationId: 'org-b' } }, ORG)
    ).toThrow(/another organisation/)
    expect(() =>
      assertTenantScopedCall(
        'customer',
        'deleteMany',
        { where: { OR: [{ organizationId: ORG }, { organizationId: 'org-b' }] } },
        ORG
      )
    ).toThrow(/another organisation/)
  })

  it('refuses a create stamped with another organisation, or not stamped at all', () => {
    expect(() =>
      assertTenantScopedCall(
        'customer',
        'create',
        { data: { id: 'c1', organizationId: 'org-b' } },
        ORG
      )
    ).toThrow(/stamps another organisation/)
    expect(() =>
      assertTenantScopedCall(
        'customer',
        'createMany',
        {
          data: [
            { id: 'c1', organizationId: ORG },
            { id: 'c2', organizationId: 'org-b' },
          ],
        },
        ORG
      )
    ).toThrow(/stamps another organisation/)
    expect(() =>
      assertTenantScopedCall('customer', 'createMany', { data: [{ id: 'c1' }] }, ORG)
    ).toThrow(/does not stamp/)
    expect(() =>
      assertTenantScopedCall('vehicle', 'create', { data: { id: 'v1', organizationId: null } }, ORG)
    ).toThrow(/stamps another organisation/)
  })

  it('refuses an upsert whose create half is wrong', () => {
    expect(() =>
      assertTenantScopedCall(
        'customer',
        'upsert',
        { where: { id: 'c1', organizationId: ORG }, create: { id: 'c1' }, update: {} },
        ORG
      )
    ).toThrow(/does not stamp/)
  })

  it('refuses an operation the restore has no business with', () => {
    expect(() => assertTenantScopedCall('customer', 'executeRaw', {}, ORG)).toThrow(
      /not allowed in a restore/
    )
  })
})

describe('tenantScoped', () => {
  it('checks every call and passes the good ones through', async () => {
    const createMany = vi.fn(async (_args: unknown) => ({ count: 1 }))
    const deleteMany = vi.fn(async (_args: unknown) => ({ count: 1 }))
    const tx = {
      customer: { createMany, deleteMany },
      $executeRaw: vi.fn(),
    }
    const guarded = tenantScoped(tx, ORG)

    await guarded.customer.deleteMany({ where: { organizationId: ORG } })
    await guarded.customer.createMany({ data: [{ id: 'c1', organizationId: ORG }] })
    expect(deleteMany).toHaveBeenCalledWith({ where: { organizationId: ORG } })
    expect(createMany).toHaveBeenCalledWith({ data: [{ id: 'c1', organizationId: ORG }] })

    await expect(
      guarded.customer.createMany({ data: [{ id: 'c2', organizationId: 'org-b' }] })
    ).rejects.toThrow(TenantGuardError)
    expect(createMany).toHaveBeenCalledTimes(1)
    await expect(guarded.customer.deleteMany({})).rejects.toThrow(TenantGuardError)
    expect(deleteMany).toHaveBeenCalledTimes(1)

    // The same wrapper for the same delegate, and `$` members untouched.
    expect(guarded.customer).toBe(guarded.customer)
    expect(guarded.$executeRaw).toBe(tx.$executeRaw)
  })
})
