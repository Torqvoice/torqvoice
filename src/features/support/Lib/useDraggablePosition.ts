'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  readSupportPosition,
  writeSupportPosition,
  type SupportPosition,
} from './supportVisibility'

/** Distance to the viewport edges the button is never allowed to cross. */
const EDGE_MARGIN = 8

/**
 * Room reserved at the bottom for MobileBottomNav, which occupies the bottom
 * edge below md and would otherwise sit under the default position.
 */
const MOBILE_NAV_HEIGHT = 56

function clamp(value: number, min: number, max: number): number {
  // max can fall below min on a very small viewport; min wins so the button
  // stays reachable rather than being pushed off the top.
  return Math.max(min, Math.min(value, max))
}

function defaultPosition(size: number): SupportPosition {
  const isMobile = window.innerWidth < 768
  return {
    x: window.innerWidth - size - (isMobile ? 16 : 24),
    y: window.innerHeight - size - (isMobile ? MOBILE_NAV_HEIGHT + 16 : 24),
  }
}

function clampToViewport(position: SupportPosition, size: number): SupportPosition {
  return {
    x: clamp(position.x, EDGE_MARGIN, window.innerWidth - size - EDGE_MARGIN),
    y: clamp(position.y, EDGE_MARGIN, window.innerHeight - size - EDGE_MARGIN),
  }
}

/**
 * Lets the support button be dragged out of the way and remembers where.
 *
 * The button is fixed to a corner, and on a long page that corner is usually
 * where the save button ends up. Rather than guess at a position that avoids
 * every page, this lets the user move it and keeps that choice per device,
 * alongside the dismissal preference.
 *
 * Pointer events rather than mouse events, so a touch drag works without a
 * second code path.
 */
export function useDraggablePosition(size: number) {
  const [position, setPosition] = useState<SupportPosition | null>(null)
  const [dragging, setDragging] = useState(false)
  // Set while a drag is in progress and cleared on the next click, so releasing
  // after a drag does not also open the panel.
  const movedRef = useRef(false)
  const originRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(
    null
  )

  useEffect(() => {
    const stored = readSupportPosition()
    setPosition(clampToViewport(stored ?? defaultPosition(size), size))
  }, [size])

  // A window that shrinks, or a phone that rotates, can leave a stored position
  // outside the viewport with no way to reach the button.
  useEffect(() => {
    const onResize = () => {
      setPosition((current) => (current ? clampToViewport(current, size) : current))
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [size])

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Left button or touch only; a right-click should not start a drag.
      if (event.button !== 0) return
      if (!position) return
      movedRef.current = false
      originRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        x: position.x,
        y: position.y,
      }
      // Capture so the drag survives the pointer leaving the small target.
      ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    },
    [position]
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const origin = originRef.current
      if (!origin) return

      const dx = event.clientX - origin.pointerX
      const dy = event.clientY - origin.pointerY

      // A few pixels of travel while pressing is a click, not a drag. Without
      // this threshold an ordinary tap would register as a move and swallow
      // the click that opens the panel.
      if (!movedRef.current && Math.abs(dx) < 4 && Math.abs(dy) < 4) return

      if (!movedRef.current) {
        movedRef.current = true
        setDragging(true)
      }
      setPosition(clampToViewport({ x: origin.x + dx, y: origin.y + dy }, size))
    },
    [size]
  )

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
    originRef.current = null
    if (movedRef.current) {
      setDragging(false)
      setPosition((current) => {
        if (current) writeSupportPosition(current)
        return current
      })
    }
  }, [])

  /** True when the pointer press that just ended was a drag, so the click should be ignored. */
  const consumeDrag = useCallback(() => {
    const wasDrag = movedRef.current
    movedRef.current = false
    return wasDrag
  }, [])

  return {
    position,
    dragging,
    consumeDrag,
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
