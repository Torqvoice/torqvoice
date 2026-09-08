import { describe, expect, it } from 'vitest'
import en from '../../../../messages/en/email.json'
import { buildEmailSpec } from '@/features/email/Lib/buildEmailSpec'
import {
  sampleContextFor,
  sampleValuesFor,
  summaryRowsFor,
  tagValuesFor,
} from '@/features/email/Lib/emailContext'
import { EMAIL_KINDS, kindSpec } from '@/features/email/Lib/emailKinds'
import { type EmailMessages, presetTemplate } from '@/features/email/Lib/emailPresets'
import { activeTemplateId, templateText } from '@/features/email/Lib/emailTemplate'
import { fillTags, missingTags, tagsUsed, unknownTags } from '@/features/email/Lib/tags'
import { renderEmailHtml } from '@/features/email/Render/renderEmailHtml'
import { renderEmailText } from '@/features/email/Render/renderEmailText'
import { readStoredTemplate } from '@/features/email/Schema/emailTemplateSchema'
import {
  joinSplitTags,
  plainToRich,
  richDocSchema,
  richToPlain,
} from '@/features/email/Lib/richText'
import { emailLogoPublicPath, templateAssets } from '@/features/email/Lib/emailTemplate'
import { normalizeHref } from '@/features/email/Lib/links'

const messages = en as EmailMessages
const preset = (kind: (typeof EMAIL_KINDS)[number]) => presetTemplate(kind, messages)

describe('tags', () => {
  it('fills what it has', () => {
    expect(fillTags('Hi {customer_name}', { customer_name: 'Alex' })).toBe('Hi Alex')
  })

  it('renders a known tag with no value as nothing, and tidies the punctuation', () => {
    // "Hi ," is what a blank tag leaves behind; nobody should read that.
    expect(fillTags('Hi {customer_name},', {})).toBe('Hi,')
    expect(fillTags('for your {vehicle} today', {})).toBe('for your today')
  })

  it('leaves a tag it does not know as typed, so a typo is visible', () => {
    expect(fillTags('Hi {custmer_name}', { customer_name: 'Alex' })).toBe('Hi {custmer_name}')
  })

  it('accepts the older SMS spellings', () => {
    expect(fillTags('{company_name}', { workshop_name: 'Bergen Auto' })).toBe('Bergen Auto')
  })

  it('lists the tags a template uses, once each', () => {
    expect(tagsUsed('{a} then {b} then {a}')).toEqual(['a', 'b'])
  })

  it('names the tags a kind does not offer', () => {
    const tags = kindSpec('invoice_sent').tags
    expect(unknownTags('{customer_name} {tyre_pressure}', tags)).toEqual(['tyre_pressure'])
    expect(unknownTags('{signin_link}', tags)).toEqual(['signin_link'])
    expect(unknownTags('{company_name}', tags)).toEqual([])
  })

  it('names a required tag that is missing', () => {
    expect(missingTags('Sign in soon', ['signin_link'])).toEqual(['signin_link'])
    expect(missingTags('Sign in: {signin_link}', ['signin_link'])).toEqual([])
  })
})

describe('presets', () => {
  it.each(EMAIL_KINDS)('%s uses only the tags its kind offers and carries what it must', (kind) => {
    const template = preset(kind)
    const text = templateText(template)
    expect(unknownTags(text, kindSpec(kind).tags)).toEqual([])
    expect(missingTags(text, kindSpec(kind).required)).toEqual([])
  })

  it('reads a stored row leniently, dropping what it cannot understand', () => {
    const stored = readStoredTemplate({
      kind: 'invoice_sent',
      name: 'Mine',
      subject: 'Hello',
      blocks: [
        { id: 'p', type: 'paragraph', text: 'Hi' },
        { id: 'x', type: 'hologram', text: 'from the future' },
      ],
      theme: { primaryColor: '#123456', textColor: 'red' },
    })
    expect(stored?.blocks.map((b) => b.type)).toEqual(['paragraph'])
    expect(stored?.theme.primaryColor).toBe('#123456')
    // A colour that is not a colour costs that colour, not the whole theme.
    expect(stored?.theme.textColor).toBe('#111827')
  })

  it('gives up on a row it cannot use at all, so the preset answers', () => {
    expect(
      readStoredTemplate({
        kind: 'invoice_sent',
        name: 'x',
        subject: 's',
        blocks: 'nope',
        theme: {},
      })
    ).toBeNull()
    expect(
      readStoredTemplate({ kind: 'hologram', name: 'x', subject: 's', blocks: [], theme: {} })
    ).toBeNull()
    expect(
      readStoredTemplate({ kind: 'invoice_sent', name: 'x', subject: 's', blocks: [], theme: null })
    ).toBeNull()
  })

  it('knows what the active-template setting points at', () => {
    expect(activeTemplateId('design:abc')).toBe('abc')
    expect(activeTemplateId('preset')).toBeNull()
    expect(activeTemplateId(undefined)).toBeNull()
  })
})

const workshop = {
  name: 'Bergen Bil',
  phone: '+47 55 00 00 00',
  email: 'post@bergenbil.no',
  address: 'Havnegata 3\n5003 Bergen',
}

const invoice = {
  customerName: 'Alex Carter',
  vehicle: { year: 2019, make: 'Volvo', model: 'V70' },
  document: { number: 'INV-1042', total: 4200, paid: 1000, currencyCode: 'NOK' },
  shareLink: 'https://shop.example.com/share/invoice/org/tok',
}

const invoiceInput = {
  values: tagValuesFor('invoice_sent', invoice, { workshop }),
  summary: summaryRowsFor('invoice_sent', invoice, messages.summary),
}

describe('buildEmailSpec', () => {
  it('fills the subject and the blocks from one set of values', () => {
    const spec = buildEmailSpec(preset('invoice_sent'), invoiceInput)
    expect(spec.subject).toBe('Invoice INV-1042 from Bergen Bil')
    const paragraph = spec.blocks.find((b) => b.type === 'paragraph')
    expect(paragraph && 'text' in paragraph && paragraph.text).toContain('Alex Carter')
  })

  it('never sends a literal tag when the send has no value for it', () => {
    const spec = buildEmailSpec(preset('invoice_sent'), {
      values: tagValuesFor('invoice_sent', { document: { number: 'INV-1' } }, { workshop }),
    })
    const html = renderEmailHtml(spec)
    expect(html).not.toMatch(/\{\w+\}/)
    expect(spec.subject).toBe('Invoice INV-1 from Bergen Bil')
  })

  it('drops a button whose link has no value', () => {
    const spec = buildEmailSpec(preset('invoice_sent'), {
      values: { ...invoiceInput.values, share_link: undefined },
    })
    expect(spec.blocks.some((b) => b.type === 'button')).toBe(false)
  })

  it('drops the summary panel when there is nothing to summarise', () => {
    const spec = buildEmailSpec(preset('invoice_sent'), { values: invoiceInput.values })
    expect(spec.blocks.some((b) => b.type === 'document_summary')).toBe(false)
  })

  it('shows only the summary rows the block asks for', () => {
    const template = preset('invoice_sent')
    template.blocks = [{ id: 's', type: 'document_summary', rows: ['total'] }]
    const spec = buildEmailSpec(template, invoiceInput)
    const summary = spec.blocks[0]
    expect(summary.type === 'document_summary' && summary.rows.map((r) => r.key)).toEqual(['total'])
  })

  it('mentions the attachment only when there is one', () => {
    const attached = buildEmailSpec(preset('invoice_sent'), { ...invoiceInput, attached: true })
    const linked = buildEmailSpec(preset('invoice_sent'), invoiceInput)
    expect(attached.blocks.some((b) => b.type === 'attachment_note')).toBe(true)
    expect(linked.blocks.some((b) => b.type === 'attachment_note')).toBe(false)
  })

  it('shows the logo only when the theme wants it', () => {
    const template = preset('invoice_sent')
    const withLogo = buildEmailSpec(template, { ...invoiceInput, logoUrl: 'https://x/logo.png' })
    const header = withLogo.blocks[0]
    expect(header.type === 'header' && header.logoUrl).toBe('https://x/logo.png')
    template.theme = { ...template.theme, showLogo: false }
    const without = buildEmailSpec(template, { ...invoiceInput, logoUrl: 'https://x/logo.png' })
    expect(without.blocks[0].type === 'header' && without.blocks[0].logoUrl).toBeUndefined()
  })

  it('does not leave a rule or a gap where a dropped block was', () => {
    const template = preset('invoice_sent')
    template.blocks = [
      { id: 'd1', type: 'divider' },
      { id: 'p', type: 'paragraph', text: 'Hello' },
      { id: 'd2', type: 'divider' },
      { id: 'd3', type: 'divider' },
    ]
    const spec = buildEmailSpec(template, invoiceInput)
    expect(spec.blocks.map((b) => b.type)).toEqual(['paragraph'])
  })
})

describe('renderEmailHtml', () => {
  const spec = buildEmailSpec(preset('invoice_sent'), invoiceInput)
  const html = renderEmailHtml(spec)

  it('builds a table layout rather than anything a mail client will drop', () => {
    expect(html).toContain('<table')
    expect(html).not.toContain('display:flex')
    expect(html).not.toContain('display:grid')
    expect(html).not.toContain('<style')
  })

  it('puts the link behind the button', () => {
    expect(html).toContain('href="https://shop.example.com/share/invoice/org/tok"')
  })

  it('escapes what a person typed instead of pasting it into the markup', () => {
    const template = preset('invoice_sent')
    template.blocks = [{ id: 'p', type: 'paragraph', text: '<script>alert(1)</script>' }]
    const out = renderEmailHtml(buildEmailSpec(template, invoiceInput))
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('refuses a link that is not a real address', () => {
    const template = preset('invoice_sent')
    template.blocks = [
      // eslint-disable-next-line no-script-url
      { id: 'b', type: 'button', label: 'Click', href: 'javascript:alert(1)' },
    ]
    const out = renderEmailHtml(buildEmailSpec(template, invoiceInput))
    expect(out).not.toContain('javascript:')
  })

  it('refuses a theme value that could break out of an attribute', () => {
    const template = preset('invoice_sent')
    template.theme = { ...template.theme, primaryColor: '"><script>alert(1)</script>' }
    const out = renderEmailHtml(buildEmailSpec(template, invoiceInput))
    expect(out).not.toContain('<script>')
    expect(out).toContain('#d97706')
  })

  it('marks every row with its block only when asked, for the designer', () => {
    const sent = renderEmailHtml(spec)
    const marked = renderEmailHtml(spec, { marked: true })
    expect(sent).not.toContain('data-block')
    expect(marked).toContain('<style')
    for (const block of spec.blocks) expect(marked).toContain(`data-block="${block.id}"`)
  })

  it('keeps a typed line break as a break', () => {
    const template = preset('invoice_sent')
    template.blocks = [{ id: 'p', type: 'paragraph', text: 'One\nTwo' }]
    expect(renderEmailHtml(buildEmailSpec(template, invoiceInput))).toContain('One<br />Two')
  })
})

describe('renderEmailText', () => {
  const spec = buildEmailSpec(preset('invoice_sent'), invoiceInput)
  const text = renderEmailText(spec)

  it('says the same things as the HTML, without the markup', () => {
    expect(text).toContain('Alex Carter')
    expect(text).toContain('INV-1042')
    expect(text).not.toContain('<')
  })

  it('spells out a button, since there is nothing to click', () => {
    expect(text).toContain('View invoice: https://shop.example.com/share/invoice/org/tok')
  })
})

describe('emailContext', () => {
  it('works out the balance rather than asking for it', () => {
    const values = tagValuesFor('invoice_sent', invoice, { workshop })
    expect(values.total).toContain('4')
    expect(values.balance_due).toContain('3')
  })

  it('leaves out what the workshop has not filled in', () => {
    const values = tagValuesFor('invoice_sent', invoice, {
      workshop: { name: 'Bergen Bil', phone: '', email: null },
    })
    expect('workshop_phone' in values).toBe(false)
    expect('workshop_email' in values).toBe(false)
  })

  it('names the vehicle the way a person would', () => {
    expect(tagValuesFor('invoice_sent', invoice, { workshop }).vehicle).toBe('2019 Volvo V70')
  })

  it('fills only the tags the kind offers', () => {
    const values = tagValuesFor('portal_signin', { signinLink: 'https://x/s' }, { workshop })
    expect(values.signin_link).toBe('https://x/s')
    expect('share_link' in values).toBe(false)
  })

  it('summarises without repeating the total as the balance', () => {
    const paid = summaryRowsFor(
      'invoice_sent',
      { ...invoice, document: { ...invoice.document, paid: 0 } },
      messages.summary
    )
    expect(paid.map((r) => r.key)).not.toContain('balance')
    expect(summaryRowsFor('invoice_sent', invoice, messages.summary).map((r) => r.key)).toContain(
      'balance'
    )
  })

  it('previews with the real letterhead and an invented job', () => {
    const values = sampleValuesFor('invoice_sent', { name: 'Bergen Bil', phone: '' })
    expect(values.workshop_name).toBe('Bergen Bil')
    expect(values.workshop_phone).toBeUndefined()
    expect(values.customer_name).toBeTruthy()
    expect(sampleValuesFor('invoice_sent', {}).workshop_name).toBeTruthy()
  })

  it.each(EMAIL_KINDS)('%s renders its preset from sample data without a literal tag', (kind) => {
    const context = sampleContextFor(kind)
    const spec = buildEmailSpec(preset(kind), {
      values: tagValuesFor(kind, context, { workshop }),
      summary: summaryRowsFor(kind, context, messages.summary),
      attached: true,
    })
    expect(renderEmailHtml(spec)).not.toMatch(/\{\w+\}/)
    expect(renderEmailText(spec)).not.toMatch(/\{\w+\}/)
  })
})

describe('rich text', () => {
  const doc = {
    type: 'doc' as const,
    content: [
      {
        type: 'paragraph' as const,
        content: [
          { type: 'text' as const, text: 'Hi ' },
          { type: 'text' as const, text: '{customer_name}', marks: [{ type: 'bold' as const }] },
          { type: 'hardBreak' as const },
          {
            type: 'text' as const,
            text: 'book here',
            marks: [{ type: 'link' as const, attrs: { href: 'https://x.example/book' } }],
          },
        ],
      },
      {
        type: 'bulletList' as const,
        content: [
          {
            type: 'listItem' as const,
            content: [
              { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Oil' }] },
            ],
          },
          {
            type: 'listItem' as const,
            content: [
              { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Brakes' }] },
            ],
          },
        ],
      },
    ],
  }

  it('is accepted by the schema and rejected when it carries what mail cannot show', () => {
    expect(richDocSchema.safeParse(doc).success).toBe(true)
    const bad = { type: 'doc', content: [{ type: 'iframe', src: 'x' }] }
    expect(richDocSchema.safeParse(bad).success).toBe(false)
  })

  it('fills tags inside formatted text and keeps the formatting', () => {
    const template = preset('invoice_sent')
    template.blocks = [{ id: 'p', type: 'paragraph', content: doc }]
    const html = renderEmailHtml(buildEmailSpec(template, invoiceInput))
    expect(html).toContain('<span style="font-weight:700;">Alex Carter</span>')
    expect(html).toContain('href="https://x.example/book"')
    expect(html).toContain('<li')
    expect(html).not.toContain('{customer_name}')
  })

  it('reads the same words as plain text, lists included', () => {
    const template = preset('invoice_sent')
    template.blocks = [{ id: 'p', type: 'paragraph', content: doc }]
    const text = renderEmailText(buildEmailSpec(template, invoiceInput))
    expect(text).toContain('Hi Alex Carter\nbook here')
    expect(text).toContain('- Oil\n- Brakes')
  })

  it('fills a tag used as a link address, and drops the link when it has no value', () => {
    const linked = (href: string) => ({
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [
            {
              type: 'text' as const,
              text: 'Open',
              marks: [{ type: 'link' as const, attrs: { href } }],
            },
          ],
        },
      ],
    })
    const template = preset('invoice_sent')
    template.blocks = [{ id: 'p', type: 'paragraph', content: linked('{share_link}') }]
    expect(renderEmailHtml(buildEmailSpec(template, invoiceInput))).toContain(
      'href="https://shop.example.com/share/invoice/org/tok"'
    )
    const without = buildEmailSpec(template, {
      values: { ...invoiceInput.values, share_link: undefined },
    })
    const html = renderEmailHtml(without)
    expect(html).toContain('Open')
    expect(html).not.toContain('<a ')
    expect(unknownTags(templateText(template), kindSpec('portal_signin').tags)).toContain(
      'share_link'
    )
  })

  it('drops a formatted block that fills to nothing', () => {
    const template = preset('invoice_sent')
    template.blocks = [
      {
        id: 'p',
        type: 'paragraph',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '{mileage}' }] }],
        },
      },
    ]
    expect(buildEmailSpec(template, invoiceInput).blocks).toEqual([])
  })

  it('refuses a link that is not an address', () => {
    const template = preset('invoice_sent')
    template.blocks = [
      {
        id: 'p',
        type: 'paragraph',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                // eslint-disable-next-line no-script-url
                {
                  type: 'text',
                  text: 'x',
                  marks: [{ type: 'link', attrs: { href: 'javascript:1' } }],
                },
              ],
            },
          ],
        },
      },
    ]
    expect(renderEmailHtml(buildEmailSpec(template, invoiceInput))).not.toContain('javascript:')
  })

  it('turns plain text into a document and back without loss', () => {
    const plain = 'Hi {customer_name},\n\nThank you.\nSee you soon.'
    expect(richToPlain(plainToRich(plain))).toBe(plain)
  })
})

describe('email logo', () => {
  it('serves only its own uploads through the public route', () => {
    expect(emailLogoPublicPath('/api/protected/files/org1/email-logos/abc.png')).toBe(
      '/api/public/email-logo/org1/abc.png'
    )
    expect(emailLogoPublicPath('/api/protected/files/org1/logos/abc.png')).toBeUndefined()
    expect(emailLogoPublicPath('https://evil.example/x.png')).toBeUndefined()
    expect(emailLogoPublicPath('')).toBeUndefined()
  })

  it('places the header and the button where the block says', () => {
    const template = preset('invoice_sent')
    template.blocks = [
      { id: 'h', type: 'header', align: 'center' },
      { id: 'b', type: 'button', label: 'Go', href: '{share_link}', align: 'right' },
    ]
    const html = renderEmailHtml(
      buildEmailSpec(template, { ...invoiceInput, logoUrl: 'https://x/l.png' })
    )
    expect(html).toContain('<td align="center" style="padding:0 0 20px 0;text-align:center;">')
    expect(html).toContain('<td align="right" style="padding:6px 0 20px 0;text-align:right;">')
  })

  it('draws the logo at the width the theme asks for', () => {
    const template = preset('invoice_sent')
    template.theme = { ...template.theme, logoWidth: 200 }
    const html = renderEmailHtml(
      buildEmailSpec(template, { ...invoiceInput, logoUrl: 'https://x/l.png' })
    )
    expect(html).toContain('width="200"')
  })
})

describe('link addresses', () => {
  it('guesses https for an address typed without a scheme', () => {
    expect(normalizeHref('example.com/book')).toBe('https://example.com/book')
    expect(normalizeHref('www.example.com')).toBe('https://www.example.com')
    expect(normalizeHref('post@example.com')).toBe('mailto:post@example.com')
    expect(normalizeHref('https://example.com')).toBe('https://example.com')
    expect(normalizeHref('{share_link}')).toBe('{share_link}')
    expect(normalizeHref('not a link')).toBe('not a link')
  })

  it('keeps a scheme-less link in the mail', () => {
    const template = preset('invoice_sent')
    template.blocks = [
      { id: 'b', type: 'button', label: 'Book', href: 'example.com/book' },
      {
        id: 'p',
        type: 'paragraph',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Book',
                  marks: [{ type: 'link', attrs: { href: 'example.com/book' } }],
                },
              ],
            },
          ],
        },
      },
    ]
    const html = renderEmailHtml(buildEmailSpec(template, invoiceInput))
    expect(html.match(/href="https:\/\/example.com\/book"/g)).toHaveLength(2)
  })
})

describe('image block', () => {
  const stored = '/api/protected/files/org1/email-images/pic.jpg'

  it('draws the picture at its width and position, linked when asked', () => {
    const template = preset('invoice_sent')
    template.blocks = [
      {
        id: 'i',
        type: 'image',
        src: stored,
        alt: 'Our workshop',
        width: 300,
        align: 'center',
        href: '{share_link}',
      },
    ]
    const html = renderEmailHtml(buildEmailSpec(template, invoiceInput))
    expect(html).toContain('src="/api/public/email-image/org1/pic.jpg"')
    expect(html).toContain('alt="Our workshop"')
    expect(html).toContain('width="300"')
    expect(html).toContain('<td align="center"')
    expect(html).toContain('href="https://shop.example.com/share/invoice/org/tok"')
    expect(renderEmailText(buildEmailSpec(template, invoiceInput))).toContain(
      'Our workshop: https://'
    )
  })

  it("takes the sender's addresses and drops a picture whose file is gone", () => {
    const template = preset('invoice_sent')
    template.blocks = [{ id: 'i', type: 'image', src: stored }]
    const sent = buildEmailSpec(template, {
      ...invoiceInput,
      assets: { [stored]: 'https://app/x.jpg' },
    })
    expect(sent.blocks[0]).toMatchObject({ type: 'image', src: 'https://app/x.jpg' })
    const gone = buildEmailSpec(template, { ...invoiceInput, assets: { [stored]: undefined } })
    expect(gone.blocks).toEqual([])
  })

  it('lists every upload a template refers to, for the sweep', () => {
    const template = preset('invoice_sent')
    template.theme = { ...template.theme, logoUrl: '/api/protected/files/org1/email-logos/l.png' }
    template.blocks = [
      { id: 'i', type: 'image', src: stored },
      { id: 'j', type: 'image', src: stored },
      { id: 'k', type: 'image', src: 'https://elsewhere.example/x.png' },
    ]
    expect(templateAssets(template)).toEqual([
      '/api/protected/files/org1/email-logos/l.png',
      stored,
    ])
  })
})

describe('tags split across formatting', () => {
  const split = {
    type: 'doc' as const,
    content: [
      {
        type: 'paragraph' as const,
        content: [
          { type: 'text' as const, text: 'Hi {custo', marks: [{ type: 'bold' as const }] },
          { type: 'text' as const, text: 'mer_name}, welcome' },
        ],
      },
    ],
  }

  it('makes the tag whole before filling', () => {
    const joined = joinSplitTags(split)
    expect(richToPlain(joined)).toBe('Hi {customer_name}, welcome')
    const template = preset('invoice_sent')
    template.blocks = [{ id: 'p', type: 'paragraph', content: split }]
    const html = renderEmailHtml(buildEmailSpec(template, invoiceInput))
    expect(html).toContain('Alex Carter')
    expect(html).not.toContain('{custo')
  })

  it('fills a required link that was typed across two formattings', () => {
    const template = preset('portal_signin')
    template.blocks = [
      {
        id: 'p',
        type: 'paragraph',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: '{signin', marks: [{ type: 'italic' }] },
                { type: 'text', text: '_link}' },
              ],
            },
          ],
        },
      },
    ]
    const values = tagValuesFor('portal_signin', { signinLink: 'https://x/s' }, { workshop })
    const text = renderEmailText(buildEmailSpec(template, { values }))
    expect(text).toContain('https://x/s')
    expect(text).not.toContain('{signin')
  })
})

describe('button address', () => {
  it('refuses an address that is not a link, in both halves of the mail', () => {
    const template = preset('invoice_sent')
    // eslint-disable-next-line no-script-url
    template.blocks = [{ id: 'b', type: 'button', label: 'Go', href: 'javascript:alert(1)' }]
    const spec = buildEmailSpec(template, invoiceInput)
    expect(spec.blocks).toEqual([])
    expect(renderEmailText(spec)).not.toContain('javascript')
  })
})
