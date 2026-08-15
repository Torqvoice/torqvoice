import { z } from "zod";
import { registerInstaller } from "@/lib/packages/registry";

/**
 * The inspection-template content type.
 *
 * This is the payload shape, the review summary and the sanitising rule — the
 * database work lives in the server action, so this file stays importable from
 * the client for previewing a file before anything is sent.
 */

export const INSPECTION_TEMPLATE_TYPE = "inspection-template";

export const packagedItemSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().max(2000).nullish(),
  code: z.string().max(40).nullish(),
  inputType: z.enum(["condition", "measurement", "text", "choice"]).default("condition"),
  unit: z.string().max(20).nullish(),
  minValue: z.number().nullish(),
  maxValue: z.number().nullish(),
  choices: z.array(z.string().max(200)).max(50).default([]),
  required: z.boolean().default(false),
  photoRequired: z.boolean().default(false),
  defaultSeverity: z.enum(["attention", "fail", "dangerous"]).nullish(),
  defectSuggestions: z.array(z.string().max(500)).max(50).default([]),
});

export const packagedSectionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  code: z.string().max(40).nullish(),
  // Bounded so a malformed or hostile file cannot ask for an unbounded write.
  items: z.array(packagedItemSchema).min(1).max(500),
});

export const packagedTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  country: z.string().length(2).nullish(),
  standard: z.string().max(64).nullish(),
  severityScale: z.enum(["eu", "basic"]).default("eu"),
  sections: z.array(packagedSectionSchema).min(1).max(60),
});

export type PackagedTemplate = z.infer<typeof packagedTemplateSchema>;

export function describeTemplate(data: PackagedTemplate): string[] {
  const items = data.sections.flatMap((s) => s.items);
  const measurements = items.filter((i) => i.inputType === "measurement").length;
  const wording = items.reduce((n, i) => n + i.defectSuggestions.length, 0);

  const lines = [
    `${data.sections.length} section${data.sections.length === 1 ? "" : "s"}`,
    `${items.length} check${items.length === 1 ? "" : "s"}`,
    data.severityScale === "eu" ? "EU defect scale" : "Pass / attention / fail",
  ];
  if (measurements > 0) lines.push(`${measurements} measured against a limit`);
  if (data.country) lines.push(`Country: ${data.country}`);
  if (wording > 0) lines.push(`${wording} custom defect phrase${wording === 1 ? "" : "s"}`);
  return lines;
}

/**
 * Removes the workshop's own defect wording.
 *
 * That field is free text someone typed at a bench. It is the most useful part
 * of a refined checklist and the most likely to name a customer, a colleague or
 * a local arrangement, so sharing it is a decision the exporter makes rather
 * than a default they discover afterwards.
 */
export function withoutCustomWording(data: PackagedTemplate): PackagedTemplate {
  return {
    ...data,
    sections: data.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({ ...item, defectSuggestions: [] })),
    })),
  };
}

export function countCustomWording(data: PackagedTemplate): number {
  return data.sections.reduce(
    (total, section) =>
      total + section.items.reduce((n, item) => n + item.defectSuggestions.length, 0),
    0
  );
}

registerInstaller({
  type: INSPECTION_TEMPLATE_TYPE,
  label: "inspection template",
  schema: packagedTemplateSchema,
  describe: describeTemplate,
});
