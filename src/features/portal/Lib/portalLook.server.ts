import 'server-only'

import { access } from 'node:fs/promises'
import path from 'node:path'
import { cache } from 'react'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { isTireHotelEnabled } from '@/features/tire-hotel/Lib/tireHotelSettings'
import { db } from '@/lib/db'
import { uploadsRoot } from '@/lib/upload-root'
import {
  DEFAULT_PORTAL_LOOK,
  onAccentFor,
  type PortalLook,
  resolvePortalAccent,
  resolvePortalTheme,
} from './theme'

/**
 * The stored url of a picture, when its file is really there. A setting can
 * outlive its file (a restore without files, a disk that was moved), and a
 * page that asks for it then shows the browser's broken-image mark where the
 * cover or the logo should be. Checked here, once, so every theme simply
 * gets "no picture" and draws its own fallback.
 */
async function storedPicture(
  organizationId: string,
  folder: 'portal' | 'logos',
  storedUrl: string | null
): Promise<string | null> {
  const name = storedUrl?.split('?')[0].split('/').pop()
  if (!storedUrl || !name || name.includes('..') || name.includes('\\')) return null
  try {
    await access(path.join(uploadsRoot(), organizationId, folder, name))
    return storedUrl
  } catch {
    return null
  }
}

/**
 * How a workshop's portal looks and which of its optional parts are on:
 * the theme, the workshop's colour and the ink that sits on it, the cover
 * photo and logo, whether the chat is on and whether stored tyres show.
 *
 * One read per request however many components ask (the layout, the shell
 * and the page all do). `organizationId` is the workshop the address resolved
 * to or the session's, never something a visitor passes in. A workshop that
 * has set nothing gets Daylight in its own orange; a failed read gets the
 * same, so a page never breaks over its colours.
 *
 * The urls are the public routes, written with the workshop's id: they work
 * before anyone has signed in.
 */
export const loadPortalLook = cache(async (organizationId: string): Promise<PortalLook> => {
  try {
    const [rows, tireHotel] = await Promise.all([
      db.appSetting.findMany({
        where: {
          organizationId,
          key: {
            in: [
              SETTING_KEYS.PORTAL_THEME,
              SETTING_KEYS.PORTAL_ACCENT,
              SETTING_KEYS.PORTAL_COVER,
              SETTING_KEYS.PORTAL_MESSAGES,
              SETTING_KEYS.PORTAL_SHOW_TIRES,
              SETTING_KEYS.COMPANY_LOGO,
            ],
          },
        },
        select: { key: true, value: true },
      }),
      isTireHotelEnabled(organizationId).catch(() => false),
    ])
    const value = (key: string) => rows.find((row) => row.key === key)?.value?.trim() || null

    const theme = resolvePortalTheme(value(SETTING_KEYS.PORTAL_THEME))
    const accent = resolvePortalAccent(theme, value(SETTING_KEYS.PORTAL_ACCENT))
    const [cover, logo] = await Promise.all([
      storedPicture(organizationId, 'portal', value(SETTING_KEYS.PORTAL_COVER)),
      storedPicture(organizationId, 'logos', value(SETTING_KEYS.COMPANY_LOGO)),
    ])
    // The file's own name in the address, so a new photo is not served from
    // the browser's copy of the old one.
    const coverVersion = cover ? encodeURIComponent(cover.split('/').pop() ?? '') : ''

    return {
      theme,
      accent,
      onAccent: onAccentFor(accent),
      coverUrl: cover ? `/api/public/portal-bg/${organizationId}?v=${coverVersion}` : null,
      logoUrl: logo ? `/api/public/logo/${organizationId}` : null,
      messagesEnabled: value(SETTING_KEYS.PORTAL_MESSAGES) !== 'false',
      showTires: tireHotel && value(SETTING_KEYS.PORTAL_SHOW_TIRES) !== 'false',
    }
  } catch (error) {
    console.error('[portal] look:', error)
    return DEFAULT_PORTAL_LOOK
  }
})
