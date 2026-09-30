'use server'

import { revalidatePath } from 'next/cache'
import { getLocale } from 'next-intl/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { markTypeCatalogue } from '../Lib/loadMarks.server'
import { isBuiltinMarkKey, MARK_SHAPES, type MarkType, ownMarkKey } from '../Lib/markTypes'

/**
 * The workshop's kinds of mark: the built-in eight as the workshop left
 * them, and its own. Read with the permission to read work orders, as the
 * statuses are: a technician drawing a dent has to see what kinds exist.
 * Changed with the settings permission.
 */

const MANAGE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }]
/** More than a workshop could tell apart on a drawing; stops a runaway script. */
const MAX_TYPES = 40

const HEX = /^#[0-9a-fA-F]{6}$/

const markTypeInput = z.object({
  name: z.string().trim().min(1).max(40),
  shape: z.enum(MARK_SHAPES),
  color: z.string().regex(HEX),
  hidden: z.boolean().default(false),
})

function revalidate() {
  revalidatePath('/settings/templates')
}

export async function listMarkTypes() {
  return withAuth(
    async ({ organizationId }): Promise<MarkType[]> =>
      markTypeCatalogue(organizationId, await getLocale()),
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

/** A kind of the workshop's own, listed after the ones it has. */
export async function createMarkType(input: unknown) {
  const data = markTypeInput.parse(input)
  return withAuth(
    async ({ organizationId }) => {
      const count = await db.conditionMarkType.count({ where: { organizationId } })
      if (count >= MAX_TYPES)
        throw new Error('The workshop has as many kinds of mark as it can take')
      const catalogue = await markTypeCatalogue(organizationId, await getLocale())
      const last = catalogue.reduce((max, type) => Math.max(max, type.sortOrder), -1)
      // Two writes, since the key is made from the id.
      const created = await db.$transaction(async (tx) => {
        const row = await tx.conditionMarkType.create({
          data: { organizationId, key: 'pending', ...data, sortOrder: last + 1 },
          select: { id: true },
        })
        return tx.conditionMarkType.update({
          where: { id: row.id },
          data: { key: ownMarkKey(row.id) },
          select: { id: true, key: true, name: true },
        })
      })
      revalidate()
      return created
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'settings.markType.create',
        entity: 'ConditionMarkType',
        entityId: result.id,
        message: `Added the kind of mark "${result.name}"`,
      }),
    }
  )
}

/**
 * Changes a kind: a built-in one gets a row of its own the first time, so
 * the app's defaults stay what they are for every other workshop.
 */
export async function updateMarkType(input: unknown) {
  const { key, ...data } = markTypeInput.extend({ key: z.string().min(1) }).parse(input)
  return withAuth(
    async ({ organizationId }) => {
      const existing = await db.conditionMarkType.findUnique({
        where: { organizationId_key: { organizationId, key } },
        select: { id: true },
      })
      if (!existing && !isBuiltinMarkKey(key)) throw new Error('Kind of mark not found')
      const catalogue = await markTypeCatalogue(organizationId, await getLocale())
      const current = catalogue.find((type) => type.key === key)
      const saved = await db.conditionMarkType.upsert({
        where: { organizationId_key: { organizationId, key } },
        update: data,
        create: { organizationId, key, ...data, sortOrder: current?.sortOrder ?? catalogue.length },
        select: { id: true, key: true, name: true },
      })
      revalidate()
      return saved
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'settings.markType.update',
        entity: 'ConditionMarkType',
        entityId: result.id,
        message: `Changed the kind of mark "${result.name}"`,
      }),
    }
  )
}

/**
 * Puts a built-in kind back as the app ships it, or removes a kind of the
 * workshop's own. A kind that marks still carry cannot go: hide it instead,
 * and the marks keep saying what they are.
 */
export async function removeMarkType(key: string) {
  const parsed = z.string().min(1).parse(key)
  return withAuth(
    async ({ organizationId }) => {
      const row = await db.conditionMarkType.findUnique({
        where: { organizationId_key: { organizationId, key: parsed } },
        select: { id: true, name: true },
      })
      if (!row) throw new Error('Kind of mark not found')
      if (!isBuiltinMarkKey(parsed)) {
        const inUse = await db.conditionMark.count({ where: { organizationId, kind: parsed } })
        if (inUse > 0) throw new Error('Marks of this kind exist; hide it instead')
      }
      await db.conditionMarkType.delete({ where: { id: row.id } })
      revalidate()
      return { id: row.id, name: row.name, key: parsed }
    },
    {
      requiredPermissions: MANAGE,
      audit: ({ result }) => ({
        action: 'settings.markType.remove',
        entity: 'ConditionMarkType',
        entityId: result.id,
        message: isBuiltinMarkKey(result.key)
          ? `Restored the kind of mark "${result.name}" to the app's own`
          : `Removed the kind of mark "${result.name}"`,
      }),
    }
  )
}

/** Every kind, built-in ones included, in the order the picker should list them. */
export async function reorderMarkTypes(input: unknown) {
  const { keys } = z.object({ keys: z.array(z.string().min(1)).max(MAX_TYPES + 8) }).parse(input)
  return withAuth(
    async ({ organizationId }) => {
      const catalogue = await markTypeCatalogue(organizationId, await getLocale())
      const known = new Map(catalogue.map((type) => [type.key, type]))
      if (keys.length !== known.size || keys.some((key) => !known.has(key))) {
        throw new Error('The list of kinds does not match')
      }
      // A built-in kind moved for the first time gets a row to hold its place.
      await db.$transaction(
        keys.map((key, sortOrder) => {
          const type = known.get(key)!
          return db.conditionMarkType.upsert({
            where: { organizationId_key: { organizationId, key } },
            update: { sortOrder },
            create: {
              organizationId,
              key,
              name: type.name,
              shape: type.shape,
              color: type.color,
              hidden: type.hidden,
              sortOrder,
            },
          })
        })
      )
      revalidate()
      return { count: keys.length }
    },
    {
      requiredPermissions: MANAGE,
      audit: () => ({
        action: 'settings.markType.reorder',
        entity: 'ConditionMarkType',
        entityId: 'catalogue',
        message: 'Reordered the kinds of mark',
      }),
    }
  )
}
