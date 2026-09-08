import { describe, expect, it } from 'vitest'
import {
  attachPdfDefault,
  buildDocumentEmailHtml,
  resolveAttachPdf,
} from '@/features/email/Lib/documentEmail'

/**
 * A workshop that wants to know whether its invoice was read has to send the
 * link, because a PDF in the mail is read without ever touching the link and
 * the viewed counter stays at zero.
 */
describe('attachPdfDefault', () => {
  it('attaches when the workshop has never chosen', () => {
    expect(attachPdfDefault({})).toBe(true)
  })

  it('attaches when the setting says so', () => {
    expect(attachPdfDefault({ 'email.attachPdf': 'true' })).toBe(true)
  })

  it('sends the link when the setting says so', () => {
    expect(attachPdfDefault({ 'email.attachPdf': 'false' })).toBe(false)
  })
})

describe('resolveAttachPdf', () => {
  it('follows the setting when the send does not say', () => {
    expect(resolveAttachPdf({ 'email.attachPdf': 'false' }, undefined)).toBe(false)
    expect(resolveAttachPdf({}, undefined)).toBe(true)
  })

  it('lets one send overrule the setting either way', () => {
    expect(resolveAttachPdf({ 'email.attachPdf': 'false' }, true)).toBe(true)
    expect(resolveAttachPdf({ 'email.attachPdf': 'true' }, false)).toBe(false)
  })
})

describe('buildDocumentEmailHtml', () => {
  const base = {
    heading: 'Invoice INV-1042',
    subject: 'invoice',
    linkLabel: 'View Invoice Online',
    fromName: 'Bergen Bil',
  }

  it('says the document is attached when it is', () => {
    const html = buildDocumentEmailHtml({ ...base, attached: true, link: null })
    expect(html).toContain('Please find the invoice attached.')
  })

  it('points at the link when the PDF is not attached', () => {
    const html = buildDocumentEmailHtml({
      ...base,
      attached: false,
      link: 'https://workshop.example.com/share/invoice/org/token',
    })
    expect(html).not.toContain('attached')
    expect(html).toContain('href="https://workshop.example.com/share/invoice/org/token"')
    expect(html).toContain('View Invoice Online')
  })

  it('carries the link alongside the attachment, as it always did', () => {
    const html = buildDocumentEmailHtml({
      ...base,
      attached: true,
      link: 'https://workshop.example.com/share/invoice/org/token',
    })
    expect(html).toContain('attached')
    expect(html).toContain('View Invoice Online')
  })

  it('still reads sensibly with neither an attachment nor a link', () => {
    const html = buildDocumentEmailHtml({ ...base, attached: false, link: null })
    expect(html).toContain('The invoice is ready.')
    expect(html).not.toContain('<a href')
  })

  it('includes the sender note and the phone when there is one', () => {
    const html = buildDocumentEmailHtml({
      ...base,
      attached: true,
      link: null,
      message: 'Ready for pickup on Friday',
      phone: '+47 55 00 00 00',
    })
    expect(html).toContain('Ready for pickup on Friday')
    expect(html).toContain('+47 55 00 00 00')
  })

  it('escapes what the sender typed rather than pasting it into the mail', () => {
    const html = buildDocumentEmailHtml({
      ...base,
      attached: true,
      link: null,
      message: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
