/**
 * Built-in background templates for the customer portal landing page.
 * Each template is a Tailwind class string that paints a full-bleed background.
 * Kept as plain CSS gradients so we don't need to ship asset files.
 */
export type PortalBackgroundTemplate = {
  id: string
  /** Translation key under `settings.portal.background.templateNames` */
  labelKey: string
  /** Tailwind class applied to the outer landing wrapper. */
  className: string
}

export const PORTAL_BACKGROUND_TEMPLATES: PortalBackgroundTemplate[] = [
  {
    id: 'default',
    labelKey: 'default',
    className: 'bg-muted/30',
  },
  {
    id: 'sunrise',
    labelKey: 'sunrise',
    className: 'bg-gradient-to-br from-orange-100 via-amber-50 to-rose-100',
  },
  {
    id: 'ocean',
    labelKey: 'ocean',
    className: 'bg-gradient-to-br from-sky-100 via-blue-50 to-cyan-100',
  },
  {
    id: 'forest',
    labelKey: 'forest',
    className: 'bg-gradient-to-br from-emerald-100 via-green-50 to-teal-100',
  },
  {
    id: 'slate',
    labelKey: 'slate',
    className: 'bg-gradient-to-br from-slate-100 via-slate-50 to-zinc-100',
  },
  {
    id: 'sand',
    labelKey: 'sand',
    className: 'bg-gradient-to-br from-amber-50 via-stone-100 to-yellow-50',
  },
]

export const DEFAULT_PORTAL_BACKGROUND_TEMPLATE = PORTAL_BACKGROUND_TEMPLATES[0]

export type PortalBackgroundType = 'none' | 'template' | 'image'

export function isValidPortalBackgroundType(
  value: string | null | undefined
): value is PortalBackgroundType {
  return value === 'none' || value === 'template' || value === 'image'
}

export function resolvePortalBackgroundTemplate(
  id: string | null | undefined
): PortalBackgroundTemplate {
  if (!id) return DEFAULT_PORTAL_BACKGROUND_TEMPLATE
  return PORTAL_BACKGROUND_TEMPLATES.find((t) => t.id === id) ?? DEFAULT_PORTAL_BACKGROUND_TEMPLATE
}
