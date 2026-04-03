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

export async function aiAnalyzePartImage(imageDataUris: string | string[]) {
  return withAuth(
    async ({ organizationId }) => {
      const locale = (await getLocale()) as Locale;
      const langName = localeNames[locale] || "English";

      const uris = Array.isArray(imageDataUris) ? imageDataUris : [imageDataUris];
      const imageCount = uris.length;

      const langInstruction = locale !== "en"
        ? `IMPORTANT: The user's language is ${langName}. You MUST translate the "name", "category", and "description" fields into ${langName}, regardless of what language appears on the packaging or part. For example, if the packaging is in German but the user's language is Norwegian, translate to Norwegian. Keep "partNumber", "barcode", and "supplier" in their original form — do NOT translate those.`
        : "";

      const systemPrompt = `You are an expert automotive parts identifier. Analyze the ${imageCount > 1 ? `${imageCount} images` : "image"} of a part or its packaging and extract as much information as possible. ${imageCount > 1 ? "The images show the same part from different angles. Combine information from all images." : ""}

${langInstruction}

Return ONLY valid JSON with these fields (omit fields you cannot determine):
{
  "name": "part name${locale !== "en" ? ` (in ${langName})` : ""}",
  "partNumber": "manufacturer part number",
  "barcode": "barcode/UPC/EAN number if visible",
  "category": "part category${locale !== "en" ? ` (in ${langName})` : ""} (e.g. Brakes, Filters, Engine, Electrical)",
  "description": "brief description of the part${locale !== "en" ? ` (in ${langName})` : ""}",
  "supplier": "manufacturer or brand name"
}`;

      const userText = imageCount > 1
        ? `Analyze these ${imageCount} images of the same automotive/repair part from different angles and extract all identifiable information.`
        : "Analyze this automotive/repair part image and extract all identifiable information.";

      const raw = await visionCompletion(
        organizationId,
        systemPrompt,
        userText,
        uris,
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
