import { getTranslations } from 'next-intl/server'
import { loadPortalOpeningHours } from '../Lib/openingHours.server'
import { loadPortalLook } from '../Lib/portalLook.server'
import { loadPortalWorkshop } from '../Lib/workshop.server'
import { portalThemeComponents } from './Themes'

/**
 * The workshop's front door, for someone who is not signed in: the sign-in
 * page and the "continue to sign in" step. It reads the workshop and how its
 * portal looks, and puts `children` (the sign-in form, or the confirm
 * button) in the frame of the theme the workshop chose.
 *
 * `organizationId` is the workshop the address resolved to. Without
 * `heading`, the frame says what signing in gives, in the customer's words.
 */
export async function PortalLanding({
  orgParam,
  organizationId,
  orgName,
  description,
  hoursText,
  eyebrow,
  heading,
  children,
}: {
  orgParam: string
  organizationId: string
  orgName: string
  /** The workshop's own words about itself (`portal.description`). */
  description: string | null
  /** The hours as the workshop typed them (`portal.hours`). */
  hoursText: string | null
  eyebrow?: string
  heading?: string
  children: React.ReactNode
}) {
  const [look, workshop, hours, t] = await Promise.all([
    loadPortalLook(organizationId),
    loadPortalWorkshop(organizationId, orgName),
    // The week from the workshop calendar, or null for a workshop that typed
    // its hours and never set them there: then its own words show.
    loadPortalOpeningHours(organizationId, hoursText),
    getTranslations('portal.signIn'),
  ])
  const { marine, ...workshopInfo } = workshop
  const { SignIn } = portalThemeComponents(look.theme)
  const headingKey = `heading${look.messagesEnabled ? '' : 'NoMessages'}${marine ? 'Marine' : ''}`

  return (
    <SignIn
      orgParam={orgParam}
      workshop={{ ...workshopInfo, hours }}
      description={description?.trim() || null}
      hoursText={hours ? null : hoursText?.trim() || null}
      coverUrl={look.coverUrl}
      eyebrow={eyebrow ?? t('eyebrow')}
      heading={heading ?? t(headingKey)}
    >
      {children}
    </SignIn>
  )
}
