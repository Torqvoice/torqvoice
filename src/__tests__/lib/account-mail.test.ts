import { describe, expect, it } from 'vitest'
import { renderAccountMail } from '@/lib/account-mail'

/**
 * Account mails read like a mail from a person: left-aligned text, a
 * greeting, one ordinary link, a sign-off, and a plain-text half that says
 * the same thing. Nothing is centred and nothing is a button.
 */
describe('renderAccountMail', () => {
  const mail = renderAccountMail({
    to: 'a@b.test',
    subject: 'Reset your password',
    name: 'Kari <Nordmann>',
    paragraphs: ['We received a request to reset your password.'],
    link: { text: 'Reset your password', url: 'https://app.test/reset?token=abc&x=1' },
    notes: ["If you didn't ask for this, ignore it."],
  })

  it('is plain and left-aligned, with no box or button', () => {
    expect(mail.html).toContain('text-align: left')
    expect(mail.html).not.toContain('margin: 0 auto')
    expect(mail.html).not.toContain('max-width')
    expect(mail.html).not.toContain('display: inline-block')
    expect(mail.html).not.toContain('<h2')
  })

  it('escapes what people typed and shows the link address in full', () => {
    expect(mail.html).toContain('Hi Kari &lt;Nordmann&gt;,')
    expect(mail.html).not.toContain('<Nordmann>')
    expect(mail.html).toContain('href="https://app.test/reset?token=abc&amp;x=1"')
    expect(mail.html).toContain('>https://app.test/reset?token=abc&amp;x=1</a>')
    expect(mail.html).toContain('If you didn&quot;t'.replace('&quot;', "'"))
  })

  it('carries the same words in the text half', () => {
    expect(mail.text).toBe(
      [
        'Hi Kari <Nordmann>,',
        '',
        'We received a request to reset your password.',
        '',
        'Reset your password: https://app.test/reset?token=abc&x=1',
        '',
        "If you didn't ask for this, ignore it.",
        '',
        'Torqvoice',
      ].join('\n')
    )
  })

  it('greets without a name when there is none', () => {
    const anonymous = renderAccountMail({ to: 'a@b.test', subject: 's', paragraphs: ['x'] })
    expect(anonymous.text.startsWith('Hi,\n')).toBe(true)
    expect(anonymous.html).not.toContain('undefined')
  })
})
