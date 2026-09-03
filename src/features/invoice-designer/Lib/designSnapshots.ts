import { db } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'
import { bytesHash, contentHash } from './designHash'
import { materializeDesignSource, type DesignSource } from './designSource'

/**
 * Snapshots are kept once per distinct content: an invoice issued with the
 * same look as a thousand before it points at the row they share. The
 * unique index on (organization, hash) is the guard, and the create is
 * retried as a lookup when two issues race for the same new row.
 */

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === 'P2002')
}

/** The id of the snapshot holding this design, created if it is new. */
export async function ensureDesignSnapshot(
  organizationId: string,
  source: DesignSource
): Promise<string> {
  const frozen = materializeDesignSource(source)
  const hash = contentHash(frozen)
  const existing = await db.documentDesignSnapshot.findUnique({
    where: { organizationId_hash: { organizationId, hash } },
    select: { id: true },
  })
  if (existing) return existing.id
  try {
    const created = await db.documentDesignSnapshot.create({
      data: {
        organizationId,
        hash,
        layout: frozen.layout as unknown as Prisma.InputJsonValue,
        template: frozen.template as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    return created.id
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const raced = await db.documentDesignSnapshot.findUnique({
      where: { organizationId_hash: { organizationId, hash } },
      select: { id: true },
    })
    if (!raced) throw err
    return raced.id
  }
}

const DATA_URI = /^data:([^;,]+);base64,([\s\S]*)$/

/**
 * The id of the stored copy of a file given as a data URI, created if it is
 * new. Null for anything that is not a base64 data URI, which is the only
 * form the print path hands a logo around in.
 */
export async function ensureAssetSnapshot(
  organizationId: string,
  dataUri: string
): Promise<string | null> {
  const match = DATA_URI.exec(dataUri)
  if (!match) return null
  const mimeType = match[1]
  const bytes = new Uint8Array(Buffer.from(match[2], 'base64'))
  if (bytes.length === 0) return null
  const hash = bytesHash(bytes)
  const existing = await db.documentAssetSnapshot.findUnique({
    where: { organizationId_hash: { organizationId, hash } },
    select: { id: true },
  })
  if (existing) return existing.id
  try {
    const created = await db.documentAssetSnapshot.create({
      data: { organizationId, hash, mimeType, data: bytes },
      select: { id: true },
    })
    return created.id
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const raced = await db.documentAssetSnapshot.findUnique({
      where: { organizationId_hash: { organizationId, hash } },
      select: { id: true },
    })
    if (!raced) throw err
    return raced.id
  }
}

/** A stored file back in the form the renderers take. */
export function assetDataUri(asset: { mimeType: string; data: Uint8Array }): string {
  return `data:${asset.mimeType};base64,${Buffer.from(asset.data).toString('base64')}`
}
