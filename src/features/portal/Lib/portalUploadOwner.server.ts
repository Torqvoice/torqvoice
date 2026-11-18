import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { parseUploadUrl } from '@/lib/upload-url'
import { PORTAL_UPLOAD_FOLDER } from './portalUploads'

/**
 * Whose upload a file in a workshop's `portal-uploads` folder is.
 *
 * A customer's file has no row until a message or a request is saved with
 * it, and the customer is the one who then says which file that is. The
 * folder alone says which workshop; it does not say which customer. Without
 * more, a customer who learnt another customer's file url could attach it to
 * a message of their own, and the file route, which serves a file to whoever
 * has a record that mentions it, would hand it over.
 *
 * So the name the upload route gives a file carries its owner: half of it is
 * random, the other half a keyed MAC over the workshop, the customer and
 * that random half. Nobody without the server's secret can make a name that
 * checks out for a customer, and a name that checks out for one customer
 * does not for any other. There is no table to keep in step and nothing to
 * restore: the name is the proof.
 *
 * The name keeps the shape of every other generated file name (a uuid and an
 * extension), so the file manager's sweep, the backup and the file routes
 * treat it as they treat the rest.
 *
 * What the workshop's staff upload into a thread (`/api/protected/upload/
 * portal-message`) has an ordinary random name and so belongs to no customer
 * here: staff attach it through `sendPortalReply`, which checks the workshop
 * only, and a customer can read it once a message to them mentions it, but
 * can never attach it themselves. The same goes for a file uploaded before
 * names carried an owner: still readable where a record mentions it, never
 * attachable again.
 */

/** 64 random bits, then 64 bits of MAC: 32 hex digits, written as a uuid. */
const HALF = 16

const NAME =
  /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.[A-Za-z0-9]{1,8}$/

/** The secret every signed link of the app is made with (see lib/photo-handoff.ts). */
function signingSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.ENCRYPTION_KEY
  if (!secret) throw new Error('No signing secret configured: set BETTER_AUTH_SECRET.')
  return secret
}

function ownerMac(organizationId: string, customerId: string, random: string): string {
  // The purpose is part of what is signed, so nothing else signed with the
  // same secret can be passed off as a file name. The parts cannot contain a
  // line break, so no two different triples sign the same text.
  return createHmac('sha256', signingSecret())
    .update(['portal-upload', organizationId, customerId, random].join('\n'))
    .digest('hex')
    .slice(0, HALF)
}

/** The name a new upload of this customer is stored under. */
export function portalUploadFileName(
  organizationId: string,
  customerId: string,
  extension: string
): string {
  const random = randomBytes(HALF / 2).toString('hex')
  const hex = random + ownerMac(organizationId, customerId, random)
  const uuid = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
  return `${uuid}.${extension}`
}

/**
 * The stored url of a file this customer uploaded to this workshop's portal,
 * or null for anything else: another workshop's file, another folder, a
 * staff upload, a file from before names carried an owner, and above all
 * another customer's upload. Never throws on a name it does not understand.
 */
export function ownPortalUploadUrl(
  url: unknown,
  organizationId: string,
  customerId: string
): string | null {
  if (typeof url !== 'string') return null
  const parts = parseUploadUrl(url)
  if (!parts || parts.organizationId !== organizationId) return null
  if (parts.category !== PORTAL_UPLOAD_FOLDER) return null
  const match = NAME.exec(parts.file)
  if (!match) return null
  const hex = match.slice(1, 6).join('')
  const given = Buffer.from(hex.slice(HALF), 'hex')
  const expected = Buffer.from(ownerMac(organizationId, customerId, hex.slice(0, HALF)), 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  return `/api/protected/files/${organizationId}/${PORTAL_UPLOAD_FOLDER}/${parts.file}`
}

/** Whether a url is a file this customer uploaded to this workshop's portal. */
export function isOwnPortalUpload(
  url: unknown,
  organizationId: string,
  customerId: string
): boolean {
  return ownPortalUploadUrl(url, organizationId, customerId) !== null
}
