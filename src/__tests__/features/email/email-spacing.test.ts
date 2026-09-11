/**
 * Line and paragraph spacing, set once in the theme and carried into every
 * line of the mail. Body text is the reference; headings and small print
 * scale with it, a paragraph's own gap and the room between text blocks
 * follow the paragraph step, and a theme saved before the steps existed
 * reads as normal, which is what every mail looked like until now.
 */
import { describe, expect, it } from 'vitest'
import en from '../../../../messages/en/email.json'
import { buildEmailSpec } from '@/features/email/Lib/buildEmailSpec'
import { tagValuesFor } from '@/features/email/Lib/emailContext'
import { emailSpacing } from '@/features/email/Lib/emailTemplate'
import { type EmailMessages, presetTemplate } from '@/features/email/Lib/emailPresets'
import { richToHtml } from '@/features/email/Render/richTextHtml'
import { renderEmailHtml } from '@/features/email/Render/renderEmailHtml'
import { readStoredTemplate } from '@/features/email/Schema/emailTemplateSchema'

const messages = en as EmailMessages
const workshop = { name: 'Bergen Bil', phone: '', email: 'post@bergenbil.no', address: '' }
const input = {
  values: tagValuesFor(
    'invoice_sent',
    {
      customerName: 'Alex',
      document: { number: 'INV-1', total: 100, paid: 0, currencyCode: 'NOK' },
    },
    { workshop }
  ),
}

function mailWith(theme: Record<string, unknown>) {
  const template = presetTemplate('invoice_sent', messages)
  template.theme = { ...template.theme, ...theme }
  return renderEmailHtml(buildEmailSpec(template, input))
}

describe('emailSpacing', () => {
  it('reads an unset theme as normal', () => {
    expect(emailSpacing({})).toEqual({
      body: 1.6,
      heading: 1.3,
      small: 1.5,
      paragraphGap: 10,
      blockGap: 16,
    })
  })

  it('scales headings and small print with the body', () => {
    expect(emailSpacing({ lineSpacing: 'compact' })).toMatchObject({
      body: 1.4,
      heading: 1.14,
      small: 1.31,
    })
    expect(emailSpacing({ lineSpacing: 'relaxed' })).toMatchObject({
      body: 1.8,
      heading: 1.46,
      small: 1.69,
    })
  })

  it('keeps the paragraph gap and the block gap in step', () => {
    expect(emailSpacing({ paragraphSpacing: 'tight' })).toMatchObject({
      paragraphGap: 4,
      blockGap: 10,
    })
    expect(emailSpacing({ paragraphSpacing: 'loose' })).toMatchObject({
      paragraphGap: 16,
      blockGap: 24,
    })
  })

  it('treats a value it does not know as normal rather than failing', () => {
    expect(emailSpacing({ lineSpacing: 'huge' as never }).body).toBe(1.6)
    expect(emailSpacing({ paragraphSpacing: 'none' as never }).paragraphGap).toBe(10)
  })
})

describe('the rendered mail', () => {
  it('sets every body line at the theme height, and stays at 1.6 by default', () => {
    expect(mailWith({})).toContain('font-size:15px;line-height:1.6;')
    expect(mailWith({})).not.toContain('line-height:1.8;')
    const relaxed = mailWith({ lineSpacing: 'relaxed' })
    expect(relaxed).toContain('font-size:15px;line-height:1.8;')
    expect(relaxed, 'no body line is left at the old height').not.toContain(
      'font-size:15px;line-height:1.6;'
    )
    expect(relaxed, 'the heading follows').toContain('font-size:22px;line-height:1.46;')
    expect(relaxed, 'so does the footer').toContain('font-size:12.5px;line-height:1.8;')
  })

  it('spaces the text blocks by the paragraph step', () => {
    expect(mailWith({})).toContain('line-height:1.6;color:#111827;padding:0 0 16px 0;')
    expect(mailWith({ paragraphSpacing: 'tight' })).toContain(
      'line-height:1.6;color:#111827;padding:0 0 10px 0;'
    )
    expect(mailWith({ paragraphSpacing: 'loose' })).toContain(
      'line-height:1.6;color:#111827;padding:0 0 24px 0;'
    )
  })

  it('carries the paragraph gap into rich text', () => {
    const doc = {
      type: 'doc' as const,
      content: [
        { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'One' }] },
        { type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Two' }] },
      ],
    }
    const style = {
      font: 'sans-serif',
      color: '#000',
      fontSize: 15,
      lineHeight: 1.6,
      linkColor: '#00f',
    }
    expect(richToHtml(doc, style)).toContain('margin:0 0 10px 0;')
    expect(richToHtml(doc, { ...style, paragraphGap: 16 })).toContain('margin:0 0 16px 0;')
    // The last paragraph never carries a gap, whatever the step.
    expect(richToHtml(doc, { ...style, paragraphGap: 16 })).toContain('margin:0;">Two')
  })
})

describe('a stored template', () => {
  it('accepts the spacing steps and nothing else in their place', () => {
    const template = presetTemplate('invoice_sent', messages)
    const stored = readStoredTemplate({
      ...template,
      theme: { ...template.theme, lineSpacing: 'relaxed', paragraphSpacing: 'loose' },
    })
    expect(stored?.theme.lineSpacing).toBe('relaxed')
    expect(stored?.theme.paragraphSpacing).toBe('loose')
    // Saved before the steps existed: still a valid template, read as normal.
    expect(readStoredTemplate(template)?.theme.lineSpacing).toBeUndefined()
  })
})
