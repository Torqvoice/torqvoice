import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

const { createConnectorHttp } = await import('@/features/integrations/Lib/http')

/**
 * The client labels a body as JSON when the caller did not say what it is.
 * A form has to be left alone: only fetch can write its content type, with
 * the boundary that separates the parts, and a file upload sent as JSON is
 * refused by the vendor.
 */
describe('connector http', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const client = () =>
    createConnectorHttp({
      connectionId: 'c1',
      credentials: { accessToken: 'tok' },
      auth: {},
      log: () => Promise.resolve(),
    })

  it('labels a text body as JSON and signs the request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    await client().fetch('https://api.example.com/x', { method: 'POST', body: '{"a":1}' })
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('authorization')).toBe('Bearer tok')
  })

  it('leaves the content type of a form to fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    const form = new FormData()
    form.set('filename', 'INV-1.pdf')
    form.set('file', new Blob(['%PDF'], { type: 'application/pdf' }), 'INV-1.pdf')
    await client().fetch('https://api.example.com/upload', { method: 'POST', body: form })
    const init = fetchMock.mock.calls[0][1]
    expect(new Headers(init?.headers).has('content-type')).toBe(false)
    expect(init?.body).toBe(form)
  })
})
