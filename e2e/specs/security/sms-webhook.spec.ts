import { expect, test } from '@playwright/test'
import {
  deleteInboundSms,
  forgetConnections,
  inboundSmsCount,
  insertConnection,
  ownerOrganizationId,
  userIdFor,
} from '../../support/db'
import { sealCredentials, twilioSignature, webhookSecretHash } from '../../support/webhooks'

/**
 * An inbound text message has to come from the vendor.
 *
 * The SMS webhooks authenticated on a secret in the URL and nothing else, and
 * a URL is something a vendor's dashboard, a log line or a support ticket
 * shows to people. Anyone who had seen it could post a message attributed to
 * any customer. Twilio signs every delivery with the account's auth token,
 * and the route checks that signature now; the secret in the URL only says
 * which workshop the call is for.
 *
 * The connection is planted with sealed keys rather than connected through
 * the page, because connecting tests the keys against Twilio.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const AUTH_TOKEN = `e2e-twilio-token-${stamp}`
const URL_SECRET = `e2e-url-secret-${stamp}`
const FROM = '+15551230000'
const BODY = `E2E inbound ${stamp}`

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'
const webhook = `${baseURL}/api/webhooks/sms/twilio?org_secret=${URL_SECRET}`

let organizationId = ''

/** What Twilio posts: the message as form fields. */
function message(body = BODY): Record<string, string> {
  return { From: FROM, To: '+15550009999', Body: body, MessageSid: `SM${stamp}` }
}

test.beforeAll(async () => {
  organizationId = await ownerOrganizationId()
  await forgetConnections(['twilio-sms'])
  await insertConnection({
    organizationId,
    connectorId: 'twilio-sms',
    credentials: sealCredentials({
      accountSid: 'ACe2e',
      authToken: AUTH_TOKEN,
      webhookSecret: URL_SECRET,
    }),
    settings: { webhookSecretHash: webhookSecretHash(URL_SECRET) },
    createdById: await userIdFor('demo@torqvoice.com'),
  })
})

test.afterAll(async () => {
  await forgetConnections(['twilio-sms'])
  await deleteInboundSms(organizationId, BODY)
})

test.describe('a text message posted to the Twilio webhook', () => {
  test('with the wrong URL secret is for nobody', async ({ request }) => {
    const response = await request.post(`${baseURL}/api/webhooks/sms/twilio?org_secret=wrong`, {
      form: message(),
    })
    expect(response.status()).toBe(403)
    expect(await response.json()).toEqual({ error: 'Invalid org_secret' })
  })

  test('without Twilio’s signature is dropped', async ({ request }) => {
    const response = await request.post(webhook, { form: message() })
    expect(response.status()).toBe(403)
    expect(await response.json()).toEqual({ error: 'Invalid signature' })
    expect(await inboundSmsCount(organizationId, BODY), 'nothing was filed').toBe(0)
  })

  test('with a signature made with the wrong token is dropped', async ({ request }) => {
    const response = await request.post(webhook, {
      form: message(),
      headers: { 'x-twilio-signature': twilioSignature('not-the-token', webhook, message()) },
    })
    expect(response.status()).toBe(403)
    expect(await inboundSmsCount(organizationId, BODY), 'nothing was filed').toBe(0)
  })

  test('with a signature Twilio would make is received', async ({ request }) => {
    const response = await request.post(webhook, {
      form: message(),
      headers: { 'x-twilio-signature': twilioSignature(AUTH_TOKEN, webhook, message()) },
    })
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/xml')
    expect(await inboundSmsCount(organizationId, BODY), 'the message is filed once').toBe(1)
  })

  test('with a body that was changed after signing is dropped', async ({ request }) => {
    // The signature covers every field, so a message cannot be altered in
    // flight either.
    const signed = message()
    const response = await request.post(webhook, {
      form: message(`${BODY} tampered`),
      headers: { 'x-twilio-signature': twilioSignature(AUTH_TOKEN, webhook, signed) },
    })
    expect(response.status()).toBe(403)
    expect(await inboundSmsCount(organizationId, `${BODY} tampered`)).toBe(0)
  })
})
