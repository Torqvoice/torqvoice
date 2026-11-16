import 'server-only'
import { NextResponse } from 'next/server'
import type { ShareKind } from '@/lib/share-expiry'
import { findSharedDocument, findSharedDocumentOfAnyKind } from '@/lib/share-link.server'

const NOT_FOUND = { error: 'Not found' }
const EXPIRED = { error: 'This link has expired', expired: true }

/**
 * For a route behind a share link: the response to send when the link cannot
 * be used, or null when it can. A token nobody holds is 404; a link that has
 * expired is 410, so the page can tell the two apart.
 */
export async function refuseClosedShareLink(
  kind: ShareKind,
  token: string,
  organizationId: string
): Promise<NextResponse | null> {
  const shared = await findSharedDocument(kind, token, organizationId)
  if (!shared) return NextResponse.json(NOT_FOUND, { status: 404 })
  if (!shared.open) return NextResponse.json(EXPIRED, { status: 410 })
  return null
}

/** The same for a route that only has the token, whichever document it names. */
export async function refuseExpiredShareToken(token: string): Promise<NextResponse | null> {
  const shared = await findSharedDocumentOfAnyKind(token)
  if (shared && !shared.open) return NextResponse.json(EXPIRED, { status: 410 })
  return null
}
