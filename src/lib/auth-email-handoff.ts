/**
 * Carries the address someone typed on sign-in over to the page they go to
 * next (reset password, create an account), so they do not type it again.
 *
 * It goes through sessionStorage rather than the URL: an address in a query
 * string ends up in browser history and in every analytics page view. It is
 * read once and removed, and a browser that refuses storage just starts the
 * next page empty, as it did before.
 */

const KEY = 'torqvoice.auth.email'

export function handOnEmail(email: string): void {
  const value = email.trim()
  if (!value) return
  try {
    sessionStorage.setItem(KEY, value)
  } catch {
    /* storage refused: the next page starts empty */
  }
}

/** The handed-on address, once; an empty string when there is none. */
export function takeHandedEmail(): string {
  try {
    const value = sessionStorage.getItem(KEY) ?? ''
    sessionStorage.removeItem(KEY)
    return value
  } catch {
    return ''
  }
}
