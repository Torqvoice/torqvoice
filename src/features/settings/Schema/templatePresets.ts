import {
  type InvoiceLayoutConfig,
  getDefaultInvoiceLayout,
} from '@/features/settings/Schema/invoiceLayoutSchema'

export interface TemplatePreset {
  id: string
  name: string
  description: string
  primaryColor: string
  fontFamily: string
  headerStyle: string
  /**
   * Sections the preset arranges for you. Presets without one only set colors
   * and fonts, and leave whatever layout the workshop has already built alone.
   */
  layoutConfig?: InvoiceLayoutConfig
}

/**
 * The arrangement the framed sheet expects: letterhead, then the customer
 * opposite the vehicle, then the title with its reference box, then every line
 * on one numbered list.
 */
function framedLayout(): InvoiceLayoutConfig {
  return {
    sections: getDefaultInvoiceLayout().sections.map((section) => {
      switch (section.id) {
        case 'document_title':
        case 'items_table':
          return { ...section, visible: true }
        case 'parts_table':
        case 'labor_table':
          return { ...section, visible: false }
        case 'vehicle':
        case 'service':
          return { ...section, column: 'right' as const }
        default:
          return section
      }
    }),
  }
}

export const templatePresets: TemplatePreset[] = [
  {
    id: 'standard',
    name: 'Standard',
    description: 'Classic amber theme with a traditional header layout',
    primaryColor: '#d97706',
    fontFamily: 'Helvetica',
    headerStyle: 'standard',
  },
  {
    id: 'professional',
    name: 'Professional',
    description: 'Sleek slate tones with a compact header',
    primaryColor: '#475569',
    fontFamily: 'Helvetica',
    headerStyle: 'compact',
  },
  {
    id: 'modern',
    name: 'Modern',
    description: 'Bold blue with a full-width colored banner',
    primaryColor: '#2563eb',
    fontFamily: 'Helvetica',
    headerStyle: 'modern',
  },
  {
    id: 'classic',
    name: 'Classic',
    description: 'Timeless serif font with dark red accents',
    primaryColor: '#991b1b',
    fontFamily: 'Times-Roman',
    headerStyle: 'standard',
  },
  {
    id: 'clean',
    name: 'Clean',
    description: 'Fresh emerald green with a modern banner',
    primaryColor: '#059669',
    fontFamily: 'Helvetica',
    headerStyle: 'modern',
  },
  {
    id: 'framed',
    name: 'Framed',
    description: 'Banded letterhead with a left rail and one numbered item list',
    primaryColor: '#ee7623',
    fontFamily: 'Helvetica',
    headerStyle: 'framed',
    layoutConfig: framedLayout(),
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Vibrant purple with a compact layout',
    primaryColor: '#7c3aed',
    fontFamily: 'Helvetica',
    headerStyle: 'compact',
  },
]
