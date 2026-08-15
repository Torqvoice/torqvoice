"use server";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { sanitizeConfig, type CustomWidget } from "../custom-cards/registry";
import {
  ENTITY_PERMISSION_SUBJECT,
  runEntityQuery,
  type CardRow,
} from "../custom-cards/server-registry";

const MAX_WIDGETS = 20;

function cleanName(name: unknown): string {
  const title = typeof name === "string" ? name.trim().slice(0, 60) : "";
  if (!title) throw new Error("Name is required");
  return title;
}

export async function createDashboardWidget(name: unknown, config: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const clean = sanitizeConfig(config);
    if (!clean) throw new Error("Invalid card configuration");
    const title = cleanName(name);

    const count = await db.dashboardWidget.count({ where: { userId, organizationId } });
    if (count >= MAX_WIDGETS) throw new Error("Card limit reached");

    const widget = await db.dashboardWidget.create({
      data: {
        name: title,
        config: clean as unknown as Prisma.InputJsonValue,
        userId,
        organizationId,
      },
    });
    revalidatePath("/");
    return { id: widget.id, name: widget.name, config: clean } satisfies CustomWidget;
  });
}

export async function updateDashboardWidget(id: string, name: unknown, config: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    const clean = sanitizeConfig(config);
    if (!clean) throw new Error("Invalid card configuration");
    const title = cleanName(name);

    const result = await db.dashboardWidget.updateMany({
      where: { id, userId, organizationId },
      data: { name: title, config: clean as unknown as Prisma.InputJsonValue },
    });
    if (result.count === 0) throw new Error("Card not found");
    revalidatePath("/");
    return { id, name: title, config: clean } satisfies CustomWidget;
  });
}

export async function deleteDashboardWidget(id: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const result = await db.dashboardWidget.deleteMany({
      where: { id, userId, organizationId },
    });
    if (result.count === 0) throw new Error("Card not found");
    revalidatePath("/");
    return { id };
  });
}

/**
 * Executes a widget's query. The widget must belong to the calling user in
 * their current organization; the inner withAuth enforces the READ
 * permission for the widget's entity, so a user who loses access to e.g.
 * inventory gets an error rather than data.
 */
export async function runDashboardWidget(id: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const widget = await db.dashboardWidget.findFirst({
      where: { id, userId, organizationId },
      select: { config: true },
    });
    if (!widget) throw new Error("Card not found");

    const config = sanitizeConfig(widget.config);
    if (!config) throw new Error("Invalid card configuration");

    const result = await withAuth(
      async ({ organizationId: orgId }) => runEntityQuery(config, orgId),
      {
        requiredPermissions: [
          {
            action: PermissionAction.READ,
            subject: ENTITY_PERMISSION_SUBJECT[config.entity],
          },
        ],
      }
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to run card");
    }
    return result.data satisfies CardRow[];
  });
}
