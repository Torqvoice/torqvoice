import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'

/** Seats on the workshop's plan: how many are taken and how many it has. */
export interface MemberSeats {
  used: number
  limit: number
  /** No seat left, so an office invite would be refused. */
  full: boolean
}

export function seatsFrom(used: number, limit: number): MemberSeats {
  return { used, limit, full: used >= limit }
}

/**
 * The one count the invite action enforces and the add-person dialog shows,
 * so the dialog can never offer a seat the server then refuses. Every member
 * row counts, technicians included, the same as the invite check always has.
 */
export async function memberSeats(organizationId: string): Promise<MemberSeats> {
  const [features, used] = await Promise.all([
    getFeatures(organizationId),
    db.organizationMember.count({ where: { organizationId } }),
  ])
  return seatsFrom(used, features.maxUsers)
}
