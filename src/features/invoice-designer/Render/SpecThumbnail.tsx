'use client'

import type { DocumentSpec } from '../Spec/documentSpec'
import { groupFlowBlocks } from '../Spec/documentSpec'
import { RenderNode } from './renderHtml'
import { fontStack } from '../Components/types'

/**
 * A template's card, drawn from the template.
 *
 * The gallery used to show four identical mock-ups with the current color
 * painted on, which is why every template looked the same before you picked
 * one. This renders what the template actually produces, through the same
 * generator and the same walker as the sheet.
 */
export function SpecThumbnail({ spec, height = 150 }: { spec: DocumentSpec; height?: number }) {
  const scale = height / spec.page.height
  const rows = groupFlowBlocks(spec.blocks)
  const contentWidth = spec.page.width - spec.page.margin.left - spec.page.margin.right

  return (
    <div
      style={{
        width: spec.page.width * scale,
        height,
        overflow: 'hidden',
        position: 'relative',
        background: spec.page.background,
        border: '1px solid #eceef1',
        borderRadius: 4,
      }}
    >
      <div
        style={{
          width: spec.page.width,
          height: spec.page.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'relative',
          fontFamily: fontStack(spec.page.fontFamily),
          color: spec.page.text,
          fontSize: spec.page.fontSize,
        }}
      >
        {spec.frame && (
          <>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                height: spec.frame.bandHeight,
                background: spec.frame.color,
              }}
            />
            <div
              style={{
                position: 'absolute',
                [spec.frame.side]: 0,
                top: 0,
                bottom: 0,
                width: spec.frame.railWidth,
                background: spec.frame.color,
              }}
            />
          </>
        )}
        <div
          style={{
            position: 'absolute',
            top: spec.page.margin.top,
            left: spec.page.margin.left,
            width: contentWidth,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {rows.map((row, i) =>
            row.type === 'single' ? (
              <RenderNode key={row.block.id} node={row.block.content} />
            ) : (
              <div key={`row-${i}`} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  {row.left.map((b) => (
                    <RenderNode key={b.id} node={b.content} />
                  ))}
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  {row.right.map((b) => (
                    <RenderNode key={b.id} node={b.content} />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
