import type { PortalHomeData, PortalHomeFormat, PortalWorkshop } from '../../Lib/homeTypes'

/**
 * What a theme's three compositions receive. A theme arranges and styles;
 * every fact, link and sentence comes in through these props or from the
 * shared pieces (`Components/Ui`, `Components/Home/homeCopy.ts`,
 * `usePortalNav`, `PortalAccountMenu`, `PortalWorkshopMark`).
 */

/**
 * The signed-in home. A server component (it may be async), since `format`
 * holds functions. One responsive component from 360 px to a wide desk.
 */
export interface PortalHomeProps {
  /** The slug or id in the address, for links: `/portal/${orgParam}/…`. */
  orgParam: string
  data: PortalHomeData
  format: PortalHomeFormat
  /**
   * The chat with the workshop, ready to place: it fills the box it is put
   * in, so give that box a height. Null when the workshop turned the chat
   * off. On a phone the chat lives behind the Messages tab: hide the box
   * there and show a one-line preview from `data.messages` instead.
   */
  chat: React.ReactNode | null
}

/**
 * The frame of the sign-in page and of the "continue to sign in" step: the
 * workshop's own front door. A server component. It draws the workshop
 * (mark, name, its own line about itself, cover photo, whether it is open,
 * the week's hours, address, phone) and places `children`, which is the
 * sign-in form or the confirm button, under `eyebrow` and `heading`.
 */
export interface PortalSignInProps {
  orgParam: string
  workshop: PortalWorkshop
  /** The workshop's own words about itself, when it wrote any. May hold line breaks. */
  description: string | null
  /**
   * The hours as the workshop typed them, for a workshop that never set its
   * week in the calendar. Shown only when `workshop.hours` is null.
   */
  hoursText: string | null
  /** The cover photo the workshop uploaded; draw nothing in its place without one. */
  coverUrl: string | null
  /** The small line above the heading: "For our customers". */
  eyebrow: string
  /** What signing in gives, in the customer's words. An `h2`: the workshop's name is the `h1`. */
  heading: string
  /** The form, already styled with the shared primitives. */
  children: React.ReactNode
}

/**
 * Everything around a signed-in page: the header, the phone's bottom
 * navigation (Home, Messages with its unread badge, Book, My cars, Papers)
 * and whatever else frames the page. A client component (it reads the
 * current path through `usePortalNav`).
 *
 * It renders `children` inside `<main id="portal-main">` with no padding of
 * its own: a page brings its own (`.p-page` through the shell, or its own
 * layout on the home), and it leaves room for the bottom navigation.
 */
export interface PortalChromeProps {
  orgParam: string
  workshop: PortalWorkshop
  customerName: string
  /** The workshop works on boats: "My boats", a boat icon. */
  marine: boolean
  /** False hides Messages from the navigation. */
  messagesEnabled: boolean
  /** Unread messages as the server counted them; pass to `usePortalNav`. */
  unreadMessages: number
  children: React.ReactNode
}

export interface PortalThemeComponents {
  Home: (props: PortalHomeProps) => React.ReactNode | Promise<React.ReactNode>
  SignIn: (props: PortalSignInProps) => React.ReactNode | Promise<React.ReactNode>
  Chrome: (props: PortalChromeProps) => React.ReactNode
}
