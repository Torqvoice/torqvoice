import { PDFDocument, StandardFonts } from 'pdf-lib'
import { extractText } from 'unpdf'

/**
 * Reading what a PDF actually says.
 *
 * Page count and byte size prove two copies of an invoice are not the same
 * document; they say nothing about whether either one is right. The sheet is
 * drawn by react-pdf with embedded fonts, and it comes back out as real text
 * — the figures formatted exactly as the screen shows them, and a description
 * typed over three lines still on three lines.
 */

export interface PdfContent {
  pages: number
  /**
   * The file's own size. Text alone cannot see a missing logo or QR code, and
   * that is precisely what the emailed copy was once missing, so the weight is
   * kept alongside the words.
   */
  size: number
  /** As extracted, one line per line of the sheet. */
  text: string
  /** The same with every run of whitespace collapsed, for phrase assertions. */
  flat: string
}

export async function pdfContent(bytes: Buffer | Uint8Array): Promise<PdfContent> {
  const { totalPages, text } = await extractText(new Uint8Array(bytes), { mergePages: true })
  const merged = String(text)
  return {
    pages: totalPages,
    size: bytes.byteLength,
    text: merged,
    flat: merged.replace(/\s+/g, ' ').trim(),
  }
}

/**
 * A small PDF with words on it, for the tests that attach one to a job. Built
 * here rather than committed as a fixture so that what it says is visible to
 * whoever reads the spec — and what it says is the point, since the invoice
 * appends these pages and the test looks for them.
 */
export async function makePdf(pages: string[]): Promise<Buffer> {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  for (const line of pages) {
    const page = document.addPage([595, 842])
    page.drawText(line, { x: 60, y: 700, size: 24, font })
  }
  return Buffer.from(await document.save())
}

/**
 * A 1×1 PNG: the smallest thing the invoice will accept as a photograph.
 * Signature, IHDR, a deflated red pixel and IEND, each with its CRC — the
 * one that circulates as "the smallest PNG" has a broken IDAT checksum, and
 * a broken image is a different test (see BROKEN_PNG).
 */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
)

/**
 * A PNG that says it is one and is not: the header parses, the pixels do not
 * inflate. What a truncated upload from a phone looks like on disk.
 */
export const BROKEN_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
)
