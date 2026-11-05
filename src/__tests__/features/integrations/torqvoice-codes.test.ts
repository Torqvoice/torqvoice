import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type ConnectorContext, FaultCodesUnavailable } from '@/features/integrations/Lib/types'
import { connector, mapAnswer } from '@/integrations/torqvoice-codes/server'

/**
 * The code service's connector against replies shaped exactly like the API
 * contract (v1): what a workshop reads comes from these mappings, and a
 * service that is down or slow must turn into "not available", never an
 * error on the screen.
 */

function ctx(credentials: Record<string, unknown> = {}): ConnectorContext {
  return {
    connection: {
      id: 'c1',
      organizationId: 'org1',
      connectorId: 'torqvoice-codes',
      settings: {},
      state: {},
      externalAccountId: null,
    },
    credentials,
    http: { fetch: vi.fn(), json: vi.fn() },
    links: {} as ConnectorContext['links'],
    log: vi.fn(async () => undefined),
    saveState: vi.fn(async () => undefined),
    timezone: 'UTC',
    appUrl: 'http://localhost',
  } as unknown as ConnectorContext
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
  })
}

/** P0420 as the service answers it in Norwegian, with details. */
const P0420 = {
  code: 'P0420',
  found: true,
  meaning: {
    system: 'P',
    category: 'powertrain',
    scope: 'generic',
    source: 'standard',
    version: 3,
    verified: true,
    pending_check: false,
    title: {
      text: 'Katalysatorsystem virkningsgrad under terskel (bank 1)',
      lang: 'nb',
      machine_translated: true,
    },
    flags: { warning_light: true, emissions: true, drive_cycle: false, limp_mode: false },
    related: [{ code: 'P0430', title: 'Bank 2' }, { code: 'P0136' }],
    details: {
      description: {
        text: 'The catalyst stores oxygen. The code sets when it no longer does.',
        lang: 'en',
        machine_translated: false,
      },
      causes: [
        {
          key: 'aged',
          likelihood: 'high',
          label: { text: 'Catalyst aged', lang: 'nb', machine_translated: true },
        },
      ],
    },
  },
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('TORQVOICE_CODES_URL', 'http://torqvoice-codes:8090/')
  vi.stubEnv('TORQVOICE_CODES_API_TOKEN', 'tvc_test_server_key')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Torqvoice Codes lookups', () => {
  it('asks for every code at once with the vehicle and the language, and maps the answers', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        data_version: 15,
        results: [
          P0420,
          { code: 'P1570', found: false },
          { code: 'BANANA', found: false, error: 'not_a_code' },
        ],
      })
    )
    const answers = await connector.lookupCodes!(ctx(), {
      codes: ['P0420', 'P1570', 'BANANA'],
      vehicle: { make: 'Volkswagen', model: 'Golf', year: 2014, engine: '' },
      locale: 'nb',
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://torqvoice-codes:8090/v1/lookups')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tvc_test_server_key')
    expect(JSON.parse(init.body)).toEqual({
      codes: ['P0420', 'P1570', 'BANANA'],
      vehicle: { make: 'Volkswagen', model: 'Golf', year: 2014 },
      lang: 'nb',
      details: false,
    })

    expect(answers).toHaveLength(3)
    const meaning = answers[0].meaning!
    expect(meaning.title).toEqual({
      text: 'Katalysatorsystem virkningsgrad under terskel (bank 1)',
      lang: 'nb',
      machineTranslated: true,
    })
    expect(meaning.flags).toEqual({
      warningLight: true,
      emissions: true,
      driveCycle: false,
      limpMode: false,
    })
    expect(meaning.related).toEqual([{ code: 'P0430', title: 'Bank 2' }, { code: 'P0136' }])
    expect(meaning.causes[0]).toEqual({
      key: 'aged',
      likelihood: 'high',
      label: { text: 'Catalyst aged', lang: 'nb', machineTranslated: true },
    })
    expect(meaning.version).toBe(3)
    expect(answers[1]).toEqual({ code: 'P1570', found: false, range: 'manufacturer' })
    expect(answers[2]).toEqual({ code: 'BANANA', found: false, range: 'standard' })
  })

  it('keeps the range the service gives, and works it out from the code when it gives none', () => {
    // The contract's later answer: type and range on every valid code.
    expect(mapAnswer({ code: 'P0420', type: 'obd', range: 'standard', found: false })).toEqual({
      code: 'P0420',
      found: false,
      range: 'standard',
    })
    expect(
      mapAnswer({ code: 'B1A2F', type: 'obd', range: 'manufacturer', found: false })?.range
    ).toBe('manufacturer')
    // The running service today: no range, so the SAE split decides.
    expect(mapAnswer({ code: 'P1570', found: false })?.range).toBe('manufacturer')
    expect(mapAnswer({ code: 'P3001', found: false })?.range).toBe('manufacturer')
    expect(mapAnswer({ code: 'P3400', found: false })?.range).toBe('standard')
    expect(mapAnswer({ code: 'U0100', found: false })?.range).toBe('standard')
    expect(mapAnswer({ code: 'C1234', found: false })?.range).toBe('manufacturer')
    expect(mapAnswer(P0420)?.range).toBe('standard')
  })

  it("uses the workshop's own key over the server's", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { results: [] }))
    await connector.lookupCodes!(ctx({ apiToken: ' tvc_test_own ' }), {
      codes: ['P0420'],
      locale: 'en',
    })
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tvc_test_own')
  })

  it('gives a detail with sections when the service sends them, and without when it does not', () => {
    const withSections = mapAnswer({
      ...P0420,
      meaning: {
        ...P0420.meaning,
        details: {
          ...P0420.meaning.details,
          sections: [
            {
              kind: 'how_it_works',
              text: { text: 'The catalyst stores oxygen.', lang: 'en', machine_translated: false },
            },
            {
              kind: 'something_new',
              text: { text: 'More text.', lang: 'en', machine_translated: false },
            },
          ],
        },
      },
    })
    expect(withSections?.meaning?.sections).toEqual([
      {
        kind: 'how_it_works',
        text: { text: 'The catalyst stores oxygen.', lang: 'en', machineTranslated: false },
      },
      { kind: 'other', text: { text: 'More text.', lang: 'en', machineTranslated: false } },
    ])
    const without = mapAnswer(P0420)
    expect(without?.meaning?.sections).toBeUndefined()
    expect(without?.meaning?.description?.text).toContain('stores oxygen')
  })

  it('reads one code with details, and says null for a code the service does not have', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, P0420))
    const answer = await connector.codeDetail!(ctx(), {
      code: 'P0420',
      vehicle: { make: 'Volkswagen' },
      locale: 'de',
    })
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://torqvoice-codes:8090/v1/codes/P0420?lang=de&details=true&make=Volkswagen'
    )
    expect(answer?.meaning?.description?.text).toContain('stores oxygen')

    fetchMock.mockResolvedValueOnce(reply(404, { title: 'Not Found', status: 404 }))
    expect(await connector.codeDetail!(ctx(), { code: 'P1570', locale: 'en' })).toBeNull()
  })

  it('searches by prefix or words with a small limit', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        results: [
          {
            code: 'P0171',
            title: { text: 'System too lean (bank 1)', lang: 'en', machine_translated: false },
          },
        ],
      })
    )
    const hits = await connector.searchCodes!(ctx(), {
      query: 'lean bank 1',
      locale: 'en',
      limit: 5,
    })
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://torqvoice-codes:8090/v1/search?q=lean+bank+1&lang=en&limit=5'
    )
    expect(hits).toEqual([
      {
        code: 'P0171',
        title: { text: 'System too lean (bank 1)', lang: 'en', machineTranslated: false },
      },
    ])
  })

  it('sends a report with nothing that identifies the car, and reads report statuses back', async () => {
    fetchMock.mockResolvedValueOnce(reply(201, { id: 'r1', status: 'open' }))
    const receipt = await connector.reportDefinition!(ctx(), {
      code: 'P0420',
      version: 3,
      lang: 'nb',
      reason: 'wrong_for_vehicle',
      note: 'Our tester says rear O2 sensor',
      scanText: '',
      vehicle: { make: 'Volkswagen', model: 'Golf', year: 2014, engine: '1.4 TSI' },
      automatic: false,
      workshopRef: 'org1',
    })
    expect(receipt).toEqual({ id: 'r1', status: 'open' })
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent).toEqual({
      code: 'P0420',
      version: 3,
      lang: 'nb',
      reason: 'wrong_for_vehicle',
      note: 'Our tester says rear O2 sensor',
      vehicle: { make: 'Volkswagen', model: 'Golf', year: 2014, engine: '1.4 TSI' },
      automatic: false,
      workshop_ref: 'org1',
    })

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        reports: [
          {
            id: 'r1',
            code: 'P0420',
            status: 'resolved',
            outcome: 'fixed',
            resolved_at: '2026-11-06T09:00:00Z',
            message: 'Title corrected',
          },
        ],
      })
    )
    const statuses = await connector.reportStatus!(ctx(), ['r1', 'r1'])
    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://torqvoice-codes:8090/v1/definition-reports?ids=r1'
    )
    expect(statuses).toEqual([
      {
        id: 'r1',
        code: 'P0420',
        status: 'resolved',
        outcome: 'fixed',
        resolvedAt: '2026-11-06T09:00:00Z',
        message: 'Title corrected',
      },
    ])
  })
})

/** A fix as the service answers it. */
const FIX = {
  id: '0190f3c2-7d1a-7000-8000-000000000001',
  code: 'P0420',
  lang: 'nb',
  text: 'Gnagd ledning ved pluggen bak girkassen',
  vehicle: { make: 'Volkswagen', model: 'Golf', year: 2014, engine: 'CAXA' },
  photos: [{ n: 0, width: 1200, height: 900 }],
  created_at: '2026-11-05T10:00:00Z',
}

describe('Torqvoice Codes shared fixes', () => {
  it('sends a fix as multipart with its photos, the vehicle and nothing that names the car', async () => {
    fetchMock.mockResolvedValueOnce(reply(201, { id: FIX.id, status: 'pending' }))
    const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })
    const result = await connector.shareFix!(ctx(), {
      code: 'P0420',
      text: 'Chafed wire at the rear O2 sensor plug',
      lang: 'nb',
      vehicle: { make: ' Volkswagen ', model: 'Golf', year: 2014, engine: 'CAXA' },
      workshopRef: 'org1',
      photos: [photo, photo],
    })
    expect(result).toEqual({ ok: true, id: FIX.id })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://torqvoice-codes:8090/v1/fixes')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tvc_test_server_key')
    const form = init.body as FormData
    expect(JSON.parse(await (form.get('fix') as Blob).text())).toEqual({
      code: 'P0420',
      text: 'Chafed wire at the rear O2 sensor plug',
      lang: 'nb',
      vehicle: { make: 'Volkswagen', model: 'Golf', year: 2014, engine: 'CAXA' },
      workshop_ref: 'org1',
    })
    expect(form.getAll('photo')).toHaveLength(2)
  })

  it('says why the service would not take a fix', async () => {
    const send = () =>
      connector.shareFix!(ctx(), {
        code: 'P0420',
        text: 'x',
        lang: 'en',
        workshopRef: 'org1',
        photos: [],
      })
    fetchMock.mockResolvedValueOnce(reply(503, { detail: 'not taking new fixes' }))
    expect(await send()).toEqual({ ok: false, reason: 'paused' })
    fetchMock.mockResolvedValueOnce(reply(400, { detail: 'photo 1: not a JPEG' }))
    expect(await send()).toEqual({ ok: false, reason: 'photo' })
    fetchMock.mockResolvedValueOnce(reply(413, { detail: 'photo 2 is too large' }))
    expect(await send()).toEqual({ ok: false, reason: 'too_large' })
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(send()).rejects.toBeInstanceOf(FaultCodesUnavailable)
  })

  it('reads published fixes and its own with their review', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { fixes: [FIX] }))
    const published = await connector.publishedFixes!(ctx(), { code: 'P0420' })
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://torqvoice-codes:8090/v1/codes/P0420/fixes?limit=20'
    )
    expect(published).toEqual([
      {
        id: FIX.id,
        code: 'P0420',
        lang: 'nb',
        text: FIX.text,
        vehicle: { make: 'Volkswagen', model: 'Golf', year: 2014, engine: 'CAXA' },
        photos: [{ n: 0, width: 1200, height: 900 }],
        createdAt: '2026-11-05T10:00:00Z',
      },
    ])

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        fixes: [
          {
            ...FIX,
            vehicle: null,
            status: 'rejected',
            reason: 'The photo shows a plate.',
            reviewed_at: '2026-11-06T09:00:00Z',
          },
        ],
      })
    )
    const own = await connector.fixStatus!(ctx(), [FIX.id, FIX.id])
    expect(fetchMock.mock.calls[1][0]).toBe(`http://torqvoice-codes:8090/v1/fixes?ids=${FIX.id}`)
    expect(own[0]).toMatchObject({
      vehicle: null,
      status: 'rejected',
      reason: 'The photo shows a plate.',
      reviewedAt: '2026-11-06T09:00:00Z',
    })
  })

  it('withdraws with the workshop, and streams a photo or says there is none', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect(await connector.withdrawFix!(ctx(), { id: FIX.id, workshopRef: 'org1' })).toBe(true)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ workshop_ref: 'org1' })
    fetchMock.mockResolvedValueOnce(reply(404, { detail: 'no fix with that id' }))
    expect(await connector.withdrawFix!(ctx(), { id: FIX.id, workshopRef: 'org1' })).toBe(false)

    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': '3' },
      })
    )
    const photo = await connector.fixPhoto!(ctx(), {
      id: FIX.id,
      n: 0,
      size: 'thumb',
      workshopRef: 'org1',
    })
    expect(fetchMock.mock.calls[2][0]).toBe(
      `http://torqvoice-codes:8090/v1/fixes/${FIX.id}/photos/0?size=thumb&workshop_ref=org1`
    )
    expect(photo?.length).toBe(3)
    expect(new Uint8Array(await new Response(photo?.body).arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff])
    )
    fetchMock.mockResolvedValueOnce(reply(404, { detail: 'no such photo' }))
    expect(
      await connector.fixPhoto!(ctx(), { id: FIX.id, n: 1, size: 'full', workshopRef: 'org1' })
    ).toBeNull()
  })
})

describe('Torqvoice Codes when the service is not there', () => {
  it('turns a connection failure into FaultCodesUnavailable and logs it', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const c = ctx()
    await expect(
      connector.lookupCodes!(c, { codes: ['P0420'], locale: 'en' })
    ).rejects.toBeInstanceOf(FaultCodesUnavailable)
    expect(c.log).toHaveBeenCalledWith(
      'warn',
      'The code service could not be reached',
      expect.any(Object)
    )
  })

  it('turns a timeout, a 5xx and an unreadable answer into FaultCodesUnavailable', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'))
    await expect(
      connector.searchCodes!(ctx(), { query: 'p04', locale: 'en' })
    ).rejects.toBeInstanceOf(FaultCodesUnavailable)
    fetchMock.mockResolvedValueOnce(reply(503, { title: 'Service Unavailable', status: 503 }))
    await expect(
      connector.lookupCodes!(ctx(), { codes: ['P0420'], locale: 'en' })
    ).rejects.toBeInstanceOf(FaultCodesUnavailable)
    fetchMock.mockResolvedValueOnce(reply(200, { nothing: true }))
    await expect(
      connector.lookupCodes!(ctx(), { codes: ['P0420'], locale: 'en' })
    ).rejects.toBeInstanceOf(FaultCodesUnavailable)
  })

  it('does not call out at all without an address, and says so on the connect check', async () => {
    vi.stubEnv('TORQVOICE_CODES_URL', '')
    await expect(
      connector.lookupCodes!(ctx(), { codes: ['P0420'], locale: 'en' })
    ).rejects.toBeInstanceOf(FaultCodesUnavailable)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await connector.test(ctx())).toEqual({
      ok: false,
      message: 'The code service is not set up on this server',
    })
  })

  it('tells a refused key apart from a service that is down on the connect check', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { results: [] }))
    expect(await connector.test(ctx())).toEqual({ ok: true })
    fetchMock.mockResolvedValueOnce(
      reply(401, { title: 'Unauthorized', status: 401, detail: 'revoked' })
    )
    expect(await connector.test(ctx())).toEqual({
      ok: false,
      message: 'Torqvoice Codes refused the key',
    })
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await connector.test(ctx())).ok).toBe(false)
  })
})
