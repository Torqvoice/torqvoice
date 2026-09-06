import { db } from '@/lib/db'
import { type DesignRuleSubject, isDesignAutoRule, pickDesignByRule } from './designRules'

/** What the rules read off an invoice, from the row the print already loads. */
export function designRuleSubjectOf(record: { vehicleId: string | null }): DesignRuleSubject {
  return { hasVehicle: record.vehicleId !== null }
}

/**
 * The design that volunteers for this invoice, or null. Only invoice
 * designs carry rules, and only the few rows that have one are read.
 */
export async function findRuleDesign(organizationId: string, subject: DesignRuleSubject) {
  const candidates = await db.documentDesign.findMany({
    where: { organizationId, documentType: 'invoice', autoRule: { not: null } },
    select: { id: true, name: true, autoRule: true, layout: true, template: true },
  })
  const picked = pickDesignByRule(candidates, subject)
  if (!picked || !isDesignAutoRule(picked.autoRule)) return null
  return { ...picked, autoRule: picked.autoRule }
}
