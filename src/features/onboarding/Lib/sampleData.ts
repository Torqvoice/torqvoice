import { db } from '@/lib/db'
import { resolveInvoicePrefix } from '@/lib/invoice-utils'
import type { SampleDataIds } from './onboardingKeys'
import type { Translator } from './onboardingDefaults'

/** The slice of an inspection template the seed copies items from. */
interface TemplateForSeed {
  id: string
  severityScale: string
  country: string | null
  sections: {
    name: string
    code: string | null
    items: {
      name: string
      description: string | null
      code: string | null
      sortOrder: number
      inputType: string
      unit: string | null
      minValue: number | null
      maxValue: number | null
      choices: string[]
      required: boolean
      photoRequired: boolean
      defaultSeverity: string | null
      defectSuggestions: string[]
    }[]
  }[]
}

const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

const daysAhead = (n: number) => daysAgo(-n)

/**
 * Seeds a small, clearly-labelled demo dataset for a brand-new organization:
 * three customers, four vehicles, three work orders in different states (one
 * completed with parts and labor), one sent quote and one inspection in
 * progress. Every name carries the translated sample prefix, and every
 * created id is returned so removal can delete exactly this set.
 *
 * Invoice and quote numbers follow the same default numbering the real
 * actions use, so real records created afterwards simply continue the
 * sequence.
 */
export async function seedSampleData(
  organizationId: string,
  userId: string,
  t: Translator,
  template: TemplateForSeed
): Promise<SampleDataIds> {
  const prefix = t('sample.prefix')
  const label = (name: string) => `${prefix} ${name}`
  const invoicePrefix = resolveInvoicePrefix('{year}-')
  const hourlyRate = 95

  return db.$transaction(async (tx) => {
    // ── Customers ────────────────────────────────────────────────────────
    const anna = await tx.customer.create({
      data: {
        name: label('Anna Bergström'),
        customerNumber: '1',
        email: 'anna.sample@example.com',
        phone: '+1 555 0101',
        userId,
        organizationId,
      },
    })
    const marco = await tx.customer.create({
      data: {
        name: label('Marco Rossi'),
        customerNumber: '2',
        email: 'marco.sample@example.com',
        phone: '+1 555 0102',
        userId,
        organizationId,
      },
    })
    const nordvik = await tx.customer.create({
      data: {
        name: label('Nordvik Logistics'),
        customerNumber: '3',
        company: label('Nordvik Logistics'),
        email: 'fleet.sample@example.com',
        phone: '+1 555 0103',
        userId,
        organizationId,
      },
    })

    // ── Vehicles ─────────────────────────────────────────────────────────
    const golf = await tx.vehicle.create({
      data: {
        make: 'Volkswagen',
        model: 'Golf',
        year: 2018,
        licensePlate: 'SAMPLE-1',
        mileage: 86500,
        fuelType: 'gasoline',
        customerId: anna.id,
        userId,
        organizationId,
      },
    })
    const rav4 = await tx.vehicle.create({
      data: {
        make: 'Toyota',
        model: 'RAV4',
        year: 2020,
        licensePlate: 'SAMPLE-2',
        mileage: 45200,
        fuelType: 'hybrid',
        customerId: marco.id,
        userId,
        organizationId,
      },
    })
    const transit = await tx.vehicle.create({
      data: {
        make: 'Ford',
        model: 'Transit',
        year: 2016,
        licensePlate: 'SAMPLE-3',
        mileage: 158000,
        fuelType: 'diesel',
        customerId: nordvik.id,
        userId,
        organizationId,
      },
    })
    const bmw = await tx.vehicle.create({
      data: {
        make: 'BMW',
        model: '320d',
        year: 2019,
        licensePlate: 'SAMPLE-4',
        mileage: 98400,
        fuelType: 'diesel',
        customerId: anna.id,
        userId,
        organizationId,
      },
    })

    // ── Work orders ──────────────────────────────────────────────────────
    // Completed job with parts + labor, invoiced and paid.
    const oilParts = [
      { name: t('sample.parts.oilFilter'), quantity: 1, unitPrice: 14.9, total: 14.9 },
      { name: t('sample.parts.engineOil'), quantity: 4, unit: 'l', unitPrice: 11.5, total: 46 },
    ]
    const oilLaborTotal = 0.8 * hourlyRate
    const oilSubtotal = oilParts.reduce((sum, p) => sum + p.total, 0) + oilLaborTotal
    const oilJob = await tx.serviceRecord.create({
      data: {
        title: label(t('sample.oilService')),
        type: 'maintenance',
        status: 'completed',
        mileage: 86200,
        serviceDate: daysAgo(12),
        invoiceDate: daysAgo(12),
        invoiceNumber: `${invoicePrefix}1001`,
        subtotal: oilSubtotal,
        totalAmount: oilSubtotal,
        cost: oilSubtotal,
        manuallyPaid: true,
        vehicleId: golf.id,
        organizationId,
        partItems: { create: oilParts },
        laborItems: {
          create: [
            {
              description: t('sample.oilService'),
              hours: 0.8,
              rate: hourlyRate,
              total: oilLaborTotal,
              pricingType: 'hourly',
            },
          ],
        },
      },
    })

    // Job on the lift right now.
    const brakeLaborTotal = 1.5 * hourlyRate
    const brakeSubtotal = 62 + brakeLaborTotal
    const brakeJob = await tx.serviceRecord.create({
      data: {
        title: label(t('sample.brakeJob')),
        type: 'repair',
        status: 'in-progress',
        mileage: 45200,
        serviceDate: new Date(),
        startDateTime: new Date(),
        invoiceNumber: `${invoicePrefix}1002`,
        subtotal: brakeSubtotal,
        totalAmount: brakeSubtotal,
        cost: brakeSubtotal,
        vehicleId: rav4.id,
        organizationId,
        partItems: {
          create: [
            {
              name: t('sample.parts.brakePads'),
              quantity: 1,
              unitPrice: 62,
              total: 62,
            },
          ],
        },
        laborItems: {
          create: [
            {
              description: t('sample.brakeJob'),
              hours: 1.5,
              rate: hourlyRate,
              total: brakeLaborTotal,
              pricingType: 'hourly',
            },
          ],
        },
      },
    })

    // Booked but not started.
    const annualJob = await tx.serviceRecord.create({
      data: {
        title: label(t('sample.annualService')),
        type: 'maintenance',
        status: 'pending',
        serviceDate: daysAhead(3),
        startDateTime: daysAhead(3),
        invoiceNumber: `${invoicePrefix}1003`,
        vehicleId: transit.id,
        organizationId,
      },
    })

    // ── Quote ────────────────────────────────────────────────────────────
    const quoteLaborTotal = 2 * hourlyRate
    const quoteSubtotal = 178 + quoteLaborTotal
    const quote = await tx.quote.create({
      data: {
        quoteNumber: 'QT-1001',
        title: label(t('sample.quoteTitle')),
        status: 'sent',
        validUntil: daysAhead(30),
        subtotal: quoteSubtotal,
        totalAmount: quoteSubtotal,
        customerId: anna.id,
        vehicleId: bmw.id,
        userId,
        organizationId,
        partItems: {
          create: [
            {
              name: t('sample.parts.shockAbsorber'),
              quantity: 2,
              unitPrice: 89,
              total: 178,
            },
          ],
        },
        laborItems: {
          create: [
            {
              description: t('sample.quoteTitle'),
              hours: 2,
              rate: hourlyRate,
              total: quoteLaborTotal,
              pricingType: 'hourly',
            },
          ],
        },
      },
    })

    // ── Inspection ───────────────────────────────────────────────────────
    // Items are copied from the installed default template exactly like
    // createInspection does; the first few carry results so the inspection
    // screen shows what a partially-done checklist looks like.
    const inspection = await tx.inspection.create({
      data: {
        status: 'in_progress',
        mileage: 86500,
        severityScale: template.severityScale,
        country: template.country,
        vehicleId: golf.id,
        templateId: template.id,
        organizationId,
      },
    })

    let inspected = 0
    const items = template.sections.flatMap((section, sIdx) =>
      section.items.map((item) => {
        // Grade the first handful of plain condition checks, leave the rest
        // untouched; one gets flagged so the attention state is visible too.
        let condition = 'not_inspected'
        let notes: string | null = null
        if (item.inputType === 'condition' && inspected < 5) {
          inspected += 1
          if (inspected === 4) {
            condition = 'attention'
            notes = t('sample.inspectionNote')
          } else {
            condition = 'pass'
          }
        }
        return {
          name: item.name,
          section: section.name,
          sectionCode: section.code,
          description: item.description,
          code: item.code,
          sortOrder: sIdx * 1000 + item.sortOrder,
          inputType: item.inputType,
          unit: item.unit,
          minValue: item.minValue,
          maxValue: item.maxValue,
          choices: item.choices,
          required: item.required,
          photoRequired: item.photoRequired,
          defaultSeverity: item.defaultSeverity,
          defectSuggestions: item.defectSuggestions,
          condition,
          notes,
          inspectionId: inspection.id,
        }
      })
    )
    if (items.length > 0) {
      await tx.inspectionItem.createMany({ data: items })
    }

    return {
      customers: [anna.id, marco.id, nordvik.id],
      vehicles: [golf.id, rav4.id, transit.id, bmw.id],
      serviceRecords: [oilJob.id, brakeJob.id, annualJob.id],
      quotes: [quote.id],
      inspections: [inspection.id],
    }
  })
}
