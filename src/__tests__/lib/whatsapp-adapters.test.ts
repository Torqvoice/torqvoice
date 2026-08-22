/**
 * Tests for the two WhatsApp adapters.
 *
 * Every provider is reached over HTTP with a payload we build by hand, and a
 * wrong field name fails silently at the far end: the API returns 200 and the
 * customer receives nothing. These pin the shapes, and the webhook parsing
 * that has to survive whatever the provider posts back.
 */

import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { buildMetaPayload, metaAdapter } from '@/lib/whatsapp/adapters/meta'
import { buildTwilioForm, twilioAdapter } from '@/lib/whatsapp/adapters/twilio'
import type { WhatsappContext } from '@/lib/whatsapp/types'

const metaContext: WhatsappContext = {
  organizationId: 'org_1',
  from: '+4915112345678',
  credentials: {
    phoneNumberId: '11112222',
    accessToken: 'token',
    verifyToken: 'let-me-in',
    appSecret: 'shhh',
  },
}

const twilioContext: WhatsappContext = {
  organizationId: 'org_1',
  from: '+4915112345678',
  credentials: { accountSid: 'AC123', authToken: 'secret', webhookToken: 'tok_abc' },
}

describe('meta payloads', () => {
  it('strips the plus from the recipient, which Meta rejects', () => {
    const payload = buildMetaPayload({ to: '+49 151 12345678', body: 'Hallo' })
    expect(payload.to).toBe('4915112345678')
  })

  it('sends a photo as an image with the text as its caption', () => {
    const payload = buildMetaPayload({
      to: '+4915112345678',
      body: 'Der Bremssattel ist fest',
      mediaUrl: 'https://example.com/part.jpg',
      mediaType: 'image',
    })
    expect(payload.type).toBe('image')
    expect(payload.image).toEqual({
      link: 'https://example.com/part.jpg',
      caption: 'Der Bremssattel ist fest',
    })
  })

  it('keeps the filename on a document, where WhatsApp shows it', () => {
    const payload = buildMetaPayload({
      to: '+4915112345678',
      mediaUrl: 'https://example.com/invoice.pdf',
      mediaType: 'document',
      mediaFilename: 'Rechnung-2026-001.pdf',
    })
    expect(payload.document).toMatchObject({ filename: 'Rechnung-2026-001.pdf' })
  })

  it('passes template variables in order, as positional body parameters', () => {
    const payload = buildMetaPayload({
      to: '+4915112345678',
      template: { name: 'vehicle_ready', language: 'de', variables: ['Golf', 'Freitag'] },
    })
    const template = payload.template as {
      name: string
      language: { code: string }
      components: Array<{ type: string; parameters: Array<{ text: string }> }>
    }
    expect(payload.type).toBe('template')
    expect(template.language.code).toBe('de')
    expect(template.components[0].parameters.map((p) => p.text)).toEqual(['Golf', 'Freitag'])
  })

  it('omits components entirely for a template that takes none', () => {
    const payload = buildMetaPayload({
      to: '+4915112345678',
      template: { name: 'hello', language: 'en' },
    })
    expect(payload.template).not.toHaveProperty('components')
  })
})

describe('meta webhook', () => {
  function signed(body: string, secret = 'shhh') {
    const signature = createHmac('sha256', secret).update(body).digest('hex')
    return new Request('https://app.test/api/webhooks/whatsapp/meta/org_1', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${signature}` },
      body,
    })
  }

  const inboundBody = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { display_phone_number: '4915112345678' },
              contacts: [{ profile: { name: 'Manuel' } }],
              messages: [
                {
                  id: 'wamid.1',
                  from: '4917612345678',
                  timestamp: '1755780000',
                  type: 'text',
                  text: { body: 'Ist mein Auto fertig?' },
                },
              ],
            },
          },
        ],
      },
    ],
  })

  it('reads an inbound message and restores E.164 on both numbers', async () => {
    const events = await metaAdapter.receive(signed(inboundBody), metaContext)
    expect(events.inbound).toHaveLength(1)
    expect(events.inbound[0]).toMatchObject({
      providerMessageId: 'wamid.1',
      from: '+4917612345678',
      to: '+4915112345678',
      body: 'Ist mein Auto fertig?',
      senderName: 'Manuel',
    })
  })

  it('rejects a delivery whose signature does not match the app secret', async () => {
    const forged = new Request('https://app.test/api/webhooks/whatsapp/meta/org_1', {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=deadbeef' },
      body: inboundBody,
    })
    await expect(metaAdapter.receive(forged, metaContext)).rejects.toThrow(/signature/i)
  })

  it('reads an image message as media rather than empty text', async () => {
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { display_phone_number: '4915112345678' },
                messages: [
                  {
                    id: 'wamid.2',
                    from: '4917612345678',
                    type: 'image',
                    image: { id: 'media-99', mime_type: 'image/jpeg', caption: 'Hier' },
                  },
                ],
              },
            },
          ],
        },
      ],
    })
    const events = await metaAdapter.receive(signed(body), metaContext)
    expect(events.inbound[0].media).toEqual({
      reference: 'media-99',
      type: 'image',
      mimeType: 'image/jpeg',
      filename: undefined,
    })
    expect(events.inbound[0].body).toBe('Hier')
  })

  it('turns delivery receipts into status events and drops the ones we do not track', async () => {
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: 'wamid.1', status: 'read' },
                  { id: 'wamid.2', status: 'deleted' },
                ],
              },
            },
          ],
        },
      ],
    })
    const events = await metaAdapter.receive(signed(body), metaContext)
    expect(events.statuses).toEqual([
      { providerMessageId: 'wamid.1', status: 'read', errorMessage: undefined },
    ])
  })

  it('echoes the challenge only when the verify token matches', async () => {
    const url = 'https://app.test/api/webhooks/whatsapp/meta/org_1'
    const ok = await metaAdapter.verify?.(
      new Request(`${url}?hub.mode=subscribe&hub.verify_token=let-me-in&hub.challenge=42`),
      metaContext
    )
    expect(await ok?.text()).toBe('42')

    const wrong = await metaAdapter.verify?.(
      new Request(`${url}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42`),
      metaContext
    )
    expect(wrong?.status).toBe(403)
  })
})

describe('twilio payloads', () => {
  it('prefixes both numbers with the whatsapp channel', () => {
    const form = buildTwilioForm(twilioContext, { to: '+4917612345678', body: 'Hallo' })
    expect(form.get('To')).toBe('whatsapp:+4917612345678')
    expect(form.get('From')).toBe('whatsapp:+4915112345678')
  })

  it('sends through a messaging service instead of the number when one is set', () => {
    const form = buildTwilioForm(
      {
        ...twilioContext,
        credentials: { ...twilioContext.credentials, messagingServiceSid: 'MG1' },
      },
      { to: '+4917612345678', body: 'Hallo' }
    )
    expect(form.get('MessagingServiceSid')).toBe('MG1')
    expect(form.get('From')).toBeNull()
  })

  it('maps template variables to Twilio numbered content variables', () => {
    const form = buildTwilioForm(twilioContext, {
      to: '+4917612345678',
      template: { name: 'HX123', language: 'de', variables: ['Golf', 'Freitag'] },
    })
    expect(form.get('ContentSid')).toBe('HX123')
    expect(JSON.parse(form.get('ContentVariables') as string)).toEqual({
      '1': 'Golf',
      '2': 'Freitag',
    })
  })

  it('leaves media to the template rather than sending it alongside', () => {
    // Twilio's Content API fills a media template's image from a content
    // variable; a MediaUrl next to a ContentSid is rejected or ignored.
    const form = buildTwilioForm(twilioContext, {
      to: '+4917612345678',
      template: {
        name: 'HX123',
        language: 'de',
        variables: ['https://app.test/photo.jpg', 'Bremssattel fest'],
        headerMediaUrl: 'https://app.test/photo.jpg',
      },
    })
    expect(form.get('MediaUrl')).toBeNull()
    expect(JSON.parse(form.get('ContentVariables') as string)).toEqual({
      '1': 'https://app.test/photo.jpg',
      '2': 'Bremssattel fest',
    })
  })
})

describe('twilio webhook', () => {
  function inbound(fields: Record<string, string>, token = 'tok_abc') {
    const body = new URLSearchParams(fields)
    return new Request(`https://app.test/api/webhooks/whatsapp/twilio/org_1?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  }

  it('reads a message and strips the channel prefix off the numbers', async () => {
    const events = await twilioAdapter.receive(
      inbound({
        MessageSid: 'SM1',
        From: 'whatsapp:+4917612345678',
        To: 'whatsapp:+4915112345678',
        Body: 'Ist mein Auto fertig?',
        ProfileName: 'Manuel',
        NumMedia: '0',
      }),
      twilioContext
    )
    expect(events.inbound[0]).toMatchObject({
      from: '+4917612345678',
      to: '+4915112345678',
      body: 'Ist mein Auto fertig?',
      senderName: 'Manuel',
    })
  })

  it('rejects a call without the shared token in the URL', async () => {
    await expect(
      twilioAdapter.receive(
        inbound({ From: 'whatsapp:+49176', Body: 'hi' }, 'wrong'),
        twilioContext
      )
    ).rejects.toThrow(/token/i)
  })

  it('treats a bodyless status callback as a delivery receipt, not a message', async () => {
    const events = await twilioAdapter.receive(
      inbound({ MessageSid: 'SM1', MessageStatus: 'delivered' }),
      twilioContext
    )
    expect(events.inbound).toHaveLength(0)
    expect(events.statuses[0]).toMatchObject({ providerMessageId: 'SM1', status: 'delivered' })
  })

  it('carries an attachment through as media', async () => {
    const events = await twilioAdapter.receive(
      inbound({
        MessageSid: 'SM2',
        From: 'whatsapp:+4917612345678',
        To: 'whatsapp:+4915112345678',
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.com/media/ME1',
        MediaContentType0: 'image/jpeg',
      }),
      twilioContext
    )
    expect(events.inbound[0].media).toMatchObject({
      reference: 'https://api.twilio.com/media/ME1',
      type: 'image',
    })
  })

  it('refuses to fetch media from a host that is not Twilio', async () => {
    await expect(
      twilioAdapter.fetchMedia?.(twilioContext, 'https://evil.example.com/x.jpg')
    ).rejects.toThrow(/outside Twilio/i)
  })

  it('answers Twilio with empty TwiML so it does not reply to the customer', async () => {
    const response = twilioAdapter.acknowledge()
    expect(response.headers.get('content-type')).toContain('xml')
    expect(await response.text()).toContain('<Response/>')
  })
})
