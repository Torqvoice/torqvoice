import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("lucide-react", () => ({
  Camera: () => <span data-testid="icon-camera" />,
  Check: () => <span data-testid="icon-check" />,
  ChevronLeft: () => <span data-testid="icon-chevron-left" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  Download: () => <span data-testid="icon-download" />,
  FileText: () => <span data-testid="icon-file-text" />,
  Loader2: () => <span data-testid="icon-loader" />,
  MessageSquare: () => <span data-testid="icon-message" />,
  X: () => <span data-testid="icon-x" />,
}));

import { QuoteView } from "@/app/(public)/share/quote/[orgId]/[token]/quote-view";

const WORKSHOP = {
  name: "Speed Shop",
  address: "123 Main St",
  phone: "555-1234",
  email: "shop@example.com",
};

const BASE_QUOTE = {
  id: "quote-1",
  quoteNumber: "QT-0001",
  title: "Oil Change & Filter",
  description: null,
  status: "sent",
  validUntil: null,
  createdAt: new Date("2024-01-15"),
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  totalAmount: 100,
  notes: null,
  partItems: [],
  laborItems: [],
  customer: null,
  vehicle: null,
};

const DEFAULT_PROPS = {
  quote: BASE_QUOTE,
  workshop: WORKSHOP,
  currencyCode: "USD",
  orgId: "org-1",
  token: "tok-abc",
};

let mockFetch: ReturnType<typeof vi.fn>;

beforeAll(() => {
  URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  vi.resetAllMocks();
  URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
  URL.revokeObjectURL = vi.fn();
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
});

describe("QuoteView", () => {
  describe("rendering", () => {
    it("renders the quote number and title", () => {
      render(<QuoteView {...DEFAULT_PROPS} />);
      expect(screen.getByText("QT-0001")).toBeInTheDocument();
      expect(screen.getByText("Oil Change & Filter")).toBeInTheDocument();
    });

    it("renders the Download PDF button", () => {
      render(<QuoteView {...DEFAULT_PROPS} />);
      expect(screen.getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
    });

    it("renders customer info when provided", () => {
      const props = {
        ...DEFAULT_PROPS,
        quote: {
          ...BASE_QUOTE,
          customer: {
            name: "Jane Doe",
            email: "jane@example.com",
            phone: "555-9999",
            address: "1 Park Ave",
            company: "Acme Corp",
          },
        },
      };
      render(<QuoteView {...props} />);
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("jane@example.com")).toBeInTheDocument();
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    });

    it("renders vehicle info when provided", () => {
      const props = {
        ...DEFAULT_PROPS,
        quote: {
          ...BASE_QUOTE,
          vehicle: { year: 2020, make: "Toyota", model: "Camry", vin: "VIN123", licensePlate: "ABC-123" },
        },
      };
      render(<QuoteView {...props} />);
      expect(screen.getByText("2020 Toyota Camry")).toBeInTheDocument();
      expect(screen.getByText("VIN: VIN123")).toBeInTheDocument();
      expect(screen.getByText("Plate: ABC-123")).toBeInTheDocument();
    });

    it("renders parts table when parts are present", () => {
      const props = {
        ...DEFAULT_PROPS,
        quote: {
          ...BASE_QUOTE,
          partItems: [{ partNumber: "P-001", name: "Oil Filter", quantity: 1, unitPrice: 15, total: 15 }],
        },
      };
      render(<QuoteView {...props} />);
      // "Parts" appears in both the table header and the totals row
      expect(screen.getAllByText("Parts").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Oil Filter")).toBeInTheDocument();
      expect(screen.getByText("P-001")).toBeInTheDocument();
    });

    it("does not render parts table when there are no parts", () => {
      render(<QuoteView {...DEFAULT_PROPS} />);
      expect(screen.queryByText("Parts")).not.toBeInTheDocument();
    });

    it("renders labor table when labor items are present", () => {
      const props = {
        ...DEFAULT_PROPS,
        quote: {
          ...BASE_QUOTE,
          laborItems: [{ description: "Labor - Oil Change", hours: 0.5, rate: 80, total: 40 }],
        },
      };
      render(<QuoteView {...props} />);
      // "Labor" appears in both the table header and the totals row
      expect(screen.getAllByText("Labor").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Labor - Oil Change")).toBeInTheDocument();
    });

    it("renders tax row when taxRate > 0", () => {
      const props = {
        ...DEFAULT_PROPS,
        quote: { ...BASE_QUOTE, taxRate: 10, taxAmount: 10, totalAmount: 110 },
      };
      render(<QuoteView {...props} />);
      expect(screen.getByText("Tax (10%)")).toBeInTheDocument();
    });

    it("renders discount row when discountAmount > 0", () => {
      const props = {
        ...DEFAULT_PROPS,
        quote: {
          ...BASE_QUOTE,
          discountType: "fixed",
          discountValue: 10,
          discountAmount: 10,
          subtotal: 110,
          totalAmount: 100,
        },
      };
      render(<QuoteView {...props} />);
      expect(screen.getByText(/discount/i)).toBeInTheDocument();
    });

    it("renders workshop name in header", () => {
      render(<QuoteView {...DEFAULT_PROPS} />);
      // Name appears in both the header h2 and the footer — verify at least one is a heading
      const instances = screen.getAllByText("Speed Shop");
      expect(instances.length).toBeGreaterThanOrEqual(1);
      expect(instances.some((el) => el.tagName === "H2")).toBe(true);
    });
  });

  describe("status badges and action buttons", () => {
    it("shows Accept Quote and Request Changes buttons when status=sent", () => {
      render(<QuoteView {...DEFAULT_PROPS} />);
      expect(screen.getByRole("button", { name: /accept quote/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /request changes/i })).toBeInTheDocument();
    });

    it("shows Accept Quote and Request Changes buttons when status=draft", () => {
      const props = { ...DEFAULT_PROPS, quote: { ...BASE_QUOTE, status: "draft" } };
      render(<QuoteView {...props} />);
      expect(screen.getByRole("button", { name: /accept quote/i })).toBeInTheDocument();
    });

    it("hides action buttons when status=accepted", () => {
      const props = { ...DEFAULT_PROPS, quote: { ...BASE_QUOTE, status: "accepted" } };
      render(<QuoteView {...props} />);
      expect(screen.queryByRole("button", { name: /accept quote/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /request changes/i })).not.toBeInTheDocument();
    });

    it("hides action buttons when status=rejected", () => {
      const props = { ...DEFAULT_PROPS, quote: { ...BASE_QUOTE, status: "rejected" } };
      render(<QuoteView {...props} />);
      expect(screen.queryByRole("button", { name: /accept quote/i })).not.toBeInTheDocument();
    });

    it("hides action buttons when status=expired", () => {
      const props = { ...DEFAULT_PROPS, quote: { ...BASE_QUOTE, status: "expired" } };
      render(<QuoteView {...props} />);
      expect(screen.queryByRole("button", { name: /accept quote/i })).not.toBeInTheDocument();
    });

    it("shows Quote Accepted confirmation when status=accepted", () => {
      const props = { ...DEFAULT_PROPS, quote: { ...BASE_QUOTE, status: "accepted" } };
      render(<QuoteView {...props} />);
      expect(screen.getByText("Quote Accepted")).toBeInTheDocument();
    });

    it("shows Changes Requested confirmation when status=changes_requested", () => {
      const props = { ...DEFAULT_PROPS, quote: { ...BASE_QUOTE, status: "changes_requested" } };
      render(<QuoteView {...props} />);
      // Unique confirmation message (the badge also says "Changes Requested" but this text is unique)
      expect(screen.getByText(/your change request has been submitted/i)).toBeInTheDocument();
    });
  });

  describe("Accept Quote interaction", () => {
    it("calls /api/public/forms/quote-response with action=accepted", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      render(<QuoteView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /accept quote/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/public/forms/quote-response",
          expect.objectContaining({ method: "POST" })
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.action).toBe("accepted");
        expect(body.quoteId).toBe("quote-1");
        expect(body.publicToken).toBe("tok-abc");
      });
    });

    it("shows Quote Accepted message after successful accept", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      render(<QuoteView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /accept quote/i }));

      await waitFor(() => {
        expect(screen.getByText("Quote Accepted")).toBeInTheDocument();
      });
    });

    it("hides action buttons after accepting", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      render(<QuoteView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /accept quote/i }));

      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /accept quote/i })).not.toBeInTheDocument();
      });
    });
  });

  describe("Request Changes interaction", () => {
    it("shows the changes form when Request Changes is clicked", async () => {
      render(<QuoteView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /request changes/i }));
      expect(screen.getByPlaceholderText(/describe the changes/i)).toBeInTheDocument();
    });

    it("Submit Request button is disabled when message is empty", async () => {
      render(<QuoteView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /request changes/i }));
      expect(screen.getByRole("button", { name: /submit request/i })).toBeDisabled();
    });

    it("Submit Request button is enabled after typing a message", async () => {
      render(<QuoteView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /request changes/i }));
      await userEvent.type(screen.getByPlaceholderText(/describe the changes/i), "Please fix the price");
      expect(screen.getByRole("button", { name: /submit request/i })).not.toBeDisabled();
    });

    it("submits changes_requested with the typed message", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      render(<QuoteView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /request changes/i }));
      await userEvent.type(screen.getByPlaceholderText(/describe the changes/i), "Need a discount");
      await userEvent.click(screen.getByRole("button", { name: /submit request/i }));

      await waitFor(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.action).toBe("changes_requested");
        expect(body.message).toBe("Need a discount");
      });
    });

    it("shows Changes Requested confirmation after submitting", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      render(<QuoteView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /request changes/i }));
      await userEvent.type(screen.getByPlaceholderText(/describe the changes/i), "Fix it");
      await userEvent.click(screen.getByRole("button", { name: /submit request/i }));

      await waitFor(() => {
        expect(screen.getByText(/your change request has been submitted/i)).toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/describe the changes/i)).not.toBeInTheDocument();
      });
    });

    it("Cancel button hides the changes form", async () => {
      render(<QuoteView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /request changes/i }));
      expect(screen.getByPlaceholderText(/describe the changes/i)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
      expect(screen.queryByPlaceholderText(/describe the changes/i)).not.toBeInTheDocument();
    });
  });

  describe("Download PDF", () => {
    it("fetches the PDF from the correct API URL", async () => {
      const mockBlob = new Blob(["pdf"], { type: "application/pdf" });
      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      render(<QuoteView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/public/share/quote/org-1/tok-abc/pdf");
      });
    });

    it("creates an object URL for the downloaded blob", async () => {
      const mockBlob = new Blob(["pdf"], { type: "application/pdf" });
      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      render(<QuoteView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

      await waitFor(() => {
        expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
      });
    });

    it("revokes the object URL after download", async () => {
      const mockBlob = new Blob(["pdf"], { type: "application/pdf" });
      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      render(<QuoteView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

      await waitFor(() => {
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
      });
    });
  });
});
