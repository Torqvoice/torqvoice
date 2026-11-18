import { beforeEach, describe, expect, it } from 'vitest'
import {
  createFixHandoffToken,
  createInspectionHandoffToken,
  isFixHandoffToken,
  verifyFixHandoffToken,
  verifyInspectionHandoffToken,
} from '@/lib/photo-handoff'

const HANDOFF = {
  organizationId: 'org1',
  code: 'P0420',
  draftId: '3f2b1c4d-5e6f-4a7b-8c9d-0123456789ab',
  userId: 'user1',
}

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = 'test-secret-for-fix-handoff'
})

describe("a fix's phone code", () => {
  it('reads back what it was made for', () => {
    const { token } = createFixHandoffToken(HANDOFF)
    expect(isFixHandoffToken(token)).toBe(true)
    const check = verifyFixHandoffToken(token)
    expect(check.ok && check.handoff).toMatchObject(HANDOFF)
  })

  it('stops working after 30 minutes, and says so', () => {
    const now = Date.now()
    const { token } = createFixHandoffToken(HANDOFF, now)
    expect(verifyFixHandoffToken(token, now + 31 * 60 * 1000)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('refuses a changed draft', () => {
    const { token } = createFixHandoffToken(HANDOFF)
    const [prefix, body, signature] = token.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    payload.d = '00000000-0000-4000-8000-000000000000'
    const forged = `${prefix}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`
    expect(verifyFixHandoffToken(forged)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('cannot pass for an inspection code, nor the other way round', () => {
    const fix = createFixHandoffToken(HANDOFF).token
    const inspection = createInspectionHandoffToken({
      organizationId: 'org1',
      inspectionId: 'i1',
      userId: 'user1',
    }).token
    expect(verifyInspectionHandoffToken(fix).ok).toBe(false)
    expect(verifyFixHandoffToken(inspection).ok).toBe(false)
  })
})
