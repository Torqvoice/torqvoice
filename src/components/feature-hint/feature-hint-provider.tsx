'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { dismissFeatureHint } from '@/features/settings/Actions/featureHintActions'

type FeatureHintContext = {
  /** The one hint allowed to show right now, if any. */
  active: string | null
  register: (id: string) => void
  unregister: (id: string) => void
  dismiss: (id: string) => void
}

/** No provider above: nothing registers, so nothing ever shows. */
// biome-ignore lint/suspicious/noEmptyBlockStatements: default noop
const noop = () => {}

const Context = createContext<FeatureHintContext>({
  active: null,
  register: noop,
  unregister: noop,
  dismiss: noop,
})

/**
 * Decides which feature hint, if any, is showing.
 *
 * Two rules, both from how these go wrong in practice. Only one hint shows at
 * a time, because a screen with three of them is noise nobody reads. And a
 * hint shows once: dismissed for good, not per session, so it never becomes
 * something staff learn to click past.
 *
 * Dismissals are stored against the workshop rather than the browser. A hint
 * says something appeared in this workshop's sidebar, so once anybody here
 * has been told, the workshop has been told, and somebody joining next year
 * does not get a backlog of announcements about features that have always
 * been there. It also means dismissing on the desk machine settles it for the
 * tablet in the bay.
 *
 * Registration order decides the queue, which means sidebar order decides it,
 * which is the order somebody reads the screen in anyway.
 */
export function FeatureHintProvider({
  initialSeen,
  children,
}: {
  /** Ids already shown, read on the server so nothing flashes on load. */
  initialSeen: string[]
  children: React.ReactNode
}) {
  const [seen, setSeen] = useState<string[]>(initialSeen)
  const [queue, setQueue] = useState<string[]>([])

  const register = useCallback((id: string) => {
    setQueue((current) => (current.includes(id) ? current : [...current, id]))
  }, [])

  const unregister = useCallback((id: string) => {
    setQueue((current) => current.filter((entry) => entry !== id))
  }, [])

  const dismiss = useCallback((id: string) => {
    // Closed immediately and recorded in the background. Nobody should watch
    // a spinner to put a note away, and a failed write costs one extra
    // sighting rather than anything that matters.
    setSeen((current) => (current.includes(id) ? current : [...current, id]))
    void dismissFeatureHint(id)
  }, [])

  const active = useMemo(() => queue.find((id) => !seen.includes(id)) ?? null, [queue, seen])

  const value = useMemo(
    () => ({ active, register, unregister, dismiss }),
    [active, register, unregister, dismiss]
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}

/**
 * Registers a hint and reports whether it is the one showing.
 *
 * `eligible` is the caller's own condition, e.g. a module being switched on.
 * A hint that is not eligible never joins the queue, so it cannot hold up the
 * one behind it.
 */
export function useFeatureHint(id: string, eligible: boolean) {
  const { active, register, unregister, dismiss } = useContext(Context)

  // In an effect, not during render: register() sets state on the provider,
  // and touching a parent's state while a child renders is exactly what React
  // warns about.
  useEffect(() => {
    if (!eligible) return
    register(id)
    return () => unregister(id)
  }, [id, eligible, register, unregister])

  return {
    open: eligible && active === id,
    dismiss: useCallback(() => dismiss(id), [dismiss, id]),
  }
}
