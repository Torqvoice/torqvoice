import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { bearer } from 'better-auth/plugins/bearer'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { db } from './db'
import { logAudit } from './audit'
import { noteDevice, sendNewDeviceMail } from '@/lib/known-devices'
import { isDemoMode } from './demo'
import { googleSignInConfig } from './auth-providers'

const baseURL = process.env.NEXT_PUBLIC_APP_URL
const google = googleSignInConfig()
const isProduction = baseURL?.startsWith('https://')

/**
 * Origins allowed to sign in.
 *
 * Production trusts only the app's own URL. The technician app is native and
 * sends no Origin header, so it needs nothing added here.
 *
 * Development also trusts the Expo dev server, which serves the technician app
 * in a browser. Without this, signing in from Expo web is refused with
 * "Invalid origin" and the app looks like it rejected the password, when what
 * actually happened is a CSRF check doing its job.
 *
 * Wildcarded on the port rather than pinned, because Expo walks up from 8081
 * whenever a port is busy and a pinned list goes stale the first time two dev
 * servers overlap. Better Auth matches these as glob patterns.
 */
const EXPO_DEV_ORIGINS = [
  'http://localhost:*',
  'http://127.0.0.1:*',
  // Expo also serves on the machine's LAN address, which is the same host the
  // workshop is reached on during development. Derived rather than hardcoded
  // so this keeps working on a different network.
  ...devLanOrigin(),
  ...(process.env.EXPO_DEV_ORIGIN ? [process.env.EXPO_DEV_ORIGIN] : []),
]

function devLanOrigin(): string[] {
  if (!baseURL) return []
  try {
    const { hostname } = new URL(baseURL)
    if (hostname === 'localhost' || hostname === '127.0.0.1') return []
    return [`http://${hostname}:*`]
  } catch {
    return []
  }
}

const trustedOrigins = [
  ...(baseURL ? [baseURL] : []),
  ...(process.env.NODE_ENV === 'production' ? [] : EXPO_DEV_ORIGINS),
]

export const auth = betterAuth({
  baseURL,
  basePath: '/api/public/auth',
  trustedOrigins,
  database: prismaAdapter(db, {
    provider: 'postgresql',
  }),
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      // Only send if email verification is required
      const setting = await db.systemSetting.findUnique({
        where: { key: 'email.verificationRequired' },
      })
      if (setting?.value !== 'true') return

      // Invited addresses are verified like any other. This used to skip the
      // mail when a pending invitation existed for the address, relying on
      // acceptInvitation to mark the user verified; but an invitation only
      // proves the inviter typed the address, and any admin anywhere could
      // suppress somebody's verification mail just by inviting them.

      // Server-side rate limit: 60 seconds between verification emails per user
      const cooldownKey = `email-verify-cooldown:${user.id}`
      const existingCooldown = await db.verification.findUnique({
        where: { identifier: cooldownKey },
      })
      if (existingCooldown && existingCooldown.expiresAt > new Date()) return

      // Set cooldown record
      await db.verification.upsert({
        where: { identifier: cooldownKey },
        create: {
          identifier: cooldownKey,
          value: '1',
          expiresAt: new Date(Date.now() + 60_000),
        },
        update: {
          expiresAt: new Date(Date.now() + 60_000),
        },
      })

      try {
        const { sendMail, getFromAddress } = await import('@/lib/email')
        const from = await getFromAddress()

        await sendMail({
          from,
          to: user.email,
          subject: 'Verify your Torqvoice email',
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
              <h2>Email Verification</h2>
              <p>Hi${user.name ? ` ${user.name}` : ''},</p>
              <p>Please verify your email address by clicking the button below:</p>
              <div style="margin: 24px 0;">
                <a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500;">
                  Verify Email
                </a>
              </div>
              <p style="color: #6b7280; font-size: 14px;">If you didn't create an account, you can safely ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
              <p style="color: #6b7280; font-size: 12px;">
                If the button doesn't work, copy and paste this URL into your browser:<br/>
                <a href="${url}" style="color: #6b7280;">${url}</a>
              </p>
            </div>
          `,
        })
      } catch (error) {
        console.error('[emailVerification] Failed to send verification email:', error)
      }
    },
  },
  // better-auth allows three sign-ins per ten seconds in production. The
  // end-to-end suite signs in far more often than that, on purpose, so its
  // server runs with the limiter off. Nothing else sets this variable.
  rateLimit: {
    enabled: process.env.NODE_ENV === 'production' && process.env.AUTH_RATE_LIMIT !== 'off',
  },
  socialProviders: google
    ? {
        google: {
          clientId: google.clientId,
          clientSecret: google.clientSecret,
          // Always show the chooser: a workshop laptop is shared, and a
          // silent sign-in with whatever Google account is open is wrong
          // more often than it is convenient.
          prompt: 'select_account',
        },
      }
    : undefined,
  account: {
    accountLinking: {
      enabled: true,
      // A Google sign-in whose email matches a password account attaches to
      // that account rather than creating a second person with the same
      // email, but only when both sides have proved the address. Google is
      // deliberately not a trusted provider: better-auth links a trusted
      // provider's account without looking at email_verified at all, and
      // anyone can create a Google account with somebody else's address on
      // it. Trusted, that signed a stranger into the workshop that owns the
      // address.
      //
      // The local account has to be verified too. Google's word covers the
      // person now signing in; it says nothing about who made the password
      // account. Left unverified, that account can be anyone's: sign up with
      // a stranger's address and a password of your own, and when they later
      // press "Continue with Google" they are signed into your account and
      // build their workshop behind a password you hold. So an unverified
      // password account is not joined; the person is sent back to sign-in
      // with a message (see sign-in-form.tsx) and gets in with the password,
      // where verifying the address makes the Google route open up.
      // e2e/specs/cloud/google-sign-in.spec.ts holds all three halves.
      requireLocalEmailVerified: true,
    },
  },
  emailAndPassword: {
    enabled: true,
    // A reset is how a person recovers from a stolen password; leaving the
    // thief's sessions alive would make it theatre. Change-password passes
    // revokeOtherSessions from the form for the same reason.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const { sendMail, getFromAddress } = await import('@/lib/email')
      const from = await getFromAddress()

      await sendMail({
        from,
        to: user.email,
        subject: 'Reset your Torqvoice password',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Password Reset</h2>
            <p>Hi${user.name ? ` ${user.name}` : ''},</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <div style="margin: 24px 0;">
              <a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500;">
                Reset Password
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="color: #6b7280; font-size: 12px;">
              This link will expire shortly. If it doesn't work, copy and paste this URL into your browser:<br/>
              <a href="${url}" style="color: #6b7280;">${url}</a>
            </p>
          </div>
        `,
      })
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    // No cookie cache. It saved one session lookup per request and in return
    // let a revoked session keep working for up to five minutes: a phone
    // signed out from the devices list stayed signed in, and a password
    // change did not end the other browser until the cache ran out. The
    // session table is read on every request now; membership already was.
    cookieCache: {
      enabled: false,
    },
  },
  advanced: {
    useSecureCookies: isProduction,
    ipAddress: {
      // Only headers a proxy we control has overwritten. The proxy sets
      // x-real-ip from the real connection; cf-connecting-ip is whatever the
      // caller typed unless Cloudflare genuinely fronts every request, which
      // it does not while production runs grey-clouded. Trusting it let a
      // caller change one digit and become a different person to every
      // per-address limit in the product. See lib/rate-limit.ts.
      ipAddressHeaders:
        process.env.TRUST_CF_CONNECTING_IP === 'true'
          ? ['cf-connecting-ip', 'x-real-ip']
          : ['x-real-ip'],
    },
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session, ctx) => {
          await db.user.update({
            where: { id: session.userId },
            data: { lastLogin: new Date() },
          })

          // Which device this is, and a mail when the account has not seen
          // it before. Its first device is recorded without a word: that is
          // the sign-up, or an account from before devices were tracked. The
          // demo's one shared account is every visitor's browser and sends no
          // mail, so it is not tracked at all.
          const sighting = isDemoMode
            ? null
            : await noteDevice(
                {
                  id: session.id,
                  userId: session.userId,
                  userAgent: ((session as Record<string, unknown>).userAgent as string) ?? null,
                  ipAddress: ((session as Record<string, unknown>).ipAddress as string) ?? null,
                },
                ctx
              ).catch((error) => {
                console.error('[auth] could not record the device:', error)
                return null
              })
          if (sighting?.isNew && !sighting.isFirst) {
            const account = await db.user.findUnique({
              where: { id: session.userId },
              select: { email: true, name: true },
            })
            if (account?.email) {
              sendNewDeviceMail({
                to: account.email,
                name: account.name,
                label: sighting.label,
                ip: ((session as Record<string, unknown>).ipAddress as string) ?? null,
                at: new Date(),
              }).catch((error) => console.error('[auth] new-device mail failed:', error))
            }
          }

          // Audit: log successful login
          const membership = await db.organizationMember.findFirst({
            where: { userId: session.userId },
            select: { organizationId: true },
          })
          logAudit(
            { userId: session.userId, organizationId: membership?.organizationId ?? '' },
            {
              action: 'auth.login',
              message: 'User logged in',
              ip: ((session as Record<string, unknown>).ipAddress as string) ?? null,
              userAgent: ((session as Record<string, unknown>).userAgent as string) ?? null,
            }
          ).catch(() => {
            /* best-effort */
          })
        },
      },
    },
    user: {
      create: {
        before: async (user) => {
          // Block registration if disabled via system settings (always disabled in demo mode)
          const setting = isDemoMode
            ? null
            : await db.systemSetting.findUnique({
                where: { key: 'registration.disabled' },
              })
          if (isDemoMode || setting?.value === 'true') {
            // Allow registration if there's a pending invitation for this email
            const invitation = await db.teamInvitation.findFirst({
              where: {
                email: user.email,
                status: 'pending',
                expiresAt: { gt: new Date() },
              },
            })
            if (!invitation) {
              return false
            }
          }
          return { data: user }
        },
        after: async (user) => {
          // Auto-promote the first registered user to super admin
          const count = await db.user.count()
          if (count === 1) {
            await db.user.update({
              where: { id: user.id },
              data: { isSuperAdmin: true, termsAcceptedAt: new Date() },
            })
          } else {
            await db.user.update({
              where: { id: user.id },
              data: { termsAcceptedAt: new Date() },
            })
          }
        },
      },
    },
  },
  plugins: [
    // Lets the technician app authenticate with `Authorization: Bearer <token>`
    // instead of a cookie. Session lookup, expiry and revocation stay inside
    // Better Auth rather than being reimplemented against the session table,
    // so signing out on the web really does kill the phone's session too.
    bearer(),
    twoFactor({ issuer: 'Torqvoice' }),
    passkey({
      rpID: baseURL ? new URL(baseURL).hostname : 'localhost',
      rpName: 'Torqvoice',
      origin: baseURL || 'http://localhost:3000',
    }),
    nextCookies(), // Must be last plugin
  ],
})
