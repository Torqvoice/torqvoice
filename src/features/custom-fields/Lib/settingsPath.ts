/**
 * Where a workshop finds its custom fields, meters and equipment: the Custom
 * Fields tab of Settings, Invoice & Quotes. One place for every link to it.
 */
export const CUSTOM_FIELDS_SETTINGS_PATH = '/settings/invoice?tab=customFields'

/** The same page, scrolled to one of its sections. */
export function customFieldsSettingsHref(anchor: string): string {
  return `${CUSTOM_FIELDS_SETTINGS_PATH}#${anchor}`
}
