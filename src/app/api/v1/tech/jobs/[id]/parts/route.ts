import { z } from 'zod'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { addPart, AddPartError } from '@/features/vehicles/Lib/addPart'
import { onInventoryChanged } from '@/features/inventory/Lib/onInventoryChanged'
import {
  readPartsPricingSettings,
  resolvePartPrice,
  roundMoney,
} from '@/features/inventory/Lib/partPricing'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

/**
 * Books a part onto a job from the bay.
 *
 * The client sends what it scanned and how many, never a price. Letting a
 * phone name the money would put the shop's margin on the far side of a
 * network boundary, where a modified client could change it. Pricing is read
 * from the stock record here.
 *
 * A free-text line (no inventoryPartId) is allowed for a part that is not in
 * stock, because refusing would send the technician back to a desk. It books
 * at zero and the office prices it later.
 */
const bodySchema = z.object({
  inventoryPartId: z.string().optional(),
  /** Only used when no stock part is named. */
  name: z.string().min(1).max(200).optional(),
  partNumber: z.string().max(100).optional(),
  quantity: z.number().positive().max(10_000),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params
      const body = bodySchema.parse(await request.json())

      const job = await db.serviceRecord.findFirst({
        where: {
          id,
          organizationId: ctx.organizationId,
          ...(ctx.isAdmin ? {} : { technicianId: { in: ctx.technicianIds } }),
        },
        select: { id: true },
      })
      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')

      let line: Parameters<typeof addPart>[0]['input']

      if (body.inventoryPartId) {
        const stock = await db.inventoryPart.findFirst({
          where: {
            id: body.inventoryPartId,
            organizationId: ctx.organizationId,
            isArchived: false,
          },
          select: {
            id: true,
            name: true,
            partNumber: true,
            unit: true,
            unitCost: true,
            sellPrice: true,
          },
        })
        if (!stock) return apiError(404, 'not_found', 'That part is no longer in stock.')

        // Same pricing rules the web uses, so a part booked from a phone and
        // one booked from a desk cost the customer the same. The workshop may
        // price from cost plus a house markup rather than the part's own sell
        // price, and only the settings know which.
        const settingRows = await db.appSetting.findMany({
          where: {
            organizationId: ctx.organizationId,
            key: {
              in: [
                SETTING_KEYS.PARTS_DEFAULT_MARKUP_PERCENT,
                SETTING_KEYS.PARTS_MARKUP_APPLIES_TO_INVENTORY,
              ],
            },
          },
          select: { key: true, value: true },
        })
        const pricing = readPartsPricingSettings(
          Object.fromEntries(settingRows.map((r) => [r.key, r.value ?? undefined])),
          {
            defaultMarkupPercent: SETTING_KEYS.PARTS_DEFAULT_MARKUP_PERCENT,
            markupAppliesToInventory: SETTING_KEYS.PARTS_MARKUP_APPLIES_TO_INVENTORY,
          }
        )
        const { unitPrice } = resolvePartPrice(stock, pricing)

        line = {
          serviceRecordId: job.id,
          inventoryPartId: stock.id,
          name: stock.name,
          partNumber: stock.partNumber,
          unit: stock.unit,
          quantity: body.quantity,
          unitPrice,
          unitCost: stock.unitCost,
          total: roundMoney(unitPrice * body.quantity),
        }
      } else {
        if (!body.name) {
          return apiError(400, 'invalid_request', 'Name a part, or scan one from stock.')
        }
        line = {
          serviceRecordId: job.id,
          name: body.name,
          partNumber: body.partNumber,
          quantity: body.quantity,
          unitPrice: 0,
          unitCost: 0,
          total: 0,
        }
      }

      try {
        const { part } = await addPart({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          input: line,
        })
        if (line.inventoryPartId) await onInventoryChanged(ctx.organizationId)
        return apiOk({ part }, 201)
      } catch (err) {
        if (err instanceof AddPartError) return apiError(404, 'not_found', err.message)
        throw err
      }
    },
    {
      requireTechnician: true,
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
    }
  )
}
