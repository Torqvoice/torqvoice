import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { REQUEST_PATH_HEADER } from './request-path'
import { signInUrlFor } from './signed-out'

/**
 * Sends a visitor without a session to sign-in, set to bring them back to the
 * page they asked for. A layout cannot see its own URL, so the path comes from
 * the header proxy.ts writes on every page request. Without the header (a
 * request the proxy did not match) it is the plain sign-in page, as before.
 */
export async function redirectToSignIn(): Promise<never> {
  const requested = (await headers()).get(REQUEST_PATH_HEADER)
  redirect(requested ? signInUrlFor(requested) : '/auth/sign-in')
}
