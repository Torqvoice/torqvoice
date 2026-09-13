'use server'

import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import {
  isCloudMode,
  organizationAllowance,
  FeatureGatedError,
  SINGLE_WORKSHOP_MESSAGE,
} from '@/lib/features'
import { demoGuard } from '@/lib/demo'
import { createOrganizationSchema } from '../Schema/teamSchema'
import { revalidatePath } from 'next/cache'

export async function createNewOrganization(input: unknown) {
  return withAuth(
    async ({ userId }) => {
      // A visitor-created org survives the per-org demo reset and hijacks the
      // shared demo user's active-org cookie for every later visitor.
      demoGuard()
      const data = createOrganizationSchema.parse(input)

      const allowance = await organizationAllowance(userId)
      if (!allowance.allowed) {
        // On the cloud this is a plan limit and the client offers the way to
        // a plan; on a self-hosted install it is the licence, and the message
        // says where that lives.
        if (!isCloudMode()) throw new Error(SINGLE_WORKSHOP_MESSAGE)
        throw new FeatureGatedError(
          'maxOrganizations',
          `You have reached the maximum number of organizations (${allowance.max}) for your plan. Upgrade to create more.`,
          allowance.max
        )
      }

      const org = await db.$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: { name: data.name },
        })

        await tx.organizationMember.create({
          data: {
            userId,
            organizationId: created.id,
            role: 'owner',
          },
        })

        return created
      })

      // Auto-switch to the newly created organization
      const cookieStore = await cookies()
      cookieStore.set('active-org-id', org.id, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      })

      revalidatePath('/')
      return org
    },
    {
      audit: ({ result }) => ({
        action: 'organization.create',
        entity: 'Organization',
        entityId: result.id,
        details: { key: 'organization_create', params: { name: result.name } },
        metadata: { organizationId: result.id },
      }),
    }
  )
}
