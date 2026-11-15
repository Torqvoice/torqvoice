'use client'

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslations } from 'next-intl'
import type { DrawingShape } from '@/features/invoice-designer/Spec/documentSpec'
import { cn } from '@/lib/utils'
import { getBodyDrawing } from '../Drawings'
import {
  composeViews,
  locateOnSheet,
  markGlyph,
  markPosition,
  placedLines,
  placedPanels,
} from '../Lib/compose'
import type { BodyType, Panel, View } from '../Lib/drawingTypes'
import { isPanel, isView, type MarkSeverity } from '../Lib/marks'
import { isMarkShape, type MarkTypeRef, markStyleOf, markTypeOf } from '../Lib/markTypes'

/** A mark as the drawing shows it: where, what, and its number. */
export interface MapMark {
  id: string
  view: string
  x: number
  y: number
  kind: string
  severity: string
  number: number
  /** The panel it is on, for its name read out to a screen reader. */
  panel?: string
  previous: boolean
  /** Drawn on another sheet, so it stays where it is: a job's linked inspection. */
  fixed?: boolean
}

export interface MapTap {
  view: View
  panel: Panel
  x: number
  y: number
}

/** The glyph's radius on screen, in sheet units; larger than print, for a finger. */
const GLYPH = 34
/** How far one arrow key moves a mark, in sheet units; Shift moves it further. */
const NUDGE = 8
const NUDGE_FAR = 40
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/**
 * The vehicle's five views on one sheet, with the marks on them.
 *
 * Tap a panel to add a mark; drag a mark to move it, or focus it and use the
 * arrow keys. Every panel is a path
 * with its name on it, so a tap records "left front door" as well as where
 * on the picture, and the legend can say so. One view can be brought up on
 * its own for a finger on a phone.
 */
export function ConditionMap({
  body,
  marks,
  types,
  selectedId,
  focusView,
  readOnly = false,
  onTap,
  onSelect,
  onMove,
  className,
}: {
  body: BodyType
  marks: MapMark[]
  /** The workshop's kinds of mark: what draws and names each one. */
  types: readonly MarkTypeRef[]
  selectedId?: string | null
  /** Show one view large instead of the whole sheet. */
  focusView?: View | null
  readOnly?: boolean
  onTap?: (tap: MapTap) => void
  onSelect?: (id: string) => void
  onMove?: (id: string, to: MapTap) => void
  className?: string
}) {
  const t = useTranslations('conditionMap')
  const svgRef = useRef<SVGSVGElement>(null)
  const drawing = useMemo(() => getBodyDrawing(body), [body])
  const composition = useMemo(() => composeViews(), [])
  const panels = useMemo(() => placedPanels(drawing, composition), [drawing, composition])
  const lines = useMemo(() => placedLines(drawing, composition), [drawing, composition])
  const [hover, setHover] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const dragMoved = useRef(false)
  /**
   * A mark being moved with the arrow keys: drawn where the keys have taken
   * it, and saved once the key is let go or the mark loses focus, so holding
   * an arrow down is one save rather than one per repeat.
   */
  const [nudge, setNudge] = useState<{ id: string; x: number; y: number } | null>(null)
  const nudgeRef = useRef<{ id: string; x: number; y: number; view: string } | null>(null)
  const keysHintId = useId()

  const viewBox = useMemo(() => {
    if (focusView) {
      const placed = composition.views.find((v) => v.view === focusView)
      if (placed) {
        const pad = 30
        const { x, y, width, height } = placed.box
        return `${x - pad} ${y - pad} ${width + pad * 2} ${height + pad * 2}`
      }
    }
    return `0 0 ${composition.width} ${composition.height}`
  }, [composition, focusView])

  /** A pointer's place in sheet units. */
  const toSheet = useCallback((event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current
    if (!svg) return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
    return { x: point.x, y: point.y }
  }, [])

  /** The panel under a screen point, ignoring the marks over it. */
  const panelAt = useCallback((clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | SVGElement | null
    const panel = el?.getAttribute?.('data-panel')
    const view = el?.getAttribute?.('data-view')
    return isPanel(panel) && isView(view) ? { panel, view } : null
  }, [])

  const handlePanelClick = (event: ReactPointerEvent<SVGPathElement>, panel: Panel, view: View) => {
    if (readOnly || !onTap || drag) return
    const at = toSheet(event)
    if (!at) return
    const located = locateOnSheet(composition, at.x, at.y)
    if (!located) return
    onTap({ view, panel, x: located.x, y: located.y })
  }

  const startDrag = (event: ReactPointerEvent<SVGGElement>, mark: MapMark) => {
    if (readOnly || mark.previous || mark.fixed) {
      onSelect?.(mark.id)
      return
    }
    event.stopPropagation()
    const at = toSheet(event)
    if (!at) return
    dragMoved.current = false
    setDrag({ id: mark.id, x: at.x, y: at.y })
    svgRef.current?.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return
    const at = toSheet(event)
    if (!at) return
    dragMoved.current = true
    setDrag({ ...drag, x: at.x, y: at.y })
  }

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return
    const { id } = drag
    setDrag(null)
    svgRef.current?.releasePointerCapture(event.pointerId)
    if (!dragMoved.current) {
      onSelect?.(id)
      return
    }
    const target = panelAt(event.clientX, event.clientY)
    const at = toSheet(event)
    if (!target || !at || !onMove) return
    const located = locateOnSheet(composition, at.x, at.y)
    if (!located) return
    onMove(id, { view: target.view, panel: target.panel, x: located.x, y: located.y })
  }

  const movable = (mark: MapMark) => !readOnly && !mark.previous && !mark.fixed && Boolean(onMove)

  /** The panel of a view drawn at a sheet point: the topmost one, as a tap would find it. */
  const panelAtSheet = (view: string, x: number, y: number): Panel | null => {
    const svg = svgRef.current
    if (!svg) return null
    const paths = Array.from(
      svg.querySelectorAll<SVGPathElement>(`path[data-view="${CSS.escape(view)}"]`)
    ).reverse()
    for (const path of paths) {
      // Not every browser engine (nor a test's) can hit-test a path.
      if (typeof path.isPointInFill !== 'function') return null
      let inside = false
      try {
        inside = path.isPointInFill(new DOMPoint(x, y))
      } catch {
        return null
      }
      const panel = path.getAttribute('data-panel')
      if (inside && isPanel(panel)) return panel
    }
    return null
  }

  const handleMarkKey = (event: ReactKeyboardEvent<SVGGElement>, mark: MapMark) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect?.(mark.id)
      return
    }
    const arrow = ARROWS[event.key]
    if (!arrow || !movable(mark)) return
    event.preventDefault()
    const placed = composition.views.find((v) => v.view === mark.view)
    const from =
      nudgeRef.current?.id === mark.id
        ? [nudgeRef.current.x, nudgeRef.current.y]
        : markPosition(composition, mark)
    if (!placed || !from) return
    const step = event.shiftKey ? NUDGE_FAR : NUDGE
    // Kept inside the mark's own view: the keys move a mark across its
    // panels, and the Panel field in its editor takes it to another view.
    const { box } = placed
    const x = Math.min(box.x + box.width, Math.max(box.x, from[0] + arrow[0] * step))
    const y = Math.min(box.y + box.height, Math.max(box.y, from[1] + arrow[1] * step))
    nudgeRef.current = { id: mark.id, x, y, view: mark.view }
    setNudge({ id: mark.id, x, y })
  }

  const commitNudge = (mark: MapMark) => {
    const current = nudgeRef.current
    if (!current || current.id !== mark.id) return
    nudgeRef.current = null
    setNudge(null)
    const located = locateOnSheet(composition, current.x, current.y)
    if (!located || !onMove) return
    // Off every panel (in the air around the vehicle) it keeps the panel it had.
    const panel = panelAtSheet(located.view, current.x, current.y) ?? mark.panel
    if (!isPanel(panel)) return
    onMove(mark.id, { view: located.view, panel, x: located.x, y: located.y })
  }

  /** Where a mark is drawn now, in sheet units: under the pointer or the keys while it moves. */
  const markAt = (mark: MapMark): [number, number] | null => {
    if (drag?.id === mark.id) return [drag.x, drag.y]
    if (nudge?.id === mark.id) return [nudge.x, nudge.y]
    return markPosition(composition, mark)
  }

  const glyphShapes = (mark: MapMark): DrawingShape[] => {
    const at = markAt(mark)
    if (!at) return []
    return markGlyph({
      x: at[0],
      y: at[1],
      ...markStyleOf(types, mark.kind),
      severity: mark.severity as MarkSeverity,
      number: mark.number,
      previous: mark.previous,
      size: GLYPH,
    })
  }

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      // A group, not an image: the marks inside are buttons a keyboard and a
      // screen reader must be able to reach.
      role="group"
      aria-label={t('title')}
      className={cn('block h-auto w-full select-none touch-none', className)}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={() => setDrag(null)}
    >
      {panels.map((panel) => (
        <path
          key={`${panel.view}-${panel.panel}`}
          d={panel.d}
          data-view={panel.view}
          data-panel={panel.panel}
          className={cn(
            'stroke-foreground transition-colors',
            !readOnly && 'cursor-crosshair',
            hover === `${panel.view}-${panel.panel}` && !readOnly ? 'fill-primary/15' : 'fill-card'
          )}
          strokeWidth={3}
          strokeLinejoin="round"
          onPointerEnter={() => setHover(`${panel.view}-${panel.panel}`)}
          onPointerLeave={() => setHover(null)}
          onClick={(event) =>
            handlePanelClick(
              event as unknown as ReactPointerEvent<SVGPathElement>,
              panel.panel,
              panel.view
            )
          }
        >
          <title>{t(`panels.${panel.panel}`)}</title>
        </path>
      ))}
      {lines.map((d, i) => (
        <path
          key={i}
          d={d}
          className="pointer-events-none fill-none stroke-foreground"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {!focusView &&
        composition.views.map((placed) => (
          <text
            key={placed.view}
            x={placed.box.x + placed.box.width / 2}
            y={placed.box.y + placed.box.height + 46}
            textAnchor="middle"
            fontSize={36}
            className="pointer-events-none fill-muted-foreground"
          >
            {t(`views.${placed.view}`)}
          </text>
        ))}
      {marks.map((mark) => {
        const shapes = glyphShapes(mark)
        if (shapes.length === 0) return null
        const selected = selectedId === mark.id
        const at = markAt(mark)
        return (
          <g
            key={mark.id}
            role="button"
            tabIndex={0}
            aria-label={t('markLabel', {
              n: mark.number,
              kind: markTypeOf(types, mark.kind).name,
              area: isPanel(mark.panel) ? t(`panels.${mark.panel}`) : '',
            })}
            aria-describedby={movable(mark) ? keysHintId : undefined}
            className={cn(
              'group outline-none',
              readOnly || mark.previous || mark.fixed ? 'cursor-pointer' : 'cursor-grab',
              drag?.id === mark.id && 'pointer-events-none cursor-grabbing'
            )}
            onPointerDown={(event) => startDrag(event, mark)}
            onKeyDown={(event) => handleMarkKey(event, mark)}
            onKeyUp={(event) => {
              if (ARROWS[event.key]) commitNudge(mark)
            }}
            onBlur={() => commitNudge(mark)}
          >
            {/* The keyboard's focus, drawn as a ring in the theme's focus colour. */}
            {at && (
              <circle
                cx={at[0]}
                cy={at[1]}
                r={GLYPH * 1.9}
                className="pointer-events-none fill-none stroke-ring opacity-0 group-focus-visible:opacity-100"
                strokeWidth={6}
                data-focus-ring
              />
            )}
            {selected && (
              <circle
                cx={shapes[0].type === 'circle' ? shapes[0].cx : 0}
                cy={shapes[0].type === 'circle' ? shapes[0].cy : 0}
                r={GLYPH * 1.6}
                className="fill-primary/15 stroke-primary"
                strokeWidth={4}
                style={shapes[0].type === 'circle' ? undefined : { display: 'none' }}
              />
            )}
            <SelectionRing mark={mark} shapes={shapes} selected={selected} />
            {shapes.map((shape, i) => (
              <Shape key={i} shape={shape} />
            ))}
          </g>
        )
      })}
      <desc id={keysHintId}>{t('markKeysHint')}</desc>
    </svg>
  )
}

/** The ring around the selected mark, drawn from the glyph's own centre. */
function SelectionRing({
  mark,
  shapes,
  selected,
}: {
  mark: MapMark
  shapes: DrawingShape[]
  selected: boolean
}) {
  if (!selected || shapes[0]?.type === 'circle') return null
  // The number's disc is the last circle; the glyph centre is up-left of it.
  const disc = [...shapes].reverse().find((s) => s.type === 'circle')
  if (!disc || disc.type !== 'circle') return null
  const cx = disc.cx - GLYPH * 1.15
  const cy = disc.cy + GLYPH * 1.15
  return (
    <circle
      cx={cx}
      cy={cy}
      r={GLYPH * 1.6}
      className="fill-primary/15 stroke-primary"
      strokeWidth={4}
      data-mark={mark.id}
    />
  )
}

/** One shape of a glyph as an SVG element. */
export function Shape({ shape }: { shape: DrawingShape }) {
  if (shape.type === 'path') {
    return (
      <path
        d={shape.d}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        fill={shape.fill ?? 'none'}
        strokeDasharray={shape.dash?.join(' ')}
        opacity={shape.opacity}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    )
  }
  if (shape.type === 'circle') {
    return (
      <circle
        cx={shape.cx}
        cy={shape.cy}
        r={shape.r}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        fill={shape.fill ?? 'none'}
        opacity={shape.opacity}
      />
    )
  }
  return (
    <text
      x={shape.x}
      y={shape.y}
      fill={shape.fill}
      textAnchor={shape.anchor ?? 'start'}
      fontSize={shape.size}
      fontWeight={shape.bold ? 700 : 400}
      className="pointer-events-none"
    >
      {shape.text}
    </text>
  )
}

/** A kind's glyph on its own, for a chip or a legend row. */
export function MarkIcon({
  type,
  severity,
  previous = false,
  number,
  size = 18,
  className,
}: {
  /** The kind, or anything with its shape and colour. */
  type: Pick<MarkTypeRef, 'shape' | 'color'>
  severity: MarkSeverity
  previous?: boolean
  number?: number
  size?: number
  className?: string
}) {
  const r = 26
  const shapes = markGlyph({
    x: 40,
    y: 44,
    shape: isMarkShape(type.shape) ? type.shape : 'circle',
    color: type.color,
    severity,
    number: number ?? 0,
    previous,
    size: r,
  })
  const withNumber = number !== undefined
  // Without a number, only the glyph itself: the last two shapes are the disc and its digit.
  const drawn = withNumber ? shapes : shapes.slice(0, -2)
  return (
    <svg
      viewBox={withNumber ? '0 0 100 90' : '10 14 60 60'}
      width={withNumber ? size * 1.1 : size}
      height={size}
      aria-hidden="true"
      className={cn('inline-block shrink-0', className)}
    >
      {drawn.map((shape, i) => (
        <Shape key={i} shape={shape} />
      ))}
    </svg>
  )
}
