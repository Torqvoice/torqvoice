/**
 * The address a share link's page gives the browser for one of the
 * workshop's stored files.
 *
 * Uploads are stored under the signed-in file route, in either of the forms
 * it has had (`/api/protected/files/<org>/...` today, `/api/files/<org>/...`
 * before). The customer opening a link has no session, so each is rewritten
 * to the public route the link's token opens. Anything else (a picture on
 * another site, a data URI, an older `/uploads/...` path) is left as it is.
 */
export function shareFileUrl(url: string, token: string): string {
  const match = url.match(/^\/api\/(?:protected\/)?files\/[^/]+\/(.+)$/)
  return match ? `/api/public/files/${token}/${match[1]}` : url
}
