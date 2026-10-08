import { db } from './db'
import { SYSTEM_SETTING_KEYS } from '@/features/admin/Schema/systemSettingsSchema'

/**
 * Whether this install treats an email address as proved only after a link
 * sent to it was opened.
 *
 * Off by default on a self-hosted install, where there may be no mail server
 * at all and the people on it are the workshop's own. On means an address
 * is a claim until confirmed: changing it goes through a confirmation mail,
 * and inviting an address that an unconfirmed account holds mails the
 * address rather than seating the account. Read here, on the server, by
 * every action the answer changes; a page reading it on its own was a
 * promise the server did not keep.
 */
export async function emailVerificationRequired(): Promise<boolean> {
  const setting = await db.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEYS.EMAIL_VERIFICATION_REQUIRED },
    select: { value: true },
  })
  return setting?.value === 'true'
}
