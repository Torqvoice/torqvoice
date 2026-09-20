/**
 * The four steps a concern goes through, as the trade teaches them:
 * condition, cause, correction, confirmation.
 *
 * The condition is the concern's own description. The other three are text the
 * shop writes as the job moves on, and "confirmed" is a tick with a name and a
 * time against it. This file is the rules for those, kept pure so they can be
 * read and tested without a database or a browser.
 */

export interface ConcernStoryInput {
  cause?: string | null
  correction?: string | null
  confirmation?: string | null
  confirmed?: boolean
}

export interface ConcernConfirmationStamp {
  confirmedAt: Date | null
  confirmedById: string | null
}

/** Emptied text is no text: a cleared box must not leave a row of spaces. */
function cleaned(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * What to write for a concern's story on a save.
 *
 * Who confirmed and when is decided here, from the session, never taken from
 * the client. A concern that was already confirmed keeps its first stamp, so
 * every later save of the job does not move the time or hand the credit to
 * whoever pressed Save last. Unticking clears it. A client that sends no
 * `confirmed` at all (the technician app, an older tab) leaves it alone.
 */
export function concernStoryData(
  input: ConcernStoryInput,
  existing: ConcernConfirmationStamp | null,
  userId: string,
  now: Date
) {
  const stamp: Partial<ConcernConfirmationStamp> =
    input.confirmed === undefined
      ? {}
      : input.confirmed
        ? existing?.confirmedAt
          ? {}
          : { confirmedAt: now, confirmedById: userId }
        : { confirmedAt: null, confirmedById: null }

  return {
    ...(input.cause !== undefined ? { cause: cleaned(input.cause) } : {}),
    ...(input.correction !== undefined ? { correction: cleaned(input.correction) } : {}),
    ...(input.confirmation !== undefined ? { confirmation: cleaned(input.confirmation) } : {}),
    ...stamp,
  }
}

/** Whether a row has anything written past the condition. */
export function concernHasStory(input: ConcernStoryInput): boolean {
  return Boolean(
    input.cause?.trim() || input.correction?.trim() || input.confirmation?.trim() || input.confirmed
  )
}

/** How far along a concern is, one flag per step, for the dots beside it. */
export function concernSteps(concern: { description: string } & ConcernStoryInput) {
  return {
    condition: Boolean(concern.description.trim()),
    cause: Boolean(concern.cause?.trim()),
    correction: Boolean(concern.correction?.trim()),
    confirm: Boolean(concern.confirmed),
  }
}

/** A concern as the editor holds it: what is saved, plus what the server says about it. */
export interface ConcernRowLike extends ConcernStoryInput {
  id?: string
  description: string
  sortOrder: number
  /** ISO, set by the server when the concern was ticked as confirmed. */
  confirmedAt?: string | null
  confirmedByName?: string | null
}

/**
 * Bring the editor's rows up to date with what the server now holds.
 *
 * The server gives a new concern its id on the first save, and the editor has
 * to learn it: a row sent back without one is taken for a new concern, the
 * saved one is deleted as "removed", and every finding that pointed at it is
 * cut loose. With nothing unsaved the server's list simply replaces the
 * editor's. With edits in flight the rows are left as typed, and each row
 * still missing an id takes it (and its confirmation stamp) from the saved
 * row that says the same thing.
 */
export function reconcileConcernRows<T extends ConcernRowLike>(
  current: T[],
  server: T[],
  dirty: boolean
): T[] {
  if (!dirty) return server
  const taken = new Set(current.map((row) => row.id).filter(Boolean))
  return current.map((row) => {
    if (row.id) {
      const saved = server.find((s) => s.id === row.id)
      return saved
        ? { ...row, confirmedAt: saved.confirmedAt, confirmedByName: saved.confirmedByName }
        : row
    }
    const match = server.find(
      (s) => s.id && !taken.has(s.id) && s.description.trim() === row.description.trim()
    )
    if (!match?.id) return row
    taken.add(match.id)
    return {
      ...row,
      id: match.id,
      confirmedAt: match.confirmedAt,
      confirmedByName: match.confirmedByName,
    }
  })
}
