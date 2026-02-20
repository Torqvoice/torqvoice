import { z } from "zod";

export const templateItemSchema = z.object({
  name: z.string().min(1, "Item name is required"),
  sortOrder: z.number().int().min(0).default(0),
});

export const templateSectionSchema = z.object({
  name: z.string().min(1, "Section name is required"),
  sortOrder: z.number().int().min(0).default(0),
  items: z.array(templateItemSchema).min(1, "Section must have at least one item"),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  isDefault: z.boolean().default(false),
  sections: z.array(templateSectionSchema).min(1, "Template must have at least one section"),
});

export const updateTemplateSchema = createTemplateSchema.extend({
  id: z.string(),
});

export type TemplateItemInput = z.infer<typeof templateItemSchema>;
export type TemplateSectionInput = z.infer<typeof templateSectionSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
