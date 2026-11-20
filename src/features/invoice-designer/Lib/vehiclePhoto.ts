import {
  layoutDocumentType,
  mergeWithDefaults,
  photoStyleOf,
  type InvoiceLayoutConfig,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import {
  lookOf,
  mixColors,
  PANEL_FILL,
  sectionFields,
  VEHICLE_PHOTO_FIELD,
} from '../Spec/buildSpec'
import type { DocumentTheme } from '../Spec/buildSpec'
import { photoToneFor, type PhotoTone } from './photoContrast'

/**
 * Which photo a design prints in its Vehicle block, if any.
 *
 * The photo is read, resized and sent only when this says so: a design
 * without the option, a hidden Vehicle block or a certificate costs nothing
 * and carries nothing, which keeps the photo off every page a design does
 * not print it on.
 */
export function vehiclePhotoStyleOf(
  layout: Partial<InvoiceLayoutConfig> | null | undefined
): 'beside' | 'faded' | null {
  if (!layout) return null
  const merged = mergeWithDefaults(layout)
  if (layoutDocumentType(merged) === 'certificate') return null
  const vehicle = merged.sections.find((s) => s.id === 'vehicle')
  if (!vehicle?.visible) return null
  if (!sectionFields(vehicle).includes(VEHICLE_PHOTO_FIELD)) return null
  return photoStyleOf(vehicle)
}

/** The few template colours the Vehicle block's inks derive from. */
export interface PhotoTemplate {
  primaryColor?: string
  textColor?: string
  backgroundColor?: string
}

/**
 * How far the faded photo has to be washed out for this design's Vehicle
 * block: its body, label and muted inks against the block's own fill, worked
 * out the way the print builders resolve them (the same theme defaults and
 * `lookOf`), so the photo is faded for the colours it will actually sit under.
 */
export function vehicleBlockTone(
  layout: Partial<InvoiceLayoutConfig>,
  template: PhotoTemplate | null | undefined
): PhotoTone {
  const merged = mergeWithDefaults(layout)
  const vehicle = merged.sections.find((s) => s.id === 'vehicle')
  const text = template?.textColor || '#111827'
  const background = template?.backgroundColor || '#ffffff'
  const primary = template?.primaryColor || '#d97706'
  const theme = {
    text,
    background,
    muted: template?.textColor ? mixColors(text, background, 0.42) : '#6b7280',
    accent: merged.document?.accentColor || primary,
    fontFamily: merged.document?.fontFamily || 'Helvetica',
  } as DocumentTheme
  if (!vehicle) return photoToneFor([theme.text, theme.muted, theme.accent], background)
  const look = lookOf(vehicle, theme)
  const fill = look.fill || (vehicle.boxed !== false ? PANEL_FILL : background)
  return photoToneFor(
    [look.text, look.muted, ...(vehicle.heading === false ? [] : [look.label])],
    fill
  )
}
