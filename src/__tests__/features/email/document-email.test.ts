import { describe, expect, it } from 'vitest'
import { attachPdfDefault, resolveAttachPdf } from '@/features/email/Lib/documentEmail'

describe('attachPdfDefault', () => {
  it('attaches when nothing has been decided, as it always did', () => {
    expect(attachPdfDefault({})).toBe(true)
  })

  it('sends the link when the setting says so', () => {
    expect(attachPdfDefault({ 'email.attachPdf': 'false' })).toBe(false)
  })
})

describe('resolveAttachPdf', () => {
  it('lets the sender override the workshop default either way', () => {
    expect(resolveAttachPdf({ 'email.attachPdf': 'false' }, true)).toBe(true)
    expect(resolveAttachPdf({}, false)).toBe(false)
  })

  it('falls back to the workshop default when the sender did not choose', () => {
    expect(resolveAttachPdf({ 'email.attachPdf': 'false' }, undefined)).toBe(false)
    expect(resolveAttachPdf({}, undefined)).toBe(true)
  })
})
