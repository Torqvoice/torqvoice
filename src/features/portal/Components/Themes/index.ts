import type { PortalTheme } from '../../Lib/theme'
import { Chrome as ColourChrome } from './Colour/Chrome'
import { Home as ColourHome } from './Colour/Home'
import { SignIn as ColourSignIn } from './Colour/SignIn'
import { Chrome as DaylightChrome } from './Daylight/Chrome'
import { Home as DaylightHome } from './Daylight/Home'
import { SignIn as DaylightSignIn } from './Daylight/SignIn'
import { Chrome as GarageChrome } from './Garage/Chrome'
import { Home as GarageHome } from './Garage/Home'
import { SignIn as GarageSignIn } from './Garage/SignIn'
import { Chrome as PrintChrome } from './Print/Chrome'
import { Home as PrintHome } from './Print/Home'
import { SignIn as PrintSignIn } from './Print/SignIn'
import type { PortalThemeComponents } from './types'

export type {
  PortalChromeProps,
  PortalHomeProps,
  PortalSignInProps,
  PortalThemeComponents,
} from './types'

/**
 * Each theme's three compositions. A theme's folder exports `Home` from
 * Home.tsx, `SignIn` from SignIn.tsx and `Chrome` from Chrome.tsx; nothing
 * else in the portal names a theme.
 */
export const PORTAL_THEME_COMPONENTS: Record<PortalTheme, PortalThemeComponents> = {
  daylight: { Home: DaylightHome, SignIn: DaylightSignIn, Chrome: DaylightChrome },
  garage: { Home: GarageHome, SignIn: GarageSignIn, Chrome: GarageChrome },
  print: { Home: PrintHome, SignIn: PrintSignIn, Chrome: PrintChrome },
  colour: { Home: ColourHome, SignIn: ColourSignIn, Chrome: ColourChrome },
}

export function portalThemeComponents(theme: PortalTheme): PortalThemeComponents {
  return PORTAL_THEME_COMPONENTS[theme]
}
