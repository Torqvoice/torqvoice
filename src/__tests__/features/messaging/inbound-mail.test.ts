// @vitest-environment node
/**
 * The rules that decide what an inbound email is before it is stored: which
 * notifications count, which mails were written by machines, where a reply
 * ends and the quoted mail begins, and which files are kept.
 */
import { describe, expect, it } from 'vitest'
import {
  cleanAttachmentName,
  cleanBody,
  cleanSubject,
  headerView,
  isAutomatedMail,
  KEPT_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MAX_BODY_CHARS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  parseSesReceivedNotification,
  replySubject,
  selectAttachments,
  splitQuotedReply,
} from '@/features/messaging/Lib/inboundMail'

const notification = {
  notificationType: 'Received',
  mail: {
    messageId: 'd6iitobk75ur44p8kdnnp7g2n800',
    source: 'kari@example.com',
    destination: ['reply-abcdefghijklmnopqrstuvwxyz@reply.torqvoice.com'],
  },
  receipt: {
    recipients: ['reply-abcdefghijklmnopqrstuvwxyz@reply.torqvoice.com'],
    spamVerdict: { status: 'PASS' },
    virusVerdict: { status: 'PASS' },
    action: {
      type: 'S3',
      bucketName: 'torqvoice-inbound-mail',
      objectKey: 'd6iitobk75ur44p8kdnnp7g2n800',
    },
  },
}

describe('parseSesReceivedNotification', () => {
  it('reads the parts the inbox acts on', () => {
    expect(parseSesReceivedNotification(notification)).toEqual({
      messageId: 'd6iitobk75ur44p8kdnnp7g2n800',
      bucket: 'torqvoice-inbound-mail',
      objectKey: 'd6iitobk75ur44p8kdnnp7g2n800',
      recipients: ['reply-abcdefghijklmnopqrstuvwxyz@reply.torqvoice.com'],
      spamVerdict: 'PASS',
      virusVerdict: 'PASS',
    })
  })

  it('refuses other notification types, other actions and broken shapes', () => {
    expect(parseSesReceivedNotification({ ...notification, notificationType: 'Bounce' })).toBeNull()
    expect(
      parseSesReceivedNotification({
        ...notification,
        receipt: { ...notification.receipt, action: { type: 'SNS' } },
      })
    ).toBeNull()
    expect(
      parseSesReceivedNotification({
        ...notification,
        receipt: { ...notification.receipt, recipients: [] },
      })
    ).toBeNull()
    expect(
      parseSesReceivedNotification({
        ...notification,
        mail: { ...notification.mail, messageId: '../etc/passwd' },
      })
    ).toBeNull()
    expect(parseSesReceivedNotification(null)).toBeNull()
    expect(parseSesReceivedNotification('x')).toBeNull()
  })

  it('keeps going without verdicts', () => {
    const parsed = parseSesReceivedNotification({
      ...notification,
      receipt: { recipients: notification.receipt.recipients, action: notification.receipt.action },
    })
    expect(parsed?.spamVerdict).toBeNull()
    expect(parsed?.virusVerdict).toBeNull()
  })
})

describe('isAutomatedMail', () => {
  const human = headerView(new Map([['content-type', { value: 'text/plain' }]]))

  it('lets a person’s mail through', () => {
    expect(isAutomatedMail(human, 'kari@example.com')).toBe(false)
  })

  it('drops out-of-office replies, bounces and list mail on their headers', () => {
    expect(isAutomatedMail(headerView({ 'auto-submitted': 'auto-replied' }), 'k@x.no')).toBe(true)
    expect(isAutomatedMail(headerView({ 'auto-submitted': 'no' }), 'k@x.no')).toBe(false)
    expect(isAutomatedMail(headerView({ 'x-auto-response-suppress': 'All' }), 'k@x.no')).toBe(true)
    expect(isAutomatedMail(headerView({ precedence: 'bulk' }), 'k@x.no')).toBe(true)
    expect(isAutomatedMail(headerView({ precedence: 'first-class' }), 'k@x.no')).toBe(false)
    expect(
      isAutomatedMail(headerView({ 'content-type': { value: 'multipart/report' } }), 'k@x.no')
    ).toBe(true)
    expect(isAutomatedMail(headerView({ 'list-unsubscribe': '<mailto:x>' }), 'k@x.no')).toBe(true)
  })

  it('drops mail from system senders whatever the headers say', () => {
    expect(isAutomatedMail(human, 'mailer-daemon@googlemail.com')).toBe(true)
    expect(isAutomatedMail(human, 'postmaster@example.com')).toBe(true)
    expect(isAutomatedMail(human, 'noreply@bank.example')).toBe(true)
    expect(isAutomatedMail(human, 'no-reply@shop.example')).toBe(true)
    expect(isAutomatedMail(human, 'donotreply@gov.example')).toBe(true)
    expect(isAutomatedMail(human, 'bounces+123@mailer.example')).toBe(true)
    // A person whose name happens to start with one of the words is still a person.
    expect(isAutomatedMail(human, 'noreplyson@example.com')).toBe(false)
    expect(isAutomatedMail(human, 'bouncer@example.com')).toBe(false)
  })
})

describe('splitQuotedReply', () => {
  it('cuts at the attribution line a mail client writes above the quote', () => {
    const text = [
      'Yes, Tuesday works for me.',
      '',
      'On Mon, 27 Oct 2026 at 10:12, EF Moto <post@torqvoice.com> wrote:',
      '> Your invoice is attached.',
      '> Regards',
    ].join('\n')
    expect(splitQuotedReply(text)).toEqual({
      reply: 'Yes, Tuesday works for me.',
      quoted: [
        'On Mon, 27 Oct 2026 at 10:12, EF Moto <post@torqvoice.com> wrote:',
        '> Your invoice is attached.',
        '> Regards',
      ].join('\n'),
    })
  })

  it('handles an attribution line a client wrapped over two lines', () => {
    const text = [
      'Takk, det passer.',
      '',
      'man. 27. okt. 2026 kl. 10:12 skrev EF Moto',
      '<post@torqvoice.com>:',
      '',
      '> Faktura vedlagt.',
    ].join('\n')
    expect(splitQuotedReply(text).reply).toBe('Takk, det passer.')
  })

  it('reads the attribution in other languages', () => {
    for (const line of [
      'Am 27.10.2026 um 10:12 schrieb EF Moto <post@torqvoice.com>:',
      'Le lun. 27 oct. 2026 à 10:12, EF Moto <post@torqvoice.com> a écrit :',
      'El lun, 27 oct 2026 a las 10:12, EF Moto (<post@torqvoice.com>) escribió:',
      'Il giorno lun 27 ott 2026 alle ore 10:12 EF Moto <post@torqvoice.com> ha scritto:',
      'Op ma 27 okt 2026 om 10:12 schreef EF Moto <post@torqvoice.com>:',
      'W dniu pon., 27 paź 2026 o 10:12 EF Moto <post@torqvoice.com> napisał(a):',
      'Em seg., 27 de out. de 2026 às 10:12, EF Moto <post@torqvoice.com> escreveu:',
      'пн, 27 окт. 2026 г. в 10:12, EF Moto <post@torqvoice.com> написал:',
      '27 Eki 2026 Pzt 10:12 tarihinde EF Moto <post@torqvoice.com> şunu yazdı:',
      'Den man. 27. okt. 2026 kl. 10:12 skrev EF Moto <post@torqvoice.com>:',
    ]) {
      const result = splitQuotedReply(`Ok.\n\n${line}\n> old`)
      expect(result.reply, line).toBe('Ok.')
    }
  })

  it('cuts at Outlook’s separator and at its header block', () => {
    expect(
      splitQuotedReply('Fine by me.\n\n-----Original Message-----\nFrom: EF Moto\nSent: Monday')
        .reply
    ).toBe('Fine by me.')
    expect(
      splitQuotedReply(
        'Fine by me.\n\n________________________________\nFrom: EF Moto\nSent: Monday'
      ).reply
    ).toBe('Fine by me.')
    expect(
      splitQuotedReply('Fine by me.\n\nFrom: EF Moto <post@torqvoice.com>\nSent: Monday\nTo: me')
        .reply
    ).toBe('Fine by me.')
  })

  it('does not mistake a sentence beginning with From for a header block', () => {
    const text = 'From: what I can see the brakes are fine.\nThanks.'
    expect(splitQuotedReply(text)).toEqual({ reply: text, quoted: '' })
  })

  it('does not mistake prose with the word wrote in it for an attribution', () => {
    const text = 'The mechanic wrote:\nbrakes are fine.\nThanks.'
    expect(splitQuotedReply(text)).toEqual({ reply: text, quoted: '' })
  })

  it('cuts at a signature separator', () => {
    expect(splitQuotedReply('See you then.\n-- \nKari\nkari@example.com').reply).toBe(
      'See you then.'
    )
  })

  it('returns a mail that is all quote whole, so nothing is lost', () => {
    const text = '> only quoted\n> lines'
    expect(splitQuotedReply(text)).toEqual({ reply: text, quoted: '' })
  })

  it('leaves a mail with no quote alone', () => {
    expect(splitQuotedReply('Just a question: is it ready?\r\nThanks')).toEqual({
      reply: 'Just a question: is it ready?\nThanks',
      quoted: '',
    })
  })
})

describe('attachments', () => {
  const file = (contentType: string, size: number, filename = 'a.bin') => ({
    filename,
    contentType,
    size,
  })

  it('keeps only the types the file route can serve, within the limits', () => {
    expect(KEPT_ATTACHMENT_TYPES.has('application/pdf')).toBe(true)
    expect(KEPT_ATTACHMENT_TYPES.has('text/html')).toBe(false)
    expect(KEPT_ATTACHMENT_TYPES.has('application/x-msdownload')).toBe(false)
    expect(
      selectAttachments([
        file('image/jpeg', 1000),
        file('text/html', 10),
        file('application/pdf', MAX_ATTACHMENT_BYTES + 1),
        file('application/pdf', 0),
        file('IMAGE/PNG', 500),
      ])
    ).toEqual([0, 4])
  })

  it('stops at the count and the total size', () => {
    const many = Array.from({ length: MAX_ATTACHMENTS + 3 }, () => file('image/jpeg', 10))
    expect(selectAttachments(many)).toHaveLength(MAX_ATTACHMENTS)

    const big = MAX_TOTAL_ATTACHMENT_BYTES / 2 + 1
    expect(selectAttachments([file('image/jpeg', big), file('image/jpeg', big)])).toEqual([0])
  })

  it('cleans a name for display and gives it the stored extension', () => {
    expect(cleanAttachmentName('../../etc/passwd', 'pdf')).toBe('.. .. etc passwd.pdf')
    expect(cleanAttachmentName('Faktura "2026".PDF', 'pdf')).toBe('Faktura 2026.PDF')
    expect(cleanAttachmentName('bilde\r\nContent-Type: x', 'jpg')).toBe('bilde Content-Type: x.jpg')
    expect(cleanAttachmentName('', 'jpg')).toBe('attachment.jpg')
    expect(cleanAttachmentName(null, 'png')).toBe('attachment.png')
    expect(cleanAttachmentName('x'.repeat(300), 'jpg')).toHaveLength(124)
  })
})

describe('subjects and bodies', () => {
  it('makes a subject one line and a reply subject once', () => {
    expect(cleanSubject(' Re:\r\n invoice  ')).toBe('Re: invoice')
    expect(cleanSubject('')).toBeNull()
    expect(replySubject('Invoice 2026-104')).toBe('Re: Invoice 2026-104')
    expect(replySubject('Re: Invoice 2026-104')).toBe('Re: Invoice 2026-104')
    expect(replySubject('SV: Faktura')).toBe('SV: Faktura')
    expect(replySubject(null)).toBe('Re:')
  })

  it('normalises line endings and cuts a body at the limit', () => {
    expect(cleanBody('a\r\nb\rc\n  ')).toBe('a\nb\nc')
    expect(cleanBody('x'.repeat(MAX_BODY_CHARS + 5))).toHaveLength(MAX_BODY_CHARS)
    expect(cleanBody(undefined)).toBe('')
  })
})
