'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_PORTAL_LOOK, type PortalLook, portalThemeProps } from '../Lib/theme'

const PortalLookContext = createContext<PortalLook>(DEFAULT_PORTAL_LOOK)

/** Hands the workshop's look to every client component under `PortalRoot`. */
export function PortalLookProvider({
  look,
  children,
}: {
  look: PortalLook
  children: React.ReactNode
}) {
  return <PortalLookContext.Provider value={look}>{children}</PortalLookContext.Provider>
}

/** The workshop's look, in a client component: theme, colours, what is on. */
export function usePortalLook(): PortalLook {
  return useContext(PortalLookContext)
}

/**
 * The theme for content a library draws outside the page: a Radix dialog,
 * sheet, popover or dropdown is moved to <body>, where the root's variables
 * do not reach. Wrap what goes inside it:
 *
 *   <DialogContent><PortalScope>…</PortalScope></DialogContent>
 *
 * It adds no box of its own (`display: contents`) unless given a className.
 */
export function PortalScope({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const look = usePortalLook()
  const themed = portalThemeProps(look)
  return (
    <div
      {...themed}
      className={className ? `portal-scope ${className}` : 'portal-scope'}
      style={className ? themed.style : { ...themed.style, display: 'contents' }}
    >
      {children}
    </div>
  )
}
