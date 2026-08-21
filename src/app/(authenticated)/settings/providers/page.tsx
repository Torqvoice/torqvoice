import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures, isCloudMode } from '@/lib/features'
import { getEmailSettings } from '@/features/email/Actions/emailSettingsActions'
import { getSmsSettings } from '@/features/sms/Actions/smsSettingsActions'
import { getTelegramSettings } from '@/features/telegram/Actions/telegramSettingsActions'
import { getWhatsappSettings } from '@/features/whatsapp/Actions/whatsappSettingsActions'
import { EmailSettingsForm } from '@/features/email/Components/EmailSettingsForm'
import { SmsSettingsForm } from '@/features/sms/Components/SmsSettingsForm'
import { TelegramSettingsForm } from '@/features/telegram/Components/TelegramSettingsForm'
import { WhatsappSettingsForm } from '@/features/whatsapp/Components/WhatsappSettingsForm'
import { FeatureLockedMessage } from '../feature-locked-message'
import { ProviderTabs, type ProviderPanel } from './provider-tabs'

/**
 * Every channel the workshop can reach customers on, in one place.
 *
 * Each provider still loads its own settings on the server; the tabs only
 * decide which one is on screen.
 */
export default async function ProvidersSettingsPage() {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const [features, t] = await Promise.all([
    getFeatures(data.organizationId),
    getTranslations('settings.providers'),
  ])
  const isCloud = isCloudMode()

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  // A locked channel is still worth a tab: it tells a workshop the capability
  // exists, which a hidden tab cannot.
  const [email, sms, telegram, whatsapp] = await Promise.all([
    features.smtp ? getEmailSettings() : null,
    features.sms ? getSmsSettings() : null,
    features.telegram ? getTelegramSettings() : null,
    features.whatsapp ? getWhatsappSettings() : null,
  ])

  const panels: ProviderPanel[] = [
    {
      key: 'email',
      label: t('tabs.email'),
      locked: !features.smtp,
      content: features.smtp ? (
        <EmailSettingsForm initial={email?.success && email.data ? email.data : {}} />
      ) : (
        <FeatureLockedMessage
          feature={t('locked.email.feature')}
          description={t('locked.email.description')}
          isCloud={isCloud}
        />
      ),
    },
    {
      key: 'sms',
      label: t('tabs.sms'),
      locked: !features.sms,
      content: features.sms ? (
        <SmsSettingsForm initial={sms?.success && sms.data ? sms.data : {}} appUrl={appUrl} />
      ) : (
        <FeatureLockedMessage
          feature={t('locked.sms.feature')}
          description={t('locked.sms.description')}
          isCloud={isCloud}
        />
      ),
    },
    {
      key: 'whatsapp',
      label: t('tabs.whatsapp'),
      locked: !features.whatsapp,
      content:
        features.whatsapp && whatsapp?.success && whatsapp.data ? (
          <WhatsappSettingsForm initial={whatsapp.data} />
        ) : (
          <FeatureLockedMessage
            feature={t('locked.whatsapp.feature')}
            description={t('locked.whatsapp.description')}
            isCloud={isCloud}
          />
        ),
    },
    {
      key: 'telegram',
      label: t('tabs.telegram'),
      locked: !features.telegram,
      content: features.telegram ? (
        <TelegramSettingsForm
          initial={telegram?.success && telegram.data ? telegram.data : {}}
          appUrl={appUrl}
          initialEnabled={
            telegram?.success && telegram.data
              ? telegram.data['telegram.enabled'] === 'true'
              : false
          }
        />
      ) : (
        <FeatureLockedMessage
          feature={t('locked.telegram.feature')}
          description={t('locked.telegram.description')}
          isCloud={isCloud}
        />
      ),
    },
  ]

  return <ProviderTabs panels={panels} defaultTab="email" />
}
