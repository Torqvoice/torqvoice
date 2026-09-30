import { describe, expect, it } from 'vitest'
import {
  INSPECTION_ATTACHMENT_LIMITS,
  INSPECTION_ITEM_PHOTO_LIMIT,
} from '@/features/inspections/Lib/attachmentLimits'

describe('the caps the card, the action and the phone route share', () => {
  it('names every kind the card offers, and leaves room for the signed form', () => {
    expect(Object.keys(INSPECTION_ATTACHMENT_LIMITS).sort()).toEqual(['document', 'image', 'video'])
    for (const limit of Object.values(INSPECTION_ATTACHMENT_LIMITS)) {
      expect(limit).toBeGreaterThan(0)
    }
    expect(INSPECTION_ITEM_PHOTO_LIMIT).toBeGreaterThan(0)
  })
})
