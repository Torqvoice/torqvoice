"use server"

import { db } from "@/lib/db"
import { withAuth } from "@/lib/with-auth"
import { PermissionAction, PermissionSubject } from "@/lib/permissions"

export async function lookupPartByBarcode(barcode: string) {
  return withAuth(async ({ organizationId }) => {
    const part = await db.inventoryPart.findFirst({
      where: {
        organizationId,
        barcode: { equals: barcode, mode: "insensitive" },
        isArchived: false,
      },
      select: {
        id: true,
        partNumber: true,
        barcode: true,
        name: true,
        description: true,
        unitCost: true,
        sellPrice: true,
        quantity: true,
        category: true,
      },
    })
    return part
  }, {
    requiredPermissions: [
      { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
    ],
  })
}
