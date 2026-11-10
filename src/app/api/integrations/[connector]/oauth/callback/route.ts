import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/get-auth-context'
import { logAudit } from '@/lib/audit'
import { getManifest } from '@/integrations/registry'
import {
  appUrl,
  loadConnection,
  setConnectionStatus,
  writeLog,
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
      state,
      previous,
    })
  } catch (err) {
    // The vendor's own words, such as invalid_client for a wrong secret, are
    // the only clue to what is misconfigured. The browser only gets a code,
    // so they go to the server log and the connection's activity log as well.
    const reason = err instanceof Error ? err.message : 'Token exchange failed'
    console.error(`[integrations] ${connector} refused the sign-in: ${reason}`)
    await db.integrationConnection.update({
      where: { id: connection.id },
      data: {
        oauthState: null,
        status: connection.status === 'active' ? 'active' : 'error',
        lastError: reason,
      },
    })
    await writeLog(connection.id, 'error', 'The provider refused the sign-in', { error: reason })
    return fail('exchange')
  }

  // What the vendor tells us only here, such as which company was chosen,
  // goes into the sealed credentials, next to the tokens, so identify and
  // every job after it can read it and it never sits in the database in the
  // clear: Intuit's rules put the realm id under the same encryption as the
  // refresh token. A token refresh spreads the previous credentials, so it
  // survives those.
  const extra: Record<string, string> = {}
  for (const name of spec.callbackParams ?? []) {
    const value = params.get(name)
    if (value) extra[name] = value
  }

  await db.integrationConnection.update({
    where: { id: connection.id },
    data: {
      oauthState: null,
      credentials: sealCredentials({
        ...(credentials as unknown as Record<string, unknown>),
        ...extra,
      }),
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

  // Settings the vendor already knows, such as the one organisation that was
  // allowed, so the form does not ask for them. A failure here leaves them
  // for the workshop to choose; the connection itself is good.
  try {
    const { ctx: connectorCtx, server } = await loadConnection(connection.id)
    const outcome = server.onConnect ? await server.onConnect(connectorCtx) : undefined
    if (outcome?.settings) {
      const row = await db.integrationConnection.findUnique({
        where: { id: connection.id },
        select: { settings: true },
      })
      await db.integrationConnection.update({
        where: { id: connection.id },
        data: {
          settings: {
            ...((row?.settings as Record<string, unknown> | null) ?? {}),
            ...outcome.settings,
          } as object,
        },
      })
    }
  } catch (err) {
    await writeLog(connection.id, 'warn', 'Connection setup could not finish on its own', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  await logAudit(
    { userId: ctx.userId, organizationId: ctx.organizationId },
    {
      action: 'integration.connect',
      entity: 'IntegrationConnection',
      entityId: connection.id,
      details: {
        key: 'integration_connect',
        params: { name: manifest.name, connectorId: manifest.id },
      },
    }
  )

  return NextResponse.redirect(`${settingsUrl}?connected=1`)
}
