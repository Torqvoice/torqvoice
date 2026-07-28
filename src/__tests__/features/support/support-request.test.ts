/**
 * Tests for what a support request is allowed to contain, and for what an
 * administrator ends up reading.
 *
 * The submitted text lands in an HTML email, so escaping is a correctness
 * requirement rather than a nicety: a workshop reporting a problem with a page
 * will quite reasonably paste markup into the description.
 */

import { describe, it, expect } from "vitest";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENTS,
  MAX_MESSAGE_LENGTH,
  MAX_REQUEST_BYTES,
  MAX_SUBJECT_LENGTH,
  MAX_TOTAL_ATTACHMENT_BYTES,
  buildSupportEmailHtml,
  escapeHtml,
  exceedsRequestLimit,
  sanitizeFilename,
  validateSupportRequest,
} from "@/features/support/Lib/supportRequest";

const attachment = (overrides: Partial<{ filename: string; contentType: string; size: number }> = {}) => ({
  filename: "screenshot.jpg",
  contentType: "image/jpeg",
  size: 1024,
  ...overrides,
});

const request = (overrides: Partial<Parameters<typeof validateSupportRequest>[0]> = {}) => ({
  subject: "Invoice will not save",
  message: "Pressing save does nothing on the invoice page.",
  attachments: [],
  ...overrides,
});

describe("validateSupportRequest", () => {
  it("accepts a normal request", () => {
    const result = validateSupportRequest(request());
    expect(result.ok).toBe(true);
  });

  it("trims the submitted text", () => {
    const result = validateSupportRequest(request({ subject: "  Padded  ", message: "  Body  " }));
    expect(result).toEqual({ ok: true, subject: "Padded", message: "Body" });
  });

  it("rejects whitespace-only text as empty", () => {
    // Required attributes on the inputs stop the empty case in a browser, but
    // the endpoint is reachable without one.
    expect(validateSupportRequest(request({ subject: "   " }))).toEqual({
      ok: false,
      reason: "subject-required",
    });
    expect(validateSupportRequest(request({ message: "\n\t " }))).toEqual({
      ok: false,
      reason: "message-required",
    });
  });

  it("rejects text beyond the stated limits", () => {
    expect(validateSupportRequest(request({ subject: "x".repeat(MAX_SUBJECT_LENGTH + 1) }))).toEqual({
      ok: false,
      reason: "subject-too-long",
    });
    expect(validateSupportRequest(request({ message: "x".repeat(MAX_MESSAGE_LENGTH + 1) }))).toEqual({
      ok: false,
      reason: "message-too-long",
    });
  });

  it("accepts text exactly at the limits", () => {
    expect(
      validateSupportRequest(
        request({
          subject: "x".repeat(MAX_SUBJECT_LENGTH),
          message: "x".repeat(MAX_MESSAGE_LENGTH),
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects more attachments than allowed", () => {
    const attachments = Array.from({ length: MAX_ATTACHMENTS + 1 }, () => attachment());
    expect(validateSupportRequest(request({ attachments }))).toEqual({
      ok: false,
      reason: "too-many-attachments",
    });
  });

  it("accepts exactly the allowed number of attachments", () => {
    const attachments = Array.from({ length: MAX_ATTACHMENTS }, () => attachment());
    expect(validateSupportRequest(request({ attachments })).ok).toBe(true);
  });

  it("rejects file types that have no business in an inbox", () => {
    for (const contentType of [
      "application/x-msdownload",
      "application/zip",
      "text/html",
      "application/octet-stream",
      "",
    ]) {
      expect(validateSupportRequest(request({ attachments: [attachment({ contentType })] }))).toEqual({
        ok: false,
        reason: "attachment-type-not-allowed",
      });
    }
  });

  it("accepts every type on the allow list", () => {
    for (const contentType of ALLOWED_ATTACHMENT_TYPES) {
      expect(validateSupportRequest(request({ attachments: [attachment({ contentType })] })).ok).toBe(
        true,
      );
    }
  });

  it("rejects attachments whose combined size exceeds the budget", () => {
    // Each file is individually fine; only the total is over. Checking them one
    // at a time would let this through.
    const attachments = [
      attachment({ size: MAX_TOTAL_ATTACHMENT_BYTES * 0.6 }),
      attachment({ size: MAX_TOTAL_ATTACHMENT_BYTES * 0.6 }),
    ];
    expect(validateSupportRequest(request({ attachments }))).toEqual({
      ok: false,
      reason: "attachments-too-large",
    });
  });

  it("accepts attachments exactly at the budget", () => {
    const attachments = [attachment({ size: MAX_TOTAL_ATTACHMENT_BYTES })];
    expect(validateSupportRequest(request({ attachments })).ok).toBe(true);
  });
});

/**
 * The only check that runs before the body is read. Everything else in this
 * file operates on a parsed FormData, and parsing has already buffered the
 * whole upload into memory by then.
 */
describe("exceedsRequestLimit", () => {
  it("refuses a request that declares more than the ceiling", () => {
    expect(exceedsRequestLimit(String(MAX_REQUEST_BYTES + 1))).toBe(true);
    expect(exceedsRequestLimit(String(1024 * 1024 * 1024))).toBe(true);
  });

  it("allows a request at or under the ceiling", () => {
    expect(exceedsRequestLimit(String(MAX_REQUEST_BYTES))).toBe(false);
    expect(exceedsRequestLimit(String(MAX_TOTAL_ATTACHMENT_BYTES))).toBe(false);
    expect(exceedsRequestLimit("0")).toBe(false);
  });

  it("leaves room above the attachment budget for the form fields themselves", () => {
    // A request carrying the maximum attachments plus a full-length subject and
    // message must not be refused by the very limit meant to allow it.
    expect(MAX_REQUEST_BYTES).toBeGreaterThan(
      MAX_TOTAL_ATTACHMENT_BYTES + MAX_SUBJECT_LENGTH + MAX_MESSAGE_LENGTH,
    );
  });

  it("allows a chunked upload through to the byte counter", () => {
    // No Content-Length means the size is not knowable up front. Refusing these
    // outright would break any client that streams.
    expect(exceedsRequestLimit(null)).toBe(false);
    expect(exceedsRequestLimit("")).toBe(false);
  });

  it("does not refuse on a header it cannot parse", () => {
    expect(exceedsRequestLimit("not-a-number")).toBe(false);
  });
});

describe("escapeHtml", () => {
  it("neutralises markup so a pasted snippet renders as text", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapes ampersands before anything else, so entities are not doubled oddly", () => {
    expect(escapeHtml("Tom & Jerry <b>")).toBe("Tom &amp; Jerry &lt;b&gt;");
  });

  it("escapes quotes that could break out of an attribute", () => {
    expect(escapeHtml(`" onload='x'`)).toBe("&quot; onload=&#39;x&#39;");
  });
});

describe("sanitizeFilename", () => {
  it("keeps an ordinary name", () => {
    expect(sanitizeFilename("screenshot 1.jpg", "fallback")).toBe("screenshot 1.jpg");
  });

  it("strips directory components", () => {
    expect(sanitizeFilename("../../etc/passwd", "fallback")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\me\\report.pdf", "fallback")).toBe("report.pdf");
  });

  it("removes characters that could break a MIME header", () => {
    // The allow list is word characters, dot, hyphen and space, so the CRLF and
    // the colon that would forge a header are collapsed, and so is the @.
    expect(sanitizeFilename('bad"name\r\nBcc: x@y.z.pdf', "fallback")).toBe("bad_name_Bcc_ x_y.z.pdf");
    expect(sanitizeFilename('report\r\nBcc: a@b.c', "fallback")).not.toMatch(/[\r\n:]/);
  });

  it("falls back when nothing usable is left", () => {
    expect(sanitizeFilename("", "attachment-1")).toBe("attachment-1");
    expect(sanitizeFilename("...", "attachment-2")).toBe("attachment-2");
    expect(sanitizeFilename("/", "attachment-3")).toBe("attachment-3");
  });

  it("caps the length", () => {
    expect(sanitizeFilename(`${"a".repeat(400)}.jpg`, "fallback")).toHaveLength(120);
  });
});

describe("buildSupportEmailHtml", () => {
  const context = {
    organizationName: "Bergen Bil",
    organizationId: "org_123",
    userName: "Kari",
    userEmail: "kari@example.com",
    pageUrl: "https://app.torqvoice.com/vehicles/1",
    userAgent: "Mozilla/5.0",
    appVersion: "1.4.2",
    submittedAt: "2026-07-28T09:00:00.000Z",
  };

  it("carries the context needed to act on the ticket", () => {
    const html = buildSupportEmailHtml("Cannot save", "It fails", context);
    expect(html).toContain("Bergen Bil");
    expect(html).toContain("org_123");
    expect(html).toContain("kari@example.com");
    expect(html).toContain("https://app.torqvoice.com/vehicles/1");
    expect(html).toContain("1.4.2");
  });

  it("escapes the user's own text", () => {
    const html = buildSupportEmailHtml("<b>subject</b>", "<img src=x onerror=alert(1)>", context);
    expect(html).not.toContain("<b>subject</b>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;b&gt;subject&lt;/b&gt;");
  });

  it("escapes context values, which are not all under our control", () => {
    // Organization name and user agent are both attacker-influenced.
    const html = buildSupportEmailHtml("s", "m", {
      ...context,
      organizationName: "<script>x</script>",
      userAgent: "<img onerror=1>",
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain("<img onerror=1>");
  });

  it("omits rows it has no value for rather than printing blanks", () => {
    const html = buildSupportEmailHtml("s", "m", {
      ...context,
      pageUrl: null,
      appVersion: null,
      userAgent: null,
    });
    expect(html).not.toContain("Page");
    expect(html).not.toContain("App version");
    expect(html).not.toContain("Browser");
    expect(html).toContain("Organization");
  });

  it("falls back to the email alone when the account has no name", () => {
    const html = buildSupportEmailHtml("s", "m", { ...context, userName: null });
    expect(html).toContain("kari@example.com");
  });
});
