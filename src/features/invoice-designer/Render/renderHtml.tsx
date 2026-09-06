'use client'

import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import { sanitizeHtml } from '@/lib/sanitize-html'
import type { BoxStyle, Node, TextStyle } from '../Spec/documentSpec'
import { fontStack } from '../Components/types'

/**
 * The document model drawn in HTML.
 *
 * A walker, nothing more: it knows how to draw a stack, a row, a text run, an
 * image and a table, and nothing at all about invoices. Everything specific to
 * a document lives in the generators, so this and the PDF renderer cannot drift
 * apart on what a section contains.
 */

function padding(style?: BoxStyle): CSSProperties {
  if (!style?.padding) return {}
  if (typeof style.padding === 'number') return { padding: style.padding }
  const p = style.padding
  return { padding: `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px` }
}

export function boxCss(style?: BoxStyle): CSSProperties {
  if (!style) return {}
  return {
    background: style.background,
    border: style.borderWidth ? `${style.borderWidth}px solid ${style.borderColor}` : undefined,
    borderRadius: style.radius,
    ...padding(style),
  }
}

export function textCss(style?: TextStyle): CSSProperties {
  if (!style) return {}
  return {
    color: style.color,
    fontFamily: style.fontFamily ? fontStack(style.fontFamily) : undefined,
    fontSize: style.fontSize,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    textAlign: style.align,
    textTransform: style.uppercase ? 'uppercase' : undefined,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight ?? 1.4,
  }
}

const JUSTIFY = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
} as const

const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end' } as const

/**
 * Nodes the designer is standing in for, by id, and what to call them.
 *
 * Only the editing canvas provides this. Every other reader of this model
 * draws the same nodes and must never wear the mark, because a stand-in that
 * reaches paper is a bug the mark would hide rather than something to print.
 */
export const PlaceholderNodes = createContext<{
  ids: ReadonlySet<string>
  label: string
} | null>(null)

/** The dashed frame and tag a marked row wears, matching a marked block's. */
function Marked({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div style={{ position: 'relative', outline: '1px dashed #c9a227', outlineOffset: 2 }}>
      {children}
      <span
        style={{
          position: 'absolute',
          top: -8,
          right: -2,
          background: '#fdf6e3',
          border: '1px solid #e6d8a8',
          color: '#8a6d1f',
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontSize: 9,
          fontWeight: 600,
          padding: '1px 5px',
          borderRadius: 3,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {label}
      </span>
    </div>
  )
}

/**
 * Draw one node. Anchored nodes are handled by the page, which lifts them out
 * of the flow before they get here, so this only ever lays out in flow.
 */
export function RenderNode({ node }: { node: Node }): ReactNode {
  const placeholders = useContext(PlaceholderNodes)
  const drawn = <NodeBody node={node} />
  if (!node.id || !placeholders?.ids.has(node.id)) return drawn
  return <Marked label={placeholders.label}>{drawn}</Marked>
}

function NodeBody({ node }: { node: Node }): ReactNode {
  const id = node.id ? { 'data-node-id': node.id } : {}

  switch (node.kind) {
    case 'stack':
      return (
        <div
          {...id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: node.gap ?? 0,
            ...boxCss(node.style),
          }}
        >
          {node.children.map((child, i) => (
            <RenderNode key={child.id ?? i} node={child} />
          ))}
        </div>
      )

    case 'row':
      return (
        <div
          {...id}
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: node.gap ?? 0,
            justifyContent: JUSTIFY[node.justify ?? 'start'],
            alignItems: ALIGN[node.align ?? 'start'],
            ...boxCss(node.style),
          }}
        >
          {node.children.map((child, i) => (
            <div
              key={child.node.id ?? i}
              style={
                child.width === 'flex'
                  ? { flex: 1, minWidth: 0 }
                  : child.width
                    ? { width: child.width, flex: 'none' }
                    : undefined
              }
            >
              <RenderNode node={child.node} />
            </div>
          ))}
        </div>
      )

    case 'text':
      return (
        <div {...id} style={textCss(node.style)}>
          {node.text}
        </div>
      )

    case 'richtext':
      return (
        <div
          {...id}
          style={{ lineHeight: 1.5, ...textCss(node.style) }}
          // The workshop's own rich-text notes, sanitized the same way the
          // PDF sanitizes them before parsing.
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(node.html) }}
        />
      )

    case 'image':
      return (
        <div
          {...id}
          style={{
            display: 'flex',
            justifyContent:
              node.align === 'center'
                ? 'center'
                : node.align === 'left'
                  ? 'flex-start'
                  : 'flex-end',
          }}
        >
          {/* A workshop upload rather than a static asset. */}
          <img
            src={node.src}
            alt=""
            style={{ maxWidth: node.maxWidth, maxHeight: node.maxHeight, objectFit: 'contain' }}
          />
        </div>
      )

    case 'table': {
      const cell = (width: number | 'flex'): CSSProperties =>
        width === 'flex' ? { flex: 1, minWidth: 0 } : { width, flex: 'none' }
      return (
        <div {...id} style={boxCss(node.style)}>
          <div
            style={{
              display: 'flex',
              ...boxCss(node.headerStyle),
              ...textCss(node.headerStyle),
              padding: '6px 8px',
            }}
          >
            {node.columns.map((column) => (
              <span key={column.key} style={{ ...cell(column.width), textAlign: column.align }}>
                {column.label}
              </span>
            ))}
          </div>
          {node.rows.flatMap((row, i) => {
            const struck = node.strikeKey ? !!row[node.strikeKey] : false
            // Rules are their own elements between rows, overlapping both
            // neighbours by a hair so scaled rendering cannot leave seams;
            // a banded background paints after the rule and covers the
            // overlap. The outer border already closes the table's bottom.
            const rule =
              i < node.rows.length - 1 || !node.style?.borderWidth ? (
                <div
                  key={`rule-${i}`}
                  style={{
                    // Below the last row nothing paints the overlap back, so
                    // the trailing rule keeps only its upper extension.
                    height: (node.ruleWidth ?? 0.75) + (i === node.rows.length - 1 ? 0.35 : 0.7),
                    marginTop: -0.35,
                    marginBottom: i === node.rows.length - 1 ? 0 : -0.35,
                    background: node.style?.borderColor ?? '#eceef1',
                  }}
                />
              ) : null
            const body = (
              <div
                key={`${row[node.columns[0].key]}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  padding: `${node.rowPadding ?? 5}px 8px`,
                  background: node.stripe && i % 2 === 1 ? node.stripe : node.rowBackground,
                  opacity: struck ? 0.5 : undefined,
                  textDecoration: struck ? 'line-through' : undefined,
                }}
              >
                {node.columns.map((column) => (
                  <span key={column.key} style={{ ...cell(column.width), textAlign: column.align }}>
                    {row[column.key]}
                    {node.subKey && column.width === 'flex' && row[node.subKey] ? (
                      <span style={{ display: 'block', opacity: 0.6, fontSize: '0.85em' }}>
                        {row[node.subKey]}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            )
            return rule ? [body, rule] : [body]
          })}
        </div>
      )
    }

    case 'spacer':
      return <div {...id} style={{ height: node.height, background: node.color }} />

    default:
      return null
  }
}
