import 'server-only'
import { db } from '@/lib/db'

/**
 * What a workshop can put in the blanks of an approved template.
 *
 * A template is fixed text with numbered placeholders, approved once and then
 * unchangeable, so the interesting question is which of our data fills which
 * blank. The workshop lists the values in the order its own template expects
 * them, because only they know what they had approved.
 *
 * An approved template reading
 *
 *   Hallo {{1}}, Ihr {{2}} ist fertig. {{3}}
 *
 * is filled by the list `customer, vehicle, message`.
 */

export const TEMPLATE_TOKENS = ['customer', 'vehicle', 'plate', 'message', 'workshop'] as const

export type TemplateToken = (typeof TEMPLATE_TOKENS)[number]

export function parseTemplateTokens(value: string | undefined | null): TemplateToken[] {
  if (!value?.trim()) return []
  return value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token): token is TemplateToken =>
      (TEMPLATE_TOKENS as readonly string[]).includes(token)
    )
}

/** Names any entry that is not one of ours, for the settings form to refuse. */
export function unknownTemplateTokens(value: string | undefined | null): string[] {
  if (!value?.trim()) return []
  return value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .filter((token) => !(TEMPLATE_TOKENS as readonly string[]).includes(token))
}

export interface TemplateContext {
  organizationId: string
  customerId?: string
  /** What the mechanic typed, for the token that carries it. */
  body?: string
  relatedEntityType?: string
  relatedEntityId?: string
}

/**
 * Fills the listed tokens, in order.
 *
 * Only what the tokens ask for is looked up, and a blank is never left empty:
 * WhatsApp rejects a template parameter that is an empty string, so a missing
 * value becomes a dash rather than a failed send.
 */
export async function resolveTemplateVariables(
  tokens: TemplateToken[],
  context: TemplateContext
): Promise<string[]> {
  if (tokens.length === 0) return []

  const needs = new Set(tokens)
  const values: Partial<Record<TemplateToken, string>> = {}

  if (needs.has('message') && context.body) values.message = context.body

  if ((needs.has('customer') || needs.has('vehicle') || needs.has('plate')) && context.customerId) {
    const customer = await db.customer.findFirst({
      where: { id: context.customerId, organizationId: context.organizationId },
      select: { name: true },
    })
    if (customer) values.customer = customer.name
  }

  // The vehicle is only knowable when the message came from a job, which is
  // where a workshop sends from anyway.
  if (
    (needs.has('vehicle') || needs.has('plate')) &&
    context.relatedEntityType === 'ServiceRecord' &&
    context.relatedEntityId
  ) {
    const record = await db.serviceRecord.findFirst({
      where: { id: context.relatedEntityId, organizationId: context.organizationId },
      select: { vehicle: { select: { make: true, model: true, year: true, licensePlate: true } } },
    })
    const vehicle = record?.vehicle
    if (vehicle) {
      values.vehicle = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
      if (vehicle.licensePlate) values.plate = vehicle.licensePlate
    }
  }

  if (needs.has('workshop')) {
    const organization = await db.organization.findUnique({
      where: { id: context.organizationId },
      select: { name: true },
    })
    if (organization) values.workshop = organization.name
  }

  return tokens.map((token) => values[token]?.trim() || '-')
}
