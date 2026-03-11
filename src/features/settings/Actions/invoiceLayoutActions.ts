"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import {
  type InvoiceLayoutConfig,
  invoiceLayoutConfigSchema,
  mergeWithDefaults,
  getDefaultInvoiceLayout,
} from "@/features/settings/Schema/invoiceLayoutSchema";

export async function getInvoiceLayoutConfig() {
  return withAuth(async ({ organizationId }) => {
    const setting = await db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: SETTING_KEYS.INVOICE_LAYOUT_CONFIG,
        },
      },
    });

    if (!setting?.value) {
      return getDefaultInvoiceLayout();
    }

    const parsed = JSON.parse(setting.value);
    return mergeWithDefaults(parsed);
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }] });
}

export async function saveInvoiceLayoutConfig(config: InvoiceLayoutConfig) {
  return withAuth(async ({ userId, organizationId }) => {
    const validated = invoiceLayoutConfigSchema.parse(config);
    const value = JSON.stringify(validated);

    await db.appSetting.upsert({
      where: {
        organizationId_key: {
          organizationId,
          key: SETTING_KEYS.INVOICE_LAYOUT_CONFIG,
        },
      },
      update: { value },
      create: {
        userId,
        organizationId,
        key: SETTING_KEYS.INVOICE_LAYOUT_CONFIG,
        value,
      },
    });

    revalidatePath("/settings/templates");
    return validated;
  }, {
    requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }],
    audit: () => ({
      action: "settings.updateInvoiceLayout",
      entity: "AppSetting",
      message: "Updated invoice layout configuration",
    }),
  });
}

export async function getQuoteLayoutConfig() {
  return withAuth(async ({ organizationId }) => {
    const setting = await db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: SETTING_KEYS.QUOTE_LAYOUT_CONFIG,
        },
      },
    });

    if (!setting?.value) {
      return getDefaultInvoiceLayout();
    }

    const parsed = JSON.parse(setting.value);
    return mergeWithDefaults(parsed);
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }] });
}

export async function saveQuoteLayoutConfig(config: InvoiceLayoutConfig) {
  return withAuth(async ({ userId, organizationId }) => {
    const validated = invoiceLayoutConfigSchema.parse(config);
    const value = JSON.stringify(validated);

    await db.appSetting.upsert({
      where: {
        organizationId_key: {
          organizationId,
          key: SETTING_KEYS.QUOTE_LAYOUT_CONFIG,
        },
      },
      update: { value },
      create: {
        userId,
        organizationId,
        key: SETTING_KEYS.QUOTE_LAYOUT_CONFIG,
        value,
      },
    });

    revalidatePath("/settings/templates");
    return validated;
  }, {
    requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }],
    audit: () => ({
      action: "settings.updateQuoteLayout",
      entity: "AppSetting",
      message: "Updated quote layout configuration",
    }),
  });
}
