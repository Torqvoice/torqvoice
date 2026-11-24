'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { Prisma } from '@/generated/prisma/client'
import { PHONE_MATCH_MIN_DIGITS, phoneDigits } from '../Lib/phoneNumber'

/** A customer the one being typed may be, as the warning names and links it. */
export interface CustomerDuplicate {
  id: string
  name: string
  company: string | null
}

export interface CustomerDuplicates {
  email: CustomerDuplicate[]
  phone: CustomerDuplicate[]
  name: CustomerDuplicate[]
}

/** Enough to name who it may be; the link shows the rest. */
const SHOWN = 3

const inputSchema = z.object({
  name: z.string().max(500).optional(),
  email: z.string().max(500).optional(),
  phone: z.string().max(100).optional(),
  /** The customer being edited, who is never a duplicate of themselves. */
  excludeId: z.string().optional(),
})

/**
 * Other customers of this workshop with the same email, the same phone
 * number or the same name as the one being typed, so the form can say so
 * before a second record for one person is made. It only reads: the form
 * warns and the person can save anyway, since two people can share a name
 * and a family can share a number.
 *
 * An email is compared without case, a phone number by its digits alone
 * ("+47 912 34 567" is "+4791234567"), a name without case and with runs of
 * spaces as one.
 */
export async function findCustomerDuplicates(input: unknown) {
  return withAuth(
    async ({ organizationId }): Promise<CustomerDuplicates> => {
      const { name, email, phone, excludeId } = inputSchema.parse(input)
      const notSelf = excludeId ? Prisma.sql`AND c.id <> ${excludeId}` : Prisma.empty
      const select = (where: Prisma.Sql) =>
        db.$queryRaw<CustomerDuplicate[]>(Prisma.sql`
          SELECT c.id, c.name, c.company
          FROM "public"."customers" c
          WHERE c."organizationId" = ${organizationId} ${notSelf} AND ${where}
          ORDER BY c."updatedAt" DESC
          LIMIT ${SHOWN}
        `)

      const emailKey = (email ?? '').trim().toLowerCase()
      const digits = phoneDigits(phone)
      const nameKey = (name ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

      const [byEmail, byPhone, byName] = await Promise.all([
        emailKey ? select(Prisma.sql`lower(trim(c.email)) = ${emailKey}`) : [],
        digits.length >= PHONE_MATCH_MIN_DIGITS
          ? select(Prisma.sql`regexp_replace(c.phone, '[^0-9]', '', 'g') = ${digits}`)
          : [],
        nameKey
          ? select(
              Prisma.sql`lower(regexp_replace(trim(c.name), '[[:space:]]+', ' ', 'g')) = ${nameKey}`
            )
          : [],
      ])
      return { email: byEmail, phone: byPhone, name: byName }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    }
  )
}
