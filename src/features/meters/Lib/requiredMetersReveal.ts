/**
 * Tells the work order's meter boxes which required readings a refusal named,
 * from wherever on the page the refusal came back (the status, the form's
 * save, sending or paying the invoice). The boxes mark themselves and the
 * first one takes the focus (JobMeters.tsx). A browser event rather than a
 * prop, so every caller can say it without the page threading it through.
 */

const EVENT = 'torqvoice:required-meters'

interface RevealDetail {
  jobId: string
  vehicleMeterIds: string[]
}

/** Marks the job's empty required boxes a refusal named. Nothing for a refusal that named none. */
export function revealRequiredMeters(
  jobId: string,
  meters: { vehicleMeterId: string }[] | null | undefined
): void {
  if (!meters || meters.length === 0 || typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<RevealDetail>(EVENT, {
      detail: { jobId, vehicleMeterIds: meters.map((m) => m.vehicleMeterId) },
    })
  )
}

/** Listens for this job's refusals; returns the unsubscribe. */
export function onRevealRequiredMeters(
  jobId: string,
  listener: (vehicleMeterIds: string[]) => void
): () => void {
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<RevealDetail>).detail
    if (detail?.jobId === jobId) listener(detail.vehicleMeterIds)
  }
  window.addEventListener(EVENT, handle)
  return () => window.removeEventListener(EVENT, handle)
}
