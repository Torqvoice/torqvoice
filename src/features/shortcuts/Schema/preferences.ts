import { z } from 'zod'

/**
 * The shape the settings page sends. Which shortcuts exist and which keys
 * may be used is decided by `normalizeShortcutPrefs`, against the registry.
 */
export const shortcutPrefsSchema = z.object({
  enabled: z.boolean(),
  singleKeys: z.boolean(),
  goToSequences: z.boolean().optional(),
  overrides: z.record(z.string().max(60), z.string().max(40)),
  disabled: z.array(z.string().max(60)).max(200),
})

export type ShortcutPrefsInput = z.infer<typeof shortcutPrefsSchema>
