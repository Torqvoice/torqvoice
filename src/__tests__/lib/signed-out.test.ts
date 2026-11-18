import { describe, expect, it } from 'vitest'
import { leaveForSignInNow, RECENT_INPUT_MS, signInUrlFor } from '@/lib/signed-out'

describe('signInUrlFor', () => {
  it('comes back to the page the tab was on, query included', () => {
    expect(signInUrlFor('/work-orders', '?status=pending')).toBe(
      '/auth/sign-in?redirect=%2Fwork-orders%3Fstatus%3Dpending'
    )
  })

  it('is the plain sign-in page from the dashboard', () => {
    expect(signInUrlFor('/')).toBe('/auth/sign-in')
  })

  it('never carries a target off this site', () => {
    expect(signInUrlFor('//evil.example/x')).toBe('/auth/sign-in')
    expect(signInUrlFor('/\\evil.example')).toBe('/auth/sign-in')
  })
})

describe('leaveForSignInNow', () => {
  const now = 10_000_000

  it('leaves at once when nobody has typed', () => {
    expect(leaveForSignInNow(0, now)).toBe(true)
  })

  it('waits for someone who typed just now', () => {
    expect(leaveForSignInNow(now - 5_000, now)).toBe(false)
  })

  it('leaves once the last keystroke is over a minute old', () => {
    expect(leaveForSignInNow(now - RECENT_INPUT_MS - 1, now)).toBe(true)
  })
})
