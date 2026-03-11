"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { Prisma } from "@prisma/client";

export async function getRecentAuditLogs(limit = 10) {
  return withAuth(async ({ organizationId }) => {
    const logs = await db.auditLog.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
    return logs;
  });
}

export async function getAuditLogsPaginated(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  action?: string;
  entity?: string;
  userId?: string;
}) {
  return withAuth(async ({ organizationId }) => {
    const page = params.page || 1;
    const pageSize = params.pageSize || 25;
    const skip = (page - 1) * pageSize;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { organizationId };

    if (params.search) {
      where.OR = [
        { action: { contains: params.search, mode: "insensitive" } },
        { entity: { contains: params.search, mode: "insensitive" } },
        { message: { contains: params.search, mode: "insensitive" } },
        { entityId: { contains: params.search, mode: "insensitive" } },
        { user: { name: { contains: params.search, mode: "insensitive" } } },
        { user: { email: { contains: params.search, mode: "insensitive" } } },
      ];
    }

    if (params.action && params.action !== "all") {
      where.action = params.action;
    }

    if (params.entity && params.entity !== "all") {
      where.entity = params.entity;
    }

    if (params.userId && params.userId !== "all") {
      where.userId = params.userId;
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { timestamp: "desc" },
        skip,
        take: pageSize,
      }),
      db.auditLog.count({ where }),
    ]);

    // Fetch distinct filter values for dropdowns
    const [actionValues, entityValues, userValues] = await Promise.all([
      db.auditLog.findMany({
        where: { organizationId },
        select: { action: true },
        distinct: ["action"],
        orderBy: { action: "asc" },
      }),
      db.auditLog.findMany({
        where: { organizationId, entity: { not: null } },
        select: { entity: true },
        distinct: ["entity"],
        orderBy: { entity: "asc" },
      }),
      db.auditLog.findMany({
        where: { organizationId },
        select: { userId: true, user: { select: { name: true, email: true } } },
        distinct: ["userId"],
      }),
    ]);

    return {
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      filters: {
        actions: actionValues.map((a) => a.action),
        entities: entityValues.map((e) => e.entity).filter(Boolean) as string[],
        users: userValues.map((u) => ({
          id: u.userId,
          name: u.user.name,
          email: u.user.email,
        })),
      },
    };
  });
}

