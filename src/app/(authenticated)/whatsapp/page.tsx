import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getFeatures, isCloudMode } from '@/lib/features'
import { isWhatsappConfigured } from '@/lib/whatsapp'
import { getRecentWhatsappThreads } from '@/features/whatsapp/Actions/whatsappActions'
import {
  WhatsappMessagesClient,
  type WhatsappThreadSummary,
} from '@/features/whatsapp/Components/WhatsappMessagesClient'
import { PageHeader } from '@/components/page-header'
import { FeatureLockedMessage } from '../settings/feature-locked-message'
import { WhatsappNotConfiguredMessage } from './whatsapp-not-configured-message'

export default async function WhatsappPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/auth/sign-in')

  const features = await getFeatures(ctx.organizationId)
  const t = await getTranslations('whatsapp.messages')

  if (!features.whatsapp) {
    return (
      <>
        <PageHeader />
        <div className="flex flex-1 flex-col p-4 pt-0">
          <FeatureLockedMessage
            feature={t('featureName')}
            description={t('featureDescription')}
            isCloud={isCloudMode()}
          />
        </div>
      </>
    )
  }

  if (!(await isWhatsappConfigured(ctx.organizationId))) {
    return (
      <>
        <PageHeader />
        <div className="flex flex-1 flex-col p-4 pt-0">
          <WhatsappNotConfiguredMessage />
        </div>
      </>
    )
  }

  const result = await getRecentWhatsappThreads()
  const threads = (result.success && result.data ? result.data : []) as WhatsappThreadSummary[]

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col p-4 pt-0">
        <WhatsappMessagesClient threads={threads} />
      </div>
    </>
  )
}
