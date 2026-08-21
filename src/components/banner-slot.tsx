'use client'

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react'

/**
 * How loud each strip is allowed to be, when more than one has something to
 * say. Higher wins.
 */
export const BANNER_PRIORITY = {
  /** An incident somebody is dealing with right now. */
  broadcast: 100,
  /** Permanent context for the public demo. */
  demo: 80,
  /** A licence about to lapse. Weeks of warning, so it can wait its turn. */
  licence: 60,
  /** The app updated. Interesting, never urgent. */
  update: 40,
} as const

/**
 * Keyed by instance, not by banner id.
 *
 * Two of the same banner can be mounted at once: the admin card previews the
 * real one. Keying by id let the preview's unmount release the page banner's
 * claim, so the notice vanished the moment you navigated away from settings.
 */
type Registry = Record<string, { id: string; priority: number }>

const Context = createContext<{
  /** The instance currently allowed to render, if any. */
  winner: string | null
  claim: (instance: string, id: string, priority: number) => void
  release: (instance: string) => void
}>({
  winner: null,
  claim: () => undefined,
  release: () => undefined,
})

/**
 * One strip at a time, across the whole app.
 *
 * These are full-width bars pinned above everything, and they were rendered
 * independently in three different layouts. Two at once pushed the app down by
 * two bars; a third would have been worse, and nothing stopped a fourth being
 * added. Stacking is also the wrong answer on its own terms: somebody reading
 * three notices at once reads none of them.
 *
 * So they queue instead. The loudest shows, the rest wait, and dismissing the
 * winner lets the next one through rather than losing it.
 */
export function BannerSlotProvider({ children }: { children: React.ReactNode }) {
  const [waiting, setWaiting] = useState<Registry>({})

  const claim = useCallback((instance: string, id: string, priority: number) => {
    setWaiting((current) => {
      const held = current[instance]
      if (held && held.id === id && held.priority === priority) return current
      return { ...current, [instance]: { id, priority } }
    })
  }, [])

  const release = useCallback((instance: string) => {
    setWaiting((current) => {
      if (!(instance in current)) return current
      const next = { ...current }
      delete next[instance]
      return next
    })
  }, [])

  const winner = useMemo(() => {
    const entries = Object.entries(waiting)
    if (entries.length === 0) return null
    return entries.reduce((best, entry) => (entry[1].priority > best[1].priority ? entry : best))[0]
  }, [waiting])

  const value = useMemo(() => ({ winner, claim, release }), [winner, claim, release])

  return <Context.Provider value={value}>{children}</Context.Provider>
}

/**
 * Says whether this banner is the one to render.
 *
 * `wants` is the banner's own condition. Claiming happens in an effect, not
 * during render, because claiming sets state on the provider and touching a
 * parent's state while a child renders is what React warns about.
 *
 * The consequence is that nothing shows on the very first frame, which is the
 * right way round: a banner appearing a frame late is invisible, whereas three
 * appearing at once and then collapsing to one is exactly the flicker this
 * exists to remove.
 */
export function useBannerSlot(id: string, priority: number, wants: boolean): boolean {
  const { winner, claim, release } = useContext(Context)
  const instance = useId()

  useEffect(() => {
    if (!wants) {
      release(instance)
      return
    }
    claim(instance, id, priority)
    return () => release(instance)
  }, [instance, id, priority, wants, claim, release])

  return wants && winner === instance
}
