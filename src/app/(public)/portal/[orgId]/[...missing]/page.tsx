import { notFound } from 'next/navigation'

/**
 * Any address under a workshop's portal that is not one of its pages. Without
 * this, a mistyped or outdated portal link fell through to the app's own 404,
 * which offers the workshop's dashboard; this hands it to the portal's
 * not-found page, in the portal's words, with the way back to the home page.
 */
export default function PortalUnknownPage() {
  notFound()
}
