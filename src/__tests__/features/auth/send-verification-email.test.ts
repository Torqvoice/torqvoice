import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for the sendVerificationEmail callback in src/lib/auth.ts (lines 20-86).
 * The callback logic is extracted and tested directly here.
 */

vi.mock('@/lib/db', () => ({
  db: {
    systemSetting: { findUnique: vi.fn() },
    teamInvitation: { findFirst: vi.fn() },
    verification: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

vi.mock('@/lib/email', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
  getFromAddress: vi.fn().mockResolvedValue('noreply@test.com'),
}))

import { db } from '@/lib/db'
import { sendMail, getFromAddress } from '@/lib/email'

const mockFindSetting = vi.mocked(db.systemSetting.findUnique)
const mockFindInvitation = vi.mocked(db.teamInvitation.findFirst)
const mockFindCooldown = vi.mocked(db.verification.findUnique)
const mockUpsertCooldown = vi.mocked(db.verification.upsert)
const mockSendMail = vi.mocked(sendMail)
const mockGetFromAddress = vi.mocked(getFromAddress)

// This is the exact logic from src/lib/auth.ts emailVerification.sendVerificationEmail
async function sendVerificationEmailHook(params: {
  user: { id: string; email: string; name?: string }
  url: string
}) {
  const { user, url } = params

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
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetFromAddress.mockResolvedValue('noreply@test.com')
  mockSendMail.mockResolvedValue(undefined as any)
})

const USER = { id: 'user-1', email: 'test@example.com', name: 'Test User' }
const URL = 'https://app.test.com/verify?token=abc123'

describe('sendVerificationEmail callback', () => {
  it("does NOT send when email.verificationRequired setting is not 'true'", async () => {
    mockFindSetting.mockResolvedValue({
      key: 'email.verificationRequired',
      value: 'false',
    } as any)
    await sendVerificationEmailHook({ user: USER, url: URL })
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockFindInvitation).not.toHaveBeenCalled()
  })

  it('does NOT send when email.verificationRequired is missing (null)', async () => {
    mockFindSetting.mockResolvedValue(null)
    await sendVerificationEmailHook({ user: USER, url: URL })
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('does NOT send when user has a pending invitation', async () => {
    mockFindSetting.mockResolvedValue({
      key: 'email.verificationRequired',
      value: 'true',
    } as any)
    mockFindInvitation.mockResolvedValue({
      id: 'inv-1',
      email: USER.email,
      status: 'pending',
    } as any)
    await sendVerificationEmailHook({ user: USER, url: URL })
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  it('DOES send when user has an accepted invitation (only pending blocks)', async () => {
    mockFindSetting.mockResolvedValue({
      key: 'email.verificationRequired',
      value: 'true',
    } as any)
    mockFindInvitation.mockResolvedValue(null) // accepted invitations not matched by status: "pending"
    mockFindCooldown.mockResolvedValue(null)
    mockUpsertCooldown.mockResolvedValue({} as any)
    await sendVerificationEmailHook({ user: USER, url: URL })
    expect(mockSendMail).toHaveBeenCalledTimes(1)
  })

  it("DOES send when user has no invitation and setting is 'true'", async () => {
    mockFindSetting.mockResolvedValue({
      key: 'email.verificationRequired',
      value: 'true',
    } as any)
    mockFindInvitation.mockResolvedValue(null)
    mockFindCooldown.mockResolvedValue(null)
    mockUpsertCooldown.mockResolvedValue({} as any)

    await sendVerificationEmailHook({ user: USER, url: URL })
    expect(mockSendMail).toHaveBeenCalledTimes(1)
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@test.com',
        to: USER.email,
        subject: 'Verify your Torqvoice email',
      })
    )
  })

  it('does NOT send when cooldown record exists and has not expired', async () => {
    mockFindSetting.mockResolvedValue({
      key: 'email.verificationRequired',
      value: 'true',
    } as any)
    mockFindInvitation.mockResolvedValue(null)
    mockFindCooldown.mockResolvedValue({
      identifier: `email-verify-cooldown:${USER.id}`,
      expiresAt: new Date(Date.now() + 30_000), // 30 seconds in the future
    } as any)

    await sendVerificationEmailHook({ user: USER, url: URL })
    expect(mockSendMail).not.toHaveBeenCalled()
    expect(mockUpsertCooldown).not.toHaveBeenCalled()
  })

  it('DOES send when cooldown record exists but has expired', async () => {
    mockFindSetting.mockResolvedValue({
      key: 'email.verificationRequired',
      value: 'true',
    } as any)
    mockFindInvitation.mockResolvedValue(null)
    mockFindCooldown.mockResolvedValue({
      identifier: `email-verify-cooldown:${USER.id}`,
      expiresAt: new Date(Date.now() - 5_000), // 5 seconds in the past
    } as any)
    mockUpsertCooldown.mockResolvedValue({} as any)

    await sendVerificationEmailHook({ user: USER, url: URL })
    expect(mockSendMail).toHaveBeenCalledTimes(1)
  })

  it('creates/upserts cooldown record when sending', async () => {
    mockFindSetting.mockResolvedValue({
      key: 'email.verificationRequired',
      value: 'true',
    } as any)
    mockFindInvitation.mockResolvedValue(null)
    mockFindCooldown.mockResolvedValue(null)
    mockUpsertCooldown.mockResolvedValue({} as any)

    await sendVerificationEmailHook({ user: USER, url: URL })
    expect(mockUpsertCooldown).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { identifier: `email-verify-cooldown:${USER.id}` },
        create: expect.objectContaining({
          identifier: `email-verify-cooldown:${USER.id}`,
          value: '1',
        }),
      })
    )
  })

  it('catches sendMail errors and logs them (does not throw)', async () => {
    mockFindSetting.mockResolvedValue({
      key: 'email.verificationRequired',
      value: 'true',
    } as any)
    mockFindInvitation.mockResolvedValue(null)
    mockFindCooldown.mockResolvedValue(null)
    mockUpsertCooldown.mockResolvedValue({} as any)
    mockSendMail.mockRejectedValue(new Error('SMTP connection failed'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* no-op */
    })

    // Should NOT throw
    await expect(sendVerificationEmailHook({ user: USER, url: URL })).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[emailVerification] Failed to send verification email:',
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })
})
