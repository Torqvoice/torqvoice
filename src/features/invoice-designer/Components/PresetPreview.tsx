'use client'

import { useMemo } from 'react'
import { useMessages, useTranslations } from 'next-intl'
import type { LayoutPreset } from '@/features/settings/Schema/layoutPresets'
import { SpecThumbnail } from '../Render/SpecThumbnail'
import { buildSampleData, type PrintLabels } from './sample'
import { specForDesign, specForPreset } from './presetSpec'
import type { DocumentType, SavedDesign } from './types'

/**
 * The template and design cards' pictures: the sheet each one actually
 * produces, drawn from the same spec the designer's gallery renders. Made for
 * the settings page, where the cards used to be identical mock-ups.
 */

interface PreviewWorkshop {
  name?: string
  address?: string
  phone?: string
  email?: string
  slogan?: string
}

/** The sample document on this workshop's own details, for a card's picture. */
function useSampleData(docType: DocumentType, workshop?: PreviewWorkshop, logoUrl?: string) {
  const t = useTranslations('settings.designer')
  const messages = useMessages() as { pdf?: Record<string, Record<string, string>> }

  return useMemo(() => {
    const pdf = messages.pdf ?? {}
    // The same label resolution the print path applies: quote wording over the
    // invoice's where the two differ.
    const labels: PrintLabels = {
      ...(pdf.invoice ?? {}),
      ...(docType === 'quote' ? (pdf.quote ?? {}) : {}),
      ...(pdf.common ?? {}),
    }
    return buildSampleData(
      {
        name: workshop?.name ?? '',
        address: workshop?.address ?? '',
        phone: workshop?.phone ?? '',
        email: workshop?.email ?? '',
        slogan: workshop?.slogan ?? '',
        orgNumber: '',
        logoUrl: logoUrl ?? '',
      },
      [],
      t,
      labels,
      docType
    )
  }, [docType, workshop, logoUrl, t, messages])
}

export function PresetPreview({
  preset,
  docType,
  workshop,
  logoUrl,
  height = 170,
}: {
  preset: LayoutPreset
  docType: DocumentType
  workshop?: PreviewWorkshop
  logoUrl?: string
  height?: number
}) {
  const data = useSampleData(docType, workshop, logoUrl)
  const spec = useMemo(() => specForPreset(preset, data), [preset, data])
  return <SpecThumbnail spec={spec} height={height} />
}

export function DesignPreview({
  design,
  docType,
  workshop,
  logoUrl,
  height = 170,
}: {
  design: SavedDesign
  docType: DocumentType
  workshop?: PreviewWorkshop
  logoUrl?: string
  height?: number
}) {
  const data = useSampleData(docType, workshop, logoUrl)
  const spec = useMemo(() => specForDesign(design, data), [design, data])
  return <SpecThumbnail spec={spec} height={height} />
}
