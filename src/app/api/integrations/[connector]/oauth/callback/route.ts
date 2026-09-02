import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/get-auth-context'
import { logAudit } from '@/lib/audit'
import { getManifest } from '@/integrations/registry'
import {
  appUrl,
  loadConnection,
  setConnectionStatus,
} from '@/features/integrations/Lib/connections'
import {
  exchangeCode,
  oauthSpec,
  redirectUriFor,
  resolveClient,
} from '@/features/integrations/Lib/oauth'
import type { OAuthCredentials } from '@/features/integrations/Lib/types'
import { openCredentials, sealCredentials } from '@/features/integrations/Lib/vault'

/**
 * The vendor sends the browser back here with a code. The state nonce finds
 * the pending connection, the code becomes tokens, and the connector says
 * which account it is. Errors land on the settings page with a reason.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ connector: string }> }
) {
  const { connector } = await context.params
  const settingsUrl = `${appUrl()}/settings/integrations/${connector}`
  const fail = (code: string) => NextResponse.redirect(`${settingsUrl}?error=${code}`)

  const params = request.nextUrl.searchParams
  const state = params.get('state')
  const code = params.get('code')
  if (params.get('error'))
    return fail(params.get('error') === 'access_denied' ? 'denied' : 'vendor')
  if (!state || !code) return fail('invalid')

  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.redirect(`${appUrl()}/auth/sign-in`)

  const manifest = getManifest(connector)
  const spec = manifest ? oauthSpec(manifest) : null
  if (!manifest || !spec) return fail('unknown')

  const connection = await db.integrationConnection.findUnique({ where: { oauthState: state } })
  if (
    !connection ||
    connection.organizationId !== ctx.organizationId ||
    connection.connectorId !== connector
  ) {
    return fail('state')
  }

  const previous = openCredentials(connection.credentials) as unknown as OAuthCredentials
  const client = resolveClient(spec, previous as unknown as Record<string, unknown>)
  if (!client) return fail('no-client')

  let credentials: OAuthCredentials
  try {
    credentials = await exchangeCode({
      spec,
      client,
      code,
      redirectUri: redirectUriFor(appUrl(), connector),
      codeVerifier: previous.codeVerifier,
      previous,
    })
  } catch (err) {
    await db.integrationConnection.update({
      where: { id: connection.id },
      data: {
        oauthState: null,
        status: connection.status === 'active' ? 'active' : 'error',
        lastError: err instanceof Error ? err.message : 'Token exchange failed',
      },
    })
    return fail('exchange')
  }

  await db.integrationConnection.update({
    where: { id: connection.id },
    data: {
      oauthState: null,
      credentials: sealCredentials(credentials as unknown as Record<string, unknown>),
      scopes: credentials.scope ?? spec.scopes.join(' '),
      status: 'active',
      lastError: null,
      lastHealthAt: new Date(),
    },
  })

  try {
    const { ctx: connectorCtx, server } = await loadConnection(connection.id)
    if (server.identify) {
      const who = await server.identify(connectorCtx)
      await db.integrationConnection.update({
        where: { id: connection.id },
        data: { externalAccountId: who.id, externalAccountName: who.name },
      })
    }
  } catch (err) {
    await setConnectionStatus(
      connection.id,
      'error',
      err instanceof Error ? err.message : 'Could not read the account'
    )
    return fail('identify')
  }

  await logAudit(
    { userId: ctx.userId, organizationId: ctx.organizationId },
    {
      action: 'integration.connect',
      entity: 'IntegrationConnection',
      entityId: connection.id,
      details: { key: 'integration_connect', params: { name: manifest.name } },
    }
  )

  return NextResponse.redirect(`${settingsUrl}?connected=1`)
}
