import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'

/** Long-lived cookie naming this browser to the app, across sign-ins. */
export const DEVICE_COOKIE = 'torqvoice-device'
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * What better-auth hands a database hook: the endpoint context of the request
 * that created the row, when there is one. Only the cookie helpers are used,
 * and only when present; a session minted outside a request has neither.
 */
interface HookContext {
  getCookie?: (name: string) => string | undefined | null
  setCookie?: (
    name: string,
    value: string,
    options?: {
      httpOnly?: boolean
      sameSite?: 'lax' | 'strict' | 'none'
      secure?: boolean
      path?: string
      maxAge?: number
    }
  ) => void
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
 * A browser is known by the id in its device cookie, set here on first
 * sight and kept for a year, so a sign-out or a password change that ends
 * every session does not turn the same laptop into a "new device" next week.
 * A client that keeps no cookies, such as the technician app, is known by
 * its user agent instead: coarser, but stable for one phone.
 */
export async function noteDevice(
  session: { userId: string; userAgent?: string | null; ipAddress?: string | null },
  ctx: unknown
): Promise<DeviceSighting> {
  const hook = (ctx ?? {}) as HookContext
  const label = describeUserAgent(session.userAgent)

  let deviceKey = hook.getCookie?.(DEVICE_COOKIE) || null
  if (!deviceKey && hook.setCookie) {
    deviceKey = randomBytes(24).toString('hex')
    hook.setCookie(DEVICE_COOKIE, deviceKey, {
      httpOnly: true,
      sameSite: 'lax',
      secure: useSecureCookies(),
      path: '/',
      maxAge: DEVICE_COOKIE_MAX_AGE,
    })
  }
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

  const others = await db.userDevice.count({ where: { userId: session.userId } })
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
  const devicesUrl = `${appUrl}/settings/account`
  const when = input.at.toUTCString()
  const where = input.ip ? ` from ${escapeHtml(input.ip)}` : ''
  const hi = input.name ? ` ${escapeHtml(input.name)}` : ''
  const label = escapeHtml(input.label)

  const { sendMail, getFromAddress } = await import('@/lib/email')
  const from = await getFromAddress()
  await sendMail({
    from,
    to: input.to,
    subject: 'New sign-in to your Torqvoice account',
    text: `Hi${input.name ? ` ${input.name}` : ''},\n\nA new device signed in to your Torqvoice account: ${input.label}${input.ip ? ` from ${input.ip}` : ''}, ${when}.\n\nIf this was you, there is nothing to do. If it was not, change your password and sign out the other devices here: ${devicesUrl}\n`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>New sign-in to your account</h2>
        <p>Hi${hi},</p>
        <p>A new device signed in to your Torqvoice account:</p>
        <p style="margin: 16px 0; padding: 12px 16px; background: #f4f4f5; border-radius: 8px;">
          <strong>${label}</strong>${where}<br/>
          <span style="color: #6b7280; font-size: 14px;">${escapeHtml(when)}</span>
        </p>
        <p>If this was you, there is nothing to do.</p>
        <p>If it was not, change your password and sign out the other devices:</p>
        <div style="margin: 24px 0;">
          <a href="${devicesUrl}" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500;">
            Review signed-in devices
          </a>
        </div>
      </div>
    `,
  })
}
