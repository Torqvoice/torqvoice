/**
 * SMS Send Tests
 *
 * Covers three critical invariants:
 * 1. SMS must never be sent to the wrong customer
 * 2. Phone numbers must have a country code (E.164 format)
 * 3. "SMS Sent" must never be shown unless the vendor confirmed acceptance
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/cached-session", () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/features", () => ({
  requireFeature: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    customer: { findFirst: vi.fn() },
    smsMessage: {
      create: vi.fn(),
      update: vi.fn(),
    },
    appSetting: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Mock global fetch for vendor API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getCachedSession, getCachedMembership } from "@/lib/cached-session";
import { db } from "@/lib/db";
import { sendSmsToCustomer } from "@/features/sms/Actions/smsActions";
import { sendOrgSms } from "@/lib/sms";

// ── Helpers ──────────────────────────────────────────────────────────────────

const ORG_ID = "org-1";

const CUSTOMER_A = {
  id: "cust-a",
  name: "Alice",
  phone: "+15551234567",
};

const CUSTOMER_B = {
  id: "cust-b",
  name: "Bob",
  phone: "+15559999999",
};

const SMS_RECORD = {
  id: "sms-1",
  direction: "outbound",
  fromNumber: "+15550000000",
  toNumber: CUSTOMER_A.phone,
  body: "Hello",
  status: "queued",
  organizationId: ORG_ID,
  customerId: CUSTOMER_A.id,
};

function setupAuth() {
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: "user-1", email: "user@example.com" },
  } as any);
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG_ID,
    role: "owner",
    roleId: null,
    customRole: null,
  } as any);
  vi.mocked(db.user.findUnique).mockResolvedValue({
    isSuperAdmin: false,
  } as any);
}

function setupSmsProvider(provider: "twilio" | "vonage" | "telnyx" = "twilio") {
  vi.mocked(db.appSetting.findUnique).mockImplementation(({ where }: any) => {
    const key = where.organizationId_key?.key;
    if (key === "sms.provider") return { value: provider } as any;
    if (key === "sms.phoneNumber") return { value: "+15550000000" } as any;
    return null as any;
  });
  vi.mocked(db.appSetting.findMany).mockResolvedValue([
    { key: "sms.provider", value: provider },
    { key: "sms.phoneNumber", value: "+15550000000" },
    { key: "sms.twilio.accountSid", value: "AC_test" },
    { key: "sms.twilio.authToken", value: "token_test" },
    { key: "sms.vonage.apiKey", value: "vonage_key" },
    { key: "sms.vonage.apiSecret", value: "vonage_secret" },
    { key: "sms.telnyx.apiKey", value: "telnyx_key" },
  ] as any);
}

function mockTwilioSuccess() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ sid: "SM_abc123", status: "queued" }),
  });
}

function mockTwilioFailure() {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    statusText: "Bad Request",
    json: async () => ({ message: "Invalid 'To' Phone Number" }),
  });
}

function mockVonageSuccess() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      messages: [{ "message-id": "vonage_123", status: "0" }],
    }),
  });
}

function mockVonageFailure() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      messages: [{ status: "3", "error-text": "Invalid phone number" }],
    }),
  });
}

function mockTelnyxSuccess() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: { id: "telnyx_123" } }),
  });
}

function mockTelnyxFailure() {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    statusText: "Unprocessable Entity",
    json: async () => ({ errors: [{ detail: "Invalid destination number" }] }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. SMS must never be sent to the wrong customer
// ═════════════════════════════════════════════════════════════════════════════

describe("SMS is never sent to the wrong customer", () => {
  it("uses the phone number from the database, not from user input", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
    vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
    vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);
    mockTwilioSuccess();

    await sendSmsToCustomer({
      customerId: CUSTOMER_A.id,
      body: "Hello",
    });

    // The 'To' parameter sent to Twilio must be the DB phone, not arbitrary input
    const fetchCall = mockFetch.mock.calls[0];
    const sentBody = fetchCall[1].body as string;
    expect(sentBody).toContain(encodeURIComponent(CUSTOMER_A.phone));
  });

  it("scopes customer lookup to the caller's organization", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);

    const result = await sendSmsToCustomer({
      customerId: "cust-from-other-org",
      body: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Customer not found");

    // Verify the query was scoped to the org
    expect(vi.mocked(db.customer.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "cust-from-other-org",
          organizationId: ORG_ID,
        }),
      }),
    );
  });

  it("refuses to send when customer has no phone number", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-no-phone",
      name: "No Phone",
      phone: null,
    } as any);

    const result = await sendSmsToCustomer({
      customerId: "cust-no-phone",
      body: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("no phone number");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends to customer A's number, not customer B's, when given customer A's id", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
    vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
    vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);
    mockTwilioSuccess();

    await sendSmsToCustomer({
      customerId: CUSTOMER_A.id,
      body: "Hello Alice",
    });

    const fetchCall = mockFetch.mock.calls[0];
    const sentBody = fetchCall[1].body as string;
    // Must contain Alice's number
    expect(sentBody).toContain(encodeURIComponent(CUSTOMER_A.phone));
    // Must NOT contain Bob's number
    expect(sentBody).not.toContain(encodeURIComponent(CUSTOMER_B.phone));
  });

  it("stores the correct customerId on the SMS record", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
    vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
    vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);
    mockTwilioSuccess();

    await sendSmsToCustomer({
      customerId: CUSTOMER_A.id,
      body: "Hello",
    });

    expect(vi.mocked(db.smsMessage.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          customerId: CUSTOMER_A.id,
          toNumber: CUSTOMER_A.phone,
        }),
      }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Phone number must have country code (E.164 format)
// ═════════════════════════════════════════════════════════════════════════════

describe("Phone number E.164 validation", () => {
  it("sends successfully when phone number is valid E.164 (+15551234567)", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
    vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
    vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);
    mockTwilioSuccess();

    const result = await sendSmsToCustomer({
      customerId: CUSTOMER_A.id,
      body: "Hello",
    });

    expect(result.success).toBe(true);
  });

  it("rejects phone numbers without + prefix before calling the vendor", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-bad-phone",
      name: "Bad Phone",
      phone: "5551234567",
    } as any);
    vi.mocked(db.smsMessage.create).mockResolvedValue({
      ...SMS_RECORD,
      id: "sms-bad",
      toNumber: "5551234567",
    } as any);
    vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);

    const result = await sendSmsToCustomer({
      customerId: "cust-bad-phone",
      body: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("E.164");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects phone numbers shorter than 8 digits", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-short",
      name: "Short",
      phone: "+12345",
    } as any);
    vi.mocked(db.smsMessage.create).mockResolvedValue({
      ...SMS_RECORD,
      id: "sms-short",
      toNumber: "+12345",
    } as any);
    vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);

    const result = await sendSmsToCustomer({
      customerId: "cust-short",
      body: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("E.164");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects phone numbers with letters or special characters", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-alpha",
      name: "Alpha",
      phone: "+1555ABC1234",
    } as any);
    vi.mocked(db.smsMessage.create).mockResolvedValue({
      ...SMS_RECORD,
      id: "sms-alpha",
      toNumber: "+1555ABC1234",
    } as any);
    vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);

    const result = await sendSmsToCustomer({
      customerId: "cust-alpha",
      body: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("E.164");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects numbers starting with +0", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-zero",
      name: "Zero",
      phone: "+05551234567",
    } as any);
    vi.mocked(db.smsMessage.create).mockResolvedValue({
      ...SMS_RECORD,
      id: "sms-zero",
      toNumber: "+05551234567",
    } as any);
    vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);

    const result = await sendSmsToCustomer({
      customerId: "cust-zero",
      body: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("E.164");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2b. Vonage receives digits-only (no '+' prefix)
// ═════════════════════════════════════════════════════════════════════════════

describe("Vonage number formatting", () => {
  it("strips the + prefix from to and from numbers for Vonage", async () => {
    setupAuth();
    setupSmsProvider("vonage");
    vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
    vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
    vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);
    mockVonageSuccess();

    await sendSmsToCustomer({
      customerId: CUSTOMER_A.id,
      body: "Hello",
    });

    const fetchCall = mockFetch.mock.calls[0];
    const sentBody = JSON.parse(fetchCall[1].body as string);
    // Vonage should receive digits only, no +
    expect(sentBody.to).toBe("15551234567");
    expect(sentBody.from).toBe("15550000000");
    expect(sentBody.to).not.toContain("+");
    expect(sentBody.from).not.toContain("+");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Never show "SMS Sent" unless vendor confirmed acceptance
// ═════════════════════════════════════════════════════════════════════════════

describe("SMS status reflects actual vendor response", () => {
  describe("Twilio", () => {
    it("returns success only after Twilio accepts the message", async () => {
      setupAuth();
      setupSmsProvider("twilio");
      vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
      vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
      vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);
      mockTwilioSuccess();

      const result = await sendSmsToCustomer({
        customerId: CUSTOMER_A.id,
        body: "Hello",
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({ status: "sent" }),
      );

      // DB record updated to "sent" with providerMsgId
      expect(vi.mocked(db.smsMessage.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "sent",
            providerMsgId: "SM_abc123",
          }),
        }),
      );
    });

    it("returns failure and marks record as failed when Twilio rejects", async () => {
      setupAuth();
      setupSmsProvider("twilio");
      vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
      vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
      vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);
      mockTwilioFailure();

      const result = await sendSmsToCustomer({
        customerId: CUSTOMER_A.id,
        body: "Hello",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to send SMS");

      // DB record updated to "failed" with error
      expect(vi.mocked(db.smsMessage.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            errorMessage: expect.stringContaining("Twilio error"),
          }),
        }),
      );
    });
  });

  describe("Vonage", () => {
    it("returns success only after Vonage confirms status 0", async () => {
      setupAuth();
      setupSmsProvider("vonage");
      vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
      vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
      vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);
      mockVonageSuccess();

      const result = await sendSmsToCustomer({
        customerId: CUSTOMER_A.id,
        body: "Hello",
      });

      expect(result.success).toBe(true);
      expect(vi.mocked(db.smsMessage.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "sent",
            providerMsgId: "vonage_123",
          }),
        }),
      );
    });

    it("returns failure when Vonage response status is non-zero", async () => {
      setupAuth();
      setupSmsProvider("vonage");
      vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
      vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
      vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);
      mockVonageFailure();

      const result = await sendSmsToCustomer({
        customerId: CUSTOMER_A.id,
        body: "Hello",
      });

      expect(result.success).toBe(false);
      expect(vi.mocked(db.smsMessage.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            errorMessage: expect.stringContaining("Vonage error"),
          }),
        }),
      );
    });
  });

  describe("Telnyx", () => {
    it("returns success only after Telnyx accepts the message", async () => {
      setupAuth();
      setupSmsProvider("telnyx");
      vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
      vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
      vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);
      mockTelnyxSuccess();

      const result = await sendSmsToCustomer({
        customerId: CUSTOMER_A.id,
        body: "Hello",
      });

      expect(result.success).toBe(true);
      expect(vi.mocked(db.smsMessage.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "sent",
            providerMsgId: "telnyx_123",
          }),
        }),
      );
    });

    it("returns failure when Telnyx rejects the message", async () => {
      setupAuth();
      setupSmsProvider("telnyx");
      vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
      vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
      vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);
      mockTelnyxFailure();

      const result = await sendSmsToCustomer({
        customerId: CUSTOMER_A.id,
        body: "Hello",
      });

      expect(result.success).toBe(false);
      expect(vi.mocked(db.smsMessage.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            errorMessage: expect.stringContaining("Telnyx error"),
          }),
        }),
      );
    });
  });

  it("initial SMS record is created with status 'queued', not 'sent'", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
    vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
    vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);
    mockTwilioSuccess();

    await sendSmsToCustomer({
      customerId: CUSTOMER_A.id,
      body: "Hello",
    });

    // The initial create must be "queued" — never "sent" before vendor confirms
    expect(vi.mocked(db.smsMessage.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "queued",
        }),
      }),
    );
  });

  it("never updates to 'sent' if the vendor call throws", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
    vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
    vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);

    // Simulate a network error — vendor never responds
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await sendSmsToCustomer({
      customerId: CUSTOMER_A.id,
      body: "Hello",
    });

    expect(result.success).toBe(false);

    // Must have updated to "failed", never to "sent"
    const updateCalls = vi.mocked(db.smsMessage.update).mock.calls;
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
        }),
      }),
    );
  });

  it("does not call vendor API if customer lookup fails", async () => {
    setupAuth();
    setupSmsProvider("twilio");
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);

    await sendSmsToCustomer({
      customerId: "nonexistent",
      body: "Hello",
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(vi.mocked(db.smsMessage.create)).not.toHaveBeenCalled();
  });

  it("does not call vendor API if SMS provider is not configured", async () => {
    setupAuth();
    // No provider configured
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue(CUSTOMER_A as any);
    vi.mocked(db.smsMessage.create).mockResolvedValue(SMS_RECORD as any);
    vi.mocked(db.smsMessage.update).mockResolvedValue({} as any);

    const result = await sendSmsToCustomer({
      customerId: CUSTOMER_A.id,
      body: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
