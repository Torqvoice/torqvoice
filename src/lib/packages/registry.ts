import type { ZodType } from 'zod'
import { PackageFormatError, type PackageContent } from './format'

/**
 * The extension point.
 *
 * Everything else about packages — the envelope, the file, the dialogs — is
 * written once. Supporting a new kind of shareable thing means writing one of
 * these and registering it.
 *
 * `export` lives here rather than being generic because what is safe to share
 * differs sharply by type: a labour preset references this instance's stock, a
 * webhook holds a live secret. A serialise-the-row exporter would leak.
 */
export interface PackageInstaller<T> {
  /** Stable key written into the package, e.g. "inspection-template". */
  type: string
  /** Human name for the review screen. */
  label: string
  /** Nothing from a file is trusted until it has been through this. */
  schema: ZodType<T>
  /** Lines shown before installing, e.g. "9 sections", "92 checks". */
  describe(data: T): string[]
}

const installers = new Map<string, PackageInstaller<unknown>>()

export function registerInstaller<T>(installer: PackageInstaller<T>): void {
  installers.set(installer.type, installer as PackageInstaller<unknown>)
}

export function getInstaller(type: string): PackageInstaller<unknown> | undefined {
  return installers.get(type)
}

export interface ReviewedContent {
  type: string
  label: string
  /** Validated payload, safe to hand to the installer. */
  data: unknown
  details: string[]
}

/**
 * Validates every item in a package against its registered installer.
 *
 * All-or-nothing: a package that is half-recognised installs nothing, so an
 * import can never leave a workshop with a partial checklist it believes is
 * complete.
 */
export function reviewContents(contents: PackageContent[]): ReviewedContent[] {
  return contents.map((content) => {
    const installer = getInstaller(content.type)
    if (!installer) {
      throw new PackageFormatError(
        `This package contains "${content.type}", which this version of Torqvoice cannot install.`
      )
    }
    const parsed = installer.schema.safeParse(content.data)
    if (!parsed.success) {
      throw new PackageFormatError(`The ${installer.label} in this package is not valid.`)
    }
    return {
      type: installer.type,
      label: installer.label,
      data: parsed.data,
      details: installer.describe(parsed.data),
    }
  })
}
