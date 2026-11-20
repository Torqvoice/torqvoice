'use server'

import { getTranslations } from 'next-intl/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireFeature } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { organizationTranslator } from '@/i18n/organization-translator'
import { locales } from '@/i18n/config'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { createMeterTypeSchema, updateMeterTypeSchema } from '../Schema/meterSchema'

const SETTINGS_UPDATE = [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }]

const folded = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

async function isMarine(organizationId: string): Promise<boolean> {
  const row = await db.appSetting.findFirst({
    where: { organizationId, key: SETTING_KEYS.SERVICE_TYPE },
    select: { value: true },
  })
  return row?.value === 'marine'
}

/**
 * The odometer's names: "Mileage", or "Engine Hours" on a boat, in every
 * language the app ships, since a workshop's documents can be printed in any
 * of them. A meter may not take one: the odometer is on every vehicle
 * already, and two lines with one name would say different things.
 */
async function odometerNames(organizationId: string): Promise<string[]> {
  const key = (await isMarine(organizationId)) ? 'mileageMarine' : 'mileage'
  const names = await Promise.all(
    locales.map(async (locale) => {
      const messages = (await import(`../../../../messages/${locale}/vehicles.json`)).default as {
        form?: Record<string, string>
      }
      return messages.form?.[key] ?? ''
    })
  )
  return names.filter(Boolean).map(folded)
}

async function refuseOdometerName(organizationId: string, name: string): Promise<void> {
  if (!(await odometerNames(organizationId)).includes(folded(name))) return
  const t = await getTranslations('settings.meters')
  throw new Error(t('odometerName', { name: name.trim() }))
}

/**
 * Two meters that differ only by case or spacing ("PTO hours" and "pto
 * hours ") are one meter twice; the database's own check would let them
 * both in.
 */
async function refuseDuplicateName(
  organizationId: string,
  name: string,
  exceptId?: string
): Promise<void> {
  const others = await db.meterType.findMany({
    where: { organizationId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  })
  if (!others.some((other) => folded(other.name) === folded(name))) return
  throw new Error((await getTranslations('settings.meters'))('duplicateName'))
}

/** Every meter the workshop has defined, shown or hidden, for the settings screen. */
export async function getMeterTypes() {
  return withAuth(
    async ({ organizationId }) =>
      db.meterType.findMany({
        where: { organizationId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          unit: true,
          isActive: true,
          _count: { select: { vehicleMeters: true } },
        },
      }),
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

/**
 * The one-click suggestions, in the workshop's own language, since what is
 * saved is the workshop's text. One already defined is not offered again,
 * and a boat's engine hours are its odometer already.
 */
export async function getMeterSuggestions() {
  return withAuth(
    async ({ organizationId }) => {
      const t = await organizationTranslator(organizationId, 'settings')
      const marine = await isMarine(organizationId)
      const unit = t('meters.hoursUnit')
      const suggestions = [
        ...(marine ? [] : [{ name: t('meters.suggestEngineHours'), unit }]),
        { name: t('meters.suggestPtoHours'), unit },
      ]
      const taken = (
        await db.meterType.findMany({ where: { organizationId }, select: { name: true } })
      ).map((row) => folded(row.name))
      const odometer = await odometerNames(organizationId)
      return suggestions.filter(
        (s) => !taken.includes(folded(s.name)) && !odometer.includes(folded(s.name))
      )
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

function duplicateName(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && (error as { code?: string }).code === 'P2002'
  )
}

export async function createMeterType(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const data = createMeterTypeSchema.parse(input)
      await refuseOdometerName(organizationId, data.name)
      await refuseDuplicateName(organizationId, data.name)
      const last = await db.meterType.aggregate({
        where: { organizationId },
        _max: { sortOrder: true },
      })
      try {
        const meter = await db.meterType.create({
          data: {
            name: data.name,
            unit: data.unit,
            sortOrder: (last._max.sortOrder ?? -1) + 1,
            organizationId,
          },
        })
        revalidatePath('/settings/custom-fields')
        return meter
      } catch (error) {
        if (duplicateName(error)) {
          throw new Error((await getTranslations('settings.meters'))('duplicateName'))
        }
        throw error
      }
    },
    {
      requiredPermissions: SETTINGS_UPDATE,
      audit: ({ result }) => ({
        action: 'meterType.create',
        entity: 'MeterType',
        entityId: result.id,
        details: { key: 'meterType_create', params: { name: result.name } },
        metadata: { meterTypeId: result.id, name: result.name, unit: result.unit },
      }),
    }
  )
}

export async function updateMeterType(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, 'customFields')
      const { id, ...data } = updateMeterTypeSchema.parse(input)
      if (data.name !== undefined) {
        await refuseOdometerName(organizationId, data.name)
        await refuseDuplicateName(organizationId, data.name, id)
      }
      try {
        const result = await db.meterType.updateMany({ where: { id, organizationId }, data })
        if (result.count === 0) throw new Error('Meter not found')
      } catch (error) {
        if (duplicateName(error)) {
          throw new Error((await getTranslations('settings.meters'))('duplicateName'))
        }
        throw error
      }
      const meter = await db.meterType.findFirstOrThrow({
        where: { id, organizationId },
        select: { id: true, name: true, unit: true, isActive: true },
      })
      revalidatePath('/settings/custom-fields')
      return meter
    },
    {
      requiredPermissions: SETTINGS_UPDATE,
      audit: ({ result }) => ({
        action: 'meterType.update',
        entity: 'MeterType',
        entityId: result.id,
        details: { key: 'meterType_update', params: { name: result.name } },
        metadata: { meterTypeId: result.id, isActive: result.isActive },
      }),
    }
  )
}

/**
 * Deletes a meter from the workshop's list, with every vehicle's meter of
 * that kind and all their readings. Hiding it keeps them; the settings
 * screen says so and asks before this.
 */
export async function deleteMeterType(id: string) {
  return withAuth(
    async ({ organizationId }) => {
      // Not on a plan without meters: their data is hidden there, and kept.
      await requireFeature(organizationId, 'customFields')
      const meter = await db.meterType.findFirst({
        where: { id, organizationId },
        select: { id: true, name: true },
      })
      if (!meter) throw new Error('Meter not found')
      await db.meterType.deleteMany({ where: { id, organizationId } })
      revalidatePath('/settings/custom-fields')
      return meter
    },
    {
      requiredPermissions: SETTINGS_UPDATE,
      audit: ({ result }) => ({
        action: 'meterType.delete',
        entity: 'MeterType',
        entityId: result.id,
        details: { key: 'meterType_delete', params: { name: result.name } },
        metadata: { meterTypeId: result.id },
      }),
    }
  )
}
