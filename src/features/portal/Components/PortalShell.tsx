import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getCustomerSession } from '@/lib/customer-session'
import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { countPortalUnread } from '../Lib/chat.server'
import { isPortalLive } from '../Lib/portalLive'
import { loadPortalLook } from '../Lib/portalLook.server'
import { loadPortalWorkshop } from '../Lib/workshop.server'
import { PortalPlainScreen } from './PortalPlainScreen'
import { portalThemeComponents } from './Themes'

/**
 * Every signed-in portal page is drawn inside this. It resolves the workshop
 * from the address, checks that its portal is open and that the customer is
 * signed in to it (anyone else is sent to sign in), reads how the portal
 * looks, and renders the page inside the chrome of the theme the workshop
 * chose: the header and the phone's bottom navigation.
 *
 * The theme's colours and type come from `PortalRoot`, which the portal's
 * layout already wraps around every page.
 *
 * A page gets the portal's page box (`.p-page`: the gutters and a comfortable
 * measure) unless it passes `bare`, as the home and the Messages page do
 * because they lay out the whole width themselves.
 */
export async function PortalShell({
  orgId: orgParam,
  bare = false,
  children,
}: {
  /** The slug or id in the address. */
  orgId: string
  /** The page lays itself out edge to edge: no page box around it. */
  bare?: boolean
  children: React.ReactNode
}) {
  const t = await getTranslations('portal.shell')

  const org = await resolvePortalOrg(orgParam)
  if (!org) return <PortalPlainScreen title={t('notFound')} body={t('portalNotExist')} />

  const organizationId = org.id
  if (!(await isPortalLive(organizationId))) {
    return <PortalPlainScreen title={t('portalNotAvailable')} body={t('portalNotEnabled')} />
  }

  const session = await getCustomerSession()
  if (!session || session.organizationId !== organizationId) {
    redirect(`/portal/${orgParam}/auth/login`)
  }

  const [customer, look, workshop] = await Promise.all([
    db.customer.findUnique({
      where: { id: session.customerId },
      select: { name: true },
    }),
    loadPortalLook(organizationId),
    loadPortalWorkshop(organizationId, org.name),
  ])
  if (!customer) redirect(`/portal/${orgParam}/auth/login`)

  // The badge on the Messages tab. Without it the page still works.
  const unread = look.messagesEnabled
    ? await countPortalUnread(organizationId, session.customerId).catch(() => 0)
    : 0

  const { marine, ...workshopInfo } = workshop
  const { Chrome } = portalThemeComponents(look.theme)
  return (
    <Chrome
      orgParam={orgParam}
      workshop={workshopInfo}
      customerName={customer.name}
      marine={marine}
      messagesEnabled={look.messagesEnabled}
      unreadMessages={unread}
    >
      {bare ? children : <div className="p-page">{children}</div>}
    </Chrome>
  )
}
