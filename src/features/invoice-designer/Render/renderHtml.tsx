'use client'

import type { CSSProperties, ReactNode } from 'react'
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
 * Draw one node. Anchored nodes are handled by the page, which lifts them out
 * of the flow before they get here, so this only ever lays out in flow.
 */
export function RenderNode({ node }: { node: Node }): ReactNode {
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
        <div {...id}>
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
          {node.rows.map((row, i) => (
            <div
              key={`${row[node.columns[0].key]}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                padding: `${node.rowPadding ?? 5}px 8px`,
                background: node.stripe && i % 2 === 1 ? node.stripe : undefined,
                borderBottom: `0.75px solid ${node.style?.borderColor ?? '#eceef1'}`,
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
          ))}
        </div>
      )
    }

    case 'spacer':
      return <div {...id} style={{ height: node.height }} />

    default:
      return null
  }
}
