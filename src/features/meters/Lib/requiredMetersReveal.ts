/**
 * Tells the work order's meter boxes which required readings a refusal named,
 * from wherever on the page the refusal came back (the status, the form's
 * save, sending or sharing the invoice). A browser event rather than a prop,
 * so every caller can say it without the page threading it through.
 *
 * One rule for where the cursor goes:
 * - Something the person did (pressed Completed, Save, Send, made a link) may
 *   take them to the first empty box, once the way there is clear: a dialog
 *   the refusal came back in is closed first, and has given the focus back,
 *   before the box takes it (see `whenFocusIsFree`).
 * - A save nobody asked for this moment (the autosave) only marks the boxes.
 *   The person is typing somewhere on the page, and their next keys must not
 *   land in a reading.
 *
 * The listener is the work order's meter list (JobMeters.tsx), mounted for
 * the job's vehicle even while it shows no meters, so a meter made required
 * since the page was opened is drawn and marked too.
 */

const EVENT = 'torqvoice:required-meters'

interface RevealDetail {
  jobId: string
  vehicleMeterIds: string[]
  focus: boolean
}

export interface RevealOptions {
  /**
   * Whether the first box may take the focus: true for what the person did,
   * false for an autosave, which only marks.
   */
  focus: boolean
}

/** Jobs whose meter list is on the page now, counted per listener. */
const listening = new Map<string, number>()

/** Marks the job's empty required boxes a refusal named. Nothing for a refusal that named none. */
export function revealRequiredMeters(
  jobId: string,
  meters: { vehicleMeterId: string }[] | null | undefined,
  options: RevealOptions
): void {
  if (!meters || meters.length === 0 || typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<RevealDetail>(EVENT, {
      detail: {
        jobId,
        vehicleMeterIds: meters.map((m) => m.vehicleMeterId),
        focus: options.focus,
      },
    })
  )
}

/**
 * Whether this page has the job's meter boxes to take the person to. A dialog
 * refused for readings closes for them only when it does; elsewhere it stays
 * open with the message, since closing it would leave nowhere to type them.
 */
export function canRevealRequiredMeters(jobId: string): boolean {
  return (listening.get(jobId) ?? 0) > 0
}

/** Listens for this job's refusals; returns the unsubscribe. */
export function onRevealRequiredMeters(
  jobId: string,
  listener: (vehicleMeterIds: string[], options: RevealOptions) => void
): () => void {
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<RevealDetail>).detail
    if (detail?.jobId === jobId) listener(detail.vehicleMeterIds, { focus: detail.focus })
  }
  window.addEventListener(EVENT, handle)
  listening.set(jobId, (listening.get(jobId) ?? 0) + 1)
  return () => {
    window.removeEventListener(EVENT, handle)
    const left = (listening.get(jobId) ?? 1) - 1
    if (left > 0) listening.set(jobId, left)
    else listening.delete(jobId)
  }
}

/**
 * Whether a modal layer (a dialog, a confirmation) holds the page. Radix
 * turns pointer events off on the body for as long as one is mounted, closing
 * animation included, and traps the focus inside it: a box outside cannot
 * take the focus then, and would only be handed it to lose it again.
 */
function modalOpen(): boolean {
  return (
    document.body.style.pointerEvents === 'none' ||
    document.querySelector(
      '[role="alertdialog"], [role="dialog"][data-state="open"][aria-modal]'
    ) !== null
  )
}

/** Longest a refusal waits for a dialog to close before it stops waiting and only marks. */
const MAX_WAIT_MS = 60_000

/**
 * Runs `move` once no modal layer is open and the focus it gives back on
 * closing has been given (Radix does that a tick after it unmounts, so the
 * move runs after a frame and a tick). At once when nothing is open. Returns
 * a cancel, for a list that goes away first.
 */
export function whenFocusIsFree(move: () => void): () => void {
  let cancelled = false
  let observer: MutationObserver | null = null
  let giveUp: ReturnType<typeof setTimeout> | null = null
  const stop = () => {
    observer?.disconnect()
    observer = null
    if (giveUp) clearTimeout(giveUp)
    giveUp = null
  }
  const settle = () => {
    stop()
    requestAnimationFrame(() =>
      setTimeout(() => {
        if (cancelled) return
        // Another one opened in the meantime: wait for it too.
        if (modalOpen()) wait()
        else move()
      }, 0)
    )
  }
  const wait = () => {
    observer = new MutationObserver(() => {
      if (!modalOpen()) settle()
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'data-state'],
    })
    giveUp = setTimeout(stop, MAX_WAIT_MS)
  }
  if (modalOpen()) wait()
  else move()
  return () => {
    cancelled = true
    stop()
  }
}
