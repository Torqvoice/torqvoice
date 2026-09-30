import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Real files in the app server's upload folder, for the specs that check
 * what deleting something does to the disk. The server and the suite share
 * a disk locally and on CI (the server runs from the repository, and so
 * `data/uploads` is the same folder for both); a spec skips when they do not.
 */

/** Where the app server keeps a workshop's uploads, as the suite sees it. */
export function uploadPath(organizationId: string, ...segments: string[]): string {
  return path.join('data', 'uploads', organizationId, ...segments)
}

/** Whether this run can see the server's uploads at all. */
export function sharesDiskWithServer(): boolean {
  return existsSync(path.join('data', 'uploads'))
}

export interface PlantedFile {
  /** What a row stores. */
  url: string
  /** Where it is on disk. */
  path: string
}

/** A file with a name like the upload routes give, and the URL a row would hold. */
export async function plantFile(
  organizationId: string,
  folder: string,
  ext = 'jpg'
): Promise<PlantedFile> {
  const name = `${randomUUID()}.${ext}`
  const file = uploadPath(organizationId, folder, name)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `e2e ${folder} ${name}`)
  return { url: `/api/protected/files/${organizationId}/${folder}/${name}`, path: file }
}

export function onDisk(file: PlantedFile): boolean {
  return existsSync(file.path)
}

export async function removePlanted(files: PlantedFile[]): Promise<void> {
  await Promise.all(files.map((file) => rm(file.path, { force: true })))
}
