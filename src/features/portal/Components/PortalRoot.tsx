import { DEFAULT_PORTAL_LOOK, type PortalLook, portalThemeProps } from '../Lib/theme'
import { PortalLookProvider } from './PortalLookContext'

/**
 * The one element every portal page is drawn inside, signed in or not: it
 * names the theme (`data-portal-theme`) and carries the workshop's colour and
 * the ink on it (`--p-accent`, `--p-on-accent`), which is all
 * `portal-themes.css` needs to colour everything below.
 *
 * The portal's layout (`app/(public)/portal/[orgId]/layout.tsx`) renders it
 * around every page, loading screen and error screen of a workshop's portal,
 * so a page never renders its own. It also hands the look to client
 * components (`usePortalLook`, `PortalScope`).
 */
export function PortalRoot({
  look = DEFAULT_PORTAL_LOOK,
  className,
  children,
}: {
  look?: PortalLook
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      {...portalThemeProps(look)}
      className={className ? `portal-root ${className}` : 'portal-root'}
    >
      <PortalLookProvider look={look}>{children}</PortalLookProvider>
    </div>
  )
}
