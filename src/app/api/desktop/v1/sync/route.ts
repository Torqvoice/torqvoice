import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";

export async function GET(request: Request) {
  return withDesktopAuth(request, async ({ organizationId }) => {
    const { searchParams } = new URL(request.url);
    const updatedSince = searchParams.get("updated_since");
    const since = updatedSince ? new Date(updatedSince) : null;

    const timestamp = new Date().toISOString();

    // Build where clause for incremental vs full sync
    const updatedFilter = since ? { updatedAt: { gt: since } } : {};
    const createdFilter = since ? { createdAt: { gt: since } } : {};

    // Query all entities in parallel
    const [
      customers,
      vehicles,
      serviceRecords,
      serviceParts,
      serviceLabor,
      serviceAttachments,
      payments,
      notes,
      reminders,
      fuelLogs,
      quotes,
      quoteParts,
      quoteLabor,
      quoteAttachments,
      inventoryParts,
      recurringInvoices,
      inspectionTemplates,
      inspectionTemplateSections,
      inspectionTemplateItems,
      inspections,
      inspectionItems,
      technicians,
      boardAssignments,
      appSettings,
      customFieldDefinitions,
      customFieldValues,
      smsMessages,
      serviceRequests,
      deletions,
    ] = await Promise.all([
      // customers
      db.customer.findMany({
        where: { organizationId, ...updatedFilter },
      }),
      // vehicles
      db.vehicle.findMany({
        where: { organizationId, ...updatedFilter },
      }),
      // serviceRecords (via vehicle)
      db.serviceRecord.findMany({
        where: { vehicle: { organizationId }, ...updatedFilter },
      }),
      // serviceParts (via service record → vehicle)
      db.servicePart.findMany({
        where: { serviceRecord: { vehicle: { organizationId } }, ...updatedFilter },
      }),
      // serviceLabor
      db.serviceLabor.findMany({
        where: { serviceRecord: { vehicle: { organizationId } }, ...updatedFilter },
      }),
      // serviceAttachments
      db.serviceAttachment.findMany({
        where: { serviceRecord: { vehicle: { organizationId } }, ...updatedFilter },
      }),
      // payments
      db.payment.findMany({
        where: { serviceRecord: { vehicle: { organizationId } }, ...updatedFilter },
      }),
      // notes
      db.note.findMany({
        where: { vehicle: { organizationId }, ...updatedFilter },
      }),
      // reminders
      db.reminder.findMany({
        where: { vehicle: { organizationId }, ...updatedFilter },
      }),
      // fuelLogs
      db.fuelLog.findMany({
        where: { vehicle: { organizationId }, ...updatedFilter },
      }),
      // quotes
      db.quote.findMany({
        where: { organizationId, ...updatedFilter },
      }),
      // quoteParts
      db.quotePart.findMany({
        where: { quote: { organizationId }, ...updatedFilter },
      }),
      // quoteLabor
      db.quoteLabor.findMany({
        where: { quote: { organizationId }, ...updatedFilter },
      }),
      // quoteAttachments
      db.quoteAttachment.findMany({
        where: { quote: { organizationId }, ...updatedFilter },
      }),
      // inventoryParts
      db.inventoryPart.findMany({
        where: { organizationId, ...updatedFilter },
      }),
      // recurringInvoices
      db.recurringInvoice.findMany({
        where: { vehicle: { organizationId }, ...updatedFilter },
      }),
      // inspectionTemplates
      db.inspectionTemplate.findMany({
        where: { organizationId, ...updatedFilter },
      }),
      // inspectionTemplateSections (no updatedAt, use createdAt filter or fetch all for template syncs)
      since
        ? db.inspectionTemplateSection.findMany({
            where: { template: { organizationId, updatedAt: { gt: since } } },
          })
        : db.inspectionTemplateSection.findMany({
            where: { template: { organizationId } },
          }),
      // inspectionTemplateItems
      since
        ? db.inspectionTemplateItem.findMany({
            where: { section: { template: { organizationId, updatedAt: { gt: since } } } },
          })
        : db.inspectionTemplateItem.findMany({
            where: { section: { template: { organizationId } } },
          }),
      // inspections
      db.inspection.findMany({
        where: { organizationId, ...updatedFilter },
      }),
      // inspectionItems (no updatedAt — fetch items for updated inspections)
      since
        ? db.inspectionItem.findMany({
            where: { inspection: { organizationId, updatedAt: { gt: since } } },
          })
        : db.inspectionItem.findMany({
            where: { inspection: { organizationId } },
          }),
      // technicians
      db.technician.findMany({
        where: { organizationId, ...updatedFilter },
      }),
      // boardAssignments
      db.boardAssignment.findMany({
        where: { organizationId, ...updatedFilter },
      }),
      // appSettings (no updatedAt)
      db.appSetting.findMany({
        where: { organizationId },
      }),
      // customFieldDefinitions
      db.customFieldDefinition.findMany({
        where: { organizationId, ...updatedFilter },
      }),
      // customFieldValues (no updatedAt — fetch all for updated definitions)
      since
        ? db.customFieldValue.findMany({
            where: { field: { organizationId, updatedAt: { gt: since } } },
          })
        : db.customFieldValue.findMany({
            where: { field: { organizationId } },
          }),
      // smsMessages
      db.smsMessage.findMany({
        where: { organizationId, ...updatedFilter },
      }),
      // serviceRequests
      db.serviceRequest.findMany({
        where: { organizationId, ...updatedFilter },
      }),
      // deletions
      since
        ? db.syncDeletion.findMany({
            where: { organizationId, deletedAt: { gt: since } },
          })
        : [],
    ]);

    return NextResponse.json({
      timestamp,
      customers,
      vehicles,
      serviceRecords,
      serviceParts,
      serviceLabor,
      serviceAttachments,
      payments,
      notes,
      reminders,
      fuelLogs,
      quotes,
      quoteParts,
      quoteLabor,
      quoteAttachments,
      inventoryParts,
      recurringInvoices,
      inspectionTemplates,
      inspectionTemplateSections,
      inspectionTemplateItems,
      inspections,
      inspectionItems,
      technicians,
      boardAssignments,
      appSettings,
      customFieldDefinitions,
      customFieldValues,
      smsMessages,
      serviceRequests,
      deletions: deletions.map((d) => ({
        entity: d.entity,
        recordId: d.recordId,
        deletedAt: d.deletedAt,
      })),
    });
  });
}
