import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { getFeatures, isCloudMode } from '@/lib/features'
import { getLayoutData } from '@/lib/get-layout-data'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import {
  getActiveEmailTemplates,
  listEmailTemplates,
} from '@/features/email/Actions/emailTemplateActions'
import type { EmailSampleData } from '@/features/email/Components/EmailThumbnail'
import { sampleSummaryRows, sampleValuesFor } from '@/features/email/Lib/emailContext'
import { EMAIL_KINDS, type EmailKind } from '@/features/email/Lib/emailKinds'
import { loadEmailMessages } from '@/features/email/Lib/emailMessages.server'
import { presetTemplate } from '@/features/email/Lib/emailPresets'
import type { EmailTemplate } from '@/features/email/Lib/emailTemplate'
import { FeatureLocked } from '../feature-locked-message'
import { EmailTemplateGallery } from './email-template-gallery'

/**
 * Every kind of mail with the templates saved for it, resolved on the server
 * so the first paint already shows what a workshop has rather than the
 * preset flashing first.
 */
export default async function EmailTemplatesPage() {
  const data = await getLayoutData()
  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const [features, t] = await Promise.all([
    getFeatures(data.organizationId),
    getTranslations('settings.emailTemplates'),
  ])

  const locked = !features.customTemplates

  const [settingsResult, organization, templatesResult, activeResult, messages] = await Promise.all(
    [
      getSettings([
        SETTING_KEYS.WORKSHOP_PHONE,
        SETTING_KEYS.WORKSHOP_EMAIL,
        SETTING_KEYS.WORKSHOP_ADDRESS,
      ]),
      db.organization.findUnique({
        where: { id: data.organizationId },
        select: { name: true },
      }),
      listEmailTemplates(),
      getActiveEmailTemplates(),
      loadEmailMessages(await getLocale()),
    ]
  )

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const workshop = {
    name: organization?.name,
    phone: settings[SETTING_KEYS.WORKSHOP_PHONE],
    email: settings[SETTING_KEYS.WORKSHOP_EMAIL],
    address: settings[SETTING_KEYS.WORKSHOP_ADDRESS],
  }

  const presets = {} as Record<EmailKind, EmailTemplate>
  const samples = {} as Record<EmailKind, EmailSampleData>
  for (const kind of EMAIL_KINDS) {
    presets[kind] = presetTemplate(kind, messages)
    samples[kind] = {
      values: sampleValuesFor(kind, workshop),
      summary: sampleSummaryRows(kind, messages.summary),
    }
  }

  const active = activeResult.success && activeResult.data ? activeResult.data : null

  const content = (
    <EmailTemplateGallery
      presets={presets}
      samples={samples}
      saved={templatesResult.success && templatesResult.data ? templatesResult.data : []}
      active={active ?? emptyActive()}
    />
  )

  return locked ? (
    <FeatureLocked
      feature={t('title')}
      description={t('lockedDescription')}
      isCloud={isCloudMode()}
    >
      {content}
    </FeatureLocked>
  ) : (
    content
  )
}

function emptyActive(): Record<EmailKind, string | null> {
  const active = {} as Record<EmailKind, string | null>
  for (const kind of EMAIL_KINDS) active[kind] = null
  return active
}
