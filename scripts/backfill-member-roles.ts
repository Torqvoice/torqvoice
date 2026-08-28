/**
 * Gives every roleless member an explicit role that matches what they can
 * already do, so that "no role" can safely start meaning "no permissions".
 *
 * Why this exists
 * ---------------
 * `withAuth` skipped its permission check entirely when a member had no custom
 * role, which meant an unrestricted account. The settings screen told admins
 * the opposite: "No custom role means read-only access." Anyone added as a
 * Member and never given a role has had full access ever since.
 *
 * Flipping the code alone would lock those people out mid-shift with no
 * warning, which is why this runs first. It does not restrict anybody. It
 * writes down what they already have, so that:
 *
 *   - nobody's access changes on the day the code changes,
 *   - an admin can finally see, on the team page, that these accounts have
 *     full access, and
 *   - they can be narrowed deliberately, one at a time, by someone who knows
 *     which of them is a technician and which is the bookkeeper.
 *
 * The security improvement is that the default becomes deny and the truth
 * becomes visible. It is not that this script takes anything away.
 *
 * Safe to run more than once: it skips organizations that already have the
 * role and members that already have one.
 *
 *   npx tsx scripts/backfill-member-roles.ts          # report only
 *   npx tsx scripts/backfill-member-roles.ts --apply  # write
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { permissionGroups } from '../src/lib/permissions'

// Same adapter the app uses, so this connects the way everything else does.
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

type Member = {
  id: string
  organizationId: string
  user: { email: string } | null
}

/**
 * Named so it is obvious in the UI that it is not a considered choice.
 * An admin seeing "Full access (pre-existing)" on a technician should want to
 * change it, which is the entire point.
 */
const LEGACY_ROLE_NAME = 'Full access (pre-existing)'

/** Every action on every subject: exactly what a roleless member has today. */
function everyPermission() {
  return permissionGroups.flatMap((group) =>
    group.permissions.map((p) => ({ action: p.action, subject: group.subject }))
  )
}

async function main() {
  const apply = process.argv.includes('--apply')

  // Owners and admins bypass permission checks regardless, so they are
  // unaffected by the code change and need no role.
  const affected = await db.organizationMember.findMany({
    where: { roleId: null, role: { notIn: ['owner', 'admin'] } },
    select: {
      id: true,
      organizationId: true,
      user: { select: { email: true } },
    },
  })

  if (affected.length === 0) {
    console.log('No roleless members. Nothing to do.')
    return
  }

  const byOrg = new Map<string, Member[]>()
  for (const m of affected) {
    const list = byOrg.get(m.organizationId) ?? []
    list.push(m)
    byOrg.set(m.organizationId, list)
  }

  console.log(
    `${affected.length} member(s) across ${byOrg.size} workshop(s) currently have ` +
      `unrestricted access through having no role.\n`
  )

  const permissions = everyPermission()

  for (const [organizationId, members] of byOrg) {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    })

    console.log(`  ${org?.name ?? organizationId}: ${members.length} member(s)`)
    for (const m of members) console.log(`    - ${m.user?.email ?? m.id}`)

    if (!apply) continue

    let role = await db.role.findFirst({
      where: { organizationId, name: LEGACY_ROLE_NAME },
      select: { id: true },
    })

    if (!role) {
      role = await db.role.create({
        data: {
          name: LEGACY_ROLE_NAME,
          organizationId,
          // Not isAdmin: that would be a second bypass and would hide, rather
          // than record, what these accounts can reach.
          isAdmin: false,
          permissions: { create: permissions },
        },
        select: { id: true },
      })
    }

    await db.organizationMember.updateMany({
      where: { id: { in: members.map((m) => m.id) } },
      data: { roleId: role.id },
    })
  }

  if (apply) {
    console.log('\nDone. Every member above now has an explicit role.')
    console.log('It is now safe to deploy the change that makes "no role" mean "no permissions".')
  } else {
    console.log('\nReport only. Re-run with --apply to write these roles.')
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
