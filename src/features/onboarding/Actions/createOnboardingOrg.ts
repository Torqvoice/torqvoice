'use server'

import { headers, cookies } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'
import { logAudit } from '@/lib/audit'
import { onboardingSchema } from '../Schema/onboardingSchema'
import {
  installDefaultInspectionTemplates,
  installDefaultLaborPresets,
} from '../Lib/onboardingDefaults'
import { seedSampleData } from '../Lib/sampleData'
import { CHECKLIST_DISMISSED_KEY, SAMPLE_DATA_IDS_KEY } from '../Lib/onboardingKeys'
import type { ActionResult } from '@/lib/with-auth'

export async function createOnboardingOrg(
  input: unknown
): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    // createOrganization carries the same refusal, but sign-up is open on the
    // demo and this is the path a new account lands on, so it was the way
    // around it. The seed purges foreign organizations on every reset, which
    // is a worse answer than saying so: it looks like the workshop somebody
    // set up simply vanished.
    if (isDemoMode) {
      return {
        success: false,
        error:
          'Creating a workshop is disabled on the demo. Sign in with the demo account, or install Torqvoice on your own server.',
      }
    }

    const data = onboardingSchema.parse(input)

    // Guard against duplicate org creation
    const existingMembership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    })
    if (existingMembership) {
      return { success: false, error: 'You already belong to an organization' }
    }

    const org = await db.organization.create({
      data: { name: data.workshopName },
    })

    await db.organizationMember.create({
      data: {
        userId: session.user.id,
        organizationId: org.id,
        role: 'owner',
      },
    })

    const cookieStore = await cookies()
    cookieStore.set('active-org-id', org.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    })

    // First-run setup: a default inspection template, common labor presets
    // and (optionally) removable sample data. All best-effort: the org and
    // membership above are what onboarding must not lose, so a hiccup here
    // never fails the action — the library sync tops templates up later
    // anyway.
    try {
      const [locale, t] = await Promise.all([getLocale(), getTranslations('onboarding')])

      const template = await installDefaultInspectionTemplates(org.id, locale)
      await installDefaultLaborPresets(org.id, session.user.id, t)

      if (data.loadSampleData) {
        const sampleIds = await seedSampleData(org.id, session.user.id, t, template)
        await db.appSetting.create({
          data: {
            organizationId: org.id,
            key: SAMPLE_DATA_IDS_KEY,
            value: JSON.stringify(sampleIds),
            userId: session.user.id,
          },
        })
      }

      // Written for every new org: its presence is what tells the dashboard
      // this org should see the getting-started checklist.
      await db.appSetting.create({
        data: {
          organizationId: org.id,
          key: CHECKLIST_DISMISSED_KEY,
          value: 'false',
          userId: session.user.id,
        },
      })
    } catch (setupError) {
      console.error(
        '[createOnboardingOrg] First-run setup failed:',
        setupError instanceof Error ? setupError.message : setupError
      )
    }

    // Audit: log registration + org creation (first org = new user onboarding)
    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null
    const userAgent = h.get('user-agent') || null
    const ctx = { userId: session.user.id, organizationId: org.id }
    logAudit(ctx, {
      action: 'auth.register',
      message: `New user registered: ${session.user.email}`,
      ip,
      userAgent,
    }).catch(() => {
      /* best-effort */
    })
    logAudit(ctx, {
      action: 'organization.create',
      entity: 'Organization',
      entityId: org.id,
      message: `Created organization: ${data.workshopName}`,
      metadata: { organizationName: data.workshopName },
      ip,
      userAgent,
    }).catch(() => {
      /* best-effort */
    })

    return { success: true, data: { organizationId: org.id } }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    console.error('[createOnboardingOrg] Error:', message)
    return { success: false, error: message }
  }
}
