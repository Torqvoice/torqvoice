/**
 * The workshop's mark: its logo when it has one, else its first letter on the
 * workshop's colour. Decorative: the name always stands beside it.
 *
 * `size` is the side in pixels; the letter and the corner scale with it. A
 * logo sits on the surface colour so a dark or transparent logo stays
 * visible in every theme.
 */
export function PortalWorkshopMark({
  name,
  logoUrl,
  size = 40,
  className,
}: {
  name: string
  logoUrl: string | null
  size?: number
  className?: string
}) {
  const box: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: `min(${Math.round(size / 4)}px, max(var(--p-radius), 2px))`,
  }
  if (logoUrl) {
    return (
      // A workshop's uploaded logo: its size is unknown, so no next/image.
      <img
        src={logoUrl}
        alt=""
        style={box}
        className={`shrink-0 bg-[var(--p-surface)] object-contain ${className ?? ''}`}
      />
    )
  }
  return (
    <span
      aria-hidden
      style={{
        ...box,
        fontSize: Math.round(size / 2),
        background: 'var(--p-accent)',
        color: 'var(--p-on-accent)',
      }}
      className={`p-display flex shrink-0 items-center justify-center ${className ?? ''}`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}
