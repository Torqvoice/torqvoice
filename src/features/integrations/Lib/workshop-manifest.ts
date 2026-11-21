import type { ConnectorManifest, WorkshopFeature } from './types'
import { isCustomerReferenceEnabled } from '@/features/customer-reference/Lib/referenceSetting'

/**
 * A connector's settings as one workshop is offered them.
 *
 * A setting or a choice can belong to a feature the workshop has to have
 * switched on (`requires` in the manifest). Without it the setting is not
 * part of that workshop's manifest at all: its page does not draw it and a
 * save does not take it, so a workshop that never asked for the feature sees
 * its integration settings exactly as they were before the feature existed.
 * Decided on the server, where the switch and the plan are known.
 */
export function trimManifest(
  manifest: ConnectorManifest,
  has: ReadonlySet<WorkshopFeature>
): ConnectorManifest {
  const offered = (requires?: WorkshopFeature) => !requires || has.has(requires)
  if (!usesWorkshopFeatures(manifest)) return manifest
  return {
    ...manifest,
    settings: manifest.settings
      .filter((field) => offered(field.requires))
      .map((field) =>
        field.options?.some((option) => option.requires)
          ? { ...field, options: field.options.filter((option) => offered(option.requires)) }
          : field
      ),
  }
}

function usesWorkshopFeatures(manifest: ConnectorManifest): boolean {
  return manifest.settings.some(
    (field) => field.requires || field.options?.some((option) => option.requires)
  )
}

/** The features this workshop has, of the ones a manifest can ask for. */
export async function workshopFeatures(organizationId: string): Promise<Set<WorkshopFeature>> {
  const has = new Set<WorkshopFeature>()
  if (await isCustomerReferenceEnabled(organizationId)) has.add('customerReference')
  return has
}

/** `trimManifest` for one workshop; a manifest that asks for nothing costs no query. */
export async function manifestForWorkshop(
  manifest: ConnectorManifest,
  organizationId: string
): Promise<ConnectorManifest> {
  if (!usesWorkshopFeatures(manifest)) return manifest
  return trimManifest(manifest, await workshopFeatures(organizationId))
}

/**
 * The saved settings without what this workshop is not offered: a setting
 * that is gone from its manifest, and a choice that is gone from a setting's
 * list. What is stored stays as it is; it is simply not written to.
 */
export function withoutGatedChoices(
  full: ConnectorManifest,
  offered: ConnectorManifest,
  settings: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(settings)) {
    const field = offered.settings.find((candidate) => candidate.key === key)
    if (!field) continue
    const gated = full.settings
      .find((candidate) => candidate.key === key)
      ?.options?.some((option) => option.requires && option.value === value)
    if (gated && !field.options?.some((option) => option.value === value)) continue
    out[key] = value
  }
  return out
}
