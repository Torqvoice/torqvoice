import { z } from 'zod'

/**
 * The shape of anything a workshop can share out of Torqvoice.
 *
 * Deliberately not "an exported inspection template". A package is a manifest
 * plus a list of typed contents, so labour presets, custom fields or a bundle
 * of several arrive later as new content types rather than a second file
 * format with its own parser and its own bugs.
 *
 * Nothing here knows what an inspection template is — that lives in an
 * installer, registered against a content type. See `./registry`.
 */

/** Bumped only for a breaking change to the envelope, not to any content type. */
export const PACKAGE_FORMAT_VERSION = 1

export const PACKAGE_FILE_EXTENSION = '.json'

/**
 * Whether the contents are data or something that runs.
 *
 * Only `bundle` exists today and everything in it is declarative, which is
 * what makes a schema a sufficient check on the way in. The field is here from
 * the start so that answer is stated rather than implied — an executable kind
 * would need signing and a sandbox, and should never be able to arrive by
 * omission in a file written for an older version.
 */
export const packageKindSchema = z.enum(['bundle'])

export const packageContentSchema = z.object({
  /** Registered content type, e.g. "inspection-template". */
  type: z.string().min(1).max(64),
  /** Validated by the installer for `type`, not here. */
  data: z.unknown(),
})

export const packageManifestSchema = z.object({
  formatVersion: z.number().int().positive(),
  kind: packageKindSchema,
  /** Namespaced and stable across renames, e.g. "torqvoice/eu-roadworthiness". */
  id: z.string().min(1).max(200),
  version: z.string().min(1).max(32),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  /** Free text the exporter chose to attribute it to; never derived from the account. */
  author: z.string().max(120).optional(),
  exportedAt: z.string().max(40).optional(),
  contents: z.array(packageContentSchema).min(1).max(50),
})

export type PackageManifest = z.infer<typeof packageManifestSchema>
export type PackageContent = z.infer<typeof packageContentSchema>

export class PackageFormatError extends Error {}

/**
 * Parses untrusted JSON into a package.
 *
 * The version is checked before the shape, so a file from a newer Torqvoice
 * says so plainly instead of failing as a list of unrecognised fields.
 */
export function parsePackage(raw: unknown): PackageManifest {
  if (raw === null || typeof raw !== 'object') {
    throw new PackageFormatError('This file is not a Torqvoice package.')
  }

  const version = (raw as { formatVersion?: unknown }).formatVersion
  if (typeof version !== 'number') {
    throw new PackageFormatError('This file is not a Torqvoice package.')
  }
  if (version > PACKAGE_FORMAT_VERSION) {
    throw new PackageFormatError(
      `This package was made with a newer version of Torqvoice (format ${version}). Update before importing it.`
    )
  }

  const parsed = packageManifestSchema.safeParse(raw)
  if (!parsed.success) {
    throw new PackageFormatError('This package is missing information Torqvoice needs to read it.')
  }
  return parsed.data
}

/** A filename that survives a round trip through a downloads folder. */
export function packageFileName(manifest: Pick<PackageManifest, 'name'>): string {
  const slug =
    manifest.name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'template'
  return `torqvoice-${slug}${PACKAGE_FILE_EXTENSION}`
}
