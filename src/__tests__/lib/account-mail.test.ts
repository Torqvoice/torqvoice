import { describe, expect, it } from 'vitest'
import { renderAccountMail } from '@/lib/account-mail'

/**
 * Account mails share one shell: the wordmark, a white card with a heading,
 * a greeting and a few sentences, an optional facts card, one button with
 * its address written out, quiet notes, and a footer that says why the mail
 * came. The plain-text half says the same thing without the layout.
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

  it('wraps the mail in the shared shell', () => {
    const html = mail.html
    expect(html).toContain('max-width: 560px')
    expect(html).toContain('>Torqvoice</td>')
    expect(html).toContain('<h1 style=')
    expect(html).toContain('>Reset your password</h1>')
    expect(html).toContain(
      'You are receiving this because this is the address on your Torqvoice account: a@b.test'
    )
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('Hi Kari'))
  })

  it('shows the link as a button and writes the address out for copying', () => {
    const html = mail.html
    expect(html).toContain(
      'href="https://app.test/reset?token=abc&amp;x=1" style="display: inline-block;'
    )
    expect(html).toContain('>Reset your password</a>')
    expect(html).toContain('Or copy this link into your browser: ')
    expect(html).toContain('>https://app.test/reset?token=abc&amp;x=1</a>')
  })

  it('uses a heading of its own when given one', () => {
    const custom = renderAccountMail({
      to: 'a@b.test',
      subject: 'Subject line',
      heading: 'Card heading',
      paragraphs: ['x'],
    })
    expect(custom.html).toContain('>Card heading</h1>')
    expect(custom.html).not.toContain('Subject line')
  })

  it('escapes what people typed', () => {
    expect(mail.html).toContain('Hi Kari &lt;Nordmann&gt;,')
    expect(mail.html).not.toContain('<Nordmann>')
    expect(mail.html).toContain("If you didn't ask for this")
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

  describe('facts card', () => {
    const withCard = renderAccountMail({
      to: 'a@b.test',
      subject: 'New sign-in',
      paragraphs: [
        'A new device signed in.',
        {
          rows: [
            { label: 'Device', value: 'Chrome on <Windows>' },
            { label: 'When', value: '13 September 2026 at 10:26 UTC' },
          ],
        },
        'If this was you, there is nothing to do.',
      ],
    })

    it('renders the rows as a table between the paragraphs', () => {
      const html = withCard.html
      const cardStart = html.indexOf('<table', html.indexOf('A new device signed in.'))
      const cardEnd = html.indexOf('</table>', cardStart)
      expect(cardStart).toBeGreaterThan(-1)
      expect(html.slice(cardStart, cardEnd)).toContain('>Device</td>')
      expect(html.slice(cardStart, cardEnd)).toContain('>When</td>')
      expect(cardEnd).toBeLessThan(html.indexOf('If this was you'))
    })

    it('escapes row values and keeps them in the text half', () => {
      expect(withCard.html).toContain('Chrome on &lt;Windows&gt;')
      expect(withCard.html).not.toContain('<Windows>')
      expect(withCard.text).toContain(
        [
          'A new device signed in.',
          '',
          'Device: Chrome on <Windows>',
          'When: 13 September 2026 at 10:26 UTC',
          '',
          'If this was you',
        ].join('\n')
      )
    })
  })
})
