import 'server-only'
import { db } from '@/lib/db'
import { markInvoiceSent, markQuoteSent } from '@/lib/document-lock.server'
import { getTranslations } from 'next-intl/server'
import { getOrgSmsPhoneNumber, SmsCountryRefusedError, sendOrgSms } from '@/lib/sms'

export interface DeliverSmsInput {
  /** Already normalised to the E.164 number the provider will receive. */
  to: string
  body: string
  /** Whose conversation the text belongs in, when it belongs in one. */
  customerId?: string | null
  relatedEntityType?: string
  relatedEntityId?: string
}

/**
 * Sends one text and keeps a record of it, sent or failed.
 *
 * Shared by the two ways a text leaves a workshop: to a customer on file, and
 * to a number typed into a send dialog for a job that has no customer yet.
 */
export async function deliverSms(organizationId: string, input: DeliverSmsInput) {
  const fromNumber = await getOrgSmsPhoneNumber(organizationId)
  if (!fromNumber) throw new Error('SMS phone number is not configured')

  // Create the message record first
  const message = await db.smsMessage.create({
    data: {
      direction: 'outbound',
      fromNumber,
      toNumber: input.to,
      body: input.body,
      status: 'queued',
      organizationId,
      customerId: input.customerId ?? null,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    },
  })

  try {
    const result = await sendOrgSms(organizationId, { to: input.to, body: input.body })

    await db.smsMessage.update({
      where: { id: message.id },
      data: { status: 'sent', providerMsgId: result.providerMsgId },
    })

    // These entity types are set only by the send dialogs, whose SMS
    // carries the document's link: texting it is a way of sending the
    // document, so it counts for "lock when sent". Plain conversations
    // and reminders carry no entity type and stamp nothing.
    if (input.relatedEntityType === 'invoice' && input.relatedEntityId) {
      await markInvoiceSent(input.relatedEntityId, organizationId)
    } else if (input.relatedEntityType === 'quote' && input.relatedEntityId) {
      await markQuoteSent(input.relatedEntityId, organizationId)
    }

    return { id: message.id, to: result.to }
  } catch (error) {
    // The plan saying no is not a failed send: nothing was attempted, so
    // no failed message is left in the thread, and the refusal goes up as
    // it is so the screen can offer the upgrade instead of an error.
    if (error instanceof Error && error.name === 'FeatureGatedError') {
      await db.smsMessage.delete({ where: { id: message.id } }).catch(() => null)
      throw error
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    await db.smsMessage.update({
      where: { id: message.id },
      data: { status: 'failed', errorMessage },
    })

    // The country is not open on the account: a plain sentence in the
    // person's language, saying what they can do about it, instead of the
    // provider's wording.
    if (error instanceof SmsCountryRefusedError) {
      const t = await getTranslations('messages.errors')
      throw new Error(t(error.platform ? 'countryNotAvailable' : 'countryNotAllowedOwn'))
    }

    throw new Error(`Failed to send SMS: ${errorMessage}`)
  }
}
