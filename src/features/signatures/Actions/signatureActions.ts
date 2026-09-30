'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { demoGuard } from '@/lib/demo'
import { memberSignatureDataUri } from '../Lib/memberSignature.server'
import { parseSignatureDataUri } from '../Lib/signatureImage'

/*
 * A signature is the member's own, so these ask for no permission beyond
 * belonging to the workshop: whoever can issue a document can sign it, and
 * nobody can read or change anyone else's.
 */

async function membershipId(organizationId: string, userId: string): Promise<string> {
  const member = await db.organizationMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { id: true },
  })
  if (!member) throw new Error('No organization found')
  return member.id
}

/** The caller's signature for this workshop, as a data URI, or null. */
export async function getMySignature() {
  return withAuth(async ({ organizationId, userId }) => {
    return (await memberSignatureDataUri(organizationId, userId)) ?? null
  })
}

/** Keep a drawn or uploaded signature, replacing the one before. */
export async function saveMySignature(dataUri: string) {
  return withAuth(
    async ({ organizationId, userId }) => {
      demoGuard()
      const image = parseSignatureDataUri(dataUri)
      if (!image) throw new Error('The signature must be a PNG or JPEG image under 300 KB')
      const memberId = await membershipId(organizationId, userId)
      const data = new Uint8Array(image.bytes)
      await db.memberSignature.upsert({
        where: { memberId },
        update: { mimeType: image.mimeType, data },
        create: { memberId, mimeType: image.mimeType, data },
      })
      return { saved: true }
    },
    {
      audit: ({ ctx }) => ({
        action: 'signature.save',
        entity: 'MemberSignature',
        entityId: ctx.userId,
      }),
    }
  )
}

/** Take the caller's signature away. Documents already issued keep their copy. */
export async function removeMySignature() {
  return withAuth(
    async ({ organizationId, userId }) => {
      demoGuard()
      const memberId = await membershipId(organizationId, userId)
      await db.memberSignature.deleteMany({ where: { memberId } })
      return { removed: true }
    },
    {
      audit: ({ ctx }) => ({
        action: 'signature.remove',
        entity: 'MemberSignature',
        entityId: ctx.userId,
      }),
    }
  )
}
