import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { renderAccountMail } from '@/lib/account-mail'
import { newDeviceMail } from '@/lib/known-devices'

describe('newDeviceMail', () => {
  const mail = newDeviceMail({
    to: 'bernt@example.test',
    name: 'Bernt Christian Egeland',
    label: 'Chrome on Windows',
    ip: '89.10.251.100',
    at: new Date('2026-09-13T10:26:42Z'),
  })

  it('puts device, address and time in a card, not in a sentence', () => {
    expect(mail.paragraphs[0]).toBe(
      'A device we have not seen before just signed in to your Torqvoice account.'
    )
    expect(mail.heading).toBe('New sign-in to your account')
    expect(mail.paragraphs[1]).toEqual({
      rows: [
        { label: 'Device', value: 'Chrome on Windows' },
        { label: 'Address', value: '89.10.251.100' },
        { label: 'When', value: '13 September 2026 at 10:26 UTC' },
      ],
    })
    expect(mail.link?.url).toMatch(/\/settings\/account$/)
  })

  it('leaves the address row out when the request had no IP', () => {
    const noIp = newDeviceMail({ to: 'a@b.test', label: 'Safari on iPhone', at: new Date(0) })
    const rows = (noIp.paragraphs[1] as { rows: { label: string }[] }).rows.map((r) => r.label)
    expect(rows).toEqual(['Device', 'When'])
  })

  it('reads the same in text and html', () => {
    const rendered = renderAccountMail(mail)
    expect(rendered.text).toContain(
      'Device: Chrome on Windows\nAddress: 89.10.251.100\nWhen: 13 September 2026 at 10:26 UTC'
    )
    expect(rendered.html).toContain('>Chrome on Windows</td>')
    expect(rendered.html).toContain('Hi Bernt Christian Egeland,')
  })
})
