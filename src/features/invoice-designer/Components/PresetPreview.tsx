'use client'

import { useMemo } from 'react'
import { useMessages, useTranslations } from 'next-intl'
import type { LayoutPreset } from '@/features/settings/Schema/layoutPresets'
import { SpecThumbnail } from '../Render/SpecThumbnail'
import { buildSampleData, type PrintLabels } from './sample'
import { specForPreset } from './presetSpec'
import type { DocumentType } from './types'

/**
 * A template card's picture: the sheet the template actually produces, drawn
 * from the same spec the designer's gallery renders. Made for the settings
 * page, where the cards used to be four identical mock-ups.
 */
export function PresetPreview({
  preset,
  docType,
  workshop,
  logoUrl,
  height = 170,
}: {
  preset: LayoutPreset
  docType: DocumentType
  workshop?: { name?: string; address?: string; phone?: string; email?: string; slogan?: string }
  logoUrl?: string
  height?: number
}) {
  const t = useTranslations('settings.designer')
  const messages = useMessages() as { pdf?: Record<string, Record<string, string>> }

  const spec = useMemo(() => {
    const pdf = messages.pdf ?? {}
    // The same label resolution the print path applies: quote wording over the
    // invoice's where the two differ.
    const labels: PrintLabels = {
      ...(pdf.invoice ?? {}),
      ...(docType === 'quote' ? (pdf.quote ?? {}) : {}),
      ...(pdf.common ?? {}),
    }
    const data = buildSampleData(
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
    return specForPreset(preset, data)
  }, [preset, docType, workshop, logoUrl, t, messages])

  return <SpecThumbnail spec={spec} height={height} />
}
