import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/get-auth-context'
import { getFeatures } from '@/lib/features'
import { isDemoMode } from '@/lib/demo'
import { getManifest } from '@/integrations/registry'
import { appUrl } from '@/features/integrations/Lib/connections'
import { connectorAllowed } from '@/features/integrations/Lib/plan'
import {
  buildAuthorizeUrl,
  newCodeVerifier,
  newState,
  oauthSpec,
  redirectUriFor,
  resolveClient,
} from '@/features/integrations/Lib/oauth'
import { openCredentials, sealCredentials } from '@/features/integrations/Lib/vault'

/**
 * Begin the OAuth handshake for a connector. Creates (or reuses) the
 * organisation's connection row in the pending state, stores the state
 * nonce and PKCE verifier on it, and sends the browser to the vendor.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ connector: string }> }
) {
  const { connector } = await context.params
  const settingsUrl = `${appUrl()}/settings/integrations/${connector}`
  const fail = (code: string) => NextResponse.redirect(`${settingsUrl}?error=${code}`)

  if (isDemoMode) return fail('demo')
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.redirect(`${appUrl()}/auth/sign-in`)
  if (!ctx.isAdmin) return fail('forbidden')

  const manifest = getManifest(connector)
  const spec = manifest ? oauthSpec(manifest) : null
  if (!manifest || !spec) return fail('unknown')

  const features = await getFeatures(ctx.organizationId)
  if (!connectorAllowed(manifest, features)) return fail('plan')

  const existing = await db.integrationConnection.findUnique({
    where: {
      organizationId_connectorId: { organizationId: ctx.organizationId, connectorId: connector },
    },
  })
  const previous = openCredentials(existing?.credentials)
  const client = resolveClient(spec, previous)
  if (!client) return fail('no-client')

  const state = newState()
  const codeVerifier = spec.pkce ? newCodeVerifier() : undefined
  // Keep a tenant-owned client id and secret; drop stale tokens.
  const credentials: Record<string, unknown> = {
    ...(client.ownership === 'tenant' && {
      clientId: client.clientId,
      clientSecret: client.clientSecret,
    }),
    ...(codeVerifier && { codeVerifier }),
  }

  await db.integrationConnection.upsert({
    where: {
      organizationId_connectorId: { organizationId: ctx.organizationId, connectorId: connector },
    },
    create: {
      organizationId: ctx.organizationId,
      connectorId: connector,
      status: 'pending',
      oauthState: state,
      credentials: sealCredentials(credentials),
      createdById: ctx.userId,
    },
    update: {
      status: existing?.status === 'active' ? 'active' : 'pending',
      oauthState: state,
      credentials: sealCredentials({
        ...previous,
        ...credentials,
        accessToken: undefined,
        refreshToken: undefined,
      }),
    },
  })

  const url = buildAuthorizeUrl({
    spec,
    client,
    redirectUri: redirectUriFor(appUrl(), connector),
    state,
    codeVerifier,
  })
  return NextResponse.redirect(url)
}
