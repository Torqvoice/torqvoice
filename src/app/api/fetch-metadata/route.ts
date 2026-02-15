import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

interface Metadata {
  name?: string;
  description?: string;
  partNumber?: string;
  unitCost?: number;
  supplier?: string;
  category?: string;
  imageUrl?: string;
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let url: string;
  try {
    const body = await request.json();
    url = body.url;
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }
    // Validate URL format
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // Strip fragment from URL (servers don't receive it)
    const fetchUrl = url.split("#")[0];

    const response = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,no;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!response.ok) {
      // Detect Cloudflare / bot-protection challenges
      const cfMitigated = response.headers.get("cf-mitigated");
      const server = response.headers.get("server") || "";
      if (cfMitigated === "challenge" || (response.status === 403 && server.includes("cloudflare"))) {
        return NextResponse.json(
          { error: "This site has bot protection. Please fill in the fields manually." },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { error: `Failed to fetch URL (${response.status})` },
        { status: 422 }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return NextResponse.json(
        { error: "URL does not return HTML content" },
        { status: 422 }
      );
    }

    const html = await response.text();
    const metadata = parseMetadata(html, url);

    return NextResponse.json(metadata);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out" }, { status: 422 });
    }
    return NextResponse.json(
      { error: "Failed to fetch metadata" },
      { status: 422 }
    );
  }
}

function parseMetadata(html: string, baseUrl: string): Metadata {
  const result: Metadata = {};

  // Helper to extract content from meta tags
  const getMeta = (attr: string, value: string): string | null => {
    // Match both property="..." and name="..." attributes
    const patterns = [
      new RegExp(
        `<meta[^>]+${attr}=["']${escapeRegex(value)}["'][^>]+content=["']([^"']*)["']`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${escapeRegex(value)}["']`,
        "i"
      ),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeHtmlEntities(match[1].trim());
    }
    return null;
  };

  // Name: og:title → <title>
  result.name =
    getMeta("property", "og:title") ||
    getMeta("name", "title") ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    undefined;
  if (result.name) {
    result.name = decodeHtmlEntities(result.name);
  }

  // Description: og:description → meta description
  result.description =
    getMeta("property", "og:description") ||
    getMeta("name", "description") ||
    undefined;

  // Supplier: og:site_name
  result.supplier = getMeta("property", "og:site_name") || undefined;

  // Price: product:price:amount → JSON-LD
  const priceStr =
    getMeta("property", "product:price:amount") ||
    getMeta("property", "og:price:amount");
  if (priceStr) {
    const price = parseFloat(priceStr);
    if (!isNaN(price) && price > 0) {
      result.unitCost = price;
    }
  }

  // Image: og:image
  const ogImage = getMeta("property", "og:image");
  if (ogImage) {
    try {
      // Resolve relative URLs against the fetched page
      const resolved = new URL(ogImage, baseUrl).href;
      result.imageUrl = resolved;
    } catch {
      result.imageUrl = ogImage;
    }
  }

  // Category: product:category meta tag
  result.category =
    getMeta("property", "product:category") ||
    getMeta("property", "og:category") ||
    undefined;

  // Try JSON-LD for price, sku, mpn, category
  const jsonLdMatches = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      extractFromJsonLd(data, result);
    } catch {
      // Skip invalid JSON-LD
    }
  }

  return result;
}

function extractFromJsonLd(data: unknown, result: Metadata): void {
  if (!data || typeof data !== "object") return;

  // Handle arrays (multiple JSON-LD blocks)
  if (Array.isArray(data)) {
    for (const item of data) {
      extractFromJsonLd(item, result);
    }
    return;
  }

  const obj = data as Record<string, unknown>;

  // Check for Product type
  const type = obj["@type"];
  const isProduct =
    type === "Product" ||
    (Array.isArray(type) && type.includes("Product"));

  if (isProduct) {
    // Name from JSON-LD (only if not already set)
    if (!result.name && typeof obj.name === "string") {
      result.name = obj.name;
    }

    // Description from JSON-LD
    if (!result.description && typeof obj.description === "string") {
      result.description = obj.description;
    }

    // SKU / MPN → partNumber
    if (!result.partNumber) {
      if (typeof obj.sku === "string" && obj.sku) {
        result.partNumber = obj.sku;
      } else if (typeof obj.mpn === "string" && obj.mpn) {
        result.partNumber = obj.mpn;
      }
    }

    // Price from offers
    if (!result.unitCost && obj.offers) {
      const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
      for (const offer of offers) {
        if (offer && typeof offer === "object") {
          const offerObj = offer as Record<string, unknown>;
          const price =
            offerObj.price !== undefined
              ? parseFloat(String(offerObj.price))
              : NaN;
          if (!isNaN(price) && price > 0) {
            result.unitCost = price;
            break;
          }
        }
      }
    }

    // Image from JSON-LD Product
    if (!result.imageUrl && obj.image) {
      if (typeof obj.image === "string") {
        result.imageUrl = obj.image;
      } else if (Array.isArray(obj.image) && typeof obj.image[0] === "string") {
        result.imageUrl = obj.image[0];
      }
    }

    // Category from JSON-LD Product
    if (!result.category && typeof obj.category === "string" && obj.category) {
      result.category = obj.category;
    }

    // Brand as supplier fallback
    if (!result.supplier && obj.brand) {
      if (typeof obj.brand === "string") {
        result.supplier = obj.brand;
      } else if (
        typeof obj.brand === "object" &&
        obj.brand !== null &&
        typeof (obj.brand as Record<string, unknown>).name === "string"
      ) {
        result.supplier = (obj.brand as Record<string, unknown>).name as string;
      }
    }
  }

  // BreadcrumbList → category fallback (use second-to-last or last meaningful breadcrumb)
  const isBreadcrumb =
    type === "BreadcrumbList" ||
    (Array.isArray(type) && type.includes("BreadcrumbList"));
  if (isBreadcrumb && !result.category && Array.isArray(obj.itemListElement)) {
    const items = obj.itemListElement
      .filter(
        (item: unknown) =>
          item && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string"
      )
      .map((item: unknown) => (item as Record<string, unknown>).name as string);
    // Pick the last meaningful breadcrumb (skip Home / first item, and the product name itself)
    if (items.length >= 3) {
      result.category = items[items.length - 2];
    } else if (items.length === 2) {
      result.category = items[1];
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}
