import {
  BarChart3,
  Bell,
  CalendarDays,
  Car,
  ClipboardCheck,
  ClipboardList,
  Columns3,
  Disc3,
  FileText,
  History,
  Layers,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Package,
  Receipt,
  Settings,
  Ship,
  Sparkles,
  Timer,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react'
import type { PlanFeatures } from '@/lib/features'

/**
 * Where the palette can take someone besides a record or a setting: the
 * pages of the app and the things one starts from the header's plus menu.
 *
 * Visibility follows the sidebar: a page the role cannot open is not
 * offered, and a module that is off is not listed. Keywords are English
 * aliases, so "jobs" finds Work Orders in every language.
 */
export type PageCommand = {
  id: string
  href: string
  /** Key under `navigation.sidebar`. */
  titleKey: string
  /** Used instead of `titleKey` for a marine workshop. */
  marineTitleKey?: string
  subject: string
  keywords: string[]
  icon: LucideIcon
  marineIcon?: LucideIcon
  /** Listed only when the module or plan allows it. */
  needs?: 'tireHotel' | 'ai' | 'reports'
}

export const PAGE_COMMANDS: PageCommand[] = [
  {
    id: 'page:dashboard',
    href: '/',
    titleKey: 'dashboard',
    subject: 'dashboard',
    keywords: ['home', 'overview', 'start', 'today'],
    icon: LayoutDashboard,
  },
  {
    id: 'page:customers',
    href: '/customers',
    titleKey: 'customers',
    subject: 'customers',
    keywords: ['clients', 'people', 'contacts', 'owners'],
    icon: Users,
  },
  {
    id: 'page:messages',
    href: '/messages',
    titleKey: 'messages',
    subject: 'customers',
    keywords: ['inbox', 'sms', 'chat', 'conversations', 'email'],
    icon: MessageSquare,
  },
  {
    id: 'page:vehicles',
    href: '/vehicles',
    titleKey: 'vehicles',
    marineTitleKey: 'vessels',
    subject: 'vehicles',
    keywords: ['cars', 'fleet', 'plates', 'vin', 'boats'],
    icon: Car,
    marineIcon: Ship,
  },
  {
    id: 'page:reminders',
    href: '/reminders',
    titleKey: 'reminders',
    subject: 'vehicles',
    keywords: ['due', 'follow up', 'service due', 'mot', 'eu-kontroll'],
    icon: Bell,
  },
  {
    id: 'page:work-orders',
    href: '/work-orders',
    titleKey: 'workOrders',
    subject: 'work_orders',
    keywords: ['jobs', 'service records', 'repair orders', 'ro', 'open jobs'],
    icon: ClipboardList,
  },
  {
    id: 'page:inspections',
    href: '/inspections',
    titleKey: 'inspections',
    subject: 'inspections',
    keywords: ['checklists', 'vehicle check', 'health check', 'mot'],
    icon: ClipboardCheck,
  },
  {
    id: 'page:calendar',
    href: '/calendar',
    titleKey: 'calendar',
    subject: 'work_orders',
    keywords: ['schedule', 'bookings', 'appointments', 'agenda', 'week'],
    icon: CalendarDays,
  },
  {
    id: 'page:work-board',
    href: '/work-board',
    titleKey: 'workBoard',
    subject: 'work_board',
    keywords: ['board', 'kanban', 'bays', 'planning', 'presenter'],
    icon: Columns3,
  },
  {
    id: 'page:tire-hotel',
    href: '/tire-hotel',
    titleKey: 'tireHotel',
    subject: 'tire_hotel',
    keywords: ['tyres', 'tires', 'storage', 'wheels', 'season', 'shelf'],
    icon: Disc3,
    needs: 'tireHotel',
  },
  {
    id: 'page:quotes',
    href: '/quotes',
    titleKey: 'quotes',
    subject: 'quotes',
    keywords: ['estimates', 'offers', 'proposals'],
    icon: FileText,
  },
  {
    id: 'page:billing',
    href: '/billing',
    titleKey: 'billing',
    subject: 'billing',
    keywords: ['invoices', 'payments', 'receipts', 'unpaid', 'overdue', 'recurring'],
    icon: Receipt,
  },
  {
    id: 'page:inventory',
    href: '/inventory',
    titleKey: 'inventory',
    subject: 'inventory',
    keywords: ['parts', 'stock', 'warehouse', 'supplies', 'barcode'],
    icon: Package,
  },
  {
    id: 'page:labor-presets',
    href: '/labor-presets',
    titleKey: 'laborPresets',
    subject: 'labor_presets',
    keywords: ['labor packages', 'labour', 'service packages', 'menu pricing'],
    icon: Layers,
  },
  {
    id: 'page:reports',
    href: '/reports',
    titleKey: 'reports',
    subject: 'reports',
    keywords: ['revenue', 'statistics', 'analytics', 'charts', 'kpi'],
    icon: BarChart3,
    needs: 'reports',
  },
  {
    id: 'page:timesheets',
    href: '/timesheets',
    titleKey: 'timesheets',
    subject: 'time_tracking',
    keywords: ['hours', 'clock', 'time tracking', 'attendance', 'punch'],
    icon: Timer,
  },
  {
    id: 'page:ai',
    href: '/ai',
    titleKey: 'aiAssistant',
    subject: 'ai_assistant',
    keywords: ['assistant', 'chat', 'ask', 'gpt', 'claude'],
    icon: Sparkles,
    needs: 'ai',
  },
  {
    id: 'page:audit-log',
    href: '/audit-log',
    titleKey: 'auditLog',
    subject: 'settings',
    keywords: ['history', 'activity', 'who changed', 'log'],
    icon: History,
  },
  {
    id: 'page:settings',
    href: '/settings',
    titleKey: 'settings',
    subject: 'settings',
    keywords: ['preferences', 'configuration', 'options', 'setup'],
    icon: Settings,
  },
]

export type ActionCommand = {
  id: string
  href: string
  /** Key under `search.actions`. */
  titleKey: string
  subject: string
  keywords: string[]
  icon: LucideIcon
  adminOnly?: boolean
}

export const ACTION_COMMANDS: ActionCommand[] = [
  {
    id: 'action:new-work-order',
    href: '/work-orders?new=1',
    titleKey: 'newWorkOrder',
    subject: 'work_orders',
    keywords: ['create job', 'add job', 'start job', 'new job', 'new service'],
    icon: Wrench,
  },
  {
    id: 'action:new-customer',
    href: '/customers?create=true',
    titleKey: 'newCustomer',
    subject: 'customers',
    keywords: ['add customer', 'create customer', 'new client', 'add person'],
    icon: Users,
  },
  {
    id: 'action:new-vehicle',
    href: '/vehicles?create=true',
    titleKey: 'newVehicle',
    subject: 'vehicles',
    keywords: ['add vehicle', 'add car', 'register car', 'new car', 'new boat'],
    icon: Car,
  },
  {
    id: 'action:new-quote',
    href: '/quotes?create=true',
    titleKey: 'newQuote',
    subject: 'quotes',
    keywords: ['add quote', 'create quote', 'new estimate', 'new offer'],
    icon: FileText,
  },
  {
    id: 'action:new-part',
    href: '/inventory?create=true',
    titleKey: 'newPart',
    subject: 'inventory',
    keywords: ['add part', 'add stock', 'new item', 'add inventory'],
    icon: Package,
  },
  {
    id: 'action:invite-member',
    href: '/settings/team?add=true',
    titleKey: 'inviteMember',
    subject: 'settings',
    keywords: ['add user', 'add member', 'add technician', 'invite', 'new user', 'team'],
    icon: UserPlus,
    adminOnly: true,
  },
]

export type CommandContext = {
  visibleSubjects?: string[]
  features?: PlanFeatures
  tireHotelEnabled?: boolean
  aiEnabled?: boolean
  isAdminOrOwner?: boolean
}

export function canAccessSubject(ctx: CommandContext, subject: string): boolean {
  return !ctx.visibleSubjects || ctx.visibleSubjects.includes(subject)
}

export function visiblePageCommands(ctx: CommandContext): PageCommand[] {
  return PAGE_COMMANDS.filter((page) => {
    if (!canAccessSubject(ctx, page.subject)) return false
    if (page.needs === 'tireHotel') return !!ctx.tireHotelEnabled
    if (page.needs === 'ai') return !!ctx.aiEnabled
    if (page.needs === 'reports') return ctx.features?.reports !== false
    return true
  })
}

export function visibleActionCommands(ctx: CommandContext): ActionCommand[] {
  return ACTION_COMMANDS.filter((action) => {
    if (action.adminOnly && !ctx.isAdminOrOwner) return false
    return canAccessSubject(ctx, action.subject)
  })
}
