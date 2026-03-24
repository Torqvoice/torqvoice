"use server";

import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { visionCompletion } from "@/lib/ai";
import { getLocale } from "next-intl/server";
import { localeNames, type Locale } from "@/i18n/config";

export interface PartAnalysisResult {
  name?: string;
  partNumber?: string;
  barcode?: string;
  category?: string;
  description?: string;
  supplier?: string;
}

export async function aiAnalyzePartImage(imageUrl: string) {
  return withAuth(
    async ({ organizationId }) => {
      const locale = (await getLocale()) as Locale;
      const langName = localeNames[locale] || "English";

      const systemPrompt = `You are an expert automotive parts identifier. Analyze the image of a part or its packaging and extract as much information as possible. Return ONLY valid JSON with these fields (omit fields you cannot determine):
{
  "name": "part name",
  "partNumber": "manufacturer part number",
  "barcode": "barcode/UPC/EAN number if visible",
  "category": "part category (e.g. Brakes, Filters, Engine, Electrical)",
  "description": "brief description of the part",
  "supplier": "manufacturer or brand name"
}

${locale !== "en" ? `Respond with values in ${langName} where appropriate (name, category, description). Keep partNumber, barcode, and supplier in their original form.` : ""}`;

      const userText = "Analyze this automotive/repair part image and extract all identifiable information.";

      const raw = await visionCompletion(
        organizationId,
        systemPrompt,
        userText,
        imageUrl,
      );

      const cleaned = raw.replace(/^```json?\n?|\n?```$/g, "").trim();
      const result: PartAnalysisResult = JSON.parse(cleaned);
      return result;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.INVENTORY },
      ],
    },
  );
}
