import 'server-only'
import { db } from '@/lib/db'

/**
 * Finding parts by tag on the server.
 *
 * Tags are a text array, and Prisma can only test an array for an exact,
 * case-sensitive element. A search needs "contains, any case", so the ids are
 * found in SQL here and the caller filters on them, the same way the low-stock
 * filter does.
 */

/** A LIKE pattern for text containing `term`, where `%` and `_` mean themselves. */
function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

/** This workshop's parts with a tag containing `term`, in any case. */
export async function partIdsWithTagContaining(
  organizationId: string,
  term: string
): Promise<string[]> {
  if (!term.trim()) return []
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "public"."inventory_parts"
    WHERE "organizationId" = ${organizationId}
      AND "isArchived" = false
      AND EXISTS (
        SELECT 1 FROM unnest("tags") AS t(tag) WHERE t.tag ILIKE ${containsPattern(term.trim())}
      )
  `
  return rows.map((row) => row.id)
}

/** This workshop's parts carrying `tag`, in any case. */
export async function partIdsWithTag(organizationId: string, tag: string): Promise<string[]> {
  if (!tag.trim()) return []
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "public"."inventory_parts"
    WHERE "organizationId" = ${organizationId}
      AND "isArchived" = false
      AND EXISTS (
        SELECT 1 FROM unnest("tags") AS t(tag) WHERE lower(t.tag) = lower(${tag.trim()})
      )
  `
  return rows.map((row) => row.id)
}
