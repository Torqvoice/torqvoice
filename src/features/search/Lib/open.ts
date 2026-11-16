/** The event the header's search box fires; the palette listens for it. */
export const SEARCH_OPEN_EVENT = 'torqvoice:search-open'

/** Opens the search palette from anywhere on the page. */
export function openSearch() {
  document.dispatchEvent(new CustomEvent(SEARCH_OPEN_EVENT))
}
