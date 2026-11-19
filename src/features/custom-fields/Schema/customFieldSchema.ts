import { z } from 'zod'

export const fieldTypes = ['text', 'number', 'date', 'select', 'checkbox', 'textarea'] as const
export type FieldType = (typeof fieldTypes)[number]

export const entityTypes = ['service_record', 'quote', 'vehicle', 'customer'] as const
export type EntityType = (typeof entityTypes)[number]

/**
 * The kinds whose fields describe a thing the workshop keeps, not a document
 * it writes. They arrived later, so nothing about them is on by default: a
 * workshop sees no trace of them until it defines its first field, their
 * values print only where a design places them, and the plan has to have
 * custom fields for them to show at all.
 */
export const recordEntityTypes = ['vehicle', 'customer'] as const
export type RecordEntityType = (typeof recordEntityTypes)[number]

export function isRecordEntityType(value: unknown): value is RecordEntityType {
  return typeof value === 'string' && (recordEntityTypes as readonly string[]).includes(value)
}

const baseFieldDefinitionSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_]+$/, 'Must be lowercase with underscores only'),
  label: z.string().min(1).max(100),
  fieldType: z.enum(fieldTypes),
  options: z.string().optional(),
  defaultValue: z.string().max(500).optional(),
  required: z.boolean().default(false),
  entityType: z.enum(entityTypes),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
})

// Attached to both create and update so .extend can't drop the rules.
const defaultValueRule = (
  data: { fieldType: FieldType; options?: string; defaultValue?: string },
  ctx: z.RefinementCtx
) => {
  const def = data.defaultValue
  if (!def) return
  if (data.fieldType === 'select') {
    const opts = (data.options || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    if (!opts.includes(def)) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultValue'],
        message: 'Default value must be one of the options',
      })
    }
  } else if (data.fieldType === 'checkbox') {
    if (def !== 'true' && def !== 'false') {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultValue'],
        message: 'Default value must be true or false',
      })
    }
  } else if (data.fieldType === 'number') {
    if (!Number.isFinite(Number(def))) {
      ctx.addIssue({
        code: 'custom',
        path: ['defaultValue'],
        message: 'Default value must be a number',
      })
    }
  }
}

export const createFieldDefinitionSchema = baseFieldDefinitionSchema.superRefine(defaultValueRule)

export const updateFieldDefinitionSchema = baseFieldDefinitionSchema
  .extend({
    id: z.string(),
  })
  .superRefine(defaultValueRule)

export type CreateFieldDefinitionInput = z.infer<typeof createFieldDefinitionSchema>
export type UpdateFieldDefinitionInput = z.infer<typeof updateFieldDefinitionSchema>
