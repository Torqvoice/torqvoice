/**
 * The inspection certificate's labels, shared by the workshop's download and
 * the customer's public link. A marine workshop's certificate is a vessel
 * inspection with HIN, registration and engine hours; a garage's is unchanged.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectionPrintLabels } from '@/features/inspections/Lib/inspectionLabels'

function pdfMessages(locale: string): Record<string, Record<string, string>> {
  return JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'messages', locale, 'pdf.json'), 'utf-8')
  )
}

describe('inspection print labels', () => {
  it('prints a vessel inspection for a marine workshop', () => {
    const labels = inspectionPrintLabels(pdfMessages('en'), { 'workshop.serviceType': 'marine' })
    expect(labels.title).toBe('VESSEL INSPECTION')
    expect(labels.vehicle).toBe('Vessel')
    expect(labels.vin).toBe('HIN: {vin}')
    expect(labels.plate).toBe('Registration: {plate}')
    expect(labels.mileage).toBe('Engine Hours: {mileage}')
    expect(labels.footerText).toBe('Vessel Inspection · {shopName}')
    // The rest of the certificate is untouched.
    expect(labels.customer).toBe('Customer')
    expect(labels.poweredBy).toBe('Powered by')
  })

  it('leaves an automotive workshop exactly as the translation file has it', () => {
    const en = pdfMessages('en')
    const expected = { ...en.inspection, ...en.common }
    expect(inspectionPrintLabels(en, {})).toEqual(expected)
    const labels = inspectionPrintLabels(en, { 'workshop.serviceType': 'automotive' })
    expect(labels).toEqual(expected)
    expect(labels.title).toBe('VEHICLE INSPECTION')
    expect(labels.vehicle).toBe('Vehicle')
    expect(labels.vin).toBe('VIN: {vin}')
    expect(labels.plate).toBe('Plate: {plate}')
    expect(labels.mileage).toBe('Mileage: {mileage}')
    expect(labels.footerText).toBe('Vehicle Inspection — {shopName}')
  })

  it('translates the marine wording', () => {
    const labels = inspectionPrintLabels(pdfMessages('nb'), { 'workshop.serviceType': 'marine' })
    expect(labels.title).toBe('FARTØYKONTROLL')
    expect(labels.vehicle).toBe('Fartøy')
    expect(labels.vin).toBe('HIN: {vin}')
    expect(labels.mileage).toBe('Motortimer: {mileage}')
  })

  it('does not mutate the translation file it was given', () => {
    const en = pdfMessages('en')
    inspectionPrintLabels(en, { 'workshop.serviceType': 'marine' })
    expect(en.inspection.title).toBe('VEHICLE INSPECTION')
  })
})
