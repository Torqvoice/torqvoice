import { normalizeWarranty, WARRANTY_NONE } from '@/lib/warranty'
import type { ConcernRowLike } from './concernStory'

/**
 * The fields of a work order a save writes one by one, as the page sends them.
 *
 * With the same job open in two tabs, each tab sends only the fields it
 * changed (saveServiceRecordChanges): a field is changed when what the page
 * holds differs from what the server last told this page, so a note saved in
 * the other tab is never written back over by a copy read before it. Lines of
 * parts and labour are not here: they have their own reconciliation (see the
 * line lists in useServiceFormState).
 *
 * The discount's type and value, and the warranty's four columns, move
 * together, so each is one field here.
 */
export const WORK_ORDER_FIELDS = [
  'title',
  'type',
  'status',
  'mileage',
  'description',
  'diagnosticNotes',
  'invoiceNotes',
  'invoiceNumber',
  'invoiceDate',
  'invoiceDueDate',
  'taxRate',
  'discount',
  'warranty',
  'concerns',
] as const

export type WorkOrderField = (typeof WORK_ORDER_FIELDS)[number]

export interface ConcernForSave {
  id?: string
  description: string
  sortOrder: number
  cause: string | null
  correction: string | null
  confirmation: string | null
  confirmed: boolean
}

export interface WorkOrderFieldValues {
  title: string
  type: string
  status: string
  mileage: number | null
  description: string
  diagnosticNotes: string
  invoiceNotes: string
  invoiceNumber: string
  invoiceDate: string
  invoiceDueDate: string
  taxRate: number
  discount: { discountType: string; discountValue: number }
  warranty: {
    warrantyStatus: string
    warrantyMonths: number
    warrantyMileage: number
    warrantyNotes: string
  }
  concerns: ConcernForSave[]
}

/** The editor reports an emptied box as one empty paragraph. */
export function richText(html: string): string {
  return html === '<p></p>' ? '' : html
}

/** Blank rows are somebody halfway through typing, not a concern. */
export function concernsForSave(rows: readonly ConcernRowLike[]): ConcernForSave[] {
  return rows
    .filter((c) => c.description.trim())
    .map((c, index) => ({
      id: c.id,
      description: c.description.trim(),
      sortOrder: index,
      cause: c.cause ?? null,
      correction: c.correction ?? null,
      confirmation: c.confirmation ?? null,
      confirmed: c.confirmed ?? false,
    }))
}

export function discountForSave(type: string | null | undefined, value: number | null | undefined) {
  const discountType = type || 'none'
  return { discountType, discountValue: discountType === 'none' ? 0 : (value ?? 0) }
}

/** Cleared fields go as 'none', 0 and '' so the action clears them. */
export function warrantyForSave(input: {
  warrantyStatus?: string | null
  warrantyMonths?: number | null
  warrantyMileage?: number | null
  warrantyNotes?: string | null
}) {
  return {
    warrantyStatus: input.warrantyStatus ?? WARRANTY_NONE,
    warrantyMonths: input.warrantyMonths ?? 0,
    warrantyMileage: input.warrantyMileage ?? 0,
    warrantyNotes: input.warrantyNotes ?? '',
  }
}

/** What the server holds, in the shape the page sends it back. */
export function savedWorkOrderFields(
  saved: {
    title: string
    type?: string | null
    status?: string | null
    mileage?: number | null
    description?: string | null
    diagnosticNotes?: string | null
    invoiceNotes?: string | null
    invoiceNumber?: string | null
    invoiceDate?: string | null
    invoiceDueDate?: string | null
    taxRate?: number | null
    discountType?: string | null
    discountValue?: number | null
    warrantyStatus?: string | null
    warrantyMonths?: number | null
    warrantyMileage?: number | null
    warrantyNotes?: string | null
    concerns?: readonly ConcernRowLike[] | null
  },
  defaultTaxRate: number
): WorkOrderFieldValues {
  return {
    title: saved.title ?? '',
    type: saved.type || 'maintenance',
    status: saved.status || 'completed',
    mileage: saved.mileage ?? null,
    description: richText(saved.description || ''),
    diagnosticNotes: richText(saved.diagnosticNotes || ''),
    invoiceNotes: richText(saved.invoiceNotes || ''),
    invoiceNumber: saved.invoiceNumber || '',
    invoiceDate: saved.invoiceDate || '',
    invoiceDueDate: saved.invoiceDueDate || '',
    taxRate: saved.taxRate ?? defaultTaxRate,
    discount: discountForSave(saved.discountType, saved.discountValue),
    warranty: warrantyForSave(normalizeWarranty(saved)),
    concerns: concernsForSave(saved.concerns ?? []),
  }
}

/**
 * Two values of a field compared as the server would store them. A concern is
 * compared without its id: the save that creates one gives it its id, and the
 * concern is the same one before and after.
 */
export function sameFieldValue(field: WorkOrderField, a: unknown, b: unknown): boolean {
  if (field === 'concerns') {
    const strip = (list: unknown) =>
      JSON.stringify(((list as ConcernForSave[]) ?? []).map(({ id: _id, ...rest }) => rest))
    return strip(a) === strip(b)
  }
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * The fields the page holds differently from what the server last told it:
 * the ones this tab changed. A field the page does not draw (absent from
 * `current`) is not one of them.
 */
export function changedWorkOrderFields(
  synced: WorkOrderFieldValues,
  current: Partial<WorkOrderFieldValues>
): WorkOrderField[] {
  return WORK_ORDER_FIELDS.filter(
    (field) => field in current && !sameFieldValue(field, current[field], synced[field])
  )
}

/**
 * What a page does with the job as the server now has it (a refresh after a
 * save somewhere else), field by field, against what it last knew (`synced`)
 * and what it holds now (`current`):
 *
 * - not changed anywhere: nothing;
 * - changed elsewhere, not here: the page takes the new value (`adopt`); and
 *   when this page had saved that field itself, its change was replaced by a
 *   later one, which it is told (`replaced`);
 * - changed here and elsewhere to different values: the page keeps its own,
 *   which is saved later and so wins, and is told (`kept`);
 * - changed here and elsewhere to the same value: nothing left to do.
 */
export function mergeWorkOrderFields(args: {
  synced: WorkOrderFieldValues
  current: Partial<WorkOrderFieldValues>
  server: WorkOrderFieldValues
  savedHere: ReadonlySet<WorkOrderField>
}): { adopt: WorkOrderField[]; kept: WorkOrderField[]; replaced: WorkOrderField[] } {
  const { synced, current, server, savedHere } = args
  const adopt: WorkOrderField[] = []
  const kept: WorkOrderField[] = []
  const replaced: WorkOrderField[] = []
  for (const field of WORK_ORDER_FIELDS) {
    if (sameFieldValue(field, server[field], synced[field])) continue
    const mine = field in current ? current[field] : synced[field]
    if (sameFieldValue(field, mine, server[field])) continue
    if (sameFieldValue(field, mine, synced[field])) {
      adopt.push(field)
      if (savedHere.has(field)) replaced.push(field)
    } else {
      kept.push(field)
    }
  }
  return { adopt, kept, replaced }
}
