/**
 * Recipient parsing and message building for the "new service request" alert.
 *
 * Kept free of Next.js and Prisma imports so the rules that decide who is
 * mailed, and what the workshop ends up reading, can be tested directly rather
 * than through a server action.
 */

import { escapeHtml } from "@/features/support/Lib/supportRequest";

/**
 * Deliberately loose. This is a last line of defence against a typo reaching
 * the mail provider, not an attempt to decide what a valid address is — that
 * argument is unwinnable and the strict patterns people reach for reject real
 * addresses. Anything with a local part, an @ and a dotted domain passes.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * How much of the customer's description travels in the email body.
 *
 * The full text is always one click away in the app. A portal form with no
 * client-side limit can carry a very long paste, and mail providers start
 * truncating or rejecting oversized HTML bodies.
 */
export const MAX_DESCRIPTION_IN_EMAIL = 4000;

/**
 * Split the free-text recipient field into addresses.
 *
 * Operators type this by hand, so commas, semicolons, newlines and stray
 * spaces all turn up. Entries that are not shaped like an address are dropped
 * rather than handed to the provider: most reject the entire message when one
 * recipient is malformed, which would take the valid recipients down too.
 */
export function parseRecipientList(raw: string | null | undefined): string[] {
  if (!raw) return [];

  const seen = new Set<string>();
  const addresses: string[] = [];

  for (const candidate of raw.split(/[,;\s]+/)) {
    const address = candidate.trim();
    if (!address || !EMAIL_PATTERN.test(address)) continue;

    // Case-insensitive dedupe — the same person written two ways should not
    // receive the alert twice.
    const key = address.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    addresses.push(address);
  }

  return addresses;
}

/**
 * The entries `parseRecipientList` would silently drop.
 *
 * Shares the pattern above deliberately. The settings form warns with this, the
 * sender filters with that — if the two ever disagreed, an operator could save
 * an address the form accepted and never learn it was skipped at send time.
 */
export function parseInvalidRecipients(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0 && !EMAIL_PATTERN.test(candidate));
}

/** A date with no time attached; the customer picks a day, not an hour. */
export function formatPreferredDate(date: Date | null | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  // ISO day rather than a locale format: the recipient's locale is unknown
  // here, and 03/08 reads as two different days on either side of the Atlantic.
  return date.toISOString().slice(0, 10);
}

export interface ServiceRequestEmailInput {
  organizationName: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  vehicleLabel: string;
  description: string;
  preferredDate: string | null;
  /** Absolute link into the app, or null when no base URL is configured. */
  requestUrl: string | null;
}

export function buildServiceRequestSubject(input: {
  customerName: string;
  vehicleLabel: string;
}): string {
  return `New service request from ${input.customerName} (${input.vehicleLabel})`;
}

/**
 * The point of this email is that the workshop can act on it without opening
 * the app first: who asked, for which vehicle, when they want it, and how to
 * reach them all travel in the body. The link is for the reply, not the read.
 */
export function buildServiceRequestEmailHtml(input: ServiceRequestEmailInput): string {
  const description =
    input.description.length > MAX_DESCRIPTION_IN_EMAIL
      ? `${input.description.slice(0, MAX_DESCRIPTION_IN_EMAIL)}…`
      : input.description;

  const rows: [string, string | null][] = [
    ["Customer", input.customerName],
    ["Vehicle", input.vehicleLabel],
    ["Preferred date", input.preferredDate],
    ["Email", input.customerEmail],
    ["Phone", input.customerPhone],
  ];

  const detailRows = rows
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
          <td style="padding:4px 0;color:#111;word-break:break-word;">${escapeHtml(value as string)}</td>
        </tr>`,
    )
    .join("");

  const link = input.requestUrl
    ? `<p style="margin:20px 0 0;">
         <a href="${escapeHtml(input.requestUrl)}" style="color:#2563eb;">Open in ${escapeHtml(input.organizationName)}</a>
       </p>`
    : "";

  return `
    <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto;">
      <h2 style="margin:0 0 4px;">New service request</h2>
      <p style="margin:0 0 16px;color:#666;font-size:13px;">
        Submitted through the customer portal at ${escapeHtml(input.organizationName)}
      </p>
      <table style="font-size:13px;border-collapse:collapse;margin-bottom:16px;">${detailRows}</table>
      <div style="white-space:pre-wrap;line-height:1.5;color:#111;">${escapeHtml(description)}</div>
      ${link}
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;" />
      <p style="margin:0;color:#666;font-size:12px;">
        You are receiving this because service request emails are enabled in Settings → Alerts.
      </p>
    </div>
  `;
}
