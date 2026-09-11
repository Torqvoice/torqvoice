/**
 * Public pages that live on torqvoice.com, not in this app.
 *
 * The terms used to be duplicated as an app route and drifted out of date;
 * there is one copy now, on the marketing site, and every link in here points
 * at it. The docs follow the same rule: no locale in the path, the site picks
 * the language itself.
 */
export const MARKETING_URL = 'https://torqvoice.com'
export const DOCS_URL = `${MARKETING_URL}/docs`
export const TERMS_URL = `${MARKETING_URL}/terms`
