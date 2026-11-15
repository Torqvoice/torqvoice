import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractCustomerOrgParam } from '@/i18n/locale-from-request'
import { REQUEST_PATH_HEADER, requestPathname } from '@/lib/request-path'

const headersOf = (value: string | null) => ({
  get: (name: string) => (name === REQUEST_PATH_HEADER ? value : null),
})

describe('requestPathname', () => {
  it('gives the path the proxy recorded, without its query', () => {
    expect(requestPathname(headersOf('/portal/fjordside/dashboard?error=expired'))).toBe(
      '/portal/fjordside/dashboard'
    )
  })

  it('is null when no page request is being served', () => {
    expect(requestPathname(headersOf(null))).toBeNull()
  })

  it('lets a customer page be recognised, so the workshop language can be forced on it', () => {
    const path = requestPathname(headersOf('/share/invoice/fjordside/tok123?x=1'))
    expect(extractCustomerOrgParam(path)).toBe('fjordside')
  })
})

describe('who reads the request path', () => {
  // The language resolver and the root layout once read "x-pathname", a
  // header nothing sets, so customer pages ignored a forced workshop language
  // and showed staff notices.
  it.each([
    'src/i18n/request.ts',
    'src/app/layout.tsx',
  ])('%s goes through requestPathname', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    expect(source).toContain('requestPathname(')
    expect(source).not.toContain('x-pathname')
  })
})
