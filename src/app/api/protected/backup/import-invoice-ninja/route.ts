import { NextRequest, NextResponse } from 'next/server'
import { assertContentLength } from '@/lib/backup/zip-guard'
import { rateLimit } from '@/lib/rate-limit'
import { getAuthContext } from '@/lib/get-auth-context'
import { isRestoring, RESTORE_IN_PROGRESS_MESSAGE } from '@/lib/backup/freeze'
import { db } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'
import {
  clearNextNumberSetting,
  JOB_NUMBER_SETTING_KEYS,
  jobNumberSequence,
} from '@/lib/job-number'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { toSafeWorkshopDate } from '@/lib/workshop-datetime'
import { mkdir, rm } from 'fs/promises'
import path from 'path'
import os from 'os'
import {
  extractEntry,
  openZip,
  readEntryJson,
  spoolUpload,
  type SpooledUpload,
} from '@/lib/backup/zip-file'
import { resolveWithinDir } from '@/lib/safe-path'
import { uploadsRoot } from '@/lib/upload-root'
import { prepareImportedFile, writeImportedFile } from '@/lib/backup/import-photo'
import { releaseFiles } from '@/lib/files/manager'

// Allow up to 5 minutes for large imports
export const maxDuration = 300

// ── Types for Invoice Ninja export ──────────────────────────────────────────

interface INClient {
  id: number
  hashed_id: string
  name: string
  number: string
  phone: string | null
  website: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country_id: string
  vat_number: string | null
  private_notes: string | null
  public_notes: string | null
  is_deleted: boolean
}

interface INClientContact {
  id: number
  client_id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  is_primary: number
}

interface INProduct {
  id: number
  hashed_id: string
  product_key: string
  notes: string | null
  cost: string
  price: string
  quantity: string
  in_stock_quantity: number
  product_image: string | null
  custom_value1: string | null
  custom_value2: string | null
  is_deleted: boolean
}

interface INLineItem {
  _id: string
  product_key: string
  quantity: number
  cost: number
  notes: string
  discount: number
  is_amount_discount: boolean
  line_total: number
  tax_amount: number
  gross_line_total: number
  type_id: string
}

interface INInvoice {
  id: number
  hashed_id: string
  client_id: string
  number: string
  date: string
  due_date: string | null
  status_id: number
  amount: string
  balance: string
  paid_to_date: string
  discount: string
  is_amount_discount: boolean
  line_items: INLineItem[]
  public_notes: string | null
  private_notes: string | null
  terms: string | null
  footer: string | null
  tax_name1: string
  tax_rate1: number
  uses_inclusive_taxes?: boolean
  is_deleted: boolean
  created_at: number
}

interface INPaymentable {
  paymentable_id: string
  amount: string
  paymentable_type: string
}

interface INPayment {
  id: number
  hashed_id: string
  client_id: string
  number: string
  date: string
  amount: string
  applied: string
  refunded: string
  status_id: number
  type_id: number
  private_notes: string | null
  transaction_reference: string | null
  is_manual: number
  paymentables: INPaymentable[]
  is_deleted: boolean
}

interface INDocument {
  id: number
  url: string
  name: string
  type: string
  size: number
  documentable_id: string
  documentable_type: string
  deleted_at: number | null
}

interface INBackup {
  clients: INClient[]
  client_contacts: INClientContact[]
  products: INProduct[]
  invoices: INInvoice[]
  payments: INPayment[]
  documents: INDocument[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0
  if (typeof value === 'number') return value
  const parsed = Number.parseFloat(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function buildAddress(client: INClient): string | null {
  const parts = [
    client.address1,
    client.address2,
    [client.postal_code, client.city].filter(Boolean).join(' '),
    client.state,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function getClientName(client: INClient, contacts: INClientContact[]): string {
  if (client.name && client.name.trim()) return client.name.trim()
  const primary = contacts.find((c) => c.client_id === client.hashed_id && c.is_primary === 1)
  if (primary) {
    const name = [primary.first_name, primary.last_name].filter(Boolean).join(' ').trim()
    if (name) return name
  }
  return `Client #${client.number || client.id}`
}

function getPaymentMethod(typeId: number): string {
  const methods: Record<number, string> = {
    1: 'bank_transfer',
    2: 'cash',
    4: 'credit_card',
    5: 'debit_card',
    6: 'bank_transfer',
    13: 'credit_card',
    14: 'credit_card',
    15: 'other',
    32: 'other',
  }
  return methods[typeId] || 'other'
}

// ── API Route ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, { limit: 5, windowMs: 60_000 })
  if (limited) return limited
  if (isDemoMode) {
    return NextResponse.json({ error: 'Data import is disabled on the demo.' }, { status: 403 })
  }

  const ctx = await getAuthContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // While a restore replaces this workshop's rows and files, nothing is written here.
  if (isRestoring(ctx.organizationId)) {
    return NextResponse.json({ error: RESTORE_IN_PROGRESS_MESSAGE }, { status: 409 })
  }
  // Reading or replacing the whole workshop is an owner's or admin's call.
  if (!ctx.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { organizationId, userId } = ctx
  const timeZone = await workshopTimeZone(organizationId)
  let tmpDir: string | null = null
  let upload: SpooledUpload | null = null
  // Every file this import writes, so a run that fails hands them back.
  const importedFileUrls: string[] = []

  try {
    // The zip goes to disk as it arrives; nothing of it is held in memory
    assertContentLength(request, 200 * 1024 * 1024)
    upload = await spoolUpload(request, 200 * 1024 * 1024, 'invoice-ninja-upload')

    if (upload.size < 100) {
      return NextResponse.json(
        { error: 'Uploaded file is too small to be a valid backup' },
        { status: 400 }
      )
    }

    const zip = await openZip(upload.path)
    let body: INBackup
    try {
      // Find and parse backup.json straight from the archive
      const backupEntry = zip.find('backup.json')
      if (!backupEntry) {
        return NextResponse.json({ error: 'No backup.json found in the zip file' }, { status: 400 })
      }
      body = await readEntryJson<INBackup>(zip, backupEntry)

      if (!body.clients || !Array.isArray(body.clients)) {
        return NextResponse.json(
          { error: 'Invalid Invoice Ninja export: missing clients array' },
          { status: 400 }
        )
      }

      // Extract the documents to a temp dir, one file at a time
      tmpDir = path.join(os.tmpdir(), `in-import-${Date.now()}`)
      await mkdir(tmpDir, { recursive: true })

      for (const entry of zip.entries) {
        if (entry.dir) continue
        // Only extract document files, not the full backup
        if (!entry.name.startsWith('documents/')) continue
        // Guard against zip-slip: `startsWith("documents/")` alone is bypassable
        // with `documents/../../..`, so verify the resolved path stays in tmpDir.
        const targetPath = resolveWithinDir(tmpDir, entry.name)
        if (!targetPath) {
          console.warn(`[import-invoice-ninja] Skipping unsafe zip entry: ${entry.name}`)
          continue
        }
        await extractEntry(zip, entry, targetPath)
      }
    } finally {
      zip.close()
    }
    await upload.remove()
    upload = null

    const clients = body.clients.filter((c) => !c.is_deleted)
    const contacts = body.client_contacts || []
    const products = (body.products || []).filter((p) => !p.is_deleted)
    const invoices = (body.invoices || []).filter((i) => !i.is_deleted)
    const payments = (body.payments || []).filter((p) => !p.is_deleted)
    const documents = (body.documents || []).filter((d) => !d.deleted_at)

    // Index documents by invoice hashed_id
    const docsByInvoice = new Map<string, INDocument[]>()
    for (const doc of documents) {
      if (doc.documentable_type !== 'invoices') continue
      const existing = docsByInvoice.get(doc.documentable_id) || []
      existing.push(doc)
      docsByInvoice.set(doc.documentable_id, existing)
    }

    // Imported jobs carry on the workshop's own numbering, in its format and
    // past every number already issued in it; see src/lib/job-number.ts.
    const numberingSettings = await db.appSetting.findMany({
      where: { organizationId, key: { in: [...JOB_NUMBER_SETTING_KEYS] } },
    })
    const sequence = await jobNumberSequence({
      organizationId,
      settings: Object.fromEntries(numberingSettings.map((s) => [s.key, s.value])),
      timeZone,
    })
    const invoicePrefix = sequence.prefix
    let nextInvoiceNum = sequence.first

    // Uploads directory for this org
    const uploadsBase = path.join(uploadsRoot(), organizationId)

    // Maps: IN hashed_id → Torqvoice ID
    const clientIdMap = new Map<string, string>()
    const invoiceIdMap = new Map<string, string>()

    const counts = {
      customers: 0,
      products: 0,
      invoices: 0,
      payments: 0,
      documents: 0,
    }

    // As long as the route may run: the photos are re-encoded inside.
    await db.$transaction(
      async (tx) => {
        // ── Create a single placeholder vehicle for all imported invoices ──

        // Invoice Ninja doesn't track vehicles, so all invoices go under
        // one placeholder. Users can reassign them to real vehicles later.
        const placeholderVehicle = await tx.vehicle.create({
          data: {
            make: 'Invoice Ninja',
            model: 'Import',
            year: new Date().getFullYear(),
            userId,
            organizationId,
          },
        })
        const placeholderVehicleId = placeholderVehicle.id

        // ── Import customers ────────────────────────────────────────────
        for (const client of clients) {
          const name = getClientName(client, contacts)
          const primaryContact = contacts.find(
            (c) => c.client_id === client.hashed_id && c.is_primary === 1
          )

          const customer = await tx.customer.create({
            data: {
              name,
              email: primaryContact?.email || null,
              phone: client.phone || primaryContact?.phone || null,
              address: buildAddress(client),
              notes: client.private_notes || null,
              userId,
              organizationId,
            },
          })

          clientIdMap.set(client.hashed_id, customer.id)
          counts.customers++
        }

        // ── Import products → inventory ─────────────────────────────────
        for (const product of products) {
          await tx.inventoryPart.create({
            data: {
              name: product.product_key,
              description: product.notes || null,
              unitCost: parseNum(product.price) || parseNum(product.cost),
              quantity: product.in_stock_quantity || 0,
              partNumber: product.custom_value1 || null,
              supplierUrl: product.custom_value2 || null,
              imageUrl: product.product_image || null,
              userId,
              organizationId,
            },
          })
          counts.products++
        }

        // ── Import invoices → service records ───────────────────────────
        for (const invoice of invoices) {
          const allItems = invoice.line_items || []
          const partItems = allItems.filter((li) => li.type_id === '1')
          const laborItems = allItems.filter((li) => li.type_id === '2')

          const amount = parseNum(invoice.amount)
          const discount = parseNum(invoice.discount)

          const itemNames = (invoice.line_items || [])
            .map((li) => li.product_key)
            .filter(Boolean)
            .slice(0, 3)
          const title = itemNames.length > 0 ? itemNames.join(', ') : `Invoice #${invoice.number}`

          const invoiceNumber = `${invoicePrefix}${nextInvoiceNum}`
          nextInvoiceNum++

          const partsTotal = partItems.reduce((sum, li) => sum + (li.line_total || 0), 0)
          const laborTotal = laborItems.reduce((sum, li) => sum + (li.line_total || 0), 0)
          const serviceDate = toSafeWorkshopDate(invoice.date, timeZone) ?? new Date()

          const record = await tx.serviceRecord.create({
            data: {
              organizationId,
              title,
              description: invoice.private_notes || invoice.public_notes || null,
              invoiceNotes: invoice.terms || null,
              type: 'repair',
              status: 'completed',
              cost: amount,
              serviceDate,
              // Reports and the calendar find a job by when it started; a
              // job without a start is in none of them.
              startDateTime: serviceDate,
              invoiceNumber,
              subtotal: partsTotal + laborTotal,
              discountType:
                discount > 0 ? (invoice.is_amount_discount ? 'fixed' : 'percentage') : null,
              discountValue: discount,
              discountAmount: invoice.is_amount_discount
                ? discount
                : (partsTotal + laborTotal) * (discount / 100),
              taxRate: parseNum(invoice.tax_rate1) || 0,
              taxAmount: parseNum(invoice.amount) - (partsTotal + laborTotal) + discount,
              // Invoice Ninja exposes `uses_inclusive_taxes` per invoice; fall
              // back to false (Invoice Ninja default) when the field is missing.
              taxInclusive: Boolean(invoice.uses_inclusive_taxes),
              totalAmount: amount,
              vehicleId: placeholderVehicleId,
            },
          })

          invoiceIdMap.set(invoice.hashed_id, record.id)

          // Create part line items
          let partsCreated = 0
          for (const li of partItems) {
            if (!li.product_key && !li.notes && li.line_total === 0) continue
            await tx.servicePart.create({
              data: {
                name: li.product_key || li.notes || 'Part',
                quantity: li.quantity || 1,
                unitPrice: li.cost || 0,
                total: li.line_total || 0,
                serviceRecordId: record.id,
              },
            })
            partsCreated++
          }

          // Create labor line items (tasks) — keep even if 0 hours/cost
          let laborCreated = 0
          for (const li of laborItems) {
            if (!li.product_key && !li.notes && li.line_total === 0) continue
            await tx.serviceLabor.create({
              data: {
                description: li.notes || li.product_key || 'Labor',
                hours: li.quantity || 0,
                rate: li.cost || 0,
                total: li.line_total || 0,
                serviceRecordId: record.id,
              },
            })
            laborCreated++
          }

          // ── Copy attached documents ─────────────────────────────────
          const invoiceDocs = docsByInvoice.get(invoice.hashed_id) || []
          for (const doc of invoiceDocs) {
            // Try to read the file from the extracted zip.
            // Guard against path traversal: doc.url comes from backup.json and
            // must not escape the extracted documents dir.
            const docPath = resolveWithinDir(path.join(tmpDir!, 'documents'), doc.url)
            if (!docPath) {
              console.warn(`[import-invoice-ninja] Skipping document with unsafe path: ${doc.url}`)
              continue
            }
            let fileData: Buffer
            try {
              const { readFileSync } = await import('fs')
              fileData = readFileSync(docPath)
            } catch {
              continue // File not found in zip
            }

            const targetDir = path.join(uploadsBase, 'services')
            await mkdir(targetDir, { recursive: true })
            // A photo is fitted and re-encoded on the way, so it lands at
            // the size an upload through the app would have, and the file is
            // stored under a generated name like an upload's, so the file
            // manager keeps track of it.
            const safeName = doc.name.replace(/[^a-zA-Z0-9._-]/g, '_')
            const prepared = await prepareImportedFile(`in-${invoice.number}-${safeName}`, fileData)
            const storedName = await writeImportedFile(targetDir, prepared.name, prepared.data)

            const fileUrl = `/api/protected/files/${organizationId}/services/${storedName}`
            importedFileUrls.push(fileUrl)

            await tx.serviceAttachment.create({
              data: {
                // The user's own name, with the extension the stored bytes now have.
                fileName: prepared.compressed ? doc.name.replace(/\.[^.]+$/, '.jpg') : doc.name,
                fileUrl,
                fileType: prepared.type,
                fileSize: prepared.data.length,
                category: prepared.type.startsWith('image/') ? 'image' : 'diagnostic',
                serviceRecordId: record.id,
              },
            })

            counts.documents++
          }

          counts.invoices++
        }

        // ── Import payments ─────────────────────────────────────────────
        for (const payment of payments) {
          if (!payment.paymentables || payment.paymentables.length === 0) continue

          for (const payable of payment.paymentables) {
            if (payable.paymentable_type !== 'invoices') continue

            const serviceRecordId = invoiceIdMap.get(payable.paymentable_id)
            if (!serviceRecordId) continue

            await tx.payment.create({
              data: {
                amount: parseNum(payable.amount),
                date: toSafeWorkshopDate(payment.date, timeZone) ?? new Date(),
                method: getPaymentMethod(payment.type_id),
                note: payment.private_notes || null,
                externalId: payment.transaction_reference || null,
                serviceRecordId,
              },
            })

            counts.payments++
          }
        }
        // "Next invoice number" was used up by the first imported job.
        if (sequence.usesNextNumberSetting && nextInvoiceNum > sequence.first) {
          await clearNextNumberSetting(organizationId, tx)
        }
      },
      { timeout: maxDuration * 1000 }
    )

    return NextResponse.json({
      success: true,
      imported: counts,
    })
  } catch (error) {
    console.error('[import-invoice-ninja] Error:', error)
    console.error('[backup import]', error)
    // The rows were rolled back, so nothing uses the files this run wrote.
    await releaseFiles(importedFileUrls, { organizationId, reason: 'import failed' }).catch((err) =>
      console.error('[backup import] could not release imported files:', err)
    )
    const message = 'Import failed'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    if (tmpDir) {
      rm(tmpDir, { recursive: true, force: true }).catch(() => {
        /* ignore cleanup errors */
      })
    }
    // The upload is still there when the request failed before it was extracted.
    upload?.remove().catch(() => {
      /* ignore cleanup errors */
    })
  }
}
