'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { normalizeCustomerReference } from '../Lib/reference'
import { isCustomerReferenceEnabled } from '../Lib/referenceSetting'

/**
 * Saves the customer's reference / PO on a quote, on its own.
 *
 * Not stopped by a locked quote: a customer who accepts by raising a
 * purchase order sends its number after the quote has locked, and the number
 * is not one of the things the lock freezes. It is copied to the job when
 * the quote is converted.
 */
export async function setQuoteReference(quoteId: string, reference: string) {
  return withAuth(
    async ({ organizationId }) => {
      if (typeof quoteId !== 'string' || typeof reference !== 'string') {
        throw new Error('Invalid reference')
      }
      if (!(await isCustomerReferenceEnabled(organizationId))) {
        // Said to whoever is signed in, so in their language.
        throw new Error((await getTranslations('service.reference'))('notSwitchedOn'))
      }
      const quote = await db.quote.findFirst({
        where: { id: quoteId, organizationId },
        select: { id: true },
      })
      if (!quote) throw new Error('Quote not found')

      const customerReference = normalizeCustomerReference(reference)
      await db.quote.update({ where: { id: quote.id }, data: { customerReference } })

      revalidatePath('/quotes')
      revalidatePath(`/quotes/${quote.id}`)
      return { id: quote.id, customerReference }
    },
    {
      requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.QUOTES }],
      audit: ({ result }) => ({
        action: 'quote.update',
        entity: 'Quote',
        entityId: result.id,
        details: { key: 'quote_update', params: { ref: result.id } },
        metadata: { quoteId: result.id, field: 'customerReference' },
      }),
    }
  )
}
