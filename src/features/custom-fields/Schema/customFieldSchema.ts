import { z } from "zod";

export const fieldTypes = ["text", "number", "date", "select", "checkbox", "textarea"] as const;
export type FieldType = (typeof fieldTypes)[number];

export const entityTypes = ["service_record", "quote"] as const;
export type EntityType = (typeof entityTypes)[number];

export const createFieldDefinitionSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/, "Must be lowercase with underscores only"),
  label: z.string().min(1).max(100),
  fieldType: z.enum(fieldTypes),
  options: z.string().optional(),
  required: z.boolean().default(false),
  entityType: z.enum(entityTypes),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateFieldDefinitionSchema = createFieldDefinitionSchema.extend({
  id: z.string(),
});

export type CreateFieldDefinitionInput = z.infer<typeof createFieldDefinitionSchema>;
export type UpdateFieldDefinitionInput = z.infer<typeof updateFieldDefinitionSchema>;
