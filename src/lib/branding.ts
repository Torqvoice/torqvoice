import 'server-only'

import path from 'node:path'
import { db } from '@/lib/db'
import { uploadsRoot } from '@/lib/upload-root'
import { installHasLicense, isCloudMode } from '@/lib/features'
import {
  BRANDING_APP_NAME_MAX_LENGTH,
  SYSTEM_SETTING_KEYS,
} from '@/features/admin/Schema/systemSettingsSchema'

/**
 * What the browser calls this install: tab title, favicon, home-screen and
 * installed-app name and icon. Only a licensed self-hosted install may change
 * it; everywhere else it is TorqVoice. Documents, link previews and the rest
 * of the app are not touched by this.
 */

export const DEFAULT_APP_NAME = 'TorqVoice'

export type AppBranding = {
  name: string
  iconUrl: string | null
  /** True when the install is licensed and has a name or an icon set. */
  custom: boolean
}

const DEFAULT_BRANDING: AppBranding = { name: DEFAULT_APP_NAME, iconUrl: null, custom: false }

// The root layout asks on every page, and the licence check verifies signed
// tokens, so the answer is kept for a minute. Saving a branding setting clears it.
const CACHE_TTL_MS = 60_000

// On globalThis: Next can load this module more than once, and each copy
// would otherwise keep its own stale answer.
const globalForBranding = globalThis as unknown as {
  __appBranding?: { value: AppBranding; expiresAt: number }
}

/** Install-owned, never referenced by a workshop's records. */
export function brandingDir(): string {
  return path.join(uploadsRoot(), 'system', 'branding')
}

export const APP_ICON_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
}

/**
 * Whether a stored icon name is a bare file name we would have written. The
 * setting is read from the database and joined onto a path, so anything that
 * could climb out of the branding directory is refused here.
 */
export function isSafeIconFileName(value: string): boolean {
  if (!value || value !== path.basename(value)) return false
  if (value.includes('..') || value.includes('/') || value.includes('\\')) return false
  const ext = value.split('.').pop()?.toLowerCase() ?? ''
  return Object.hasOwn(APP_ICON_MIME_TYPES, ext) && value.length > ext.length + 1
}

/** The public URL of a stored icon; the file name doubles as a cache-buster. */
export function appIconUrl(fileName: string): string {
  return `/api/public/app-icon?v=${encodeURIComponent(fileName)}`
}

async function readBranding(): Promise<AppBranding> {
  if (isCloudMode()) return DEFAULT_BRANDING
  if (!(await installHasLicense())) return DEFAULT_BRANDING

  const rows = await db.systemSetting.findMany({
    where: {
      key: { in: [SYSTEM_SETTING_KEYS.BRANDING_APP_NAME, SYSTEM_SETTING_KEYS.BRANDING_APP_ICON] },
    },
    select: { key: true, value: true },
  })
  const value = (key: string) => rows.find((row) => row.key === key)?.value?.trim() ?? ''

  const name = value(SYSTEM_SETTING_KEYS.BRANDING_APP_NAME).slice(0, BRANDING_APP_NAME_MAX_LENGTH)
  const icon = value(SYSTEM_SETTING_KEYS.BRANDING_APP_ICON)

  return {
    name: name || DEFAULT_APP_NAME,
    iconUrl: icon ? appIconUrl(icon) : null,
    custom: Boolean(name || icon),
  }
}

export async function getAppBranding(): Promise<AppBranding> {
  const cached = globalForBranding.__appBranding
  if (cached && cached.expiresAt > Date.now()) return cached.value

  let value: AppBranding
  try {
    value = await readBranding()
  } catch (error) {
    // A tab title is not worth failing a page over, and the build renders
    // without a database.
    console.error('[branding] Falling back to the default:', error)
    return DEFAULT_BRANDING
  }

  globalForBranding.__appBranding = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

/** Forget the cached branding, so the next page shows what was just saved. */
export function invalidateAppBranding(): void {
  globalForBranding.__appBranding = undefined
}
