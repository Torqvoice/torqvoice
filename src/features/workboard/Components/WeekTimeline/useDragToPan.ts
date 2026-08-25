'use client'

import { useCallback, useEffect, useState } from 'react'

/** Movement before a press becomes a pan rather than a click. */
const PAN_THRESHOLD = 4

/** Elements that own their own drag: jobs, buttons, the lane menu. */
const IGNORE_SELECTOR = '[data-pan-ignore], button, a, [role="button"]'

export type BoardOverflow = { left: boolean; right: boolean }

/**
 * Grab the board and pull it sideways.
 *
 * A week that is wider than the window is only usable if moving through it is
 * as direct as looking at it; a scrollbar at the bottom of a tall board is a
 * long way from where the eye is. Mouse and pen drag the background here.
 * Touch is deliberately left alone, because a finger already pans natively and
 * hijacking it would break the flick everyone expects.
 */
export function useDragToPan(ref: React.RefObject<HTMLElement | null>) {
  const [isPanning, setIsPanning] = useState(false)
  const [overflow, setOverflow] = useState<BoardOverflow>({ left: false, right: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setOverflow((current) => {
      const next = { left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 }
      return current.left === next.left && current.right === next.right ? current : next
    })
  }, [ref])

  /** Scroll by one day, so paging lands on a day boundary rather than mid-column. */
  const panBy = useCallback(
    (direction: -1 | 1, dayWidth: number) => {
      const el = ref.current
      if (!el) return
      el.scrollBy({ left: direction * dayWidth, behavior: 'smooth' })
    },
    [ref]
  )

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let active = false
    let moved = false
    let startX = 0
    let startY = 0
    let fromLeft = 0
    let fromTop = 0

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      // Left button drags the board; middle button is the browser-wide
      // convention for panning and is worth honouring too.
      if (event.button !== 0 && event.button !== 1) return
      const target = event.target as HTMLElement | null
      if (target?.closest(IGNORE_SELECTOR)) return

      active = true
      moved = false
      startX = event.clientX
      startY = event.clientY
      fromLeft = el.scrollLeft
      fromTop = el.scrollTop
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!active) return
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      if (!moved && Math.abs(dx) + Math.abs(dy) < PAN_THRESHOLD) return
      if (!moved) {
        moved = true
        setIsPanning(true)
      }
      event.preventDefault()
      el.scrollLeft = fromLeft - dx
      el.scrollTop = fromTop - dy
    }

    const stop = () => {
      if (!active) return
      active = false
      moved = false
      setIsPanning(false)
    }

    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    el.addEventListener('scroll', measure, { passive: true })

    measure()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => measure())
    observer?.observe(el)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      el.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [ref, measure])

  return { isPanning, overflow, panBy, remeasure: measure }
}
