import { expect, test } from '@playwright/test'
import { createHmac } from 'node:crypto'
import {
  deleteInboundWhatsapp,
  forgetConnections,
  inboundWhatsappCount,
  insertConnection,
  ownerOrganizationId,
  userIdFor,
} from '../../support/db'
import { sealCredentials } from '../../support/webhooks'

/**
 * A WhatsApp message has to come from Meta.
 *
 * The webhook URL names only the workshop's id, which every share link and
 * public logo carries, so the signature Meta puts on each delivery is the
 * whole of the proof. The app secret that checks it used to be optional, and
 * a workshop that left it blank had a webhook anyone could post to: a made-up
 * message landed in the inbox as if a customer had written it. A delivery
 * that cannot be checked is not read now.
 *
 * The route answers 200 whatever happens, so that Meta does not retry, and
 * the outcome is read from the database.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const APP_SECRET = `e2e-meta-app-secret-${stamp}`
const BODY = `E2E WhatsApp inbound ${stamp}`

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

let organizationId = ''
let webhook = ''

/** What Meta posts for one text message. */
function delivery(body: string): string {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { display_phone_number: '15550009999' },
              contacts: [{ profile: { name: 'E2E Customer' } }],
              messages: [
                {
                  id: `wamid.e2e.${stamp}.${body.length}`,
                  from: '15551230000',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

function signature(raw: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
}

async function plantConnection(withSecret: boolean): Promise<void> {
  await forgetConnections(['whatsapp-meta'])
  await insertConnection({
    organizationId,
    connectorId: 'whatsapp-meta',
    credentials: sealCredentials({
      phoneNumberId: '123456789012345',
      accessToken: 'e2e-access-token',
      verifyToken: 'e2e-verify-token',
      ...(withSecret ? { appSecret: APP_SECRET } : {}),
    }),
    settings: { enabled: true, phoneNumber: '+15550009999' },
    createdById: await userIdFor('demo@torqvoice.com'),
  })
}

test.beforeAll(async () => {
  organizationId = await ownerOrganizationId()
  webhook = `${baseURL}/api/webhooks/whatsapp/meta/${organizationId}`
})

test.afterAll(async () => {
  await forgetConnections(['whatsapp-meta'])
  await deleteInboundWhatsapp(organizationId, BODY)
})

test.describe('a message posted to the Meta webhook', () => {
  test('is dropped when the workshop has no app secret, even with a signature', async ({
    request,
  }) => {
    await plantConnection(false)
    const raw = delivery(`${BODY} unguarded`)

    const bare = await request.post(webhook, {
      data: raw,
      headers: { 'content-type': 'application/json' },
    })
    expect(bare.status(), 'Meta is told not to retry').toBe(200)

    // Whatever the poster signs it with: there is nothing to check it against.
    const signed = await request.post(webhook, {
      data: raw,
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature(raw, 'guess'),
      },
    })
    expect(signed.status()).toBe(200)

    expect(
      await inboundWhatsappCount(organizationId, `${BODY} unguarded`),
      'nothing was filed'
    ).toBe(0)
  })

  test('is dropped without Meta’s signature once the secret is set', async ({ request }) => {
    await plantConnection(true)
    const raw = delivery(`${BODY} unsigned`)

    await request.post(webhook, { data: raw, headers: { 'content-type': 'application/json' } })
    await request.post(webhook, {
      data: raw,
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature(raw, 'wrong'),
      },
    })
    expect(await inboundWhatsappCount(organizationId, `${BODY} unsigned`)).toBe(0)
  })

  test('is filed once when signed with the app secret', async ({ request }) => {
    const raw = delivery(`${BODY} genuine`)
    const response = await request.post(webhook, {
      data: raw,
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature(raw, APP_SECRET),
      },
    })
    expect(response.status()).toBe(200)
    expect(await inboundWhatsappCount(organizationId, `${BODY} genuine`)).toBe(1)
  })

  test('is dropped when the body was changed after signing', async ({ request }) => {
    const signedRaw = delivery(`${BODY} original`)
    await request.post(webhook, {
      data: delivery(`${BODY} tampered`),
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature(signedRaw, APP_SECRET),
      },
    })
    expect(await inboundWhatsappCount(organizationId, `${BODY} tampered`)).toBe(0)
  })
})
