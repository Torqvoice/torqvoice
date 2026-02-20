import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    inspection: {
      findFirst: vi.fn(),
    },
    inspectionQuoteRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/notify", () => ({
  notify: vi.fn(),
}));

import { createQuoteRequest, cancelQuoteRequest } from "@/features/inspections/Actions/quoteRequestActions";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";

const mockFindInspection = vi.mocked(db.inspection.findFirst);
const mockFindRequest = vi.mocked(db.inspectionQuoteRequest.findFirst);
const mockCreateRequest = vi.mocked(db.inspectionQuoteRequest.create);
const mockDeleteRequest = vi.mocked(db.inspectionQuoteRequest.delete);
const mockNotify = vi.mocked(notify);

const INSPECTION = {
  id: "insp-1",
  publicToken: "pub-tok-1",
  organizationId: "org-1",
  vehicle: { customer: { name: "Jane Smith" } },
};

const PENDING_REQUEST = {
  id: "req-1",
  inspectionId: "insp-1",
  status: "pending",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockCreateRequest.mockResolvedValue({} as any);
  mockDeleteRequest.mockResolvedValue({} as any);
});

describe("createQuoteRequest", () => {
  it("throws ZodError when required fields are missing", async () => {
    await expect(createQuoteRequest({})).rejects.toThrow();
  });

  it("throws ZodError when selectedItemIds is empty", async () => {
    await expect(
      createQuoteRequest({ inspectionId: "insp-1", publicToken: "tok-1", selectedItemIds: [] })
    ).rejects.toThrow();
  });

  it("returns error when inspection is not found", async () => {
    mockFindInspection.mockResolvedValue(null);
    const result = await createQuoteRequest({
      inspectionId: "bad-id",
      publicToken: "bad-token",
      selectedItemIds: ["item-1"],
    });
    expect(result).toEqual({ success: false, error: "Inspection not found" });
  });

  it("returns error when a pending request already exists", async () => {
    mockFindInspection.mockResolvedValue(INSPECTION as any);
    mockFindRequest.mockResolvedValue(PENDING_REQUEST as any);
    const result = await createQuoteRequest({
      inspectionId: "insp-1",
      publicToken: "pub-tok-1",
      selectedItemIds: ["item-1"],
    });
    expect(result).toEqual({
      success: false,
      error: "A quote request is already pending for this inspection",
    });
  });

  it("creates the request and returns success", async () => {
    mockFindInspection.mockResolvedValue(INSPECTION as any);
    mockFindRequest.mockResolvedValue(null);
    const result = await createQuoteRequest({
      inspectionId: "insp-1",
      publicToken: "pub-tok-1",
      selectedItemIds: ["item-1", "item-2"],
    });
    expect(result).toEqual({ success: true });
    expect(mockCreateRequest).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inspectionId: "insp-1",
        selectedItemIds: ["item-1", "item-2"],
        organizationId: "org-1",
      }),
    });
  });

  it("stores optional message in the quote request", async () => {
    mockFindInspection.mockResolvedValue(INSPECTION as any);
    mockFindRequest.mockResolvedValue(null);
    await createQuoteRequest({
      inspectionId: "insp-1",
      publicToken: "pub-tok-1",
      selectedItemIds: ["item-1"],
      message: "Please prioritize the brakes",
    });
    expect(mockCreateRequest).toHaveBeenCalledWith({
      data: expect.objectContaining({ message: "Please prioritize the brakes" }),
    });
  });

  it("sends a notification after creating the request", async () => {
    mockFindInspection.mockResolvedValue(INSPECTION as any);
    mockFindRequest.mockResolvedValue(null);
    await createQuoteRequest({
      inspectionId: "insp-1",
      publicToken: "pub-tok-1",
      selectedItemIds: ["item-1", "item-2"],
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        type: "inspection_quote_request",
        entityId: "insp-1",
      })
    );
  });

  it("includes item count in notification message", async () => {
    mockFindInspection.mockResolvedValue(INSPECTION as any);
    mockFindRequest.mockResolvedValue(null);
    await createQuoteRequest({
      inspectionId: "insp-1",
      publicToken: "pub-tok-1",
      selectedItemIds: ["item-1", "item-2", "item-3"],
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("3 item(s)") })
    );
  });

  it("uses customer name in notification message", async () => {
    mockFindInspection.mockResolvedValue(INSPECTION as any);
    mockFindRequest.mockResolvedValue(null);
    await createQuoteRequest({
      inspectionId: "insp-1",
      publicToken: "pub-tok-1",
      selectedItemIds: ["item-1"],
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Jane Smith") })
    );
  });

  it("falls back to 'A customer' when customer is missing", async () => {
    mockFindInspection.mockResolvedValue({ ...INSPECTION, vehicle: { customer: null } } as any);
    mockFindRequest.mockResolvedValue(null);
    await createQuoteRequest({
      inspectionId: "insp-1",
      publicToken: "pub-tok-1",
      selectedItemIds: ["item-1"],
    });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("A customer") })
    );
  });
});

describe("cancelQuoteRequest", () => {
  it("returns error when inspection is not found", async () => {
    mockFindInspection.mockResolvedValue(null);
    const result = await cancelQuoteRequest({ inspectionId: "bad-id", publicToken: "bad-token" });
    expect(result).toEqual({ success: false, error: "Inspection not found" });
  });

  it("returns error when no pending request exists", async () => {
    mockFindInspection.mockResolvedValue(INSPECTION as any);
    mockFindRequest.mockResolvedValue(null);
    const result = await cancelQuoteRequest({ inspectionId: "insp-1", publicToken: "pub-tok-1" });
    expect(result).toEqual({ success: false, error: "No pending quote request found" });
  });

  it("deletes the pending request and returns success", async () => {
    mockFindInspection.mockResolvedValue(INSPECTION as any);
    mockFindRequest.mockResolvedValue(PENDING_REQUEST as any);
    const result = await cancelQuoteRequest({ inspectionId: "insp-1", publicToken: "pub-tok-1" });
    expect(result).toEqual({ success: true });
    expect(mockDeleteRequest).toHaveBeenCalledWith({ where: { id: "req-1" } });
  });

  it("does not delete when inspection token does not match", async () => {
    mockFindInspection.mockResolvedValue(null);
    await cancelQuoteRequest({ inspectionId: "insp-1", publicToken: "wrong-token" });
    expect(mockDeleteRequest).not.toHaveBeenCalled();
  });
});
