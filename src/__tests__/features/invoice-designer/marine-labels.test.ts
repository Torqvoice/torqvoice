/**
 * A workshop that services boats prints HIN, registration, vessel and engine
 * hours where a garage prints VIN, plate, vehicle and mileage. The overrides
 * read `*Marine` keys from `pdf.json`, and for a long time those keys did not
 * exist, so every marine document silently printed the road vocabulary.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { withMarineDocumentLabels } from '@/features/invoice-designer/Lib/marineLabels'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'

type Section = Record<string, string>
type PdfMessages = Record<string, Section>

const messagesRoot = path.resolve(process.cwd(), 'messages')
const locales = fs
  .readdirSync(messagesRoot)
  .filter((entry) => fs.existsSync(path.join(messagesRoot, entry, 'pdf.json')))
  .sort()

function pdfMessages(locale: string): PdfMessages {
  return JSON.parse(fs.readFileSync(path.join(messagesRoot, locale, 'pdf.json'), 'utf-8'))
}

const MARINE = { 'workshop.serviceType': 'marine' }
const AUTOMOTIVE = { 'workshop.serviceType': 'automotive' }

describe('invoice print labels', () => {
  it('prints the marine vocabulary for a marine workshop', async () => {
    const labels = await loadPrintLabels('en', MARINE)
    expect(labels.vehicle).toBe('Vessel')
    expect(labels.vin).toBe('HIN: {vin}')
    expect(labels.plate).toBe('Registration: {plate}')
    expect(labels.mileage).toBe('Engine Hours: {mileage}')
    expect(labels.km).toBe('hrs')
    expect(labels.mi).toBe('hrs')
  })

  it('leaves an automotive workshop exactly as the translation file has it', async () => {
    const en = pdfMessages('en')
    const expected = { ...en.invoice, ...en.common }
    expect(await loadPrintLabels('en', AUTOMOTIVE)).toEqual(expected)
    // No setting at all is an automotive workshop.
    expect(await loadPrintLabels('en', {})).toEqual(expected)

    const labels = await loadPrintLabels('en', {})
    expect(labels.vehicle).toBe('Vehicle')
    expect(labels.vin).toBe('VIN: {vin}')
    expect(labels.plate).toBe('Plate: {plate}')
    expect(labels.mileage).toBe('Mileage: {mileage}')
    expect(labels.km).toBe('km')
    expect(labels.mi).toBe('mi')
  })

  it("uses the locale's own unit for engine hours", async () => {
    expect((await loadPrintLabels('nb', MARINE)).km).toBe(
      pdfMessages('nb').invoice.mileageUnitMarine
    )
    expect((await loadPrintLabels('de', MARINE)).vin).toBe('HIN: {vin}')
    expect((await loadPrintLabels('de', MARINE)).vehicle).toBe('Wasserfahrzeug')
  })
})

describe('quote print labels', () => {
  it('takes the invoice marine wording, since a quote has none of its own', async () => {
    const labels = await loadPrintLabels('en', MARINE, 'quote')
    expect(labels.vehicle).toBe('Vessel')
    expect(labels.vin).toBe('HIN: {vin}')
    expect(labels.plate).toBe('Registration: {plate}')
    expect(labels.mileage).toBe('Engine Hours: {mileage}')
    expect(labels.km).toBe('hrs')
    // Still a quote.
    expect(labels.title).toBe('QUOTE')
  })

  it('leaves an automotive quote exactly as the translation file has it', async () => {
    const en = pdfMessages('en')
    const labels = await loadPrintLabels('en', AUTOMOTIVE, 'quote')
    expect(labels).toEqual({ ...en.invoice, ...en.quote, ...en.common })
    expect(labels.vehicle).toBe('Vehicle')
    expect(labels.vin).toBe('VIN: {vin}')
    expect(labels.plate).toBe('Plate: {plate}')
    expect(labels.km).toBe('km')
  })

  it("lets a quote's own marine key win over the invoice's", () => {
    const messages: PdfMessages = {
      invoice: { vin: 'VIN: {vin}', vinMarine: 'HIN: {vin}' },
      quote: { vin: 'VIN: {vin}', vinMarine: 'Hull: {vin}' },
    }
    expect(withMarineDocumentLabels({}, messages, 'quote').vin).toBe('Hull: {vin}')
    expect(withMarineDocumentLabels({}, messages, 'invoice').vin).toBe('HIN: {vin}')
  })
})

describe('marine keys in every locale', () => {
  const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

  const pairs: [section: string, automotive: string, marine: string][] = [
    ['invoice', 'vehicle', 'vehicleMarine'],
    ['invoice', 'vin', 'vinMarine'],
    ['invoice', 'plate', 'plateMarine'],
    ['invoice', 'mileage', 'mileageMarine'],
    ['invoice', 'km', 'mileageUnitMarine'],
    ['inspection', 'title', 'titleMarine'],
    ['inspection', 'vehicle', 'vehicleMarine'],
    ['inspection', 'vin', 'vinMarine'],
    ['inspection', 'plate', 'plateMarine'],
    ['inspection', 'mileage', 'mileageMarine'],
    ['inspection', 'footerText', 'footerTextMarine'],
  ]

  it.each(locales)('%s has every marine key, shaped like the one it replaces', (locale) => {
    const messages = pdfMessages(locale)
    for (const [section, automotive, marine] of pairs) {
      const where = `${locale}/pdf.json ${section}.${marine}`
      const value = messages[section]?.[marine]
      expect(typeof value, where).toBe('string')
      expect(value, where).not.toBe('')
      expect(placeholders(value), where).toEqual(placeholders(messages[section][automotive]))
      expect(value, `${where} must not use an em dash`).not.toContain('—')
    }
    for (const section of ['invoice', 'inspection']) {
      expect(messages[section].vinMarine).toContain('HIN')
      expect(messages[section].vehicleMarine).not.toBe(messages[section].vehicle)
    }
    const title = messages.inspection.titleMarine
    expect(title).toBe(title.toLocaleUpperCase(locale))
    expect(messages.inspection.titleMarine).not.toBe(messages.inspection.title)
  })
})
