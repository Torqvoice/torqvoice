'use server'

import { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import {
  isDefaultShortcutPrefs,
  normalizeShortcutPrefs,
  type ShortcutPrefs,
} from '../Lib/preferences'
import { shortcutPrefsSchema } from '../Schema/preferences'

/**
 * Saves the signed-in person's keyboard shortcuts. They belong to the person,
 * not the workshop, so the row is found by the session's user and nothing
 * here depends on a role. Back to every default clears the column.
 */
export async function saveKeyboardShortcuts(input: unknown) {
  return withAuth<ShortcutPrefs>(async (ctx) => {
    const prefs = normalizeShortcutPrefs(shortcutPrefsSchema.parse(input))
    await db.user.update({
      where: { id: ctx.userId },
      data: {
        keyboardShortcuts: isDefaultShortcutPrefs(prefs)
          ? Prisma.DbNull
          : (prefs as unknown as Prisma.InputJsonValue),
      },
    })
    return prefs
  })
}
