"use server";

import { withSuperAdmin } from "@/lib/with-super-admin";
import { db } from "@/lib/db";
import { adminSearchSchema } from "../Schema/adminSchema";

export async function getOrganizations(input?: {
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  return withSuperAdmin(async () => {
    const { search, page, pageSize } = adminSearchSchema.parse(input ?? {});

    const where = search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : {};

    const [organizations, total] = await Promise.all([
      db.organization.findMany({
        where,
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: {
            select: { members: true },
          },
          members: {
            where: { role: "owner" },
            take: 1,
            select: {
              userId: true,
            },
          },
          subscription: {
            select: {
              status: true,
              plan: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.organization.count({ where }),
    ]);

    const ownerUserIds = organizations
      .flatMap((o) => o.members.map((m) => m.userId))
      .filter(Boolean);

    const owners = ownerUserIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: ownerUserIds } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const ownerMap = new Map(owners.map((o) => [o.id, o]));

    return {
      organizations: organizations.map((o) => {
        const ownerMember = o.members[0];
        const owner = ownerMember ? ownerMap.get(ownerMember.userId) : null;
        return {
          id: o.id,
          name: o.name,
          createdAt: o.createdAt.toISOString(),
          memberCount: o._count.members,
          ownerName: owner?.name ?? "N/A",
          ownerEmail: owner?.email ?? "N/A",
          subscriptionStatus: o.subscription?.status ?? null,
          subscriptionPlan: o.subscription?.plan?.name ?? null,
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}
