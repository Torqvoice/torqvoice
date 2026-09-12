import 'server-only'
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { sendAccountMail } from '@/lib/account-mail'
import { DEVICE_COOKIE, readDeviceCookie } from '@/lib/device-cookie'

/**
 * What better-auth hands a database hook: the endpoint context of the request
 * that created the row, when there is one. Only the request headers are read,
 * and only when present; a session minted outside a request has none.
 */
interface HookContext {
  headers?: { get(name: string): string | null } | null
  getCookie?: (name: string) => string | undefined | null
}

export interface DeviceSighting {
  /** No row existed for this device before now. */
  isNew: boolean
  /** The account had no devices at all; recorded quietly, nothing to warn about. */
  isFirst: boolean
  label: string
}

/**
 * "Chrome on Windows", "Safari on iPhone": enough for a person to recognise
 * their own device in a mail or a list, from a user agent string. Not a
 * fingerprint; the cookie does that.
 */
export function describeUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ''
  if (!ua) return 'Unknown device'
  if (/Torqvoice|Expo|okhttp|Dart|CFNetwork/i.test(ua) && !/Mozilla/i.test(ua)) {
    return 'Torqvoice technician app'
  }
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : null
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null
  if (browser && os) return `${browser} on ${os}`
  return browser ?? os ?? 'Unknown device'
}

export type DeviceKind = 'phone' | 'tablet' | 'desktop' | 'app' | 'unknown'

/** Phone, tablet or computer: which picture to draw beside a session. */
export function classifyUserAgent(userAgent: string | null | undefined): DeviceKind {
  const ua = userAgent ?? ''
  if (!ua) return 'unknown'
  if (/Torqvoice|Expo|okhttp|Dart|CFNetwork/i.test(ua) && !/Mozilla/i.test(ua)) return 'app'
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return 'tablet'
  }
  if (/iPhone|iPod|Android|Mobile|Windows Phone/i.test(ua)) return 'phone'
  if (/Windows|Macintosh|Mac OS X|CrOS|Linux|X11/i.test(ua)) return 'desktop'
  return 'unknown'
}

function useSecureCookies(): boolean {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').startsWith('https://')
}

/**
 * Records the device a session was just created from, and says whether the
 * account has seen it before.
 *
 * A browser is known by the id in its device cookie, issued by the auth
 * route on first sight and kept for a year, so a sign-out or a password change that ends
 * every session does not turn the same laptop into a "new device" next week.
 * A client that keeps no cookies, such as the technician app, is known by
 * its user agent instead: coarser, but stable for one phone.
 *
 * The first device an account ever sees is recorded quietly; a device that
 * shows up while another session is already open is a new one, even if it
 * is the first row here.
 */
export async function noteDevice(
  session: { id: string; userId: string; userAgent?: string | null; ipAddress?: string | null },
  ctx: unknown
): Promise<DeviceSighting> {
  const hook = (ctx ?? {}) as HookContext
  const label = describeUserAgent(session.userAgent)

  // The auth route issues the cookie before better-auth runs (device-cookie.ts),
  // so a returning browser and a brand-new one both carry it here.
  let deviceKey =
    readDeviceCookie(hook.headers ?? undefined) ?? hook.getCookie?.(DEVICE_COOKIE) ?? null
  if (!deviceKey) {
    deviceKey = `ua:${createHash('sha256')
      .update(session.userAgent ?? '')
      .digest('hex')}`
  }

  const now = new Date()
  const known = await db.userDevice.findUnique({
    where: { userId_deviceKey: { userId: session.userId, deviceKey } },
    select: { id: true },
  })
  if (known) {
    await db.userDevice.update({
      where: { id: known.id },
      data: {
        lastSeenAt: now,
        lastIp: session.ipAddress ?? undefined,
        userAgent: session.userAgent ?? undefined,
      },
    })
    return { isNew: false, isFirst: false, label }
  }

  // "First" means the account has never been used anywhere: no device on
  // record and no other session open. An account from before devices were
  // tracked has no rows, but a laptop still signed in says it is in use, so
  // a phone appearing beside it is news, not a first sighting.
  const [knownDevices, otherSessions] = await Promise.all([
    db.userDevice.count({ where: { userId: session.userId } }),
    db.session.count({
      where: { userId: session.userId, id: { not: session.id }, expiresAt: { gt: now } },
    }),
  ])
  const others = knownDevices + otherSessions
  await db.userDevice.create({
    data: {
      userId: session.userId,
      deviceKey,
      userAgent: session.userAgent ?? null,
      lastIp: session.ipAddress ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
    },
  })
  return { isNew: true, isFirst: others === 0, label }
}

/**
 * "A new device signed in": sent to the account's address, from the
 * platform sender, never through a workshop's own mail setup. Best effort;
 * the sign-in has already happened and must not fail on a mail error.
 */
export async function sendNewDeviceMail(input: {
  to: string
  name?: string | null
  label: string
  ip?: string | null
  at: Date
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.torqvoice.com'
  const where = input.ip ? ` from ${input.ip}` : ''
  await sendAccountMail({
    to: input.to,
    subject: 'New sign-in to your Torqvoice account',
    name: input.name,
    paragraphs: [
      `A new device signed in to your Torqvoice account: ${input.label}${where}, ${input.at.toUTCString()}.`,
      'If this was you, there is nothing to do.',
      'If it was not, change your password and sign out the other devices from your account page.',
    ],
    link: { text: 'Review signed-in devices', url: `${appUrl}/settings/account` },
  })
}
