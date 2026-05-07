import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Block webhook URLs that resolve to private, loopback, link-local, or
 * cloud metadata addresses to prevent SSRF. Operators can opt-out for
 * dev/testing by setting WEBHOOKS_ALLOW_PRIVATE_TARGETS=true.
 */

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
];

const PRIVATE_V6_PREFIXES = ["::1", "fc", "fd", "fe80:", "::ffff:"];

const BLOCKED_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.goog",
]);

export type SsrfResult = { ok: true } | { ok: false; reason: string };
export type DnsResolver = (host: string) => Promise<{ address: string; family: number }[]>;

export function isPrivateAddress(addr: string): boolean {
  const family = isIP(addr);
  if (family === 4) {
    return PRIVATE_V4.some((rx) => rx.test(addr));
  }
  if (family === 6) {
    const lower = addr.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    return PRIVATE_V6_PREFIXES.some((p) => lower.startsWith(p));
  }
  return false;
}

const defaultResolver: DnsResolver = (host) => dnsLookup(host, { all: true });

export async function checkWebhookUrl(
  rawUrl: string,
  resolver: DnsResolver = defaultResolver,
): Promise<SsrfResult> {
  if (process.env.WEBHOOKS_ALLOW_PRIVATE_TARGETS === "true") {
    return { ok: true };
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "scheme_not_http" };
  }

  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "missing_host" };

  if (BLOCKED_HOSTS.has(host)) {
    return { ok: false, reason: "metadata_host" };
  }

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false, reason: "loopback_host" };
  }

  if (isIP(host)) {
    return isPrivateAddress(host)
      ? { ok: false, reason: "private_ip" }
      : { ok: true };
  }

  let addrs: { address: string; family: number }[] = [];
  try {
    addrs = await resolver(host);
  } catch {
    return { ok: false, reason: "dns_resolution_failed" };
  }
  if (addrs.length === 0) {
    return { ok: false, reason: "dns_no_records" };
  }
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      return { ok: false, reason: "resolves_private" };
    }
  }
  return { ok: true };
}
