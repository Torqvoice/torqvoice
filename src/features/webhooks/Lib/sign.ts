import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Generate a cryptographically random secret. Format: `whsec_<48 hex chars>`.
 * Shown to the user once on webhook creation, stored verbatim.
 */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

/**
 * Sign a payload with HMAC-SHA256, including a timestamp to prevent replay.
 * Format follows Stripe's pattern: `t=<unix>,v1=<hex>`.
 */
export function signPayload(secret: string, body: string, timestamp: number = Date.now()): string {
  const signedPayload = `${timestamp}.${body}`;
  const sig = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

/**
 * Verify an inbound signature header against a body + secret. Constant-time
 * comparison; returns false on any malformed input. Tolerance defaults to 5min.
 */
export function verifySignature(
  secret: string,
  body: string,
  header: string,
  toleranceMs: number = 5 * 60 * 1000,
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(Date.now() - t) > toleranceMs) return false;

  const expected = createHmac("sha256", secret)
    .update(`${t}.${body}`)
    .digest("hex");
  if (expected.length !== v1.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(v1, "hex"));
  } catch {
    return false;
  }
}
