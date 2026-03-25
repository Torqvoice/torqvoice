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

      const systemPrompt = `You are an expert automotive parts identifier. Analyze the ${imageCount > 1 ? `${imageCount} images` : "image"} of a part or its packaging and extract as much information as possible. ${imageCount > 1 ? "The images show the same part from different angles. Combine information from all images." : ""} Return ONLY valid JSON with these fields (omit fields you cannot determine):
{
  "name": "part name",
  "partNumber": "manufacturer part number",
  "barcode": "barcode/UPC/EAN number if visible",
  "category": "part category (e.g. Brakes, Filters, Engine, Electrical)",
  "description": "brief description of the part",
  "supplier": "manufacturer or brand name"
}

${locale !== "en" ? `Respond with values in ${langName} where appropriate (name, category, description). Keep partNumber, barcode, and supplier in their original form.` : ""}`;

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
