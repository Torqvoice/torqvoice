'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject, type PermissionInput } from '@/lib/permissions'
import { FeatureGatedError, getFeatures } from '@/lib/features'
import { completionTuning, createClient, getAiConfig } from '@/lib/ai'
import { describeAiError } from '@/lib/ai-error'
import { demoGuard } from '@/lib/demo'
import { type ImportEntity, fieldsFor } from '../Lib/fields'
import {
  type DuplicateRule,
  type ExistingData,
  type ImportOptions,
  type ImportPlan,
  type PlanSummary,
  type RowAction,
  type RowIssue,
  type RowPlan,
  planImport,
} from '../Lib/pipeline'
import {
  type ImportProgress,
  discardStagedImport,
  readImportProgress,
  readStagedImport,
  writeImportProgress,
} from '../Lib/staging'
import type { ColumnMapping } from '../Lib/suggest'
import {
  type DateFormat,
  type DecimalSeparator,
  detectDateFormat,
  detectDecimalSeparator,
} from '../Lib/normalize'

// ── Input shapes ──────────────────────────────────────────────────────────────

const entitySchema = z.enum(['customers', 'vehicles', 'services'])
const mappingSchema = z.record(z.string().regex(/^\d+$/), z.string())
const optionsSchema = z.object({
  entity: entitySchema,
  dateFormat: z.enum(['auto', 'DMY', 'MDY', 'YMD']),
  decimalSeparator: z.enum(['auto', '.', ',']),
  defaultCountryCode: z.string().max(6).nullable(),
  duplicates: z.enum(['skip', 'update', 'create']),
})
const overridesSchema = z.record(z.string().regex(/^\d+$/), z.enum(['create', 'update', 'skip']))
const tokenSchema = z.string().uuid()

const runInputSchema = z.object({
  token: tokenSchema,
  mapping: mappingSchema,
  options: optionsSchema,
  overrides: overridesSchema.default({}),
})
export type RunImportInput = z.infer<typeof runInputSchema>

/** Zod problems become a normal failed result instead of an exception on the client. */
function parseRun(raw: unknown): { input: RunImportInput } | { error: string } {
  const parsed = runInputSchema.safeParse(raw)
  if (parsed.success) return { input: parsed.data }
  return { error: parsed.error.issues[0]?.message ?? 'Invalid import request' }
}
const invalid = (error: string) => ({ success: false as const, error })

export type RowFilter = 'all' | 'create' | 'update' | 'skip' | 'error' | 'warning'
const PAGE_SIZE = 100

export interface PlanPage {
  rows: RowPlan[]
  total: number
  page: number
  pageSize: number
}

export interface DryRunResult {
  summary: PlanSummary
  limit: { maxCustomers: number; remaining: number; exceeded: boolean } | null
  page: PlanPage
}

export interface CommitResult {
  batchId: string
  created: number
  updated: number
  skipped: number
  failed: number
  /** Rows that failed at write time, with what went wrong. */
  failures: { index: number; issue: RowIssue }[]
}

function permissionsFor(entity: ImportEntity): PermissionInput[] {
  switch (entity) {
    case 'customers':
      return [{ action: PermissionAction.CREATE, subject: PermissionSubject.CUSTOMERS }]
    case 'vehicles':
      return [
        { action: PermissionAction.CREATE, subject: PermissionSubject.VEHICLES },
        { action: PermissionAction.CREATE, subject: PermissionSubject.CUSTOMERS },
      ]
    case 'services':
      return [
        { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
        { action: PermissionAction.CREATE, subject: PermissionSubject.VEHICLES },
        { action: PermissionAction.CREATE, subject: PermissionSubject.CUSTOMERS },
      ]
  }
}

/** Only the field keys the entity can carry survive; anything else is ignored. */
function sanitizeMapping(mapping: ColumnMapping, entity: ImportEntity): ColumnMapping {
  const allowed = new Set(fieldsFor(entity).map((f) => f.key))
  const out: ColumnMapping = {}
  for (const [col, key] of Object.entries(mapping)) if (allowed.has(key)) out[col] = key
  return out
}

async function loadExisting(organizationId: string, entity: ImportEntity): Promise<ExistingData> {
  const [customers, vehicles, records] = await Promise.all([
    db.customer.findMany({
      where: { organizationId },
      select: { id: true, name: true, customerNumber: true, email: true, phone: true },
    }),
    entity === 'customers'
      ? Promise.resolve([])
      : db.vehicle.findMany({
          where: { organizationId },
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            vin: true,
            licensePlate: true,
            customerId: true,
          },
        }),
    entity === 'services'
      ? db.serviceRecord.findMany({
          where: { organizationId, invoiceNumber: { not: null } },
          select: { invoiceNumber: true },
        })
      : Promise.resolve([]),
  ])
  return {
    customers,
    vehicles,
    invoiceNumbers: records.map((r) => r.invoiceNumber).filter((n): n is string => Boolean(n)),
  }
}

function pageOf(plan: ImportPlan, page: number, filter: RowFilter): PlanPage {
  const rows = plan.rows.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'warning') return r.warnings.length > 0
    return r.action === filter
  })
  const start = Math.max(0, page) * PAGE_SIZE
  return {
    rows: rows.slice(start, start + PAGE_SIZE),
    total: rows.length,
    page,
    pageSize: PAGE_SIZE,
  }
}

async function buildPlan(
  organizationId: string,
  input: RunImportInput
): Promise<{
  plan: ImportPlan
  staged: NonNullable<Awaited<ReturnType<typeof readStagedImport>>>
}> {
  const staged = await readStagedImport(organizationId, input.token)
  if (!staged) throw new Error('The uploaded file has expired. Upload it again.')
  const options: ImportOptions = { ...input.options, entity: staged.entity }
  const mapping = sanitizeMapping(input.mapping, staged.entity)
  const existing = await loadExisting(organizationId, staged.entity)
  const plan = planImport(staged.sheet.rows, mapping, options, existing, input.overrides)
  return { plan, staged }
}

async function customerLimit(organizationId: string, toCreate: number) {
  const features = await getFeatures(organizationId)
  const current = await db.customer.count({ where: { organizationId } })
  const remaining = Math.max(0, features.maxCustomers - current)
  return { maxCustomers: features.maxCustomers, remaining, exceeded: toCreate > remaining }
}

// ── Dry run ───────────────────────────────────────────────────────────────────

/**
 * Run the whole pipeline against the live database and report what would
 * happen, row by row, without writing anything. This is the wizard's preview
 * and it is exactly the plan the commit executes.
 */
export async function dryRunImport(raw: unknown, page = 0, filter: RowFilter = 'all') {
  const parsed = parseRun(raw)
  if ('error' in parsed) return invalid(parsed.error)
  const { input } = parsed
  return withAuth(
    async ({ organizationId }): Promise<DryRunResult> => {
      const { plan, staged } = await buildPlan(organizationId, input)
      const limit =
        plan.summary.customersToCreate > 0 || staged.entity === 'customers'
          ? await customerLimit(organizationId, plan.summary.customersToCreate)
          : null
      return { summary: plan.summary, limit, page: pageOf(plan, page, filter) }
    },
    { requiredPermissions: permissionsFor(input.options.entity) }
  )
}

/** A page of the dry-run plan, for browsing and filtering without recomputing on the client. */
export async function getImportPlanPage(raw: unknown, page: number, filter: RowFilter) {
  const parsed = parseRun(raw)
  if ('error' in parsed) return invalid(parsed.error)
  const { input } = parsed
  return withAuth(
    async ({ organizationId }) => {
      const { plan } = await buildPlan(organizationId, input)
      return pageOf(plan, page, filter)
    },
    { requiredPermissions: permissionsFor(input.options.entity) }
  )
}

/** The whole plan as CSV, one line per spreadsheet row, so it can be checked before anything is written. */
export async function getImportReportCsv(raw: unknown) {
  const parsed = parseRun(raw)
  if ('error' in parsed) return invalid(parsed.error)
  const { input } = parsed
  return withAuth(
    async ({ organizationId }) => {
      const { plan, staged } = await buildPlan(organizationId, input)
      const esc = (v: unknown) => {
        const s = v == null ? '' : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const lines = [
        [
          'Row',
          'Action',
          'Issues',
          'Customer',
          'Matched customer',
          'Vehicle',
          'Matched vehicle',
          'Service',
        ].join(','),
      ]
      for (const r of plan.rows) {
        const issues = [...r.errors, ...r.warnings]
          .map((i) => `${i.code}${i.value ? ` (${i.value})` : ''}`)
          .join('; ')
        const vehicle = r.vehicle
          ? [r.vehicle.year, r.vehicle.make, r.vehicle.model, r.vehicle.licensePlate]
              .filter(Boolean)
              .join(' ')
          : ''
        const service = r.service
          ? [r.service.date?.slice(0, 10), r.service.title].filter(Boolean).join(' ')
          : ''
        lines.push(
          [
            r.index + 2,
            r.action,
            issues,
            r.customer?.name ?? '',
            r.customerMatch?.name ?? '',
            vehicle,
            r.vehicleMatch?.label ?? '',
            service,
          ]
            .map(esc)
            .join(',')
        )
      }
      return {
        fileName: `${staged.fileName.replace(/\.[^.]+$/, '')}-dry-run.csv`,
        csv: lines.join('\r\n'),
      }
    },
    { requiredPermissions: permissionsFor(input.options.entity) }
  )
}

// ── Commit ────────────────────────────────────────────────────────────────────

const CHUNK = 100

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

interface CommitState {
  organizationId: string
  userId: string
  batchId: string
  entity: ImportEntity
  /** Row index → id of the customer/vehicle that row created, for rows that share it. */
  customerIds: Map<number, string>
  vehicleIds: Map<number, string>
  nextCustomerNumber: number
}

async function nextCustomerNumberStart(organizationId: string): Promise<number> {
  const existing = await db.customer.findMany({
    where: { organizationId, customerNumber: { not: null } },
    select: { customerNumber: true },
  })
  return (
    existing.reduce((acc, c) => {
      const n = Number.parseInt(c.customerNumber ?? '', 10)
      return Number.isFinite(n) && n > acc ? n : acc
    }, 1000) + 1
  )
}

/** Only the values the row actually carries; an update never blanks a field. */
function definedOnly<T extends Record<string, unknown>>(
  data: T
): { [K in keyof T]?: NonNullable<T[K]> } {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) if (v != null) out[k] = v
  return out as { [K in keyof T]?: NonNullable<T[K]> }
}

async function writeRow(tx: Tx, state: CommitState, row: RowPlan): Promise<void> {
  const { organizationId, userId, batchId, entity } = state

  // Customer
  let customerId: string | null = null
  if (row.customer) {
    if (row.customerMatch) {
      customerId = row.customerMatch.id
      if (entity === 'customers' && row.action === 'update') {
        await tx.customer.update({
          where: { id: customerId },
          data: definedOnly({
            name: row.customer.name,
            email: row.customer.email,
            phone: row.customer.phone,
            company: row.customer.company,
            address: row.customer.address,
            taxId: row.customer.taxId,
            notes: row.customer.notes,
          }),
        })
      }
    } else if (row.customerSameAs != null) {
      customerId = state.customerIds.get(row.customerSameAs) ?? null
    } else if (row.customer.name) {
      const customerNumber = row.customer.customerNumber ?? String(state.nextCustomerNumber++)
      const created = await tx.customer.create({
        data: {
          name: row.customer.name,
          customerNumber,
          email: row.customer.email,
          phone: row.customer.phone,
          company: row.customer.company,
          address: row.customer.address,
          taxId: row.customer.taxId,
          notes: row.customer.notes,
          userId,
          organizationId,
          importBatchId: batchId,
        },
        select: { id: true },
      })
      customerId = created.id
      state.customerIds.set(row.index, customerId)
    }
  }

  // Vehicle
  let vehicleId: string | null = null
  if (row.vehicle) {
    const v = row.vehicle
    if (row.vehicleMatch) {
      vehicleId = row.vehicleMatch.id
      if (entity === 'vehicles' && row.action === 'update') {
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: definedOnly({
            make: v.make,
            model: v.model,
            year: v.year,
            vin: v.vin,
            licensePlate: v.licensePlate,
            color: v.color,
            mileage: v.mileage,
            fuelType: v.fuelType,
            transmission: v.transmission,
            engineSize: v.engineSize,
            engineCode: v.engineCode,
            purchaseDate: v.purchaseDate ? new Date(v.purchaseDate) : null,
            purchasePrice: v.purchasePrice,
            customerId,
          }),
        })
      } else if (customerId) {
        // A history row names the owner: attach it when the car has none.
        await tx.vehicle.updateMany({
          where: { id: vehicleId, customerId: null },
          data: { customerId },
        })
      }
    } else if (row.vehicleSameAs != null) {
      vehicleId = state.vehicleIds.get(row.vehicleSameAs) ?? null
    } else if (v.make && v.model && v.year != null) {
      const created = await tx.vehicle.create({
        data: {
          make: v.make,
          model: v.model,
          year: v.year,
          vin: v.vin,
          licensePlate: v.licensePlate,
          color: v.color,
          mileage: v.mileage ?? row.service?.mileage ?? 0,
          // Unknown fuel and gearbox take the schema defaults rather than a guess stored as fact.
          ...(v.fuelType && { fuelType: v.fuelType }),
          ...(v.transmission && { transmission: v.transmission }),
          engineSize: v.engineSize,
          engineCode: v.engineCode,
          purchaseDate: v.purchaseDate ? new Date(v.purchaseDate) : null,
          purchasePrice: v.purchasePrice,
          customerId,
          userId,
          organizationId,
          importBatchId: batchId,
        },
        select: { id: true },
      })
      vehicleId = created.id
      state.vehicleIds.set(row.index, vehicleId)
    }
  }

  // Service record
  if (entity === 'services' && row.service && row.action === 'create') {
    const s = row.service
    if (!vehicleId || !s.date || !s.title)
      throw new Error('Service row is missing its vehicle, date or title')
    const total = s.total ?? 0
    await tx.serviceRecord.create({
      data: {
        title: s.title,
        description: s.description,
        type: 'maintenance',
        status: 'completed',
        cost: total,
        subtotal: total,
        totalAmount: total,
        mileage: s.mileage,
        serviceDate: new Date(s.date),
        invoiceNumber: s.invoiceNumber,
        invoiceDate: s.invoiceNumber ? new Date(s.date) : null,
        diagnosticNotes: s.notes,
        techName: s.technician,
        // Historical jobs are settled; without this they would show as receivables.
        manuallyPaid: total > 0,
        vehicleId,
        customerId,
        organizationId,
        importBatchId: batchId,
      },
    })
    if (s.mileage != null) {
      await tx.vehicle.updateMany({
        where: { id: vehicleId, mileage: { lt: s.mileage } },
        data: { mileage: s.mileage },
      })
    }
  }
}

/**
 * Execute the plan. Rows are written in chunks, each chunk in its own
 * transaction, so one bad row costs its chunk and not the whole file; the
 * result lists exactly which rows failed. Every created row carries the
 * batch id, which is what makes undo possible.
 */
export async function commitImport(raw: unknown) {
  const parsed = parseRun(raw)
  if ('error' in parsed) return invalid(parsed.error)
  const { input } = parsed
  return withAuth(
    async ({ organizationId, userId }): Promise<CommitResult> => {
      demoGuard()
      const { plan, staged } = await buildPlan(organizationId, input)
      const { entity } = staged

      if (plan.summary.customersToCreate > 0) {
        const limit = await customerLimit(organizationId, plan.summary.customersToCreate)
        if (limit.exceeded) {
          throw new FeatureGatedError(
            'maxCustomers',
            `Customer limit reached. You can import ${limit.remaining} more customer(s). Upgrade your plan for more.`
          )
        }
      }

      const batch = await db.importBatch.create({
        data: {
          organizationId,
          userId,
          source: staged.sheet.format === 'vcard' ? 'vcard' : (staged.presetId ?? 'spreadsheet'),
          entity,
          fileName: staged.fileName,
          totalRows: plan.summary.total,
          mapping: { mapping: input.mapping, options: input.options },
        },
        select: { id: true },
      })

      const state: CommitState = {
        organizationId,
        userId,
        batchId: batch.id,
        entity,
        customerIds: new Map(),
        vehicleIds: new Map(),
        nextCustomerNumber: await nextCustomerNumberStart(organizationId),
      }

      const runnable = plan.rows.filter((r) => r.action === 'create' || r.action === 'update')
      const failures: CommitResult['failures'] = []
      let created = 0
      let updated = 0
      let done = 0
      const total = runnable.length
      await writeImportProgress(organizationId, input.token, { phase: 'writing', done: 0, total })

      for (let start = 0; start < runnable.length; start += CHUNK) {
        const chunk = runnable.slice(start, start + CHUNK)
        try {
          await db.$transaction(
            async (tx) => {
              for (const row of chunk) await writeRow(tx, state, row)
            },
            { timeout: 60_000 }
          )
          for (const row of chunk) {
            if (row.action === 'create') created++
            else updated++
          }
        } catch (err) {
          // The transaction rolled the chunk back, so ids handed out inside it are void.
          for (const row of chunk) {
            state.customerIds.delete(row.index)
            state.vehicleIds.delete(row.index)
            failures.push({
              index: row.index,
              issue: {
                code: 'write_failed',
                value: err instanceof Error ? err.message.slice(0, 200) : undefined,
              },
            })
          }
        }
        done += chunk.length
        await writeImportProgress(organizationId, input.token, { phase: 'writing', done, total })
      }

      const skipped = plan.summary.skip
      const failed = plan.summary.error + failures.length
      await db.importBatch.update({
        where: { id: batch.id },
        data: { created, updated, skipped, failed },
      })
      await writeImportProgress(organizationId, input.token, {
        phase: 'done',
        done,
        total,
        batchId: batch.id,
      })
      await discardStagedImport(organizationId, input.token).catch(() => {
        // The staged file is a cache; the import is already recorded.
      })

      revalidatePath('/customers')
      revalidatePath('/vehicles')
      revalidatePath('/work-orders')
      revalidatePath('/settings/data')

      return { batchId: batch.id, created, updated, skipped, failed, failures }
    },
    {
      requiredPermissions: permissionsFor(input.options.entity),
      audit: ({ result }) => ({
        action: 'import.commit',
        entity: 'ImportBatch',
        entityId: result.batchId,
        details: {
          key: 'import_commit',
          params: {
            entity: input.options.entity,
            created: result.created,
            updated: result.updated,
          },
        },
      }),
    }
  )
}

export async function getImportProgress(token: string) {
  if (!tokenSchema.safeParse(token).success) return invalid('Invalid import token')
  return withAuth(async ({ organizationId }): Promise<ImportProgress | null> => {
    return readImportProgress(organizationId, token)
  })
}

// ── History and undo ──────────────────────────────────────────────────────────

export async function listImportBatches(limit = 20) {
  return withAuth(async ({ organizationId }) => {
    const batches = await db.importBatch.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    // What is still attached tells the user what an undo would remove now,
    // which can be fewer than were created if some were deleted since.
    const attached = await Promise.all(
      batches.map(async (b) => {
        if (b.status !== 'completed') return { customers: 0, vehicles: 0, serviceRecords: 0 }
        const [customers, vehicles, serviceRecords] = await Promise.all([
          db.customer.count({ where: { importBatchId: b.id } }),
          db.vehicle.count({ where: { importBatchId: b.id } }),
          db.serviceRecord.count({ where: { importBatchId: b.id } }),
        ])
        return { customers, vehicles, serviceRecords }
      })
    )
    return batches.map((b, i) => ({
      id: b.id,
      source: b.source,
      entity: b.entity as ImportEntity,
      fileName: b.fileName,
      status: b.status as 'completed' | 'undone',
      totalRows: b.totalRows,
      created: b.created,
      updated: b.updated,
      skipped: b.skipped,
      failed: b.failed,
      createdAt: b.createdAt.toISOString(),
      undoneAt: b.undoneAt?.toISOString() ?? null,
      attached: attached[i],
    }))
  })
}

/**
 * Remove everything a batch created. Rows the batch only updated or linked
 * are left as they are, since the previous values are not kept. Service
 * records go first so cascades do not surprise anyone.
 */
export async function undoImportBatch(batchId: string) {
  if (!batchId) return invalid('Import not found')
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      const batch = await db.importBatch.findFirst({ where: { id: batchId, organizationId } })
      if (!batch) throw new Error('Import not found')
      if (batch.status !== 'completed') throw new Error('This import has already been undone')

      const result = await db.$transaction(async (tx) => {
        const serviceRecords = await tx.serviceRecord.deleteMany({
          where: { importBatchId: batchId, organizationId },
        })
        const vehicles = await tx.vehicle.deleteMany({
          where: { importBatchId: batchId, organizationId },
        })
        const customers = await tx.customer.deleteMany({
          where: { importBatchId: batchId, organizationId },
        })
        await tx.importBatch.update({
          where: { id: batchId },
          data: { status: 'undone', undoneAt: new Date() },
        })
        return {
          serviceRecords: serviceRecords.count,
          vehicles: vehicles.count,
          customers: customers.count,
        }
      })

      revalidatePath('/customers')
      revalidatePath('/vehicles')
      revalidatePath('/work-orders')
      revalidatePath('/settings/data')
      return result
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.CUSTOMERS },
        { action: PermissionAction.DELETE, subject: PermissionSubject.VEHICLES },
      ],
      audit: ({ result }) => ({
        action: 'import.undo',
        entity: 'ImportBatch',
        entityId: batchId,
        details: {
          key: 'import_undo',
          params: { records: result.customers + result.vehicles + result.serviceRecords },
        },
      }),
    }
  )
}

// ── AI mapping ────────────────────────────────────────────────────────────────

const aiMappingSchema = z.object({
  mapping: z.record(z.string(), z.string().nullable()),
  dateFormat: z.enum(['DMY', 'MDY', 'YMD']).nullable().optional(),
  decimalSeparator: z.enum(['.', ',']).nullable().optional(),
})

/**
 * Ask the workshop's configured model to map the columns. It sees the
 * headers and a few sample values per column, never the whole file, and its
 * answer is filtered to the fields the entity allows before it reaches the
 * user, who still confirms every column.
 */
export async function suggestMappingWithAi(token: string) {
  if (!tokenSchema.safeParse(token).success) return invalid('Invalid import token')
  return withAuth(
    async ({
      organizationId,
    }): Promise<{
      mapping: ColumnMapping
      dateFormat: DateFormat
      decimalSeparator: DecimalSeparator
    }> => {
      const staged = await readStagedImport(organizationId, token)
      if (!staged) throw new Error('The uploaded file has expired. Upload it again.')
      const features = await getFeatures(organizationId)
      if (!features.ai)
        throw new FeatureGatedError('ai', 'AI features are not included in your plan.')

      const config = await getAiConfig(organizationId)
      const client = createClient(config)
      const fields = fieldsFor(staged.entity)
      const { columns, rows } = staged.sheet

      const columnsForPrompt = columns.map((name, i) => {
        const samples: string[] = []
        for (const row of rows) {
          const v = (row[i] ?? '').trim()
          if (v) samples.push(v.slice(0, 40))
          if (samples.length >= 4) break
        }
        return `${i}. "${name}" e.g. ${samples.map((s) => JSON.stringify(s)).join(', ') || '(empty)'}`
      })

      const system = [
        'You map spreadsheet columns to fields for a vehicle workshop system.',
        'Reply with JSON only, no prose, in this shape:',
        '{"mapping":{"<column index>":"<field key or null>"},"dateFormat":"DMY|MDY|YMD|null","decimalSeparator":".|,|null"}',
        'Use each field key at most once. Leave a column null when nothing fits.',
        'Headers may be in any language. Judge by both the header and the sample values.',
      ].join('\n')
      const user = [
        `Import type: ${staged.entity}`,
        'Available field keys:',
        ...fields.map((f) => `- ${f.key} (${f.type})`),
        '',
        'Columns:',
        ...columnsForPrompt,
      ].join('\n')

      let content = ''
      try {
        const response = await client.chat.completions.create({
          model: config.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          ...completionTuning(config, 1500, 0),
        })
        content = response.choices[0]?.message?.content ?? ''
      } catch (error) {
        throw new Error(describeAiError(error))
      }

      const json = content.match(/\{[\s\S]*\}/)?.[0]
      if (!json) throw new Error('The model did not return a mapping.')
      const parsed = aiMappingSchema.parse(JSON.parse(json))

      const allowed = new Set(fields.map((f) => f.key))
      const used = new Set<string>()
      const mapping: ColumnMapping = {}
      for (const [col, key] of Object.entries(parsed.mapping)) {
        if (!key || !allowed.has(key) || used.has(key)) continue
        if (!/^\d+$/.test(col) || Number(col) >= columns.length) continue
        mapping[col] = key
        used.add(key)
      }

      const byKey = new Map(fields.map((f) => [f.key, f]))
      const dateValues: string[] = []
      const numberValues: string[] = []
      for (const [col, key] of Object.entries(mapping)) {
        const type = byKey.get(key)?.type
        for (const row of rows.slice(0, 50)) {
          const v = row[Number(col)]
          if (!v) continue
          if (type === 'date') dateValues.push(v)
          if (type === 'number' || type === 'integer') numberValues.push(v)
        }
      }
      const detectedDate = detectDateFormat(dateValues)
      const detectedDecimal = detectDecimalSeparator(numberValues)

      return {
        mapping,
        dateFormat: detectedDate !== 'auto' ? detectedDate : (parsed.dateFormat ?? 'auto'),
        decimalSeparator:
          detectedDecimal !== 'auto' ? detectedDecimal : (parsed.decimalSeparator ?? 'auto'),
      }
    }
  )
}

export type { DuplicateRule, RowAction, RowPlan, RowIssue, PlanSummary }
