// @vitest-environment node
/**
 * The reply address is the only thing that says which workshop an inbound
 * mail is for, so what it accepts and what it refuses is the whole access
 * control of the inbox email channel.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cloud-instance', () => ({ isCloudInstance: vi.fn(() => true) }))

import { isCloudInstance } from '@/lib/cloud-instance'
import {
  inboundMailConfig,
  isReplyMailToken,
  newMailMessageId,
  newReplyMailToken,
  normalizeMessageId,
  parseReferences,
  parseReplyMailAddress,
  replyMailAddress,
  replyMailDomain,
  replyTokenFromRecipients,
} from '@/lib/reply-mail'

const DOMAIN = 'reply.torqvoice.com'

/** The whole receiving setup, with any one part replaced. */
function stubSetup(overrides: Record<string, string> = {}) {
  const setup: Record<string, string> = {
    INBOUND_MAIL_DOMAIN: DOMAIN,
    INBOUND_MAIL_BUCKET: 'torqvoice-inbound-mail',
    INBOUND_MAIL_REGION: 'eu-west-1',
    INBOUND_MAIL_TOPIC_ARN: 'arn:aws:sns:eu-west-1:123456789012:inbound',
    ...overrides,
  }
  for (const [name, value] of Object.entries(setup)) vi.stubEnv(name, value)
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(isCloudInstance).mockReturnValue(true)
})

describe('reply tokens', () => {
  it('are 26 lower-case base32 characters and never repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newReplyMailToken()))
    expect(tokens.size).toBe(200)
    for (const token of tokens) {
      expect(token).toMatch(/^[a-z2-7]{26}$/)
      expect(isReplyMailToken(token)).toBe(true)
    }
  })

  it('refuses anything that is not one, including an organization id', () => {
    expect(isReplyMailToken('cmf1abc2def3ghi4jkl5mno6p')).toBe(false)
    expect(isReplyMailToken('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe(false)
    expect(isReplyMailToken('')).toBe(false)
    expect(isReplyMailToken(null)).toBe(false)
  })
})

describe('parseReplyMailAddress', () => {
  const token = newReplyMailToken()

  it('reads the token back out of the address it built', () => {
    expect(parseReplyMailAddress(replyMailAddress(token, DOMAIN), DOMAIN)).toBe(token)
  })

  it('ignores case in both halves and a +tag a client appended', () => {
    expect(parseReplyMailAddress(`Reply-${token.toUpperCase()}@Reply.Torqvoice.COM`, DOMAIN)).toBe(
      token
    )
    expect(parseReplyMailAddress(`reply-${token}+anything@${DOMAIN}`, DOMAIN)).toBe(token)
  })

  it('refuses another domain, another local part and a malformed token', () => {
    expect(parseReplyMailAddress(`reply-${token}@torqvoice.com`, DOMAIN)).toBeNull()
    expect(parseReplyMailAddress(`reply-${token}@evil.${DOMAIN}`, DOMAIN)).toBeNull()
    expect(parseReplyMailAddress(`post@${DOMAIN}`, DOMAIN)).toBeNull()
    expect(parseReplyMailAddress(`reply-${token.slice(1)}@${DOMAIN}`, DOMAIN)).toBeNull()
    expect(parseReplyMailAddress(`reply-${token}x@${DOMAIN}`, DOMAIN)).toBeNull()
    expect(parseReplyMailAddress(`reply-@${DOMAIN}`, DOMAIN)).toBeNull()
    expect(parseReplyMailAddress('', DOMAIN)).toBeNull()
  })

  it('takes the first recipient of ours from the envelope list', () => {
    expect(
      replyTokenFromRecipients(['someone@example.com', `reply-${token}@${DOMAIN}`], DOMAIN)
    ).toBe(token)
    expect(replyTokenFromRecipients(['someone@example.com'], DOMAIN)).toBeNull()
    expect(replyTokenFromRecipients([], DOMAIN)).toBeNull()
  })
})

describe('replyMailDomain', () => {
  it('is the configured domain on the cloud instance with the whole setup in place', () => {
    stubSetup({ INBOUND_MAIL_DOMAIN: 'Reply.Torqvoice.com' })
    expect(replyMailDomain()).toBe('reply.torqvoice.com')
  })

  it('is nothing on a self-hosted install, whatever the environment says', () => {
    stubSetup()
    vi.mocked(isCloudInstance).mockReturnValue(false)
    expect(replyMailDomain()).toBeNull()
  })

  it('is nothing when the variable is unset or not a domain', () => {
    stubSetup({ INBOUND_MAIL_DOMAIN: '' })
    expect(replyMailDomain()).toBeNull()
    stubSetup({ INBOUND_MAIL_DOMAIN: 'not a domain' })
    expect(replyMailDomain()).toBeNull()
  })

  it('is nothing while the bucket, region or topic is missing, so no mail promises a reply nothing can file', () => {
    stubSetup({ INBOUND_MAIL_BUCKET: '' })
    expect(replyMailDomain()).toBeNull()
    stubSetup({ INBOUND_MAIL_REGION: '' })
    expect(replyMailDomain()).toBeNull()
    stubSetup({ INBOUND_MAIL_TOPIC_ARN: '' })
    expect(replyMailDomain()).toBeNull()
  })
})

describe('inboundMailConfig', () => {
  it('names what is missing rather than running on half a setup', () => {
    vi.stubEnv('INBOUND_MAIL_DOMAIN', DOMAIN)
    vi.stubEnv('INBOUND_MAIL_BUCKET', '')
    vi.stubEnv('INBOUND_MAIL_REGION', 'eu-west-1')
    vi.stubEnv('INBOUND_MAIL_TOPIC_ARN', 'arn:aws:sns:eu-west-1:123456789012:inbound')
    const result = inboundMailConfig()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.missing).toEqual(['INBOUND_MAIL_BUCKET'])
  })

  it('refuses a region or a topic that is not one', () => {
    vi.stubEnv('INBOUND_MAIL_DOMAIN', DOMAIN)
    vi.stubEnv('INBOUND_MAIL_BUCKET', 'bucket')
    vi.stubEnv('INBOUND_MAIL_REGION', 'eu-west-1; rm -rf')
    vi.stubEnv('INBOUND_MAIL_TOPIC_ARN', 'https://evil.example/topic')
    const result = inboundMailConfig()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing).toEqual(['INBOUND_MAIL_REGION', 'INBOUND_MAIL_TOPIC_ARN'])
    }
  })

  it('returns the whole setup when everything is there', () => {
    vi.stubEnv('INBOUND_MAIL_DOMAIN', DOMAIN)
    vi.stubEnv('INBOUND_MAIL_BUCKET', 'torqvoice-inbound-mail')
    vi.stubEnv('INBOUND_MAIL_REGION', 'eu-west-1')
    vi.stubEnv('INBOUND_MAIL_TOPIC_ARN', 'arn:aws:sns:eu-west-1:123456789012:inbound')
    expect(inboundMailConfig()).toEqual({
      ok: true,
      config: {
        domain: DOMAIN,
        bucket: 'torqvoice-inbound-mail',
        region: 'eu-west-1',
        topicArn: 'arn:aws:sns:eu-west-1:123456789012:inbound',
      },
    })
  })
})

describe('message ids', () => {
  it('mints ids on the reply domain, without brackets', () => {
    const id = newMailMessageId(DOMAIN)
    expect(id).toMatch(/^[a-z2-7]{26}\.[a-z0-9]+@reply\.torqvoice\.com$/)
    expect(newMailMessageId(DOMAIN)).not.toBe(id)
  })

  it('stores a header value without its brackets and refuses an empty one', () => {
    expect(normalizeMessageId('<abc@example.com>')).toBe('abc@example.com')
    expect(normalizeMessageId('  abc@example.com ')).toBe('abc@example.com')
    expect(normalizeMessageId('<>')).toBeNull()
    expect(normalizeMessageId(undefined)).toBeNull()
  })

  it('reads every id out of a References header, oldest first', () => {
    expect(parseReferences('<a@x> <b@y>\r\n <c@z>')).toEqual(['a@x', 'b@y', 'c@z'])
    expect(parseReferences(['<a@x>', '<a@x> <b@y>'])).toEqual(['a@x', 'b@y'])
    expect(parseReferences(null)).toEqual([])
  })
})
