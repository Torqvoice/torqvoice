'use client'

import {
  useCallback,
  useMemo,
  useRef,
  useState,
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
import { isPanel, isView, type MarkKind, type MarkSeverity } from '../Lib/marks'

/** A mark as the drawing shows it: where, what, and its number. */
export interface MapMark {
  id: string
  view: string
  x: number
  y: number
  kind: string
  severity: string
  number: number
  previous: boolean
}

export interface MapTap {
  view: View
  panel: Panel
  x: number
  y: number
}

/** The glyph's radius on screen, in sheet units; larger than print, for a finger. */
const GLYPH = 34

/**
 * The vehicle's five views on one sheet, with the marks on them.
 *
 * Tap a panel to add a mark; drag a mark to move it. Every panel is a path
 * with its name on it, so a tap records "left front door" as well as where
 * on the picture, and the legend can say so. One view can be brought up on
 * its own for a finger on a phone.
 */
export function ConditionMap({
  body,
  marks,
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
    if (readOnly || mark.previous) {
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

  const glyphShapes = (mark: MapMark): DrawingShape[] => {
    const at = drag?.id === mark.id ? [drag.x, drag.y] : markPosition(composition, mark)
    if (!at) return []
    return markGlyph({
      x: at[0],
      y: at[1],
      kind: mark.kind as MarkKind,
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
      role="img"
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
        return (
          <g
            key={mark.id}
            role="button"
            tabIndex={0}
            aria-label={t('markLabel', {
              n: mark.number,
              kind: t(`kinds.${mark.kind}`),
              area: '',
            })}
            className={cn(
              'outline-none',
              readOnly || mark.previous ? 'cursor-pointer' : 'cursor-grab',
              drag?.id === mark.id && 'pointer-events-none cursor-grabbing'
            )}
            onPointerDown={(event) => startDrag(event, mark)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect?.(mark.id)
              }
            }}
          >
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
  kind,
  severity,
  previous = false,
  number,
  size = 18,
  className,
}: {
  kind: MarkKind
  severity: MarkSeverity
  previous?: boolean
  number?: number
  size?: number
  className?: string
}) {
  const r = 26
  const shapes = markGlyph({ x: 40, y: 44, kind, severity, number: number ?? 0, previous, size: r })
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
