import React from 'react'
import { Image, Text, View } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { HtmlToPdf } from '@/features/vehicles/Components/invoice-pdf/Notes'
import type { BoxStyle, Node, TextStyle } from '../Spec/documentSpec'
import { DEFAULT_LINE_HEIGHT } from './measure'

/**
 * The document model drawn in react-pdf.
 *
 * The same walker as renderHtml, wearing paper: it knows how to draw a stack,
 * a row, a text run, an image, a table and a rich-text fragment, and nothing
 * at all about invoices. Whatever the designer showed, this prints, because
 * both read the very same nodes.
 */

/** The families the PDFs embed, keyed by the names the model stores. */
const PDF_FAMILY: Record<string, string> = {
  Helvetica: 'Roboto',
  'Times-Roman': 'Noto Serif',
  Courier: 'Noto Sans Mono',
  'Open Sans': 'Open Sans',
  Lato: 'Lato',
  Montserrat: 'Montserrat',
  'PT Sans': 'PT Sans',
}

export function pdfFamily(name?: string): string {
  return PDF_FAMILY[name || 'Helvetica'] || 'Roboto'
}

export function textStylePdf(style: TextStyle | undefined, base: TextStyle): Style {
  const merged = { ...base, ...style }
  return {
    color: merged.color,
    fontFamily: pdfFamily(merged.fontFamily),
    fontWeight: merged.bold ? 700 : 400,
    // No fontStyle: the embedded families carry no italic face, and react-pdf
    // refuses to substitute one rather than falling back.
    fontSize: merged.fontSize,
    ...(merged.align ? { textAlign: merged.align } : {}),
    ...(merged.uppercase ? { textTransform: 'uppercase' as const } : {}),
    ...(merged.letterSpacing !== undefined ? { letterSpacing: merged.letterSpacing } : {}),
    lineHeight: merged.lineHeight ?? DEFAULT_LINE_HEIGHT,
  }
}

function boxStylePdf(style?: BoxStyle): Style {
  if (!style) return {}
  const padding =
    style.padding === undefined
      ? {}
      : typeof style.padding === 'number'
        ? { padding: style.padding }
        : {
            paddingTop: style.padding.top,
            paddingRight: style.padding.right,
            paddingBottom: style.padding.bottom,
            paddingLeft: style.padding.left,
          }
  return {
    ...(style.background ? { backgroundColor: style.background } : {}),
    ...(style.borderWidth
      ? { borderWidth: style.borderWidth, borderColor: style.borderColor }
      : {}),
    ...(style.radius ? { borderRadius: style.radius } : {}),
    ...padding,
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
 * Draw one node. `base` is the block's inherited text look; react-pdf has no
 * style cascade across views, so it is carried down by hand.
 */
export function RenderNodePdf({ node, base }: { node: Node; base: TextStyle }): React.ReactNode {
  switch (node.kind) {
    case 'stack': {
      const gap = node.gap ?? 0
      const children = node.children
        .map((child, i) => ({ child, i }))
        .filter(({ child }) => !(child.kind === 'text' && !child.text))
      return (
        <View style={boxStylePdf(node.style)}>
          {children.map(({ child, i }, index) => (
            <View key={child.id ?? i} style={index > 0 && gap ? { marginTop: gap } : {}}>
              <RenderNodePdf node={child} base={base} />
            </View>
          ))}
        </View>
      )
    }

    case 'row':
      return (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: JUSTIFY[node.justify ?? 'start'],
            alignItems: ALIGN[node.align ?? 'start'],
            ...(node.gap ? { gap: node.gap } : {}),
            ...boxStylePdf(node.style),
          }}
        >
          {node.children.map((child, i) => (
            <View
              key={child.node.id ?? i}
              style={
                child.width === 'flex' ? { flex: 1 } : child.width ? { width: child.width } : {}
              }
            >
              <RenderNodePdf node={child.node} base={base} />
            </View>
          ))}
        </View>
      )

    case 'text':
      if (!node.text) return null
      return <Text style={textStylePdf(node.style, base)}>{node.text}</Text>

    case 'richtext':
      return (
        <HtmlToPdf
          html={node.html}
          baseStyle={{
            fontSize: node.style?.fontSize ?? base.fontSize ?? 9,
            color: node.style?.color ?? base.color ?? '#666666',
            lineHeight: node.style?.lineHeight ?? 1.5,
          }}
          fontBold={pdfFamily(node.style?.fontFamily ?? base.fontFamily)}
        />
      )

    case 'image':
      return (
        <View
          style={{
            flexDirection: 'row',
            justifyContent:
              node.align === 'center'
                ? 'center'
                : node.align === 'left'
                  ? 'flex-start'
                  : 'flex-end',
          }}
        >
          <Image
            src={node.src}
            style={{
              maxWidth: node.maxWidth,
              maxHeight: node.maxHeight,
              objectFit: 'contain',
              // react-pdf reserves the image's layout box at maxWidth and
              // floats the scaled picture inside it; without this the picture
              // centers in that box and drifts off its alignment edge.
              objectPosition:
                node.align === 'center' ? 'center' : node.align === 'left' ? 'left' : 'right',
            }}
          />
        </View>
      )

    case 'table': {
      const cell = (width: number | 'flex'): Style => (width === 'flex' ? { flex: 1 } : { width })
      const headerText = textStylePdf(node.headerStyle, base)
      const borderColor = node.style?.borderColor ?? '#eceef1'
      return (
        <View style={boxStylePdf(node.style)}>
          <View
            style={{
              flexDirection: 'row',
              paddingVertical: 6,
              paddingHorizontal: 8,
              ...(node.headerStyle?.background
                ? { backgroundColor: node.headerStyle.background }
                : {}),
            }}
          >
            {node.columns.map((column) => (
              <Text
                key={column.key}
                style={{ ...headerText, ...cell(column.width), textAlign: column.align }}
              >
                {column.label}
              </Text>
            ))}
          </View>
          {node.rows.flatMap((row, i) => {
            const struck = node.strikeKey ? !!row[node.strikeKey] : false
            // Rules are their own elements between rows, and they overlap both
            // neighbours by a hair: PDF viewers leave antialiasing seams
            // between rectangles that merely touch, which showed as white
            // slivers around every banded row. A banded background paints
            // after the rule and covers the overlap, so the rule still
            // measures exactly its width. The outer border already closes the
            // table's bottom.
            const rule =
              i < node.rows.length - 1 || !node.style?.borderWidth ? (
                <View
                  key={`rule-${i}`}
                  style={{
                    // Below the last row nothing paints the overlap back, so
                    // the trailing rule keeps only its upper extension.
                    height: (node.ruleWidth ?? 0.75) + (i === node.rows.length - 1 ? 0.35 : 0.7),
                    marginTop: -0.35,
                    marginBottom: i === node.rows.length - 1 ? 0 : -0.35,
                    backgroundColor: borderColor,
                  }}
                />
              ) : null
            const body = (
              <View
                key={`${row[node.columns[0].key]}-${i}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  paddingVertical: node.rowPadding ?? 5,
                  paddingHorizontal: 8,
                  ...(node.stripe && i % 2 === 1
                    ? { backgroundColor: node.stripe }
                    : node.rowBackground
                      ? { backgroundColor: node.rowBackground }
                      : {}),
                  ...(struck ? { opacity: 0.5 } : {}),
                }}
              >
                {node.columns.map((column) => (
                  <View key={column.key} style={cell(column.width)}>
                    <Text
                      style={{
                        ...textStylePdf(undefined, base),
                        textAlign: column.align,
                        ...(struck ? { textDecoration: 'line-through' as const } : {}),
                      }}
                    >
                      {row[column.key]}
                    </Text>
                    {node.subKey && column.width === 'flex' && row[node.subKey] ? (
                      <Text
                        style={{
                          ...textStylePdf(undefined, base),
                          fontSize: (base.fontSize ?? 9) * 0.85,
                          opacity: 0.6,
                        }}
                      >
                        {row[node.subKey]}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )
            return rule ? [body, rule] : [body]
          })}
        </View>
      )
    }

    case 'spacer':
      return <View style={{ height: node.height }} />

    default:
      return null
  }
}
