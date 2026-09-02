/**
 * OAuth 2.0 authorization code, done once for every connector.
 *
 * A connector's manifest names the endpoints and scopes; this module builds
 * the authorize URL, exchanges the code, and refreshes tokens. Which client
 * id and secret to use depends on who owns the vendor app: the platform (set
 * in the environment, used by the cloud) or the workshop (entered in
 * settings, used by self-hosted installs).
 */

import { createHash, randomBytes } from 'node:crypto'
import type { AuthSpec, ConnectorManifest, OAuthCredentials } from './types'

export type OAuth2Spec = Extract<AuthSpec, { type: 'oauth2' }>

export interface OAuthClient {
  clientId: string
  clientSecret: string
  ownership: 'platform' | 'tenant'
}

export function oauthSpec(manifest: ConnectorManifest): OAuth2Spec | null {
  return manifest.auth.type === 'oauth2' ? manifest.auth : null
}

/** Whether this install has a platform-owned app for the connector. */
export function platformClient(spec: OAuth2Spec): OAuthClient | null {
  if (!spec.platformEnv) return null
  const clientId = process.env[spec.platformEnv.clientId]?.trim()
  const clientSecret = process.env[spec.platformEnv.clientSecret]?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, ownership: 'platform' }
}

/**
 * The platform's app when configured, otherwise the workshop's own from the
 * stored credentials. Null means the connector cannot be connected here
 * until the workshop enters an app of its own.
 */
export function resolveClient(
  spec: OAuth2Spec,
  credentials: Record<string, unknown>
): OAuthClient | null {
  const platform = platformClient(spec)
  if (platform) return platform
  const clientId = typeof credentials.clientId === 'string' ? credentials.clientId : ''
  const clientSecret = typeof credentials.clientSecret === 'string' ? credentials.clientSecret : ''
  if (clientId && clientSecret) return { clientId, clientSecret, ownership: 'tenant' }
  return null
}

export function redirectUriFor(appUrl: string, connectorId: string): string {
  return `${appUrl.replace(/\/$/, '')}/api/integrations/${connectorId}/oauth/callback`
}

export function newState(): string {
  return randomBytes(24).toString('base64url')
}

export function newCodeVerifier(): string {
  return randomBytes(48).toString('base64url')
}

function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function buildAuthorizeUrl(input: {
  spec: OAuth2Spec
  client: OAuthClient
  redirectUri: string
  state: string
  codeVerifier?: string
}): string {
  const url = new URL(input.spec.authorizeUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', input.client.clientId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('scope', input.spec.scopes.join(' '))
  url.searchParams.set('state', input.state)
  for (const [k, v] of Object.entries(input.spec.authorizeParams ?? {})) url.searchParams.set(k, v)
  if (input.codeVerifier) {
    url.searchParams.set('code_challenge', codeChallenge(input.codeVerifier))
    url.searchParams.set('code_challenge_method', 'S256')
  }
  return url.toString()
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number | string
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
}

async function tokenRequest(
  tokenUrl: string,
  params: Record<string, string>
): Promise<TokenResponse> {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params).toString(),
  })
  const text = await res.text()
  let body: TokenResponse
  try {
    body = JSON.parse(text) as TokenResponse
  } catch {
    throw new Error(`Token endpoint returned ${res.status}: ${text.slice(0, 200)}`)
  }
  if (!res.ok || body.error || !body.access_token) {
    throw new Error(body.error_description || body.error || `Token endpoint returned ${res.status}`)
  }
  return body
}

function toCredentials(body: TokenResponse, previous: OAuthCredentials): OAuthCredentials {
  const expiresIn = Number(body.expires_in)
  return {
    ...previous,
    accessToken: body.access_token as string,
    // Some vendors omit the refresh token on refresh; keep the one we have.
    refreshToken: body.refresh_token ?? previous.refreshToken,
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined,
    tokenType: body.token_type ?? previous.tokenType,
    scope: body.scope ?? previous.scope,
    codeVerifier: undefined,
  }
}

export async function exchangeCode(input: {
  spec: OAuth2Spec
  client: OAuthClient
  code: string
  redirectUri: string
  codeVerifier?: string
  previous?: OAuthCredentials
}): Promise<OAuthCredentials> {
  const body = await tokenRequest(input.spec.tokenUrl, {
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.client.clientId,
    client_secret: input.client.clientSecret,
    ...(input.codeVerifier && { code_verifier: input.codeVerifier }),
  })
  return toCredentials(body, input.previous ?? { accessToken: '' })
}

export async function refreshToken(input: {
  spec: OAuth2Spec
  client: OAuthClient
  credentials: OAuthCredentials
}): Promise<OAuthCredentials> {
  if (!input.credentials.refreshToken)
    throw new Error('No refresh token; reconnect the integration')
  const body = await tokenRequest(input.spec.tokenUrl, {
    grant_type: 'refresh_token',
    refresh_token: input.credentials.refreshToken,
    client_id: input.client.clientId,
    client_secret: input.client.clientSecret,
  })
  return toCredentials(body, input.credentials)
}

/** True when the access token is missing or expires within the next minute. */
export function needsRefresh(credentials: OAuthCredentials): boolean {
  if (!credentials.accessToken) return true
  if (!credentials.expiresAt) return false
  return credentials.expiresAt - Date.now() < 60_000
}
