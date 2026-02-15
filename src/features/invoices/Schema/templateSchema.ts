import { z } from "zod";

export const templateConfigSchema = z.object({
  primaryColor: z.string().default("#d97706"),
  fontFamily: z.enum(["Helvetica", "Times-Roman", "Courier"]).default("Helvetica"),
  showLogo: z.boolean().default(true),
  headerStyle: z.enum(["standard", "compact", "modern"]).default("standard"),
});

export type TemplateConfig = z.infer<typeof templateConfigSchema>;

export const defaultTemplate: TemplateConfig = {
  primaryColor: "#d97706",
  fontFamily: "Helvetica",
  showLogo: true,
  headerStyle: "standard",
};
