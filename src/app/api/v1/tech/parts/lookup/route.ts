import { z } from 'zod'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { normalizeBarcode } from '@/features/inventory/Lib/barcode'

const querySchema = z.object({ barcode: z.string().min(1).max(128) })

/**
 * Resolves a scanned barcode to a stock part.
 *
 * Scanned input goes through the same normalisation as stored barcodes, so an
 * exact match is enough and the (organizationId, barcode) unique index makes
 * it unambiguous.
 *
 * A miss is a 404 rather than an empty 200: the technician is standing at a
 * shelf holding a box, and "we do not stock this" is a different answer from
 * "here is nothing", which they would have to interpret.
 */
export async function GET(request: Request) {
  return withApiAuth(
    request,
    async (ctx) => {
      const url = new URL(request.url)
      const { barcode } = querySchema.parse({ barcode: url.searchParams.get('barcode') })

      const normalized = normalizeBarcode(barcode)
      if (!normalized) return apiError(400, 'invalid_request', 'That barcode could not be read.')

      const part = await db.inventoryPart.findFirst({
        where: { organizationId: ctx.organizationId, barcode: normalized, isArchived: false },
        select: {
          id: true,
          partNumber: true,
          barcode: true,
          name: true,
          description: true,
          unit: true,
          unitCost: true,
          sellPrice: true,
          quantity: true,
          category: true,
        },
      })

      if (!part) {
        return apiError(404, 'not_found', 'No part in stock matches that barcode.')
      }

      return apiOk({ part })
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INVENTORY },
      ],
      // Scanning is bursty: a technician fitting a service kit scans six boxes
      // in twenty seconds, and being throttled mid-job is worse than useless.
      rateLimit: { limit: 120, windowMs: 60_000 },
    }
  )
}
