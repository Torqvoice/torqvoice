'use server'

import { withSuperAdmin } from '@/lib/with-super-admin'
import { db } from '@/lib/db'

export async function getOrganizationDetails(organizationId: string) {
  return withSuperAdmin(async () => {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        subscription: {
          select: {
            status: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            plan: { select: { name: true } },
          },
        },
        _count: {
          select: {
            members: true,
            vehicles: true,
            customers: true,
            quotes: true,
            inventoryParts: true,
          },
        },
      },
    })
    if (!org) return null

    // Service records and inspections are linked via Vehicle.organizationId
    const [serviceRecordCount, inspectionCount, members] = await Promise.all([
      db.serviceRecord.count({ where: { vehicle: { organizationId } } }),
      db.inspection.count({ where: { vehicle: { organizationId } } }),
      db.organizationMember.findMany({
        where: { organizationId },
        select: {
          role: true,
          user: {
            select: { id: true, name: true, email: true, lastSeen: true },
          },
        },
      }),
    ])

    const owner = members.find((m) => m.role === 'owner') ?? members[0] ?? null

    return {
      id: org.id,
      name: org.name,
      createdAt: org.createdAt.toISOString(),
      subscription: org.subscription
        ? {
            status: org.subscription.status,
            planName: org.subscription.plan.name,
            currentPeriodEnd: org.subscription.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: org.subscription.cancelAtPeriodEnd,
          }
        : null,
      stats: {
        members: org._count.members,
        vehicles: org._count.vehicles,
        customers: org._count.customers,
        workOrders: serviceRecordCount,
        quotes: org._count.quotes,
        inspections: inspectionCount,
        inventoryParts: org._count.inventoryParts,
      },
      owner: owner?.user
        ? {
            id: owner.user.id,
            name: owner.user.name,
            email: owner.user.email,
            role: owner.role,
          }
        : null,
      members: members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        lastSeen: m.user.lastSeen?.toISOString() ?? null,
      })),
    }
  })
}
