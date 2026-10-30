/**
 * The streamed zip reader: the upload lands on disk, the table of contents is
 * checked before anything is inflated, data is parsed straight from the
 * archive, and an entry that tries to leave the archive fails it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createWriteStream } from 'fs'
import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import os from 'os'
import path from 'path'
import { ZipArchive } from 'archiver'
import { extractEntry, openZip, readEntryJson, spoolUpload } from '@/lib/backup/zip-file'

let sandbox: string

beforeEach(async () => {
  sandbox = await mkdtemp(path.join(os.tmpdir(), 'zip-file-test-'))
})

afterEach(async () => {
  await rm(sandbox, { recursive: true, force: true })
})

async function writeZip(name: string, entries: Record<string, string | Buffer>): Promise<string> {
  const file = path.join(sandbox, name)
  const archive = new ZipArchive({ zlib: { level: 6 } })
  const done = new Promise<void>((resolve, reject) => {
    const out = createWriteStream(file)
    out.on('close', () => resolve())
    out.on('error', reject)
    archive.on('error', reject)
    archive.pipe(out)
  })
  for (const [entryName, content] of Object.entries(entries)) {
    archive.append(content, { name: entryName })
  }
  await archive.finalize()
  await done
  return file
}

/**
 * A zip written by hand, with stored entries and whatever names are asked
 * for: archiver cleans "../" out of a name, so an escaping entry has to be
 * built without it.
 */
function rawZip(entries: Record<string, string>): Buffer {
  const { crc32 } = require('zlib') as { crc32: (data: Buffer) => number }
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, 'utf8')
    const data = Buffer.from(text, 'utf8')
    const crc = crc32(data) >>> 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, data)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, ...centrals, end])
}

function requestWith(bytes: Buffer): Request {
  return new Request('http://x/import', { method: 'POST', body: new Uint8Array(bytes) })
}

describe('spoolUpload', () => {
  it('writes the body to disk, counts it and recognises a zip', async () => {
    const zipPath = await writeZip('a.zip', { 'data.json': '{"ok":true}' })
    const bytes = await readFile(zipPath)
    const upload = await spoolUpload(requestWith(bytes), 1_000_000, 'test')
    try {
      expect(upload.size).toBe(bytes.length)
      expect(upload.isZip).toBe(true)
      expect((await stat(upload.path)).size).toBe(bytes.length)
    } finally {
      await upload.remove()
    }
    await expect(stat(upload.path)).rejects.toThrow()
  })

  it('knows plain JSON from a zip', async () => {
    const upload = await spoolUpload(requestWith(Buffer.from('{"version":1}')), 1_000, 'test')
    try {
      expect(upload.isZip).toBe(false)
    } finally {
      await upload.remove()
    }
  })

  it('refuses a body past the limit while it is still arriving', async () => {
    const big = Buffer.alloc(5_000, 1)
    await expect(spoolUpload(requestWith(big), 1_000, 'test')).rejects.toThrow(/too large/)
  })
})

describe('openZip', () => {
  it('lists the entries and streams them out one at a time', async () => {
    const zipPath = await writeZip('b.zip', {
      'data.json': JSON.stringify({ version: 2, data: { customers: [{ id: 'c1' }] } }),
      'files/images/car.jpg': Buffer.from('JPEG_BYTES'),
    })
    const zip = await openZip(zipPath)
    try {
      expect(zip.entries.map((e) => e.name).sort()).toEqual(['data.json', 'files/images/car.jpg'])
      const data = zip.find('data.json')
      expect(data).toBeDefined()
      const parsed = await readEntryJson<{ version: number; data: { customers: unknown[] } }>(
        zip,
        data!
      )
      expect(parsed.version).toBe(2)
      expect(parsed.data.customers).toEqual([{ id: 'c1' }])

      const target = path.join(sandbox, 'out', 'car.jpg')
      await extractEntry(zip, zip.find('files/images/car.jpg')!, target)
      expect((await readFile(target)).toString()).toBe('JPEG_BYTES')
    } finally {
      zip.close()
    }
  })

  it('refuses an archive whose declared sizes do not fit, before inflating', async () => {
    const zipPath = await writeZip('c.zip', { 'big.bin': Buffer.alloc(20_000, 7) })
    await expect(openZip(zipPath, { maxEntries: 10, maxTotalBytes: 10_000 })).rejects.toThrow(
      /too large/
    )
  })

  it('refuses too many entries', async () => {
    const entries = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}.txt`, 'x']))
    const zipPath = await writeZip('d.zip', entries)
    await expect(openZip(zipPath, { maxEntries: 3, maxTotalBytes: 10_000 })).rejects.toThrow(
      /too many entries/
    )
  })

  it('reads a hand-built archive, so the next test proves what it claims', async () => {
    const { writeFile } = await import('fs/promises')
    const file = path.join(sandbox, 'raw.zip')
    await writeFile(file, rawZip({ 'data.json': '{"version":2}', 'files/a.txt': 'A' }))
    const zip = await openZip(file)
    try {
      expect(zip.entries.map((e) => e.name)).toEqual(['data.json', 'files/a.txt'])
      expect(await readEntryJson(zip, zip.find('data.json')!)).toEqual({ version: 2 })
    } finally {
      zip.close()
    }
  })

  it('fails an archive with an entry that tries to leave it', async () => {
    const { writeFile } = await import('fs/promises')
    const file = path.join(sandbox, 'escape.zip')
    await writeFile(file, rawZip({ 'data.json': '{}', '../escape.txt': 'nope' }))
    await expect(openZip(file)).rejects.toThrow()
    const absolute = path.join(sandbox, 'absolute.zip')
    await writeFile(absolute, rawZip({ '/etc/passwd': 'nope' }))
    await expect(openZip(absolute)).rejects.toThrow()
  })

  it('is not fooled by a file that is not a zip', async () => {
    const file = path.join(sandbox, 'not.zip')
    await rm(file, { force: true })
    const { writeFile } = await import('fs/promises')
    await writeFile(file, 'this is not an archive at all, just text')
    await expect(openZip(file)).rejects.toThrow()
  })
})
