import { z } from 'zod'

/**
 * A check on a template. `inputType` decides which of the other fields matter:
 * `measurement` uses unit/min/max/defaultSeverity, `choice` uses choices, and
 * `condition`/`text` use none of them. The extra fields are kept regardless so
 * switching type back and forth in the builder does not lose what was typed.
 */
export const templateItemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  description: z.string().optional(),
  code: z.string().optional(),
  sortOrder: z.number().int().min(0).default(0),
  inputType: z.enum(['condition', 'measurement', 'text', 'choice']).default('condition'),
  unit: z.string().optional(),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
  choices: z.array(z.string()).default([]),
  required: z.boolean().default(false),
  photoRequired: z.boolean().default(false),
  defaultSeverity: z.enum(['attention', 'fail', 'dangerous']).nullable().optional(),
  defectSuggestions: z.array(z.string()).default([]),
})

export const templateSectionSchema = z.object({
  name: z.string().min(1, 'Section name is required'),
  description: z.string().optional(),
  code: z.string().optional(),
  sortOrder: z.number().int().min(0).default(0),
  items: z.array(templateItemSchema).min(1, 'Section must have at least one item'),
})

export const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  isDefault: z.boolean().default(false),
  // ISO-3166 alpha-2, or null when the checklist is not tied to one country.
  country: z.string().length(2).nullable().optional(),
  standard: z.string().optional(),
  severityScale: z.enum(['eu', 'basic']).default('eu'),
  sections: z.array(templateSectionSchema).min(1, 'Template must have at least one section'),
})

export const updateTemplateSchema = createTemplateSchema.extend({
  id: z.string(),
})

export type TemplateItemInput = z.infer<typeof templateItemSchema>
export type TemplateSectionInput = z.infer<typeof templateSectionSchema>
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>
