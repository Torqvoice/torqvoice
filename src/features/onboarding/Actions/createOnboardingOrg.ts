'use server'

import { headers, cookies } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { onboardingSchema } from '../Schema/onboardingSchema'
import {
  installDefaultInspectionTemplates,
  installDefaultLaborPresets,
} from '../Lib/onboardingDefaults'
import { onboardingTranslator } from '../Lib/onboardingTranslator'
import { seedSampleData } from '../Lib/sampleData'
import { CHECKLIST_DISMISSED_KEY, SAMPLE_DATA_IDS_KEY } from '../Lib/onboardingKeys'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { saveInitialWorkshopLocale } from '@/features/settings/Lib/initialWorkshopLocale'
import { setupSettings } from '../Lib/setupSettings'
import { safeTimeZone } from '@/lib/timezone'
import type { ActionResult } from '@/lib/with-auth'
import { organizationAllowance, SINGLE_WORKSHOP_MESSAGE } from '@/lib/features'

export async function createOnboardingOrg(
  input: unknown
): Promise<ActionResult<{ organizationId: string }>> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }

    const data = onboardingSchema.parse(input)

    // Guard against duplicate org creation
    const existingMembership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    })
    if (existingMembership) {
      return { success: false, error: 'You already belong to an organization' }
    }

    const allowance = await organizationAllowance(session.user.id)
    if (!allowance.allowed) {
      return { success: false, error: SINGLE_WORKSHOP_MESSAGE }
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
    // The language customers get: chosen in the guided setup, else the one
    // the owner set the workshop up in, so invoices and mails never fall
    // back to English on their own.
    const workshopLocale = data.setup?.locale ?? (await getLocale())

    // What the owner chose, step by step. Kept apart from the first-run
    // content below, so a hiccup in one never skips the other.
    try {
      const rows = data.setup
        ? setupSettings(data.setup, data.timeZone)
        : timeZoneOnly(data.timeZone)
      await db.appSetting.createMany({
        data: Object.entries(rows).map(([key, value]) => ({
          organizationId: org.id,
          key,
          value,
          userId: session.user.id,
        })),
        skipDuplicates: true,
      })
      await saveInitialWorkshopLocale(db, org.id, session.user.id, workshopLocale)
    } catch (settingsError) {
      console.error(
        '[createOnboardingOrg] Saving the setup failed:',
        settingsError instanceof Error ? settingsError.message : settingsError
      )
    }

    try {
      // Templates, labour presets and sample jobs end up on documents, so
      // they are written in the customers' language, not the owner's screens.
      const t = await onboardingTranslator(workshopLocale)
      const locale = workshopLocale

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

/** An older client sends only the browser's zone; keep it as the workshop's. */
function timeZoneOnly(timeZone: string | undefined): Record<string, string> {
  const zone = safeTimeZone(timeZone, '')
  return zone ? { [SETTING_KEYS.TIMEZONE]: zone } : {}
}
