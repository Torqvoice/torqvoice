/**
 * The layout preview is meant to look like this workshop's own paper. It used
 * to greet every workshop as "Your Workshop" because the sample shop was
 * hardcoded and the real company details never reached the renderer.
 */
import { describe, it, expect } from 'vitest'
import { resolveWorkshop } from '@/features/settings/Components/InvoiceLayoutPreviewRenderer'

describe('layout preview workshop', () => {
  it('uses the workshop that has been set up', () => {
    expect(
      resolveWorkshop({
        name: 'Die Autofabrik',
        address: 'Hauptstraße 480',
        phone: '044 89 12 27',
        email: 'info@autofabrik.net',
        slogan: 'Ihre Mehrmarken-Meisterwerkstatt',
      })
    ).toEqual({
      name: 'Die Autofabrik',
      address: 'Hauptstraße 480',
      phone: '044 89 12 27',
      email: 'info@autofabrik.net',
      slogan: 'Ihre Mehrmarken-Meisterwerkstatt',
    })
  })

  it('falls back to the sample only for what has not been filled in', () => {
    const resolved = resolveWorkshop({ name: 'Die Autofabrik', address: '  ' })
    expect(resolved.name).toBe('Die Autofabrik')
    expect(resolved.address).toBe('123 Main Street, Springfield')
  })

  it('shows the sample shop when nothing has been set up at all', () => {
    expect(resolveWorkshop(undefined).name).toBe('Your Workshop')
  })

  it('never invents a slogan', () => {
    // A workshop always has a name and an address, so a placeholder there reads
    // as "yours goes here". An invented slogan reads as one it never wrote.
    expect(resolveWorkshop(undefined).slogan).toBeUndefined()
    expect(resolveWorkshop({ name: 'Die Autofabrik' }).slogan).toBeUndefined()
    expect(resolveWorkshop({ slogan: '   ' }).slogan).toBeUndefined()
    expect(resolveWorkshop({ slogan: 'All makes, one roof' }).slogan).toBe('All makes, one roof')
  })
})
