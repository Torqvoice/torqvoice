"use server"

import { db } from "@/lib/db"
import { withAuth } from "@/lib/with-auth"
import { PermissionAction, PermissionSubject } from "@/lib/permissions"
import { normalizeBarcode } from "../Lib/barcode"

export async function lookupPartByBarcode(barcode: string) {
  return withAuth(async ({ organizationId }) => {
    // Scanned input goes through the same normalisation as stored barcodes, so
    // an exact match is enough. Combined with the (organizationId, barcode)
    // unique index this resolves to at most one part — previously a
    // case-insensitive `findFirst` could pick arbitrarily between duplicates.
    const normalized = normalizeBarcode(barcode)
    if (!normalized) return null

    const part = await db.inventoryPart.findFirst({
      where: {
        organizationId,
        barcode: normalized,
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
