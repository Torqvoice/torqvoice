import 'server-only'

import { readdir, stat, unlink } from 'fs/promises'
import path from 'path'
import { getAppBaseUrl } from '@/lib/app-url'
import { db } from '@/lib/db'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { readStoredTemplate } from '../Schema/emailTemplateSchema'
import {
  EMAIL_ASSET_CATEGORIES,
  type EmailTemplate,
  emailAssetPublicPath,
  parseEmailAssetUrl,
  templateAssets,
} from './emailTemplate'

/**
 * The files behind a template's logo and pictures.
 *
 * Uploads are written the moment they are chosen, before the template is
 * saved, because the preview has to show them. That leaves files behind
 * whenever a picture is replaced, a block is removed, a draft is discarded
 * or a template deleted. Rather than trusting every one of those paths to
 * remember, the sweep runs after each save and delete and removes any file
 * in the organisation's email folders that no saved template refers to. A
 * file younger than an hour is spared, since it may belong to a draft that
 * is still open in another tab.
 */

const GRACE_MS = 60 * 60 * 1000

/**
 * The absolute address a sent mail fetches a stored upload from, or nothing.
 *
 * Checked against the disk first, so a template that still names a file
 * after the file has gone sends without the picture rather than with a
 * broken one. The organisation in the URL has to be the one sending, so one
 * workshop's template can never point at another's upload.
 */
export async function emailAssetUrl(
  organizationId: string,
  storedUrl: string | null | undefined
): Promise<string | undefined> {
  const parts = parseEmailAssetUrl(storedUrl)
  if (!parts || parts.organizationId !== organizationId || !storedUrl) return undefined
  try {
    await stat(resolveUploadPath(storedUrl))
  } catch {
    return undefined
  }
  return `${getAppBaseUrl()}${emailAssetPublicPath(storedUrl)}`
}

/** Every upload a template refers to, resolved to what a mail can fetch. */
export async function assetUrlsFor(
  organizationId: string,
  template: Pick<EmailTemplate, 'blocks' | 'theme'>
): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {}
  await Promise.all(
    templateAssets(template).map(async (stored) => {
      out[stored] = await emailAssetUrl(organizationId, stored)
    })
  )
  return out
}

/** Every upload any saved template of the organisation still refers to. */
async function referencedAssets(organizationId: string): Promise<Set<string>> {
  const rows = await db.emailTemplate.findMany({
    where: { organizationId },
    select: { kind: true, name: true, subject: true, blocks: true, theme: true },
  })
  const referenced = new Set<string>()
  for (const row of rows) {
    const template = readStoredTemplate(row)
    if (template) for (const asset of templateAssets(template)) referenced.add(asset)
  }
  return referenced
}

/**
 * Removes the organisation's email uploads that nothing refers to any more.
 * Never throws: a sweep that fails leaves a file behind, which the next
 * sweep will find, and must not turn a successful save into an error.
 */
export async function sweepEmailAssets(organizationId: string): Promise<{ removed: number }> {
  let removed = 0
  try {
    const referenced = await referencedAssets(organizationId)
    const now = Date.now()
    for (const category of EMAIL_ASSET_CATEGORIES) {
      const dir = path.join(process.cwd(), 'data', 'uploads', organizationId, category)
      let files: string[]
      try {
        files = await readdir(dir)
      } catch {
        continue
      }
      for (const file of files) {
        const stored = `/api/protected/files/${organizationId}/${category}/${file}`
        if (referenced.has(stored)) continue
        const full = path.join(dir, file)
        try {
          const info = await stat(full)
          if (!info.isFile() || now - info.mtimeMs < GRACE_MS) continue
          await unlink(full)
          removed += 1
        } catch {
          // Gone already, or not ours to remove; either way, leave it.
        }
      }
    }
  } catch (error) {
    console.error('[email assets] sweep failed', error)
  }
  return { removed }
}
