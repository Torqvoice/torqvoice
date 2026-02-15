"use server";

import { withSuperAdmin } from "@/lib/with-super-admin";
import { db } from "@/lib/db";
import { adminSearchSchema } from "../Schema/adminSchema";

export async function getUsers(input?: { search?: string; page?: number; pageSize?: number }) {
  return withSuperAdmin(async () => {
    const { search, page, pageSize } = adminSearchSchema.parse(input ?? {});

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          isSuperAdmin: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.user.count({ where }),
    ]);

    const userIds = users.map((u) => u.id);
    const membershipCounts = await db.organizationMember.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _count: true,
    });

    const countMap = new Map(membershipCounts.map((m) => [m.userId, m._count]));

    return {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        isSuperAdmin: u.isSuperAdmin,
        createdAt: u.createdAt.toISOString(),
        organizationCount: countMap.get(u.id) ?? 0,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}
