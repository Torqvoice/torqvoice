import { getTranslations } from 'next-intl/server'
import { getPortalHome } from '@/features/portal/Actions/getPortalHome'
import { PortalChatSlot } from '@/features/portal/Components/Chat/PortalChatSlot'
import { PortalPlainScreen } from '@/features/portal/Components/PortalPlainScreen'
import { PortalShell } from '@/features/portal/Components/PortalShell'
import { portalThemeComponents } from '@/features/portal/Components/Themes'
import { PortalLinkButton } from '@/features/portal/Components/Ui'
import { portalFormat } from '@/features/portal/Lib/portalFormat'
import { loadPortalLook } from '@/features/portal/Lib/portalLook.server'
import { resolvePortalOrg } from '@/lib/portal-slug'

/**
 * The signed-in home. One load of what it shows, drawn by the Home of the
 * theme the workshop chose. PortalShell sends anyone who is not signed in to
 * this workshop to the sign-in page before any of it is seen.
 */
export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  const org = await resolvePortalOrg(orgId)
  // No such workshop: the shell says so.
  if (!org) return <PortalShell orgId={orgId}>{null}</PortalShell>

  const [result, format, look, t] = await Promise.all([
    getPortalHome(orgId),
    portalFormat(org.id),
    loadPortalLook(org.id),
    getTranslations('portal'),
  ])

  if (!result.success || !result.data) {
    return (
      <PortalShell orgId={orgId} bare>
        <PortalPlainScreen title={t('shell.errorTitle')} body={t('home.failedToLoad')}>
          <PortalLinkButton variant="accent" href={`/portal/${orgId}/dashboard`}>
            {t('shell.tryAgain')}
          </PortalLinkButton>
        </PortalPlainScreen>
      </PortalShell>
    )
  }

  const data = result.data
  const { Home } = portalThemeComponents(look.theme)
  return (
    <PortalShell orgId={orgId} bare>
      <Home
        orgParam={orgId}
        data={data}
        format={format}
        chat={
          data.messages.enabled ? (
            <PortalChatSlot
              orgParam={orgId}
              organizationId={org.id}
              workshopName={data.workshop.name}
              callHref={data.workshop.phoneHref}
              enabled
              messages={data.messages.latest}
            />
          ) : null
        }
      />
    </PortalShell>
  )
}
