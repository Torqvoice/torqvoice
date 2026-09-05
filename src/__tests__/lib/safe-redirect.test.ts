import { describe, expect, it } from 'vitest'
import { safeRedirectPath } from '@/lib/safe-redirect'

describe('safeRedirectPath', () => {
  it('keeps a path on this site, query string and all', () => {
    expect(safeRedirectPath('/settings/integrations/quickbooks')).toBe(
      '/settings/integrations/quickbooks'
    )
    expect(safeRedirectPath('/vehicles?tab=open#top')).toBe('/vehicles?tab=open#top')
    expect(safeRedirectPath('  /settings  ')).toBe('/settings')
  })

  it('falls back for anything that would leave the site', () => {
    for (const bad of [
      'https://evil.example/',
      'http://evil.example',
      '//evil.example/path',
      '/\\evil.example',
      'javascript:alert(1)',
      'settings',
      '',
      '/line\nbreak',
    ]) {
      expect(safeRedirectPath(bad)).toBe('/')
    }
  })

  it('falls back to the given default when there is nothing usable', () => {
    expect(safeRedirectPath(null, '/dashboard')).toBe('/dashboard')
    expect(safeRedirectPath(undefined)).toBe('/')
  })
})
