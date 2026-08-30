import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'

export type DocumentType = 'invoice' | 'quote'

/** The template settings the designer edits, as strings the way settings store them. */
export interface DesignerTemplate {
  primaryColor: string
  backgroundColor: string
  textColor: string
  companyTextColor: string
  frameBorderColor: string
  frameShadow: string
  /** Which edge the rail runs down. */
  frameSide: string
  /** Rounding, in points, where the rail meets the header band. */
  frameRadius: number
  fontFamily: string
  headerStyle: string
  logoSize: number
}

/**
 * A design a workshop saved under a name: the whole arrangement and look at
 * that moment, so trying another template never costs them their own work.
 */
export interface SavedDesign {
  id: string
  name: string
  savedAt: string
  layout: InvoiceLayoutConfig
  template: DesignerTemplate
}

export interface DesignerWorkshop {
  name: string
  address: string
  phone: string
  email: string
  slogan: string
  orgNumber: string
  logoUrl: string
}

export interface DesignerState {
  layout: InvoiceLayoutConfig
  template: DesignerTemplate
}

/**
 * What the canvas draws with, resolved once from the template and the layout so
 * the canvas and the inspector never disagree about a default.
 */
export interface ResolvedTheme {
  primary: string
  background: string
  text: string
  muted: string
  accent: string
  companyText: string
  fontFamily: string
  baseSize: number
  margin: number
  rowPadding: number
  stripes: boolean
  stripeColor: string
}

/** The CSS stack for a stored font name, mirroring what the PDF embeds. */
export const FONT_STACKS: Record<string, string> = {
  Helvetica: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
  'Times-Roman': "'Noto Serif', Georgia, 'Times New Roman', serif",
  Courier: "'Noto Sans Mono', 'Courier New', monospace",
  'Open Sans': "'Open Sans', 'Helvetica Neue', Arial, sans-serif",
  Lato: "'Lato', 'Helvetica Neue', Arial, sans-serif",
  Montserrat: "'Montserrat', 'Helvetica Neue', Arial, sans-serif",
  'PT Sans': "'PT Sans', 'Helvetica Neue', Arial, sans-serif",
}

export function fontStack(name?: string): string {
  return FONT_STACKS[name || 'Helvetica'] || FONT_STACKS.Helvetica
}

/**
 * What the typeface pickers offer, in one place so the section and document
 * selects cannot drift apart. Values are the names settings store; the first
 * three are the legacy names kept so nothing has to migrate.
 */
export const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'Helvetica', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'PT Sans', label: 'PT Sans' },
  { value: 'Times-Roman', label: 'Noto Serif' },
  { value: 'Courier', label: 'Noto Sans Mono' },
]
