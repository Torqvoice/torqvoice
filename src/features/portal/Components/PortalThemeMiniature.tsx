import type { CSSProperties } from 'react'
import type { PortalTheme } from '../Lib/theme'

/**
 * What each theme's page is made of, for the pictures in the settings and for
 * judging a colour against the theme: the same values `portal-themes.css`
 * gives the portal. They are the portal's colours, not the app's, which is
 * why they are written out here and not taken from the app's theme tokens.
 */
export const PORTAL_THEME_SURFACES: Record<
  PortalTheme,
  { background: string; surface: string; soft: string; line: string; ink: string; muted: string }
> = {
  daylight: {
    background: '#F2F3EF',
    surface: '#FFFFFF',
    soft: '#E9EBE5',
    line: '#DADDD6',
    ink: '#14181B',
    muted: '#56606A',
  },
  garage: {
    background: '#0C0D0E',
    surface: '#15171A',
    soft: '#25292E',
    line: '#2E3238',
    ink: '#F4F2EC',
    muted: '#A9AEB5',
  },
  print: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    soft: '#F1F4F6',
    line: '#D3D9DF',
    ink: '#0E1216',
    muted: '#55606B',
  },
  // Colour tints its page, soft fills and lines from the workshop's colour;
  // the drawing mixes those itself. What is fixed is the white of its cards,
  // which is also what its links and highlights sit on.
  colour: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    soft: '#FFFFFF',
    line: '#FFFFFF',
    ink: '#0E1216',
    muted: '#55606B',
  },
}

const box = (style: CSSProperties): CSSProperties => ({ boxSizing: 'border-box', ...style })

/** Three chat bubbles, the customer's own in the middle and to the right. */
function Bubbles({
  them,
  me,
  height,
  radius,
}: {
  them: string
  me: string
  height: number
  radius: number
}) {
  return (
    <>
      <div style={{ height, width: '80%', borderRadius: radius, background: them }} />
      <div
        style={{
          height,
          width: '70%',
          borderRadius: radius,
          background: me,
          alignSelf: 'flex-end',
        }}
      />
      <div style={{ height, width: '85%', borderRadius: radius, background: them }} />
    </>
  )
}

/**
 * A small drawing of a theme's home screen: the car band, the cards and the
 * chat, in the theme's own colours and with the workshop's colour where the
 * theme puts it. Decoration only: the tile's label names the theme.
 */
export function PortalThemeMiniature({
  theme,
  accent,
  onAccent,
}: {
  theme: PortalTheme
  /** "#RRGGBB": the colour this theme would be drawn with. */
  accent: string
  /** "#RRGGBB": the ink on that colour. */
  onAccent: string
}) {
  const c = PORTAL_THEME_SURFACES[theme]
  const frame = 'flex h-32 overflow-hidden rounded-md'

  if (theme === 'daylight') {
    return (
      <div
        aria-hidden="true"
        className={frame}
        style={box({ background: c.background, padding: 8, gap: 6 })}
      >
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 6 }}>
          <div
            className="flex flex-col"
            style={box({ height: 48, borderRadius: 6, background: c.ink, padding: 8, gap: 5 })}
          >
            <div style={{ height: 6, width: '70%', borderRadius: 3, background: '#FFFFFF' }} />
            <div
              style={{
                height: 4,
                width: '45%',
                borderRadius: 2,
                background: `color-mix(in srgb, ${accent} 58%, #FFFFFF)`,
              }}
            />
          </div>
          <div className="grid flex-1 grid-cols-2" style={{ gap: 6 }}>
            <div
              className="flex items-end"
              style={box({
                borderRadius: 6,
                background: c.surface,
                border: `1px solid ${c.line}`,
                padding: 5,
              })}
            >
              <div style={{ height: 7, width: '70%', borderRadius: 4, background: accent }} />
            </div>
            <div
              style={{ borderRadius: 6, background: c.surface, border: `1px solid ${c.line}` }}
            />
          </div>
        </div>
        <div
          className="flex shrink-0 flex-col justify-end"
          style={box({
            width: 52,
            borderRadius: 6,
            background: c.surface,
            border: `1px solid ${c.line}`,
            padding: 6,
            gap: 4,
          })}
        >
          <Bubbles them={c.soft} me={c.ink} height={8} radius={4} />
        </div>
      </div>
    )
  }

  if (theme === 'garage') {
    return (
      <div
        aria-hidden="true"
        className={frame}
        style={box({ background: c.background, padding: 8, gap: 6 })}
      >
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 6 }}>
          <div
            className="flex flex-col"
            style={box({ height: 48, background: accent, padding: 8, gap: 5 })}
          >
            <div style={{ height: 8, width: '60%', background: onAccent }} />
            <div style={{ height: 4, width: '40%', background: onAccent }} />
          </div>
          <div className="grid flex-1 grid-cols-2" style={{ gap: 6 }}>
            <div style={{ background: c.surface, borderTop: `2px solid ${accent}` }} />
            <div style={{ background: c.surface, borderTop: `2px solid ${c.line}` }} />
          </div>
        </div>
        <div
          className="flex shrink-0 flex-col justify-end"
          style={box({ width: 52, background: c.surface, padding: 6, gap: 4 })}
        >
          <Bubbles them={c.soft} me={accent} height={8} radius={0} />
        </div>
      </div>
    )
  }

  if (theme === 'print') {
    return (
      <div
        aria-hidden="true"
        className={frame}
        style={box({
          background: c.background,
          border: `1px solid ${c.line}`,
          padding: 10,
          gap: 8,
        })}
      >
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 7 }}>
          <div style={{ height: 9, width: '85%', background: c.ink }} />
          <div style={{ height: 9, width: '60%', background: c.ink }} />
          <div style={{ height: 1, background: c.ink, marginTop: 4 }} />
          <div style={{ height: 4, width: '90%', background: c.muted }} />
          <div style={{ height: 1, background: c.line }} />
          <div style={{ height: 4, width: '75%', background: c.muted }} />
          <div style={{ height: 1, background: c.line }} />
          <div style={{ height: 4, width: '45%', background: accent }} />
        </div>
        <div className="shrink-0" style={{ width: 1, background: c.ink }} />
        <div className="flex shrink-0 flex-col justify-end" style={{ width: 46, gap: 5 }}>
          <Bubbles them={c.muted} me={accent} height={4} radius={0} />
        </div>
      </div>
    )
  }

  return (
    <div
      aria-hidden="true"
      className={`${frame} flex-col`}
      style={{ background: `color-mix(in srgb, ${accent} 12%, #FFFFFF)` }}
    >
      <div
        className="flex shrink-0 flex-col"
        style={box({ height: 62, background: accent, padding: 10, gap: 6 })}
      >
        <div style={{ height: 9, width: '65%', borderRadius: 5, background: onAccent }} />
        <div style={{ height: 9, width: '45%', borderRadius: 5, background: onAccent }} />
      </div>
      <div className="grid flex-1 grid-cols-3" style={{ margin: '-14px 8px 8px', gap: 6 }}>
        <div style={{ borderRadius: 10, background: c.surface }} />
        <div style={{ borderRadius: 10, background: c.surface }} />
        <div
          className="flex flex-col justify-end"
          style={box({ borderRadius: 10, background: c.surface, padding: 6, gap: 4 })}
        >
          <div
            style={{
              height: 7,
              width: '80%',
              borderRadius: 4,
              background: `color-mix(in srgb, ${accent} 16%, #FFFFFF)`,
            }}
          />
          <div
            style={{
              height: 7,
              width: '65%',
              borderRadius: 4,
              background: accent,
              alignSelf: 'flex-end',
            }}
          />
        </div>
      </div>
    </div>
  )
}
