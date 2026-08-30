import { db } from '@/lib/db'
import { getPreset, presetToTemplateCreate } from '@/features/inspections/Lib/templatePresets'

/** Minimal shape of a next-intl translator; keeps this lib decoupled from
 *  next-intl's generics. */
export type Translator = (key: string, values?: Record<string, string | number | Date>) => string

/**
 * The inspection template a brand-new workshop starts with.
 *
 * Locales that map onto a country with its own statutory checklist get that
 * checklist installed alongside; the general multi-point check is always the
 * default, matching the library's own convention that a new shop should land
 * on the general checklist rather than a national test it may not be
 * approved to run.
 */
export function pickCountryPresetId(locale: string): string | null {
  switch (locale) {
    case 'de':
      return 'de-hauptuntersuchung'
    case 'nl':
      return 'nl-apk'
    case 'nb':
      return 'no-eu-kontroll'
    default:
      return null
  }
}

export const DEFAULT_TEMPLATE_PRESET_ID = 'standard-multipoint'

/**
 * Installs the default inspection template(s) for a fresh organization and
 * returns the default one including sections and items, so the sample seed
 * can build an inspection from it. Records preset provenance, so the
 * template library recognises these as already installed.
 */
export async function installDefaultInspectionTemplates(organizationId: string, locale: string) {
  const generic = getPreset(DEFAULT_TEMPLATE_PRESET_ID)
  if (!generic) throw new Error('Default template preset not found')

  const template = await db.inspectionTemplate.create({
    data: presetToTemplateCreate(generic, organizationId, true),
    include: {
      sections: {
        include: { items: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  const countryPresetId = pickCountryPresetId(locale)
  const countryPreset = countryPresetId ? getPreset(countryPresetId) : null
  if (countryPreset) {
    await db.inspectionTemplate.create({
      data: presetToTemplateCreate(countryPreset, organizationId, false),
    })
  }

  return template
}

/** Common jobs every workshop quotes daily. Hours only; rates stay at zero so
 *  the workshop's own hourly rate applies when the preset is used. */
const DEFAULT_LABOR_PRESETS: { key: string; hours: number }[] = [
  { key: 'oilChange', hours: 0.8 },
  { key: 'frontBrakePads', hours: 1.5 },
  { key: 'tireSwap', hours: 0.7 },
  { key: 'batteryReplacement', hours: 0.5 },
  { key: 'diagnostics', hours: 1 },
  { key: 'annualService', hours: 2.5 },
]

export async function installDefaultLaborPresets(
  organizationId: string,
  userId: string,
  t: Translator
) {
  await db.$transaction(
    DEFAULT_LABOR_PRESETS.map(({ key, hours }) =>
      db.laborPreset.create({
        data: {
          name: t(`presets.${key}.name`),
          description: t(`presets.${key}.description`),
          userId,
          organizationId,
          items: {
            create: [
              {
                description: t(`presets.${key}.name`),
                hours,
                rate: 0,
                pricingType: 'hourly',
                sortOrder: 0,
              },
            ],
          },
        },
      })
    )
  )
}
