"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { sendStatusReportSchema } from "../Schema/statusReportSchema";
import { sendSmsToCustomer } from "@/features/sms/Actions/smsActions";
import { sendNotificationEmail } from "@/features/email/Actions/emailActions";
import { sendTelegramToCustomer } from "@/features/telegram/Actions/telegramActions";

export async function sendStatusReport(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const data = sendStatusReportSchema.parse(input);

      // Get the status report with service record and customer info
      const report = await db.statusReport.findFirst({
        where: { id: data.statusReportId, organizationId },
        include: {
          serviceRecord: {
            include: {
              vehicle: {
                include: {
                  customer: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      phone: true,
                      telegramChatId: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!report) throw new Error("Status report not found");

      const customer = report.serviceRecord.vehicle.customer;
      if (!customer) throw new Error("No customer linked to this vehicle");

      // Build the public URL for the status report
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const publicUrl = `${appUrl}/share/status-report/${organizationId}/${report.publicToken}`;

      const vehicle = report.serviceRecord.vehicle;
      const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
      const messageBody =
        data.customMessage ||
        `Hi ${customer.name}, we have a status update on your ${vehicleName}. View it here: ${publicUrl}`;

      const sentChannels: string[] = [];

      if (data.channels.email && customer.email) {
        await sendNotificationEmail({
          recipientEmail: customer.email,
          subject: `Vehicle Status Update - ${vehicleName}`,
          body: messageBody,
        });
        sentChannels.push("email");
      }

      if (data.channels.sms && customer.phone) {
        await sendSmsToCustomer({
          customerId: customer.id,
          body: messageBody,
          relatedEntityType: "status_report",
          relatedEntityId: report.id,
        });
        sentChannels.push("sms");
      }

      if (data.channels.telegram && customer.telegramChatId) {
        await sendTelegramToCustomer({
          customerId: customer.id,
          body: messageBody,
          relatedEntityType: "status_report",
          relatedEntityId: report.id,
        });
        sentChannels.push("telegram");
      }

      // Update the report status
      await db.statusReport.update({
        where: { id: report.id },
        data: {
          status: "sent",
          sentVia: sentChannels.join(","),
          sentAt: new Date(),
        },
      });

      return { sent: true, channels: sentChannels, statusReportId: data.statusReportId };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: "statusReport.send",
        entity: "StatusReport",
        entityId: result.statusReportId,
        message: `Sent status report via ${result.channels.join(", ")}`,
      }),
    }
  );
}
