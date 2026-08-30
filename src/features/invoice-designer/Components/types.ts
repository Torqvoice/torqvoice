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
  fontFamily: string
  headerStyle: string
  logoSize: number
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
}

export function fontStack(name?: string): string {
  return FONT_STACKS[name || 'Helvetica'] || FONT_STACKS.Helvetica
}
