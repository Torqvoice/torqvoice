import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PortalChatSlot } from '@/features/portal/Components/Chat/PortalChatSlot'
import { PortalPlainScreen } from '@/features/portal/Components/PortalPlainScreen'
import { PortalShell } from '@/features/portal/Components/PortalShell'
import { PortalLinkButton } from '@/features/portal/Components/Ui'
import { getPortalThreadPreview } from '@/features/portal/Lib/chat.server'
import { EMPTY_THREAD_PREVIEW } from '@/features/portal/Lib/chatTypes'
import { loadPortalLook } from '@/features/portal/Lib/portalLook.server'
import { loadPortalWorkshop } from '@/features/portal/Lib/workshop.server'
import { getCustomerSession } from '@/lib/customer-session'
import { resolvePortalOrg } from '@/lib/portal-slug'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('portal.messagesPage')
  return { title: t('title') }
}

/**
 * The chat with the workshop as its own page: the whole screen under the
 * header on a phone, where it is the Messages tab, and a wide column on a
 * desk. The thread is read with the session's own ids, and only once the
 * session is known to be for this workshop; PortalShell sends anyone else to
 * sign in.
 */
export default async function PortalMessagesPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const org = await resolvePortalOrg(orgId)
  if (!org) return <PortalShell orgId={orgId}>{null}</PortalShell>

  const session = await getCustomerSession()
  if (!session || session.organizationId !== org.id) {
    // Not signed in here: the shell redirects.
    return <PortalShell orgId={orgId}>{null}</PortalShell>
  }

  const [look, workshop, t] = await Promise.all([
    loadPortalLook(org.id),
    loadPortalWorkshop(org.id, org.name),
    getTranslations('portal'),
  ])

  if (!look.messagesEnabled) {
    return (
      <PortalShell orgId={orgId} bare>
        <PortalPlainScreen
          title={t('messagesPage.offTitle')}
          body={
            workshop.phone
              ? t('messagesPage.offBody', { phone: workshop.phone })
              : t('messagesPage.offBodyNoPhone')
          }
        >
          <PortalLinkButton variant="accent" href={`/portal/${orgId}/request-service`}>
            {t('nav.bookLong')}
          </PortalLinkButton>
        </PortalPlainScreen>
      </PortalShell>
    )
  }

  const thread = await getPortalThreadPreview(org.id, session.customerId).catch((error) => {
    console.error('[portal] messages:', error)
    return EMPTY_THREAD_PREVIEW
  })

  return (
    <PortalShell orgId={orgId} bare>
      {/* The chat takes what is left of the screen: under the header, above
          the phone's tab bar. On a desk it is a column with air around it. */}
      <div className="mx-auto flex w-full max-w-[920px] flex-1 flex-col lg:px-10 lg:py-7">
        <h1 className="sr-only">{t('messagesPage.title')}</h1>
        <section
          aria-label={t('chat.label', { workshop: workshop.name })}
          className="flex h-[calc(100svh-var(--p-chrome-top)-var(--p-chrome-bottom)-env(safe-area-inset-bottom))] min-h-[360px] flex-col overflow-hidden border-b lg:h-[calc(100svh-var(--p-chrome-top)-56px)] lg:rounded-[var(--p-radius)] lg:border"
        >
          <PortalChatSlot
            orgParam={orgId}
            organizationId={org.id}
            workshopName={workshop.name}
            callHref={workshop.phoneHref}
            enabled
            messages={thread.messages}
            variant="page"
          />
        </section>
      </div>
    </PortalShell>
  )
}
