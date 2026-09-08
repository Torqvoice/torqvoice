import 'server-only'

import { db } from '@/lib/db'
import { readStoredTemplate } from '../Schema/emailTemplateSchema'
import type { EmailKind } from './emailKinds'
import { loadEmailMessages } from './emailMessages.server'
import { presetTemplate } from './emailPresets'
import { activeTemplateId, activeTemplateSettingKey, type EmailTemplate } from './emailTemplate'

/**
 * The template a kind of mail sends with: the row the workshop's setting
 * points at, else the built-in preset in the reader's language.
 *
 * Read on the send rather than threaded down from a page, because most of
 * these mails go out from a cron job or a public route with no request to
 * hang settings off. A workshop that has never opened the editor has no
 * setting and no rows, so the preset answers and there is nothing to migrate.
 *
 * A row that cannot be read falls back to the preset too. A mail that goes
 * out looking like the default beats one that does not go out.
 */
export async function resolveEmailTemplate(
  organizationId: string,
  kind: EmailKind,
  locale: string
): Promise<EmailTemplate> {
  try {
    const setting = await db.appSetting.findUnique({
      where: { organizationId_key: { organizationId, key: activeTemplateSettingKey(kind) } },
      select: { value: true },
    })
    const id = activeTemplateId(setting?.value)
    if (id) {
      const row = await db.emailTemplate.findFirst({
        where: { id, organizationId, kind },
        select: { kind: true, name: true, subject: true, blocks: true, theme: true },
      })
      const stored = row ? readStoredTemplate(row) : null
      if (stored) return stored
    }
  } catch {
    // A database that cannot answer is not a reason to drop the invoice.
  }
  return presetTemplate(kind, await loadEmailMessages(locale))
}
