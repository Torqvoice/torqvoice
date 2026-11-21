'use client'

import { useMeterTypes } from '@/components/meter-types-context'
import { useEquipmentTypes } from '@/components/equipment-types-context'
import { certificateLabels } from '@/features/inspections/Lib/certificateLabels'
import { invoiceLabels } from '../Lib/invoiceLabels'
import { workOrderLabels } from '../Lib/workOrderLabels'

import { useMemo } from 'react'
import { useMessages, useTranslations } from 'next-intl'
import { useTypeKeyEnabled } from '@/components/type-key-context'
import { useCustomerReferenceEnabled } from '@/components/customer-reference-context'
import { useFleetNumberEnabled } from '@/components/fleet-number-context'
import type { LayoutPreset } from '@/features/settings/Schema/layoutPresets'
import type { TaxComponentDefinition } from '@/lib/tax'
import { SpecThumbnail } from '../Render/SpecThumbnail'
import { buildSampleData, type PrintLabels } from './sample'
import { useSampleFormat } from './useSampleFormat'
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
  /** The workshop's split tax, so a card shows its GST and QST lines. */
  taxComponents?: TaxComponentDefinition[] | null
  /** How the workshop writes distance, for the sample car's mileage. */
  unitSystem?: 'metric' | 'imperial'
}

/** The sample document on this workshop's own details, for a card's picture. */
function useSampleData(docType: DocumentType, workshop?: PreviewWorkshop, logoUrl?: string) {
  const t = useTranslations('settings.designer')
  const typeKeyEnabled = useTypeKeyEnabled()
  const customerReferenceEnabled = useCustomerReferenceEnabled()
  const fleetNumberEnabled = useFleetNumberEnabled()
  const meterTypes = useMeterTypes()
  const equipmentTypes = useEquipmentTypes()
  const messages = useMessages() as { pdf?: Record<string, Record<string, string>> }
  const sampleFormat = useSampleFormat()

  return useMemo(() => {
    const pdf = messages.pdf ?? {}
    // The same label resolution the print path applies: quote wording over the
    // invoice's where the two differ.
    const labels: PrintLabels =
      docType === 'certificate'
        ? certificateLabels(pdf)
        : docType === 'work_order'
          ? workOrderLabels(pdf)
          : invoiceLabels(pdf, docType)
    return buildSampleData(
      {
        name: workshop?.name ?? '',
        address: workshop?.address ?? '',
        phone: workshop?.phone ?? '',
        email: workshop?.email ?? '',
        slogan: workshop?.slogan ?? '',
        orgNumber: '',
        paymentTerms: '',
        typeKeyEnabled,
        customerReferenceEnabled,
        fleetNumberEnabled,
        meterTypes,
        equipmentTypes,
        logoUrl: logoUrl ?? '',
        taxComponents: workshop?.taxComponents ?? null,
        unitSystem: workshop?.unitSystem,
      },
      [],
      t,
      labels,
      docType,
      sampleFormat
    )
  }, [
    docType,
    workshop,
    logoUrl,
    t,
    messages,
    typeKeyEnabled,
    customerReferenceEnabled,
    fleetNumberEnabled,
    meterTypes,
    equipmentTypes,
    sampleFormat,
  ])
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
