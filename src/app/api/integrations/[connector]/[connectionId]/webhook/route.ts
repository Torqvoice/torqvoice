import { NextRequest, NextResponse } from 'next/server'
import { loadConnection } from '@/features/integrations/Lib/connections'
import { enqueueJob } from '@/features/integrations/Lib/jobs'

/**
 * Inbound webhooks for connectors that receive pushes from their vendor.
 * The connector verifies the request and says which jobs to queue; this
 * route acknowledges quickly and lets the cron do the work. Connectors
 * without a webhook handler answer 404, so nothing here is reachable for a
 * calendar connector that only polls.
 */
async function handle(
  request: NextRequest,
  context: { params: Promise<{ connector: string; connectionId: string }> }
) {
  const { connector, connectionId } = await context.params
  if (!/^[a-z0-9]+$/i.test(connectionId))
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let loaded: Awaited<ReturnType<typeof loadConnection>>
  try {
    loaded = await loadConnection(connectionId)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (loaded.ctx.connection.connectorId !== connector || !loaded.server.webhook) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const result = await loaded.server.webhook.receive(request, loaded.ctx)
    for (const job of result.jobs) {
      await enqueueJob({
        connectionId,
        organizationId: loaded.ctx.connection.organizationId,
        kind: job.kind,
        payload: job.payload,
      })
    }
    return result.response ?? NextResponse.json({ ok: true })
  } catch (err) {
    await loaded.ctx.log(
      'warn',
      `Webhook rejected: ${err instanceof Error ? err.message : String(err)}`
    )
    return NextResponse.json({ error: 'Rejected' }, { status: 400 })
  }
}

export const POST = handle
export const GET = handle
