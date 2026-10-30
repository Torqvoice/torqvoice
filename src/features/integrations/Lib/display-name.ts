/**
 * What to call a connector on screen. A vendor's product keeps its own name
 * everywhere (Fiken, QuickBooks Online, Zoom). A connector named after what
 * it does rather than who sells it, such as the cloud storage bucket or the
 * local folder, has a translated name under connectors.<id>.name in the
 * integrations messages, and that is what the reader sees.
 */

/** The translator for the integrations namespace, from next-intl's hook or server helper. */
export interface NameTranslator {
  (key: string): string
  has(key: string): boolean
}

export function connectorName(t: NameTranslator, manifest: { id: string; name: string }): string {
  const key = `connectors.${manifest.id}.name`
  return t.has(key) ? t(key) : manifest.name
}
