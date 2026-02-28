import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { twoFactor } from 'better-auth/plugins/two-factor'
import { db } from './db'

const baseURL = process.env.NEXT_PUBLIC_APP_URL
const isProduction = baseURL?.startsWith('https://')

export const auth = betterAuth({
  baseURL,
  basePath: '/api/public/auth',
  trustedOrigins: baseURL ? [baseURL] : [],
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

      // Skip for users with a pending invitation — acceptInvitation will set emailVerified
      const pendingInvitation = await db.teamInvitation.findFirst({
        where: {
          email: user.email,
          status: 'pending',
        },
      })
      if (pendingInvitation) return

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
  emailAndPassword: {
    enabled: true,
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
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  advanced: {
    useSecureCookies: isProduction,
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          await db.user.update({
            where: { id: session.userId },
            data: { lastLogin: new Date() },
          })
        },
      },
    },
    user: {
      create: {
        before: async (user) => {
          // Block registration if disabled via system settings
          const setting = await db.systemSetting.findUnique({
            where: { key: 'registration.disabled' },
          })
          if (setting?.value === 'true') {
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
    twoFactor({ issuer: 'Torqvoice' }),
    passkey({
      rpID: baseURL ? new URL(baseURL).hostname : 'localhost',
      rpName: 'Torqvoice',
      origin: baseURL || 'http://localhost:3000',
    }),
    nextCookies(), // Must be last plugin
  ],
})
