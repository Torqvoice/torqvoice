/**
 * The torqvoice.com stand-in, from a spec's side: what the app asked it and
 * whether it is currently accepting the app at all.
 */

const STANDIN_URL = `http://127.0.0.1:${process.env.E2E_TORQVOICE_COM_PORT ?? '8028'}`

export interface StandinCall {
  path: string
  body: Record<string, unknown>
  authorized: boolean
  at: number
}

export interface StandinState {
  linked: boolean
  calls: StandinCall[]
}

export async function torqvoiceComState(): Promise<StandinState> {
  const res = await fetch(`${STANDIN_URL}/state`)
  return (await res.json()) as StandinState
}

/** Accept or refuse the app, as the site does with a right or wrong secret. */
export async function setTorqvoiceComLinked(linked: boolean): Promise<void> {
  await fetch(`${STANDIN_URL}/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ linked }),
  })
}

export async function clearTorqvoiceComCalls(): Promise<void> {
  await fetch(`${STANDIN_URL}/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reset: true }),
  })
}

export function torqvoiceComUrl(): string {
  return STANDIN_URL
}
