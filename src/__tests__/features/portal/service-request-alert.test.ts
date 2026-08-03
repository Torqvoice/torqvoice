/**
 * Tests for who the service request alert reaches, and for what the workshop
 * ends up reading.
 *
 * The description is written by a customer in a public portal form and lands in
 * an HTML email, so escaping is a correctness requirement rather than a nicety.
 * The recipient rules matter for a different reason: a malformed address handed
 * to a mail provider can sink the whole message, taking the valid recipients
 * with it.
 */

import { describe, it, expect } from "vitest";
import {
  MAX_DESCRIPTION_IN_EMAIL,
  buildServiceRequestEmailHtml,
  buildServiceRequestSubject,
  formatPreferredDate,
  parseInvalidRecipients,
  parseRecipientList,
} from "@/features/portal/Lib/serviceRequestAlert";

const emailInput = (overrides = {}) => ({
  organizationName: "Ola's Garage",
  customerName: "Kari Nordmann",
  customerEmail: "kari@example.com",
  customerPhone: "+47 900 00 000",
  vehicleLabel: "Volvo V70 (AB12345)",
  description: "Brakes squeal when cold.",
  preferredDate: "2026-08-10",
  requestUrl: "https://app.example.com/customers/c1?tab=requests",
  ...overrides,
});

describe("parseRecipientList", () => {
  it("returns nothing for an empty or unset field", () => {
    expect(parseRecipientList("")).toEqual([]);
    expect(parseRecipientList(null)).toEqual([]);
    expect(parseRecipientList(undefined)).toEqual([]);
    expect(parseRecipientList("   ")).toEqual([]);
  });

  it("accepts the separators an operator actually types", () => {
    expect(parseRecipientList("a@example.com, b@example.com;c@example.com\nd@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
      "d@example.com",
    ]);
  });

  it("drops entries that are not shaped like an address", () => {
    expect(parseRecipientList("good@example.com, not-an-email, @example.com, x@y")).toEqual([
      "good@example.com",
    ]);
  });

  it("dedupes case-insensitively so nobody is mailed twice", () => {
    expect(parseRecipientList("Owner@Example.com, owner@example.com")).toEqual([
      "Owner@Example.com",
    ]);
  });
});

describe("parseInvalidRecipients", () => {
  it("reports exactly what parseRecipientList would drop", () => {
    const raw = "good@example.com, oops, another@example.com, @bad";
    expect(parseInvalidRecipients(raw)).toEqual(["oops", "@bad"]);
    expect(parseRecipientList(raw)).toEqual(["good@example.com", "another@example.com"]);
  });

  it("stays quiet when every entry is valid", () => {
    expect(parseInvalidRecipients("a@example.com b@example.com")).toEqual([]);
    expect(parseInvalidRecipients("")).toEqual([]);
  });
});

describe("formatPreferredDate", () => {
  it("renders an unambiguous ISO day", () => {
    expect(formatPreferredDate(new Date("2026-08-10T00:00:00Z"))).toBe("2026-08-10");
  });

  it("returns null when there is no usable date", () => {
    expect(formatPreferredDate(null)).toBeNull();
    expect(formatPreferredDate(undefined)).toBeNull();
    expect(formatPreferredDate(new Date("nonsense"))).toBeNull();
  });
});

describe("buildServiceRequestSubject", () => {
  it("names the customer and the vehicle so the inbox is scannable", () => {
    expect(
      buildServiceRequestSubject({ customerName: "Kari", vehicleLabel: "Volvo V70" }),
    ).toBe("New service request from Kari (Volvo V70)");
  });
});

describe("buildServiceRequestEmailHtml", () => {
  it("carries the details needed to act without opening the app", () => {
    const html = buildServiceRequestEmailHtml(emailInput());
    expect(html).toContain("Brakes squeal when cold.");
    expect(html).toContain("Volvo V70 (AB12345)");
    expect(html).toContain("2026-08-10");
    expect(html).toContain("kari@example.com");
    expect(html).toContain("+47 900 00 000");
    expect(html).toContain("https://app.example.com/customers/c1?tab=requests");
  });

  it("escapes a description written by a customer", () => {
    const html = buildServiceRequestEmailHtml(
      emailInput({ description: '<img src=x onerror="alert(1)">' }),
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("escapes the customer name and vehicle too", () => {
    const html = buildServiceRequestEmailHtml(
      emailInput({ customerName: "<b>Kari</b>", vehicleLabel: "<i>V70</i>" }),
    );
    expect(html).not.toContain("<b>Kari</b>");
    expect(html).not.toContain("<i>V70</i>");
  });

  it("omits rows the customer never filled in", () => {
    const html = buildServiceRequestEmailHtml(
      emailInput({ customerEmail: null, customerPhone: null, preferredDate: null }),
    );
    expect(html).not.toContain("Preferred date");
    expect(html).not.toContain("Phone");
    expect(html).toContain("Customer");
  });

  it("omits the link when no base URL is configured", () => {
    const html = buildServiceRequestEmailHtml(emailInput({ requestUrl: null }));
    expect(html).not.toContain("<a href");
    // The rest of the mail still stands on its own.
    expect(html).toContain("Brakes squeal when cold.");
  });

  it("truncates a description long enough to trouble a mail provider", () => {
    const html = buildServiceRequestEmailHtml(
      emailInput({ description: "x".repeat(MAX_DESCRIPTION_IN_EMAIL + 500) }),
    );
    expect(html).toContain("…");
    expect(html).not.toContain("x".repeat(MAX_DESCRIPTION_IN_EMAIL + 1));
  });
});
