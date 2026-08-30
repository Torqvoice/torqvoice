'use server'

import { withSuperAdmin } from '@/lib/with-super-admin'
import { db } from '@/lib/db'
import {
  systemSettingsUpdateSchema,
  ALL_SYSTEM_KEYS,
  SYSTEM_SETTING_KEYS,
  BROADCAST_LEVELS,
  BROADCAST_MAX_LENGTH,
  type BroadcastLevel,
} from '../Schema/systemSettingsSchema'
import { demoGuard } from '@/lib/demo'
import { notificationBus } from '@/lib/notification-bus'

export async function setSystemSettings(input: Record<string, string>) {
  return withSuperAdmin(async () => {
    demoGuard()
    const data = systemSettingsUpdateSchema.parse(input)

    // Only allow known keys, filter out license.* (readonly)
    const entries = Object.entries(data).filter(([key]) => {
      if (!ALL_SYSTEM_KEYS.includes(key as (typeof ALL_SYSTEM_KEYS)[number])) return false
      if (key.startsWith('license.')) return false
      return true
    })

    const broadcast = entries.find(([key]) => key === SYSTEM_SETTING_KEYS.BROADCAST_MESSAGE)
    if (broadcast) {
      // Trimmed and capped here rather than in the form, because this is the
      // only door: an over-long notice would push the page around on every
      // screen in every workshop at once.
      broadcast[1] = broadcast[1].trim().slice(0, BROADCAST_MAX_LENGTH)

      const level = entries.find(([key]) => key === SYSTEM_SETTING_KEYS.BROADCAST_LEVEL)
      if (level && !BROADCAST_LEVELS.includes(level[1] as BroadcastLevel)) {
        level[1] = 'info'
      }

      // Stamped here, never by the caller. Each person's dismissal is keyed on
      // this value, so it decides whether a notice reappears, and a client
      // that could set it could hide a live incident from everyone who had
      // already dismissed the previous one.
      entries.push([SYSTEM_SETTING_KEYS.BROADCAST_UPDATED_AT, new Date().toISOString()])
    }

    await db.$transaction(
      entries.map(([key, value]) =>
        db.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    )

    // Pushed to everyone already looking at a screen. A notice about an
    // outage that only appears on the next navigation reaches people slowest
    // at exactly the moment it matters most.
    if (broadcast) {
      const level = entries.find(([key]) => key === SYSTEM_SETTING_KEYS.BROADCAST_LEVEL)?.[1]
      const updatedAt = entries.find(
        ([key]) => key === SYSTEM_SETTING_KEYS.BROADCAST_UPDATED_AT
      )?.[1]
      notificationBus.emit(
        'broadcast',
        broadcast[1] ? { message: broadcast[1], level: level ?? 'info', updatedAt } : null
      )
    }

    return { updated: entries.length }
  })
}
