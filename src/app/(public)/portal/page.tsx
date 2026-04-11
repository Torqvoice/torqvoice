import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import {
  PortalDirectory,
  type PortalDirectoryEntry,
} from '@/features/portal/Components/PortalDirectory'

export const dynamic = 'force-dynamic'

export default async function PortalIndexPage() {
  // Fetch all orgs that have the portal enabled.
  const enabledOrgs = await db.organization.findMany({
    where: {
      settings: {
        some: {
          key: SETTING_KEYS.PORTAL_ENABLED,
          value: 'true',
        },
      },
    },
    select: {
      id: true,
      name: true,
      portalSlug: true,
      settings: {
        where: {
          key: {
            in: [SETTING_KEYS.COMPANY_LOGO, SETTING_KEYS.WORKSHOP_ADDRESS],
          },
        },
        select: { key: true, value: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  const workshops: PortalDirectoryEntry[] = enabledOrgs.map((org) => {
    const slug = org.portalSlug ?? org.id
    const hasLogo = org.settings.some((s) => s.key === SETTING_KEYS.COMPANY_LOGO && s.value)
    const address = org.settings.find((s) => s.key === SETTING_KEYS.WORKSHOP_ADDRESS)?.value ?? null
    return {
      slug,
      name: org.name,
      // Use the public logo endpoint so unauthenticated visitors can load it.
      logo: hasLogo ? `/api/public/logo/${slug}` : null,
      address,
    }
  })

  // If there's only one workshop, skip the directory and go straight to its login.
  if (workshops.length === 1) {
    redirect(`/portal/${workshops[0].slug}/auth/login`)
  }

  return <PortalDirectory workshops={workshops} />
}
