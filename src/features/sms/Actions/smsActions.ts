"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { sendOrgSms, getOrgSmsPhoneNumber } from "@/lib/sms";
import { requireFeature } from "@/lib/features";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { SMS_TEMPLATE_DEFAULTS } from "@/lib/sms-templates";

export async function sendSmsToCustomer(input: {
  customerId: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, "sms");

      const customer = await db.customer.findFirst({
        where: { id: input.customerId, organizationId },
        select: { id: true, phone: true, name: true },
      });

      if (!customer) throw new Error("Customer not found");
      if (!customer.phone) throw new Error("Customer has no phone number");

      const fromNumber = await getOrgSmsPhoneNumber(organizationId);
      if (!fromNumber) throw new Error("SMS phone number is not configured");

      // Create the message record first
      const message = await db.smsMessage.create({
        data: {
          direction: "outbound",
          fromNumber,
          toNumber: customer.phone,
          body: input.body,
          status: "queued",
          organizationId,
          customerId: customer.id,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
        },
      });

      try {
        const result = await sendOrgSms(organizationId, {
          to: customer.phone,
          body: input.body,
        });

        await db.smsMessage.update({
          where: { id: message.id },
          data: {
            status: "sent",
            providerMsgId: result.providerMsgId,
          },
        });

        return { id: message.id, status: "sent" as const };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        await db.smsMessage.update({
          where: { id: message.id },
          data: { status: "failed", errorMessage },
        });

        throw new Error(`Failed to send SMS: ${errorMessage}`);
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.CUSTOMERS },
      ],
    },
  );
}

export async function getConversation(
  customerId: string,
  cursor?: string,
  limit: number = 50,
) {
  return withAuth(
    async ({ organizationId }) => {
      const messages = await db.smsMessage.findMany({
        where: {
          organizationId,
          customerId,
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          direction: true,
          body: true,
          status: true,
          createdAt: true,
          fromNumber: true,
          toNumber: true,
        },
      });

      const hasMore = messages.length > limit;
      const items = hasMore ? messages.slice(0, limit) : messages;

      return {
        messages: items.reverse(),
        nextCursor: hasMore ? items[items.length - 1]?.id : null,
      };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    },
  );
}

export async function deleteSmsMessage(messageId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const message = await db.smsMessage.findFirst({
        where: { id: messageId, organizationId },
      });
      if (!message) throw new Error("Message not found");

      await db.smsMessage.delete({ where: { id: messageId } });
      return { deleted: true };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS },
      ],
    },
  );
}

export async function deleteConversation(customerId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const customer = await db.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { id: true },
      });
      if (!customer) throw new Error("Customer not found");

      const { count } = await db.smsMessage.deleteMany({
        where: { organizationId, customerId },
      });

      return { deleted: count };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS },
      ],
    },
  );
}

export async function getSmsTemplates() {
  return withAuth(
    async ({ organizationId, userId }) => {
      const smsKeys = [
        SETTING_KEYS.SMS_TEMPLATE_INVOICE_READY,
        SETTING_KEYS.SMS_TEMPLATE_QUOTE_READY,
        SETTING_KEYS.SMS_TEMPLATE_INSPECTION_READY,
        SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS,
        SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS,
        SETTING_KEYS.SMS_TEMPLATE_STATUS_READY,
        SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED,
        SETTING_KEYS.SMS_TEMPLATE_PAYMENT_RECEIVED,
      ];
      const [settings, org, user] = await Promise.all([
        db.appSetting.findMany({
          where: { organizationId, key: { in: smsKeys } },
        }),
        db.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        }),
        db.user.findUnique({
          where: { id: userId },
          select: { name: true },
        }),
      ]);

      const templates: Record<string, string> = {};
      for (const key of smsKeys) {
        const found = settings.find((s) => s.key === key);
        templates[key] = found?.value || SMS_TEMPLATE_DEFAULTS[key] || "";
      }
      return {
        templates,
        companyName: org?.name || "",
        currentUser: user?.name || "",
      };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    },
  );
}

export async function getRecentSmsThreads(offset: number = 0, limit: number = 50) {
  return withAuth(
    async ({ organizationId }) => {
      // Fetch one extra to detect if there are more
      const customers = await db.customer.findMany({
        where: {
          organizationId,
          smsMessages: { some: {} },
        },
        select: {
          id: true,
          name: true,
          phone: true,
          smsMessages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              body: true,
              direction: true,
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: {
          smsMessages: { _count: "desc" },
        },
        skip: offset,
        take: limit + 1,
      });

      const filtered = customers.filter((c) => c.smsMessages.length > 0);
      const hasMore = filtered.length > limit;
      const items = hasMore ? filtered.slice(0, limit) : filtered;

      const threads = items
        .map((c) => ({
          customerId: c.id,
          customerName: c.name,
          customerPhone: c.phone,
          lastMessage: c.smsMessages[0],
        }))
        .sort(
          (a, b) =>
            new Date(b.lastMessage.createdAt).getTime() -
            new Date(a.lastMessage.createdAt).getTime(),
        );

      return { threads, hasMore };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    },
  );
}
