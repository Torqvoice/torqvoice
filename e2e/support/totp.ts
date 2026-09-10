import { createOTP } from '@better-auth/utils/otp'
import { symmetricDecrypt } from 'better-auth/crypto'

/**
 * The six digits an authenticator app would show right now, from the secret
 * better-auth stored when 2FA was enabled.
 *
 * The secret is kept encrypted with the auth secret, the same one the test
 * server was started with, so the test can read it back the way the server
 * does and stand in for the phone. The QR code on the screen carries the
 * same secret, but a picture is no use to a test.
 */
export async function currentTotpCode(storedSecret: string): Promise<string> {
  const key = process.env.BETTER_AUTH_SECRET ?? 'e2e-secret-not-for-production'
  const secret = await symmetricDecrypt({ key, data: storedSecret })
  return createOTP(secret, { digits: 6, period: 30 }).totp()
}
