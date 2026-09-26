import type { ConditionMapLabels } from './print'

/**
 * The words of the condition map, from a locale's `conditionMap.json`: the
 * views, the panels, the kinds of mark and the severities. Shared by the
 * screen (through next-intl) and the print (through this loader), so a
 * legend says "left front door" in the same words the technician tapped.
 */
export type ConditionMapMessages = {
  views: Record<string, string>
  panels: Record<string, string>
  kinds: Record<string, string>
  severities: Record<string, string>
  bodies: Record<string, string>
  print: Record<string, string>
}

export async function loadConditionMapMessages(locale: string): Promise<ConditionMapMessages> {
  try {
    return (await import(`../../../../messages/${locale}/conditionMap.json`)).default
  } catch {
    return (await import(`../../../../messages/en/conditionMap.json`)).default
  }
}

export function conditionMapLabelsFrom(messages: ConditionMapMessages): ConditionMapLabels {
  return {
    views: messages.views,
    panels: messages.panels,
    kinds: messages.kinds,
    severities: messages.severities,
    previous: messages.print.previous ?? 'recorded earlier',
  }
}

export async function loadConditionMapLabels(locale: string): Promise<ConditionMapLabels> {
  return conditionMapLabelsFrom(await loadConditionMapMessages(locale))
}
