/**
 * Whether this browser shows the "What's new" tab on the edge of the screen.
 *
 * The tab is an invitation, and somebody who does not want it should be able
 * to send it away for good: news stays reachable from the account menu and
 * from Settings, About, where the tab can also be switched back on.
 *
 * A cookie, like the other remembered choices: the signed-in layout is
 * rendered on the server, and reading the choice there means a hidden tab
 * never flashes up before the browser has had its say.
 */
export const WHATS_NEW_TAB_COOKIE = 'whatsNewTab'

const MAX_AGE = 60 * 60 * 24 * 365

export function isWhatsNewTabHidden(raw: string | undefined | null): boolean {
  return raw === 'hidden'
}

/** Client only: remember the choice for the next server render. */
export function rememberWhatsNewTabHidden(hidden: boolean) {
  document.cookie = `${WHATS_NEW_TAB_COOKIE}=${hidden ? 'hidden' : 'shown'}; path=/; max-age=${MAX_AGE}; SameSite=Lax`
}
