import { describe, it, expect } from "vitest";
import {
  signPayload,
  verifySignature,
  generateWebhookSecret,
} from "@/features/webhooks/Lib/sign";

describe("webhook signing", () => {
  it("generates secrets in the documented format", () => {
    const s = generateWebhookSecret();
    expect(s).toMatch(/^whsec_[a-f0-9]{48}$/);
  });

  it("verifies a freshly-signed payload", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ event: "customer.create", id: "cus_x" });
    const header = signPayload(secret, body);
    expect(verifySignature(secret, body, header)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ event: "customer.create", id: "cus_x" });
    const header = signPayload(secret, body);
    expect(verifySignature(secret, body + " ", header)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const secret = generateWebhookSecret();
    const wrong = generateWebhookSecret();
    const body = "{}";
    const header = signPayload(secret, body);
    expect(verifySignature(wrong, body, header)).toBe(false);
  });

  it("rejects an old timestamp (replay window)", () => {
    const secret = generateWebhookSecret();
    const body = "{}";
    const oldTs = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    const header = signPayload(secret, body, oldTs);
    expect(verifySignature(secret, body, header)).toBe(false);
  });

  it("rejects malformed signature headers", () => {
    const secret = generateWebhookSecret();
    expect(verifySignature(secret, "{}", "")).toBe(false);
    expect(verifySignature(secret, "{}", "garbage")).toBe(false);
    expect(verifySignature(secret, "{}", "t=abc,v1=def")).toBe(false);
  });

  it("constant-time-rejects a signature of the same length but different bits", () => {
    const secret = generateWebhookSecret();
    const body = "{}";
    const real = signPayload(secret, body);
    const flipped = real.replace(/v1=([0-9a-f])/, (_, c) => `v1=${c === "0" ? "1" : "0"}`);
    expect(verifySignature(secret, body, flipped)).toBe(false);
  });
});
