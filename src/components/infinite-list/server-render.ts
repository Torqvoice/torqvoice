import type { ServerBatch } from './use-infinite-rows'

/**
 * Stamps the first batch of an infinite list with an id that is new on every
 * server render of the page. Call it in the server page, on the batch it hands
 * to the list, fallback included.
 *
 * The list (useInfiniteRows) re-reads the batches it has loaded whenever the
 * stamp is new, which is how a `router.refresh()` after an edit reaches a row
 * in the third batch. A client re-render hands over the same props, and Back
 * to a page the router kept replays the same render, so both keep the stamp
 * and read nothing. Comparing the rows instead would miss an edit outside the
 * first batch; comparing object identity would depend on how the router
 * rebuilds props, and on every client component that copies the batch.
 */
export function stampServerRender<P extends object>(batch: P): ServerBatch<P> {
  return { ...batch, renderId: crypto.randomUUID() }
}
