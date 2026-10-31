/**
 * Uploads and zip archives read from disk, never from memory.
 *
 * A restore used to read the whole request into a buffer, hand that buffer
 * to a zip library that kept it, and then inflate data.json into one string
 * before parsing it: four copies of a file that can be hundreds of
 * megabytes, on a server that may have one gigabyte. Now the request body is
 * written to a temporary file as it arrives, the archive's table of contents
 * is read from that file, and each entry is streamed out of it on demand:
 * data.json straight into the JSON parser, a photo straight into its place
 * on disk. What stays in memory is the parsed data and nothing else.
 */

import { createReadStream, createWriteStream } from 'fs'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import { Readable, Transform } from 'stream'
import type { ReadableStream as WebReadableStream } from 'stream/web'
import { pipeline } from 'stream/promises'
import yauzl from 'yauzl'
import { parser } from 'stream-json'
import Assembler from 'stream-json/Assembler'
import { BACKUP_ZIP_LIMITS, assertZipWithinLimits, type ZipLimits } from './zip-guard'

/** The first bytes of a zip file. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

export interface SpooledUpload {
  /** The file the body was written to. */
  path: string
  size: number
  /** Whether the first bytes are a zip's. */
  isZip: boolean
  /** Deletes the file. Safe to call more than once. */
  remove(): Promise<void>
}

/**
 * Writes the request body to a temporary file as it arrives, refusing it
 * once it passes maxBytes, and says whether it looks like a zip. The caller
 * removes the file when done, whichever way the request ends.
 */
export async function spoolUpload(
  request: Request,
  maxBytes: number,
  label: string
): Promise<SpooledUpload> {
  const dir = await mkdtemp(path.join(os.tmpdir(), `${label}-`))
  const file = path.join(dir, 'upload')
  const remove = () => rm(dir, { recursive: true, force: true })
  const body = request.body
  if (!body) {
    await remove()
    throw new Error('The upload is empty')
  }
  let size = 0
  const head: number[] = []
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length
      if (size > maxBytes) {
        callback(new Error('The upload is too large'))
        return
      }
      for (let i = 0; head.length < ZIP_MAGIC.length && i < chunk.length; i++) head.push(chunk[i])
      callback(null, chunk)
    },
  })
  try {
    await pipeline(
      Readable.fromWeb(body as WebReadableStream<Uint8Array>),
      counter,
      createWriteStream(file)
    )
  } catch (err) {
    await remove()
    throw err
  }
  return {
    path: file,
    size,
    isZip: ZIP_MAGIC.every((byte, i) => head[i] === byte),
    remove,
  }
}

export interface ZipEntry {
  /** The path inside the archive, with forward slashes. */
  name: string
  dir: boolean
  uncompressedSize: number
  /** The library's own record, needed to open the entry. */
  raw: yauzl.Entry
}

export interface OpenedZip {
  entries: readonly ZipEntry[]
  find(name: string): ZipEntry | undefined
  /** The entry's inflated bytes, as a stream. */
  open(entry: ZipEntry): Promise<Readable>
  close(): void
}

/**
 * Opens a zip on disk and reads its table of contents, which is small even
 * for a large archive. The declared sizes are checked against the limits
 * before anything is inflated. An entry name that tries to leave the
 * archive, with ".." or a leading slash, fails the whole archive: yauzl
 * refuses those, and a backup with such a name was never one of ours.
 */
export async function openZip(
  file: string,
  limits: ZipLimits = BACKUP_ZIP_LIMITS
): Promise<OpenedZip> {
  const zipfile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zf) => {
      if (err || !zf) reject(err ?? new Error('Could not open the archive'))
      else resolve(zf)
    })
  })
  if (zipfile.entryCount > limits.maxEntries) {
    zipfile.close()
    throw new Error(`The archive has too many entries (${zipfile.entryCount})`)
  }
  const entries: ZipEntry[] = []
  try {
    await new Promise<void>((resolve, reject) => {
      zipfile.on('entry', (entry: yauzl.Entry) => {
        entries.push({
          name: entry.fileName,
          dir: entry.fileName.endsWith('/'),
          uncompressedSize: entry.uncompressedSize,
          raw: entry,
        })
        zipfile.readEntry()
      })
      zipfile.once('end', resolve)
      zipfile.once('error', reject)
      zipfile.readEntry()
    })
    assertZipWithinLimits(entries, limits)
  } catch (err) {
    zipfile.close()
    throw err
  }
  return {
    entries,
    find: (name) => entries.find((e) => e.name === name),
    open: (entry) =>
      new Promise<Readable>((resolve, reject) => {
        zipfile.openReadStream(entry.raw, (err, stream) => {
          if (err || !stream) reject(err ?? new Error(`Could not read ${entry.name}`))
          else resolve(stream)
        })
      }),
    close: () => zipfile.close(),
  }
}

/** Inflates one entry straight to a file, creating the folder it goes in. */
export async function extractEntry(zip: OpenedZip, entry: ZipEntry, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true })
  await pipeline(await zip.open(entry), createWriteStream(target))
}

/**
 * Parses JSON from a stream without first making it a string. The parser
 * is slower than JSON.parse, by a few seconds on a hundred megabytes, and
 * needs memory for the result alone instead of result, text and bytes.
 */
export async function parseJsonStream<T = unknown>(source: Readable): Promise<T> {
  const tokens = parser()
  const assembler = Assembler.connectTo(tokens)
  await pipeline(source, tokens)
  return assembler.current as T
}

/** The entry's contents, parsed as JSON. */
export async function readEntryJson<T = unknown>(zip: OpenedZip, entry: ZipEntry): Promise<T> {
  return parseJsonStream<T>(await zip.open(entry))
}

/** A JSON file on disk, parsed as it is read. */
export async function readJsonFile<T = unknown>(file: string): Promise<T> {
  return parseJsonStream<T>(createReadStream(file))
}
