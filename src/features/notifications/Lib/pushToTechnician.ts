import { db } from '@/lib/db'

/**
 * Sends a push to every device a technician is signed into.
 *
 * Fire-and-forget by design. A notification is a courtesy on top of work that
 * already succeeded, so a failure here must never surface as a failure of the
 * thing that triggered it: nobody should see "could not assign job" because
 * Expo had a bad minute.
 *
 * Delivery runs through Expo's push service rather than APNs and FCM directly.
 * That is the trade the app already made by being an Expo build, and doing it
 * ourselves would mean holding Apple and Google credentials on the server for
 * no gain the size of the work.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/** Expo's documented cap per request. Larger batches are rejected wholesale. */
const BATCH_SIZE = 100

export interface PushMessage {
  title: string
  body: string
  /** Routed by the app to open the right screen. */
  data?: Record<string, string>
}

export async function pushToTechnician(args: {
  organizationId: string
  technicianId: string
  message: PushMessage
}) {
  try {
    const technician = await db.technician.findFirst({
      where: { id: args.technicianId, organizationId: args.organizationId },
      select: { userId: true },
    })
    if (!technician?.userId) return

    const devices = await db.pushDevice.findMany({
      where: {
        userId: technician.userId,
        organizationId: args.organizationId,
        isActive: true,
      },
      select: { token: true },
    })
    if (devices.length === 0) return

    await sendExpoPush(
      devices.map((d) => d.token),
      args.message
    )
  } catch (err) {
    // Logged, never rethrown. See the note at the top.
    console.error('[push] failed', err)
  }
}

async function sendExpoPush(tokens: string[], message: PushMessage) {
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE)

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // Expo compresses aggressively and rejects oversized bodies otherwise.
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(
        batch.map((to) => ({
          to,
          sound: 'default',
          title: message.title,
          body: message.body,
          data: message.data ?? {},
          // A job notification is worth waking the screen for; it is the
          // difference between seeing it now and seeing it after lunch.
          priority: 'high',
          channelId: 'jobs',
        }))
      ),
    })

    if (!res.ok) {
      console.error('[push] expo rejected the batch', res.status)
      continue
    }

    // Expo answers per message. A token it reports as dead will never work
    // again, so it is retired rather than retried forever on every future send.
    const body = (await res.json().catch(() => null)) as {
      data?: { status: string; details?: { error?: string } }[]
    } | null

    const dead: string[] = []
    body?.data?.forEach((result, index) => {
      if (result.status === 'error' && result.details?.error === 'DeviceNotRegistered') {
        const token = batch[index]
        if (token) dead.push(token)
      }
    })

    if (dead.length > 0) {
      await db.pushDevice
        .updateMany({ where: { token: { in: dead } }, data: { isActive: false } })
        .catch(() => {
          /* best effort; the next send will try again */
        })
    }
  }
}
