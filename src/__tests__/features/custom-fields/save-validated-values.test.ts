/**
 * @vitest-environment node
 *
 * The server checks a record's custom field values itself. It used to write
 * whatever the browser sent: text in a number field, a choice that is not an
 * option, nothing in a required field, and all of it on a locked invoice.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  customFieldDefinition: { findMany: vi.fn() },
  customFieldValue: { findMany: vi.fn(), upsert: vi.fn() },
  serviceRecord: { count: vi.fn() },
  quote: { count: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db }))

vi.mock('@/lib/with-auth', () => ({
  withAuth: async (action: (ctx: { userId: string; organizationId: string }) => unknown) => {
    try {
      return { success: true, data: await action({ userId: 'u-1', organizationId: 'org-1' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/features', () => ({ requireFeature: vi.fn() }))

const lock = vi.hoisted(() => ({
  assertInvoiceEditable: vi.fn(),
  assertQuoteEditable: vi.fn(),
}))
vi.mock('@/lib/document-lock.server', () => lock)

import * as actions from '@/features/custom-fields/Actions/customFieldActions'
import { DocumentLockedError } from '@/lib/document-lock'

const { saveValidatedCustomFieldValues } = actions

const FIELDS = [
  { id: 'po', label: 'PO number', fieldType: 'text', options: null, required: true },
  { id: 'axles', label: 'Axles', fieldType: 'number', options: null, required: false },
  { id: 'due', label: 'Next test due', fieldType: 'date', options: null, required: false },
  { id: 'bay', label: 'Bay', fieldType: 'select', options: 'Bay 1, Bay 2', required: false },
  { id: 'loan', label: 'Courtesy car', fieldType: 'checkbox', options: null, required: true },
  { id: 'note', label: 'Handover notes', fieldType: 'textarea', options: null, required: false },
]

/**
 * What the server answers for these faults: each refused field with the
 * workshop's label for it, in the order the form shows the fields.
 */
const refusals = (faults: Record<string, string>) =>
  FIELDS.filter((field) => field.id in faults).map((field) => ({
    fieldId: field.id,
    label: field.label,
    issue: faults[field.id],
  }))

const VALID = {
  po: 'PO 4471',
  axles: '3',
  due: '2026-03-10',
  bay: 'Bay 2',
  loan: 'true',
  note: 'Call before\ncollection',
}

/** What was written, as field id to value. */
const written = () =>
  Object.fromEntries(
    db.customFieldValue.upsert.mock.calls.map(([args]) => [args.create.fieldId, args.create.value])
  )

beforeEach(() => {
  db.customFieldDefinition.findMany.mockReset().mockResolvedValue(FIELDS)
  db.customFieldValue.findMany.mockReset().mockResolvedValue([])
  db.customFieldValue.upsert.mockReset().mockReturnValue('upsert')
  db.serviceRecord.count.mockReset().mockResolvedValue(1)
  db.quote.count.mockReset().mockResolvedValue(1)
  db.$transaction.mockReset().mockResolvedValue([])
  lock.assertInvoiceEditable.mockReset().mockResolvedValue(undefined)
  lock.assertQuoteEditable.mockReset().mockResolvedValue(undefined)
})

describe('values that suit their fields', () => {
  it('are saved exactly as sent, one row per field, in one transaction', async () => {
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', VALID)

    expect(result).toEqual({ success: true, data: { saved: true } })
    expect(written()).toEqual(VALID)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.customFieldValue.upsert).toHaveBeenCalledWith({
      where: { fieldId_entityId: { fieldId: 'bay', entityId: 'job-1' } },
      create: { fieldId: 'bay', entityId: 'job-1', entityType: 'service_record', value: 'Bay 2' },
      update: { value: 'Bay 2' },
    })
  })

  it('may be empty where the field is not required', async () => {
    const result = await saveValidatedCustomFieldValues('q-1', 'quote', {
      ...VALID,
      axles: '',
      due: '',
      bay: '',
      note: '',
    })

    expect(result).toEqual({ success: true, data: { saved: true } })
    expect(written()).toMatchObject({ axles: '', due: '', bay: '', note: '' })
  })

  it('reads only this workshop’s active fields for that kind of record', async () => {
    await saveValidatedCustomFieldValues('q-1', 'quote', VALID)

    expect(db.customFieldDefinition.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', entityType: 'quote', isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
  })

  it('skips a field that is unknown or switched off, and saves the rest', async () => {
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {
      ...VALID,
      'switched-off': 'anything',
    })

    expect(result).toEqual({ success: true, data: { saved: true } })
    expect(written()).toEqual(VALID)
  })
})

describe('a value that does not suit its field', () => {
  it.each([
    ['text in a number field', { axles: 'three' }, { axles: 'number' }],
    ['a date that is not a calendar day', { due: '31/02/2026' }, { due: 'date' }],
    ['a choice that is not one of the options', { bay: 'Bay 9' }, { bay: 'option' }],
    ['a checkbox that is neither ticked nor unticked', { loan: 'maybe' }, { loan: 'checkbox' }],
    ['a text the length of a book', { note: 'x'.repeat(10001) }, { note: 'tooLong' }],
  ])('refuses %s and names the field', async (_what, bad, fieldErrors) => {
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {
      ...VALID,
      ...bad,
    })

    expect(result).toEqual({
      success: true,
      data: { saved: false, fieldErrors: refusals(fieldErrors) },
    })
  })

  it('writes none of the values, the good ones included', async () => {
    await saveValidatedCustomFieldValues('job-1', 'service_record', { ...VALID, axles: 'three' })

    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('names every field at fault at once', async () => {
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {
      ...VALID,
      po: '',
      axles: 'three',
      bay: 'Bay 9',
    })

    expect(result.data).toEqual({
      saved: false,
      fieldErrors: refusals({ po: 'required', axles: 'number', bay: 'option' }),
    })
  })

  it('refuses a value that is not text at all', async () => {
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {
      ...VALID,
      axles: 3 as unknown as string,
    })

    expect(result.success).toBe(false)
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })
})

describe('a required field', () => {
  it('refuses an empty value, and one of only spaces', async () => {
    for (const po of ['', '   ']) {
      const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {
        ...VALID,
        po,
      })
      expect(result.data).toEqual({ saved: false, fieldErrors: refusals({ po: 'required' }) })
    }
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('refuses it on a record that already holds it empty, as the form always has', async () => {
    db.customFieldValue.findMany.mockResolvedValue([{ fieldId: 'po', value: '' }])

    const result = await saveValidatedCustomFieldValues('old-job', 'service_record', {
      ...VALID,
      po: '',
    })

    expect(result.data).toEqual({ saved: false, fieldErrors: refusals({ po: 'required' }) })
  })

  it('takes an unticked checkbox: that is an answer', async () => {
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {
      ...VALID,
      loan: 'false',
    })

    expect(result.data).toEqual({ saved: true })
  })

  it('cannot be got around by leaving it out of the request', async () => {
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', { axles: '2' })

    expect(result.data).toEqual({ saved: false, fieldErrors: refusals({ po: 'required' }) })
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('may be left out when the record already holds a value for it', async () => {
    db.customFieldValue.findMany.mockResolvedValue([{ fieldId: 'po', value: 'PO 1' }])

    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', { axles: '2' })

    expect(result.data).toEqual({ saved: true })
    expect(written()).toEqual({ axles: '2' })
  })

  it('may be left out when the field has a default the record shows', async () => {
    db.customFieldDefinition.findMany.mockResolvedValue(
      FIELDS.map((field) => (field.id === 'po' ? { ...field, defaultValue: 'On account' } : field))
    )

    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', { axles: '2' })

    expect(result.data).toEqual({ saved: true })
    expect(written()).toEqual({ axles: '2' })
  })

  it('is still asked for when the record holds it empty and the request leaves it out', async () => {
    db.customFieldValue.findMany.mockResolvedValue([{ fieldId: 'po', value: '' }])

    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', { axles: '2' })

    expect(result.data).toEqual({ saved: false, fieldErrors: refusals({ po: 'required' }) })
  })

  it('leaves alone a field that is not required and not sent', async () => {
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {
      po: 'PO 7',
      loan: 'true',
    })

    expect(result.data).toEqual({ saved: true })
    expect(written()).toEqual({ po: 'PO 7', loan: 'true' })
  })
})

describe('what the person is told is missing', () => {
  const TWO_REQUIRED = [
    { id: 'contact', label: 'Fleet contact', fieldType: 'text', options: null, required: true },
    { id: 'colour', label: 'Colour', fieldType: 'text', options: null, required: false },
    { id: 'centre', label: 'Cost centre', fieldType: 'select', options: 'A, B', required: true },
  ]

  beforeEach(() => {
    db.customFieldDefinition.findMany.mockResolvedValue(TWO_REQUIRED)
  })

  it('names the one empty required field by the workshop\u2019s own label', async () => {
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {
      contact: '',
      colour: 'Blue',
      centre: 'A',
    })

    expect(result.data).toEqual({
      saved: false,
      fieldErrors: [{ fieldId: 'contact', label: 'Fleet contact', issue: 'required' }],
    })
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('names both when two are empty, in the order the form shows them', async () => {
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {
      centre: '',
      colour: 'Blue',
      contact: ' ',
    })

    expect(result.data).toEqual({
      saved: false,
      fieldErrors: [
        { fieldId: 'contact', label: 'Fleet contact', issue: 'required' },
        { fieldId: 'centre', label: 'Cost centre', issue: 'required' },
      ],
    })
  })

  it('names them to a client that sent neither, so a stale or hand-made request is told too', async () => {
    const result = await saveValidatedCustomFieldValues('q-1', 'quote', { colour: 'Blue' })

    expect(result.data).toEqual({
      saved: false,
      fieldErrors: [
        { fieldId: 'contact', label: 'Fleet contact', issue: 'required' },
        { fieldId: 'centre', label: 'Cost centre', issue: 'required' },
      ],
    })
  })

  it('saves once all of them are filled in', async () => {
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {
      contact: 'Dana',
      colour: '',
      centre: 'B',
    })

    expect(result.data).toEqual({ saved: true })
    expect(written()).toEqual({ contact: 'Dana', colour: '', centre: 'B' })
  })
})

describe('a value the record already holds', () => {
  it('is left alone even when it would not pass today, so the rest can be saved', async () => {
    // "Bay 3" was an option when it was chosen; the date came from an import.
    db.customFieldValue.findMany.mockResolvedValue([
      { fieldId: 'bay', value: 'Bay 3' },
      { fieldId: 'due', value: 'March 10, 2026' },
      { fieldId: 'po', value: 'PO 1' },
    ])

    const result = await saveValidatedCustomFieldValues('old-job', 'service_record', {
      ...VALID,
      bay: 'Bay 3',
      due: 'March 10, 2026',
      po: 'PO 2',
    })

    expect(result.data).toEqual({ saved: true })
    // Only what changed is written; the old values stay as they are.
    expect(written()).toEqual({ po: 'PO 2', axles: '3', loan: 'true', note: VALID.note })
  })

  it('has to pass once it is changed', async () => {
    db.customFieldValue.findMany.mockResolvedValue([{ fieldId: 'bay', value: 'Bay 3' }])

    const result = await saveValidatedCustomFieldValues('old-job', 'service_record', {
      ...VALID,
      bay: 'Bay 4',
    })

    expect(result.data).toEqual({ saved: false, fieldErrors: refusals({ bay: 'option' }) })
  })

  it('writes nothing when nothing changed', async () => {
    db.customFieldValue.findMany.mockResolvedValue(
      Object.entries(VALID).map(([fieldId, value]) => ({ fieldId, value }))
    )

    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', VALID)

    expect(result.data).toEqual({ saved: true })
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })
})

describe('a locked document', () => {
  it('refuses values on a locked work order, in the words every other edit gets', async () => {
    lock.assertInvoiceEditable.mockRejectedValue(new DocumentLockedError('sent'))

    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', VALID)

    expect(result).toEqual({
      success: false,
      error: 'This document is locked because it has been sent.',
    })
    expect(lock.assertInvoiceEditable).toHaveBeenCalledWith('job-1', 'org-1')
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('refuses values on a locked quote', async () => {
    lock.assertQuoteEditable.mockRejectedValue(new DocumentLockedError('accepted'))

    const result = await saveValidatedCustomFieldValues('q-1', 'quote', VALID)

    expect(result).toEqual({
      success: false,
      error: 'This document is locked because it has been accepted.',
    })
    expect(lock.assertQuoteEditable).toHaveBeenCalledWith('q-1', 'org-1')
    expect(lock.assertInvoiceEditable).not.toHaveBeenCalled()
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('lets a save through that changes no value, so what stays open on the page still saves', async () => {
    lock.assertInvoiceEditable.mockRejectedValue(new DocumentLockedError('sent'))
    db.customFieldValue.findMany.mockResolvedValue(
      Object.entries(VALID).map(([fieldId, value]) => ({ fieldId, value }))
    )

    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', VALID)

    expect(result).toEqual({ success: true, data: { saved: true } })
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('does not count a field nobody filled in, sent back as its default, as a change', async () => {
    lock.assertQuoteEditable.mockRejectedValue(new DocumentLockedError('accepted'))
    db.customFieldDefinition.findMany.mockResolvedValue(
      FIELDS.map((field) => (field.id === 'bay' ? { ...field, defaultValue: 'Bay 1' } : field))
    )
    db.customFieldValue.findMany.mockResolvedValue([{ fieldId: 'po', value: 'PO 1' }])

    // What the form sends for a record with one stored value: that value,
    // the default where there is one, and nothing for the rest.
    const result = await saveValidatedCustomFieldValues('q-1', 'quote', {
      po: 'PO 1',
      axles: '',
      due: '',
      bay: 'Bay 1',
      loan: '',
      note: '',
    })

    expect(result).toEqual({ success: true, data: { saved: true } })
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('does not ask a locked record for a required field it was locked without', async () => {
    lock.assertInvoiceEditable.mockRejectedValue(new DocumentLockedError('paid'))

    // "PO number" became required after this invoice was paid; nothing is stored.
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {
      po: '',
      axles: '',
    })

    expect(result).toEqual({ success: true, data: { saved: true } })
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('refuses the whole save when one value among unchanged ones is changed', async () => {
    lock.assertInvoiceEditable.mockRejectedValue(new DocumentLockedError('sent'))
    db.customFieldValue.findMany.mockResolvedValue(
      Object.entries(VALID).map(([fieldId, value]) => ({ fieldId, value }))
    )

    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {
      ...VALID,
      axles: '4',
    })

    expect(result).toEqual({
      success: false,
      error: 'This document is locked because it has been sent.',
    })
    expect(db.customFieldValue.upsert).not.toHaveBeenCalled()
  })

  it('refuses clearing a value on a locked record too', async () => {
    lock.assertQuoteEditable.mockRejectedValue(new DocumentLockedError('sent'))
    db.customFieldValue.findMany.mockResolvedValue([{ fieldId: 'note', value: 'Keys in office' }])

    const result = await saveValidatedCustomFieldValues('q-1', 'quote', { note: '' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('This document is locked because it has been sent.')
  })

  it('still fails on anything that is not the lock', async () => {
    lock.assertInvoiceEditable.mockRejectedValue(new Error('Something else'))

    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', {})

    expect(result).toEqual({ success: false, error: 'Something else' })
  })

  it('takes them again once an owner has unlocked it', async () => {
    // assertInvoiceEditable passes for an unlocked invoice; nothing else stands in the way.
    const result = await saveValidatedCustomFieldValues('job-1', 'service_record', VALID)

    expect(result.data).toEqual({ saved: true })
  })

  it('does not ask about the lock of a record that is not this workshop’s', async () => {
    db.serviceRecord.count.mockResolvedValue(0)

    const result = await saveValidatedCustomFieldValues('theirs', 'service_record', VALID)

    expect(result).toEqual({ success: false, error: 'Record not found' })
    expect(lock.assertInvoiceEditable).not.toHaveBeenCalled()
  })
})

describe('a tab opened before this change', () => {
  /** Every source file under a folder. */
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) {
        return name === 'generated' || name === '__tests__' ? [] : sources(path)
      }
      return /\.tsx?$/.test(name) ? [path] : []
    })
  }

  it('finds no action under the old name, so it is asked to reload instead of saving unchecked', () => {
    expect(Object.keys(actions)).not.toContain('saveCustomFieldValues')
    expect(Object.keys(actions)).toContain('saveValidatedCustomFieldValues')
  })

  it('has no caller left in the app', () => {
    const callers = sources(join(process.cwd(), 'src')).filter((path) =>
      /\bsaveCustomFieldValues\b/.test(readFileSync(path, 'utf8'))
    )
    expect(callers).toEqual([])
  })
})
