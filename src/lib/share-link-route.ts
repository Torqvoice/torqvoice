import 'server-only'
import { NextResponse } from 'next/server'
import type { ShareKind } from '@/lib/share-expiry'
import { findSharedDocument } from '@/lib/share-link.server'

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

/** The answer a route behind a share link gives once the link has expired. */
export function shareLinkExpiredResponse(): NextResponse {
  return NextResponse.json(EXPIRED, { status: 410 })
}
