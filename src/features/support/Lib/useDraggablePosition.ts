'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  readLegacySupportPosition,
  readSupportAnchor,
  type SupportAnchor,
  type SupportPosition,
  writeSupportAnchor,
} from './supportVisibility'

/** Distance to the viewport edges the button is never allowed to cross. */
const EDGE_MARGIN = 8

/**
 * Room reserved at the bottom for MobileBottomNav, which occupies the bottom
 * edge below md and would otherwise sit under the default position.
 */
const MOBILE_NAV_HEIGHT = 56

interface Viewport {
  width: number
  height: number
}

function readViewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight }
}

function clamp(value: number, min: number, max: number): number {
  // max can fall below min on a very small viewport; min wins so the button
  // stays reachable rather than being pushed off the top.
  return Math.max(min, Math.min(value, max))
}

/** The bottom right corner, clear of the bottom navigation in a narrow window. */
function defaultAnchor(viewport: Viewport): SupportAnchor {
  const isMobile = viewport.width < 768
  return {
    horizontal: 'right',
    x: isMobile ? 16 : 24,
    vertical: 'bottom',
    y: isMobile ? MOBILE_NAV_HEIGHT + 16 : 24,
  }
}

function clampToViewport(
  position: SupportPosition,
  size: number,
  viewport: Viewport
): SupportPosition {
  return {
    x: clamp(position.x, EDGE_MARGIN, viewport.width - size - EDGE_MARGIN),
    y: clamp(position.y, EDGE_MARGIN, viewport.height - size - EDGE_MARGIN),
  }
}

/** Where an anchored button is drawn in a window of this size, kept on screen. */
function resolveAnchor(anchor: SupportAnchor, size: number, viewport: Viewport): SupportPosition {
  return clampToViewport(
    {
      x: anchor.horizontal === 'left' ? anchor.x : viewport.width - size - anchor.x,
      y: anchor.vertical === 'top' ? anchor.y : viewport.height - size - anchor.y,
    },
    size,
    viewport
  )
}

/** Ties a place on screen to the two window edges it is nearest to. */
function anchorFor(position: SupportPosition, size: number, viewport: Viewport): SupportAnchor {
  const left = position.x + size / 2 < viewport.width / 2
  const top = position.y + size / 2 < viewport.height / 2
  return {
    horizontal: left ? 'left' : 'right',
    x: left ? position.x : viewport.width - size - position.x,
    vertical: top ? 'top' : 'bottom',
    y: top ? position.y : viewport.height - size - position.y,
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
 * The place is kept as a distance to the nearest window edges and only turned
 * into pixels for the window as it is now. A small window can push the button
 * inward to keep it on screen, but that never replaces the place it belongs:
 * making the window large again puts it back.
 *
 * Pointer events rather than mouse events, so a touch drag works without a
 * second code path.
 */
export function useDraggablePosition(size: number) {
  // Null until dragged: the default corner, which depends on the window width.
  const [anchor, setAnchor] = useState<SupportAnchor | null>(null)
  // A place saved as pixels from the top-left by an earlier build, kept as it
  // is until a window comes along that it fits in. The window it was measured
  // in is not known, only that it was at least that large, so anchoring it to
  // a smaller one would tie it to the wrong distance from the edges.
  const [legacy, setLegacy] = useState<SupportPosition | null>(null)
  // Null until the window has been measured, which only the browser can do.
  const [viewport, setViewport] = useState<Viewport | null>(null)
  const [dragging, setDragging] = useState(false)
  // Set while a drag is in progress and cleared on the next click, so releasing
  // after a drag does not also open the panel.
  const movedRef = useRef(false)
  const originRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(
    null
  )
  // What the drag in progress will save when the pointer is released.
  const draggedAnchorRef = useRef<SupportAnchor | null>(null)

  useEffect(() => {
    const stored = readSupportAnchor()
    setAnchor(stored)
    setLegacy(stored ? null : readLegacySupportPosition())
    setViewport(readViewport())
  }, [])

  // The first window the old place fits in stands in for the one it was
  // measured in: the button is drawn exactly where the earlier build drew it,
  // and from then on it is saved relative to that window's edges, so a reload
  // at another size no longer reads the old pixels again.
  useEffect(() => {
    if (!legacy || !viewport) return
    const shown = clampToViewport(legacy, size, viewport)
    if (shown.x !== legacy.x || shown.y !== legacy.y) return
    const converted = anchorFor(legacy, size, viewport)
    writeSupportAnchor(converted)
    setAnchor(converted)
    setLegacy(null)
  }, [legacy, viewport, size])

  useEffect(() => {
    const onResize = () => setViewport(readViewport())
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  const position = useMemo(() => {
    if (!viewport) return null
    if (anchor) return resolveAnchor(anchor, size, viewport)
    if (legacy) return clampToViewport(legacy, size, viewport)
    return resolveAnchor(defaultAnchor(viewport), size, viewport)
  }, [anchor, legacy, viewport, size])

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
      const current = readViewport()
      const next = anchorFor(
        clampToViewport({ x: origin.x + dx, y: origin.y + dy }, size, current),
        size,
        current
      )
      draggedAnchorRef.current = next
      setAnchor(next)
      // Moved by hand: wherever an earlier build had it no longer matters.
      setLegacy(null)
    },
    [size]
  )

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
    originRef.current = null
    if (movedRef.current) {
      setDragging(false)
      if (draggedAnchorRef.current) writeSupportAnchor(draggedAnchorRef.current)
      draggedAnchorRef.current = null
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
