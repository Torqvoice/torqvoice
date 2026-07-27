'use server'

import { withSuperAdmin } from '@/lib/with-super-admin'
import { db } from '@/lib/db'

export async function getUserDetails(userId: string) {
  return withSuperAdmin(async () => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        isSuperAdmin: true,
        createdAt: true,
        lastSeen: true,
        lastLogin: true,
        image: true,
      },
    })
    if (!user) return null

    const memberships = await db.organizationMember.findMany({
      where: { userId },
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            _count: {
              select: { members: true, vehicles: true },
            },
          },
        },
      },
    })

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      isSuperAdmin: user.isSuperAdmin,
      image: user.image,
      createdAt: user.createdAt.toISOString(),
      lastSeen: user.lastSeen?.toISOString() ?? null,
      lastLogin: user.lastLogin?.toISOString() ?? null,
      organizations: memberships
        .map((m) => ({
          id: m.organization.id,
          name: m.organization.name,
          createdAt: m.organization.createdAt.toISOString(),
          role: m.role,
          memberCount: m.organization._count.members,
          vehicleCount: m.organization._count.vehicles,
        }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    }
  })
}
