import { isCloudMode } from './features'

/**
 * Google sign-in for the cloud instance.
 *
 * Switched on by the pair of env vars and only in cloud mode: a self-hosted
 * install would need its own Google project, and the marketing pitch on the
 * sign-up page is a cloud page anyway. Distinct from
 * GOOGLE_INTEGRATION_CLIENT_ID, which is the calendar connector's client and
 * asks for calendar scopes this must never request.
 */
export function googleSignInConfig(): { clientId: string; clientSecret: string } | null {
  if (!isCloudMode()) return null
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_AUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export function isGoogleSignInEnabled(): boolean {
  return googleSignInConfig() !== null
}
