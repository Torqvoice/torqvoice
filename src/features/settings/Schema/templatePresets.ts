export interface TemplatePreset {
  id: string
  name: string
  description: string
  primaryColor: string
  fontFamily: string
  headerStyle: string
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
    id: 'bold',
    name: 'Bold',
    description: 'Vibrant purple with a compact layout',
    primaryColor: '#7c3aed',
    fontFamily: 'Helvetica',
    headerStyle: 'compact',
  },
]
