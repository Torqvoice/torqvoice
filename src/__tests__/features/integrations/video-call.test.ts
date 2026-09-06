import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { videoCallMessage } from '@/features/integrations/Lib/video-call'

describe('videoCallMessage', () => {
  const invitation = 'Hi Anna, your call is on Monday. Join here: https://z/1'
  const joinLine = 'Join the video call here: https://z/1'

  it('sends the stock invitation when nobody wrote a note', () => {
    expect(videoCallMessage({ customMessage: undefined, invitation, joinLine })).toBe(invitation)
    expect(videoCallMessage({ customMessage: '   ', invitation, joinLine })).toBe(invitation)
  })

  it('puts a note first and the join line after it, so the link cannot be lost', () => {
    expect(videoCallMessage({ customMessage: ' Bring the key. ', invitation, joinLine })).toBe(
      `Bring the key.\n\n${joinLine}`
    )
  })
})
