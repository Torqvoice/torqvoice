import { describe, expect, it } from 'vitest'
import { deliveryState } from '@/features/billing/Lib/deliveryState'

describe('deliveryState', () => {
  it('is unsent while the invoice has not left the workshop', () => {
    expect(deliveryState({ sentAt: null, viewCount: 0 })).toBe('unsent')
  })

  it('is sent once it has gone out but nobody has opened it', () => {
    expect(deliveryState({ sentAt: new Date('2026-09-01'), viewCount: 0 })).toBe('sent')
  })

  it('is viewed once the share link has been opened', () => {
    expect(deliveryState({ sentAt: new Date('2026-09-01'), viewCount: 3 })).toBe('viewed')
  })

  it('counts a view even on an invoice with no send stamp', () => {
    // A link handed over in person stamps sentAt too, but an older row from
    // before that stamp existed should still read as seen rather than unsent.
    expect(deliveryState({ sentAt: null, viewCount: 1 })).toBe('viewed')
  })

  it('reads a date that arrived from the server as a string', () => {
    expect(deliveryState({ sentAt: '2026-09-01T10:00:00.000Z', viewCount: 0 })).toBe('sent')
  })
})
