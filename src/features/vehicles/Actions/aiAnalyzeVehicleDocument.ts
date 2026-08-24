'use server'

import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { db } from '@/lib/db'
import { AI_KEYS } from '@/features/ai/Schema/aiSettingsSchema'
import { visionCompletion } from '@/lib/ai'
import { getLocale } from 'next-intl/server'
import { localeNames, type Locale } from '@/i18n/config'

/**
 * What a registration document can give us. Everything is optional: papers
 * differ by country, and a phone photo of a folded one rarely yields every
 * field.
 */
export interface VehicleDocumentScan {
  make?: string
  model?: string
  /** Year of first registration, the closest thing the papers state to a model year. */
  year?: number
  vin?: string
  licensePlate?: string
  color?: string
  /** One of the form's fuel options, already normalised. */
  fuelType?: string
  engineSize?: string
  /** Registered keeper, for attaching the vehicle to a customer. */
  owner?: {
    name?: string
    address?: string
  }
}

/**
 * Whether this organization can scan at all. The vision call needs an AI
 * provider and key configured, and every caller of the form would otherwise
 * have to thread that down from its own server page.
 */
export async function isVehicleScanAvailable() {
  return withAuth(
    async ({ organizationId }) => {
      const settings = await db.appSetting.findMany({
        where: {
          organizationId,
          key: { in: [AI_KEYS.AI_ENABLED, AI_KEYS.AI_API_KEY, AI_KEYS.AI_MODEL] },
        },
      })
      const map = new Map(settings.map((s) => [s.key, s.value]))
      return (
        map.get(AI_KEYS.AI_ENABLED) === 'true' &&
        Boolean(map.get(AI_KEYS.AI_API_KEY)) &&
        Boolean(map.get(AI_KEYS.AI_MODEL))
      )
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.VEHICLES }],
    }
  )
}

const FUEL_TYPES = ['gasoline', 'diesel', 'electric', 'hybrid', 'two-stroke', 'other']

export async function aiAnalyzeVehicleDocument(imageDataUris: string | string[]) {
  return withAuth(
    async ({ organizationId }) => {
      const locale = (await getLocale()) as Locale
      const langName = localeNames[locale] || 'English'

      const uris = Array.isArray(imageDataUris) ? imageDataUris : [imageDataUris]
      const imageCount = uris.length

      const systemPrompt = `You are an expert at reading vehicle registration documents from any country: the EU registration certificate (Zulassungsbescheinigung Teil I, carte grise, libretto di circolazione, kentekenbewijs, vognkort), a US title or registration card, a UK V5C, and similar papers.

${imageCount > 1 ? `The ${imageCount} images show the same document, or its front and back. Combine information from all of them.` : ''}

EU certificates label their fields with harmonised codes. Read them as:
- A = registration number (license plate)
- B = date of first registration
- D.1 = make, D.2 = type/variant/version, D.3 = commercial description (model)
- E = vehicle identification number (VIN)
- P.1 = engine displacement, P.3 = fuel type
- R = colour
- C.1.1 = surname or business name of the keeper, C.1.2 = first name, C.1.3 = address

On documents without these codes, read the equivalent labelled fields.

Return ONLY valid JSON, no markdown fence, no commentary. Omit any field you cannot read with confidence, and never guess a VIN or plate from a partially legible one:
{
  "make": "manufacturer, e.g. Volkswagen",
  "model": "model name only, with the manufacturer name removed if it repeats, e.g. Golf",
  "year": 1999,
  "vin": "chassis number exactly as printed, uppercase",
  "licensePlate": "registration number exactly as printed",
  "color": "colour${locale !== 'en' ? ` (translated into ${langName})` : ''}",
  "fuelType": "one of: ${FUEL_TYPES.join(', ')}",
  "engineSize": "displacement with its unit as printed, e.g. 1338 cc",
  "owner": { "name": "given name followed by surname, or the business name", "address": "street, postal code and city on one line" }
}

"year" is the year from the date of first registration (field B), as a number.
"fuelType" must be one of the listed values, translated from whatever the document says (Benzin/Essence/Bensin means gasoline, two-stroke only for outboard marine engines). Use "other" for anything that does not fit.
Leave "make", "model", "vin", "licensePlate" and the owner details in their original form. Do not translate them.`

      const userText =
        imageCount > 1
          ? `Read these ${imageCount} images of a vehicle registration document and extract the vehicle and keeper details.`
          : 'Read this vehicle registration document and extract the vehicle and keeper details.'

      const raw = await visionCompletion(organizationId, systemPrompt, userText, uris)

      const cleaned = raw.replace(/^```json?\n?|\n?```$/g, '').trim()

      // A model that answers in prose ("I cannot read this image") would
      // otherwise surface as a parser error the workshop cannot act on.
      let parsed: VehicleDocumentScan
      try {
        parsed = JSON.parse(cleaned) as VehicleDocumentScan
      } catch {
        console.error('[aiAnalyzeVehicleDocument] unparseable response:', cleaned.slice(0, 500))
        throw new Error('Could not read the document. Try a sharper, straight-on photo.')
      }

      // The model returns free-form JSON, so sanity check anything the form
      // would otherwise take at face value.
      const year =
        typeof parsed.year === 'number' &&
        parsed.year >= 1885 &&
        parsed.year <= new Date().getFullYear() + 1
          ? parsed.year
          : undefined

      const fuelType =
        typeof parsed.fuelType === 'string' && FUEL_TYPES.includes(parsed.fuelType)
          ? parsed.fuelType
          : undefined

      const owner =
        parsed.owner?.name || parsed.owner?.address
          ? { name: parsed.owner?.name, address: parsed.owner?.address }
          : undefined

      const result: VehicleDocumentScan = {
        make: parsed.make,
        model: parsed.model,
        year,
        vin: parsed.vin?.toUpperCase().replace(/\s+/g, ''),
        licensePlate: parsed.licensePlate,
        color: parsed.color,
        fuelType,
        engineSize: parsed.engineSize,
        owner,
      }
      return result
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.VEHICLES },
      ],
    }
  )
}
