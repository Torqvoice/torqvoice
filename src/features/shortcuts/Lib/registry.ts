import type { Combo } from './keys'

/**
 * Every keyboard shortcut in the signed-in app, in the order the help overlay
 * and the settings page list them. This is the one place that knows a key:
 * the listener, the hints beside menu items and the settings page all read it.
 *
 * A shortcut that opens a page carries its `href` and needs nothing else. One
 * that does something on a screen (the calendar's views, the search palette)
 * is given its handler by that screen with `useShortcut`, and does nothing
 * while the screen is not there.
 */
export type ShortcutGroup = 'general' | 'create' | 'goTo' | 'calendar'

export type ShortcutLabel =
  /** `settings.shortcuts.actions.<key>` */
  | { from: 'shortcuts'; key: string }
  /** `navigation.sidebar.<key>`, with the marine word where there is one. */
  | { from: 'sidebar'; key: string; marineKey?: string }
  /** `search.actions.<key>` */
  | { from: 'search'; key: string }

export type ShortcutDef = {
  id: string
  group: ShortcutGroup
  /** Where it works: everywhere, or on one screen only. */
  scope: 'global' | 'calendar'
  /** The keys it ships with; a person may replace them with one of their own. */
  defaultKeys: Combo[]
  /** Keys that always work beside those and are not offered for change. */
  fixedKeys?: Combo[]
  /**
   * Its place in the go-to set, such as `alt+g alt+w`: Alt+G, then Alt+W.
   * Works unless the person switched the set off.
   */
  sequence?: Combo
  label: ShortcutLabel
  /** Opened when nothing on the screen has claimed the shortcut. */
  href?: string
  /** The search palette command it mirrors; hidden when that command is. */
  command?: string
  /** Permission subject it needs when there is no palette command to go by. */
  subject?: string
  /** Works with a dialog or a menu open. Everything else waits until it closes. */
  overLayers?: boolean
}

const goTo = (
  id: string,
  command: string,
  href: string,
  key: string,
  letter: string | null,
  marineKey?: string
): ShortcutDef => ({
  id: `goTo.${id}`,
  group: 'goTo',
  scope: 'global',
  // No single chord of its own: the search palette opens every page, and
  // the go-to set (Alt+G, then a letter) the main ones. A person can give
  // any page a key.
  defaultKeys: [],
  sequence: letter ? `alt+g alt+${letter}` : undefined,
  label: { from: 'sidebar', key, marineKey },
  href,
  command,
})

const calendarView = (view: string, letter: string): ShortcutDef => ({
  id: `calendar.${view}`,
  group: 'calendar',
  scope: 'calendar',
  defaultKeys: [letter],
  label: { from: 'shortcuts', key: `calendar_${view}` },
})

export const SHORTCUTS: readonly ShortcutDef[] = [
  {
    id: 'general.search',
    group: 'general',
    scope: 'global',
    defaultKeys: ['mod+k'],
    label: { from: 'shortcuts', key: 'search' },
    overLayers: true,
  },
  {
    id: 'general.plateLookup',
    group: 'general',
    scope: 'global',
    defaultKeys: ['mod+shift+l'],
    label: { from: 'shortcuts', key: 'plateLookup' },
    overLayers: true,
  },
  {
    id: 'general.save',
    group: 'general',
    scope: 'global',
    defaultKeys: ['mod+s'],
    label: { from: 'shortcuts', key: 'save' },
    overLayers: true,
  },
  {
    id: 'general.sidebar',
    group: 'general',
    scope: 'global',
    defaultKeys: ['mod+b'],
    label: { from: 'shortcuts', key: 'sidebar' },
    overLayers: true,
  },
  {
    id: 'general.help',
    group: 'general',
    scope: 'global',
    defaultKeys: ['mod+/'],
    label: { from: 'shortcuts', key: 'help' },
  },

  // Alt and the first letter of what is being made. Vehicle is the one
  // exception: Alt+V opens the View menu in Firefox on Windows, so it is K
  // (as in car, kjøretøy, Kfz).
  {
    id: 'create.workOrder',
    group: 'create',
    scope: 'global',
    defaultKeys: ['alt+w'],
    label: { from: 'search', key: 'newWorkOrder' },
    href: '/work-orders?new=1',
    command: 'action:new-work-order',
  },
  {
    id: 'create.quote',
    group: 'create',
    scope: 'global',
    defaultKeys: ['alt+q'],
    label: { from: 'search', key: 'newQuote' },
    href: '/quotes?create=true',
    command: 'action:new-quote',
  },
  {
    id: 'create.customer',
    group: 'create',
    scope: 'global',
    defaultKeys: ['alt+c'],
    label: { from: 'search', key: 'newCustomer' },
    href: '/customers?create=true',
    command: 'action:new-customer',
  },
  {
    id: 'create.vehicle',
    group: 'create',
    scope: 'global',
    defaultKeys: ['alt+k'],
    label: { from: 'search', key: 'newVehicle' },
    href: '/vehicles?create=true',
    command: 'action:new-vehicle',
  },
  {
    id: 'create.part',
    group: 'create',
    scope: 'global',
    defaultKeys: ['alt+p'],
    label: { from: 'search', key: 'newPart' },
    href: '/inventory?create=true',
    command: 'action:new-part',
  },
  {
    id: 'create.inspection',
    group: 'create',
    scope: 'global',
    defaultKeys: ['alt+i'],
    label: { from: 'shortcuts', key: 'newInspection' },
    subject: 'inspections',
  },

  // Pages: hold Alt, press G, then the page's letter. Both presses carry
  // Alt, so nothing typed and nothing a scanner sends can start or finish
  // one. The letter is the one that creates the same thing (W work order,
  // Q quote, C customer, K vehicle, P part, I inspection); G twice is the
  // dashboard; L is the calendar, O the work board.
  goTo('dashboard', 'page:dashboard', '/', 'dashboard', 'g'),
  goTo('workOrders', 'page:work-orders', '/work-orders', 'workOrders', 'w'),
  goTo('quotes', 'page:quotes', '/quotes', 'quotes', 'q'),
  goTo('customers', 'page:customers', '/customers', 'customers', 'c'),
  goTo('vehicles', 'page:vehicles', '/vehicles', 'vehicles', 'k', 'vessels'),
  goTo('inventory', 'page:inventory', '/inventory', 'inventory', 'p'),
  goTo('inspections', 'page:inspections', '/inspections', 'inspections', 'i'),
  goTo('calendar', 'page:calendar', '/calendar', 'calendar', 'l'),
  goTo('workBoard', 'page:work-board', '/work-board', 'workBoard', 'o'),
  goTo('messages', 'page:messages', '/messages', 'messages', 'm'),
  goTo('reminders', 'page:reminders', '/reminders', 'reminders', 'r'),
  // Not in the set: their own letters (B, R, T, S) are browser keys with
  // Alt, or already taken. Search opens them, and each can be given a key.
  goTo('billing', 'page:billing', '/billing', 'billing', null),
  goTo('reports', 'page:reports', '/reports', 'reports', null),
  goTo('timesheets', 'page:timesheets', '/timesheets', 'timesheets', null),
  goTo('settings', 'page:settings', '/settings', 'settings', null),
  goTo('tireHotel', 'page:tire-hotel', '/tire-hotel', 'tireHotel', null),
  goTo('laborPresets', 'page:labor-presets', '/labor-presets', 'laborPresets', null),
  goTo('faultCodes', 'page:fault-codes', '/fault-codes', 'faultCodes', null),
  goTo('ai', 'page:ai', '/ai', 'aiAssistant', null),
  goTo('auditLog', 'page:audit-log', '/audit-log', 'auditLog', null),

  // The calendar's own keys, the ones Google Calendar taught everyone.
  calendarView('day', 'd'),
  calendarView('week', 'w'),
  calendarView('month', 'm'),
  calendarView('year', 'y'),
  calendarView('schedule', 'a'),
  calendarView('fourDays', 'x'),
  {
    id: 'calendar.today',
    group: 'calendar',
    scope: 'calendar',
    defaultKeys: ['t'],
    label: { from: 'shortcuts', key: 'calendar_today' },
  },
  {
    id: 'calendar.next',
    group: 'calendar',
    scope: 'calendar',
    defaultKeys: ['j', 'n'],
    fixedKeys: ['arrowright'],
    label: { from: 'shortcuts', key: 'calendar_next' },
  },
  {
    id: 'calendar.previous',
    group: 'calendar',
    scope: 'calendar',
    defaultKeys: ['k', 'p'],
    fixedKeys: ['arrowleft'],
    label: { from: 'shortcuts', key: 'calendar_previous' },
  },
]

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['general', 'create', 'goTo', 'calendar']

const BY_ID = new Map(SHORTCUTS.map((def) => [def.id, def]))

export function shortcutById(id: string): ShortcutDef | undefined {
  return BY_ID.get(id)
}

/** The palette row that opens the help overlay. */
export const SHORTCUTS_HELP_COMMAND = 'action:keyboard-shortcuts'

const BY_COMMAND = new Map<string, ShortcutDef>([
  ...SHORTCUTS.filter((def) => def.command).map((def) => [def.command as string, def] as const),
  ['action:plate-lookup', BY_ID.get('general.plateLookup') as ShortcutDef],
  [SHORTCUTS_HELP_COMMAND, BY_ID.get('general.help') as ShortcutDef],
])

/** The shortcut that does what a search palette command does, if there is one. */
export function shortcutForCommand(commandId: string): ShortcutDef | undefined {
  return BY_COMMAND.get(commandId)
}

/** The shortcut that opens a page, by the page's address. */
export function goToShortcutForHref(href: string): ShortcutDef | undefined {
  return SHORTCUTS.find((def) => def.group === 'goTo' && def.href === href)
}
