import { beforeEach, describe, expect, it } from 'vitest'
import {
  createPhotoHandoffToken,
  createVehicleHandoffToken,
  isVehicleHandoffToken,
  verifyPhotoHandoffToken,
  verifyVehicleHandoffToken,
} from '@/lib/photo-handoff'

const HANDOFF = { organizationId: 'org1', vehicleId: 'veh1', userId: 'user1' }

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = 'test-secret-for-vehicle-handoff'
})

describe("a vehicle's phone code", () => {
  it('reads back the vehicle it was made for', () => {
    const { token } = createVehicleHandoffToken(HANDOFF)
    expect(isVehicleHandoffToken(token)).toBe(true)
    const check = verifyVehicleHandoffToken(token)
    expect(check.ok && check.handoff).toMatchObject(HANDOFF)
  })

  it('stops working after 30 minutes, and says so', () => {
    const now = Date.now()
    const { token } = createVehicleHandoffToken(HANDOFF, now)
    expect(verifyVehicleHandoffToken(token, now + 31 * 60 * 1000)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('refuses a code pointed at another vehicle', () => {
    const { token } = createVehicleHandoffToken(HANDOFF)
    const [prefix, body, signature] = token.split('.')
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    payload.v = 'someone-elses-vehicle'
    const forged = `${prefix}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`
    expect(verifyVehicleHandoffToken(forged)).toEqual({ ok: false, reason: 'invalid' })
  })

  it("cannot pass for a work order's code, nor the other way round", () => {
    const vehicle = createVehicleHandoffToken(HANDOFF).token
    const job = createPhotoHandoffToken({
      organizationId: 'org1',
      serviceRecordId: 'job1',
      concernId: null,
      purpose: 'photos',
      userId: 'user1',
    }).token
    expect(verifyPhotoHandoffToken(vehicle).ok).toBe(false)
    expect(verifyVehicleHandoffToken(job).ok).toBe(false)
  })
})
