import { getTranslations } from 'next-intl/server'
import {
  getCustomer,
  getCustomerInvoices,
  getCustomerQuotes,
  getCustomersList,
} from '@/features/customers/Actions/customerActions'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getConversation } from '@/features/sms/Actions/smsActions'
import { getTelegramConversation } from '@/features/telegram/Actions/telegramActions'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures } from '@/lib/features'
import { getOrgTelegramBotUsername } from '@/lib/telegram'
import { channelEnabled } from '@/features/integrations/Lib/messaging'
import { CustomerDetailClient } from './customer-detail-client'
import { PageHeader } from '@/components/page-header'

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [result, settingsResult, layoutData, customersResult, invoicesResult, quotesResult] =
    await Promise.all([
      getCustomer(id),
      getSettings([SETTING_KEYS.UNIT_SYSTEM]),
      getLayoutData(),
      getCustomersList(),
      getCustomerInvoices(id),
      getCustomerQuotes(id),
    ])

  if (!result.success || !result.data) {
    const t = await getTranslations('customers.detail')
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{result.error || t('notFound')}</p>
        </div>
      </>
    )
  }

  // Load SMS/Telegram features and conversation if enabled
  let smsEnabled = false
  let telegramBotUsername: string | null = null
  let telegramEnabled = false
  let whatsappEnabled = false
  let smsMessages: {
    id: string
    direction: string
    body: string
    status: string
    createdAt: string | Date
    fromNumber: string
    toNumber: string
  }[] = []
  let smsNextCursor: string | null = null
  let telegramMessages: {
    id: string
    direction: string
    body: string
    status: string
    createdAt: string | Date
    chatId: string
  }[] = []
  let telegramNextCursor: string | null = null

  if (layoutData.status === 'ok') {
    const features = await getFeatures(layoutData.organizationId)
    smsEnabled = features.sms

    // Both switches live on the channel's integration now. The conversation
    // itself loads client-side, so only the flag is needed here to decide
    // whether the tab exists at all.
    if (features.telegram) {
      telegramEnabled = await channelEnabled(layoutData.organizationId, 'telegram')
    }
    if (features.whatsapp) {
      whatsappEnabled = await channelEnabled(layoutData.organizationId, 'whatsapp')
    }

    if (smsEnabled && result.data.phone) {
      const convResult = await getConversation(id)
      if (convResult.success && convResult.data) {
        smsMessages = convResult.data.messages
        smsNextCursor = convResult.data.nextCursor
      }
    }

    if (telegramEnabled) {
      telegramBotUsername = await getOrgTelegramBotUsername(layoutData.organizationId)
      const tgResult = await getTelegramConversation(id)
      if (tgResult.success && tgResult.data) {
        telegramMessages = tgResult.data.messages
        telegramNextCursor = tgResult.data.nextCursor
      }
    }
  }

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <CustomerDetailClient
          customer={result.data}
          customers={customersResult.success && customersResult.data ? customersResult.data : []}
          unitSystem={
            ((settingsResult.success && settingsResult.data?.[SETTING_KEYS.UNIT_SYSTEM]) ||
              'imperial') as 'metric' | 'imperial'
          }
          smsEnabled={smsEnabled}
          smsMessages={smsMessages}
          smsNextCursor={smsNextCursor}
          telegramEnabled={telegramEnabled}
          whatsappEnabled={whatsappEnabled}
          telegramBotUsername={telegramBotUsername}
          telegramMessages={telegramMessages}
          telegramNextCursor={telegramNextCursor}
          telegramChatId={result.data.telegramChatId ?? null}
          invoices={invoicesResult.success && invoicesResult.data ? invoicesResult.data : []}
          quotes={quotesResult.success && quotesResult.data ? quotesResult.data : []}
          canReadInvoices={invoicesResult.success}
          canReadQuotes={quotesResult.success}
        />
      </div>
    </>
  )
}
