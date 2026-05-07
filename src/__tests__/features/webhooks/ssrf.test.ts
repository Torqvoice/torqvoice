import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isPrivateAddress, checkWebhookUrl } from "@/features/webhooks/Lib/ssrf";

describe("isPrivateAddress", () => {
  it.each([
    ["10.0.0.1", true],
    ["10.255.255.255", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["172.32.0.1", false],
    ["192.168.1.1", true],
    ["127.0.0.1", true],
    ["169.254.169.254", true],
    ["100.64.0.1", true],
    ["8.8.8.8", false],
    ["1.1.1.1", false],
    ["::1", true],
    ["fc00::1", true],
    ["fd12:3456::1", true],
    ["fe80::1", true],
    ["2001:4860:4860::8888", false],
  ])("classifies %s correctly", (addr, expected) => {
    expect(isPrivateAddress(addr)).toBe(expected);
  });
});

describe("checkWebhookUrl", () => {
  const resolver = vi.fn();

  beforeEach(() => {
    delete process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS;
    resolver.mockReset();
  });

  afterEach(() => {
    delete process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS;
  });

  it("rejects non-http schemes", async () => {
    const r = await checkWebhookUrl("file:///etc/passwd", resolver);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("scheme_not_http");
  });

  it("rejects loopback hostnames", async () => {
    const r = await checkWebhookUrl("http://localhost/hook", resolver);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("loopback_host");
  });

  it("rejects literal private IPv4 without DNS lookup", async () => {
    const r = await checkWebhookUrl("https://192.168.1.1/hook", resolver);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("private_ip");
    expect(resolver).not.toHaveBeenCalled();
  });

  it("rejects AWS metadata IP", async () => {
    const r = await checkWebhookUrl(
      "http://169.254.169.254/latest/meta-data/",
      resolver,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects GCP metadata host", async () => {
    const r = await checkWebhookUrl("http://metadata.google.internal/", resolver);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("metadata_host");
  });

  it("rejects hosts that resolve to private addresses", async () => {
    resolver.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    const r = await checkWebhookUrl("https://internal.example.com/hook", resolver);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("resolves_private");
  });

  it("accepts public hosts that resolve to public addresses", async () => {
    resolver.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    const r = await checkWebhookUrl("https://hooks.example.com/torqvoice", resolver);
    expect(r.ok).toBe(true);
  });

  it("rejects when one of multiple records is private (mixed)", async () => {
    resolver.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);
    const r = await checkWebhookUrl("https://attacker.example.com/", resolver);
    expect(r.ok).toBe(false);
  });

  it("rejects when DNS resolution fails", async () => {
    resolver.mockRejectedValue(new Error("ENOTFOUND"));
    const r = await checkWebhookUrl("https://nonexistent.example.invalid/", resolver);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("dns_resolution_failed");
  });

  it("rejects when DNS returns no records", async () => {
    resolver.mockResolvedValue([]);
    const r = await checkWebhookUrl("https://empty.example.com/", resolver);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("dns_no_records");
  });

  it("respects WEBHOOKS_ALLOW_PRIVATE_TARGETS escape hatch", async () => {
    process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS = "true";
    const r = await checkWebhookUrl("http://192.168.1.1/hook", resolver);
    expect(r.ok).toBe(true);
  });

  it("rejects garbage URLs", async () => {
    const r = await checkWebhookUrl("not a url", resolver);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_url");
  });
});
