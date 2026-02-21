import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("lucide-react", () => ({
  Camera: () => <span data-testid="icon-camera" />,
  ChevronLeft: () => <span data-testid="icon-chevron-left" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  CreditCard: () => <span data-testid="icon-credit-card" />,
  Download: () => <span data-testid="icon-download" />,
  FileText: () => <span data-testid="icon-file-text" />,
  Film: () => <span data-testid="icon-film" />,
  Loader2: () => <span data-testid="icon-loader" />,
  Paperclip: () => <span data-testid="icon-paperclip" />,
  X: () => <span data-testid="icon-x" />,
}));

import { InvoiceView } from "@/app/(public)/share/invoice/[orgId]/[token]/invoice-view";

const WORKSHOP = {
  name: "Speed Shop",
  address: "123 Main St",
  phone: "555-1234",
  email: "shop@example.com",
};

const VEHICLE = {
  make: "Honda",
  model: "Civic",
  year: 2019,
  vin: "VIN999",
  licensePlate: "XYZ-789",
  mileage: 55000,
  customer: {
    name: "Bob Builder",
    email: "bob@example.com",
    phone: "555-0001",
    address: "99 Build St",
    company: null,
  },
};

const BASE_RECORD = {
  id: "inv-1",
  title: "Full Service",
  description: null,
  type: "service",
  status: "completed",
  serviceDate: new Date("2024-03-10"),
  shopName: null,
  techName: "Alice",
  mileage: 55000,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 200,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 200,
  cost: 200,
  invoiceNumber: "INV-0001",
  manuallyPaid: false,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  partItems: [],
  laborItems: [],
  payments: [],
  attachments: [],
  vehicle: VEHICLE,
};

const DEFAULT_PROPS = {
  record: BASE_RECORD,
  workshop: WORKSHOP,
  currencyCode: "USD",
  orgId: "org-1",
  token: "tok-xyz",
  enabledProviders: [],
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
  // Default: no payment params in URL
  vi.stubGlobal("location", {
    search: "",
    pathname: "/share/invoice/org-1/tok-xyz",
    href: "http://localhost/share/invoice/org-1/tok-xyz",
  });
  vi.stubGlobal("history", { replaceState: vi.fn() });
});

describe("InvoiceView", () => {
  describe("rendering", () => {
    it("renders invoice number and title", () => {
      render(<InvoiceView {...DEFAULT_PROPS} />);
      expect(screen.getByText("INV-0001")).toBeInTheDocument();
      expect(screen.getByText("Full Service")).toBeInTheDocument();
    });

    it("renders Download PDF button", () => {
      render(<InvoiceView {...DEFAULT_PROPS} />);
      expect(screen.getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
    });

    it("renders customer info in Bill To section", () => {
      render(<InvoiceView {...DEFAULT_PROPS} />);
      expect(screen.getByText("Bill To")).toBeInTheDocument();
      expect(screen.getByText("Bob Builder")).toBeInTheDocument();
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    });

    it("renders vehicle info", () => {
      render(<InvoiceView {...DEFAULT_PROPS} />);
      expect(screen.getByText("2019 Honda Civic")).toBeInTheDocument();
    });

    it("renders technician name", () => {
      render(<InvoiceView {...DEFAULT_PROPS} />);
      expect(screen.getByText("Tech: Alice")).toBeInTheDocument();
    });

    it("renders parts table when parts are present", () => {
      const props = {
        ...DEFAULT_PROPS,
        record: {
          ...BASE_RECORD,
          partItems: [{ partNumber: "B-200", name: "Brake Pads", quantity: 2, unitPrice: 45, total: 90 }],
        },
      };
      render(<InvoiceView {...props} />);
      expect(screen.getByText("Parts")).toBeInTheDocument();
      expect(screen.getByText("Brake Pads")).toBeInTheDocument();
    });

    it("renders labor table when labor items are present", () => {
      const props = {
        ...DEFAULT_PROPS,
        record: {
          ...BASE_RECORD,
          laborItems: [{ description: "Brake Replacement", hours: 1.5, rate: 90, total: 135 }],
        },
      };
      render(<InvoiceView {...props} />);
      expect(screen.getByText("Labor")).toBeInTheDocument();
      expect(screen.getByText("Brake Replacement")).toBeInTheDocument();
    });

    it("renders terms of sale link when termsOfSaleUrl is provided", () => {
      render(<InvoiceView {...DEFAULT_PROPS} termsOfSaleUrl="https://example.com/terms" />);
      const link = screen.getByRole("link", { name: /terms of sale/i });
      expect(link).toHaveAttribute("href", "https://example.com/terms");
    });

    it("does not render terms of sale link when not provided", () => {
      render(<InvoiceView {...DEFAULT_PROPS} />);
      expect(screen.queryByRole("link", { name: /terms of sale/i })).not.toBeInTheDocument();
    });
  });

  describe("payment section", () => {
    it("shows payment section when balance is due and providers are enabled", () => {
      const props = {
        ...DEFAULT_PROPS,
        enabledProviders: ["stripe"],
      };
      render(<InvoiceView {...props} />);
      expect(screen.getByText("Balance Due")).toBeInTheDocument();
    });

    it("hides payment provider buttons when invoice is manually paid", () => {
      const props = {
        ...DEFAULT_PROPS,
        enabledProviders: ["stripe"],
        record: { ...BASE_RECORD, manuallyPaid: true },
      };
      render(<InvoiceView {...props} />);
      // Payment provider buttons should not render when balance is zero
      expect(screen.queryByRole("button", { name: /pay.*card/i })).not.toBeInTheDocument();
    });

    it("hides payment provider buttons when balance is zero from payments", () => {
      const props = {
        ...DEFAULT_PROPS,
        enabledProviders: ["stripe"],
        record: {
          ...BASE_RECORD,
          payments: [{ amount: 200, date: new Date(), method: "card" }],
        },
      };
      render(<InvoiceView {...props} />);
      expect(screen.queryByRole("button", { name: /pay.*card/i })).not.toBeInTheDocument();
    });

    it("shows Stripe pay button when stripe provider is enabled", () => {
      render(<InvoiceView {...DEFAULT_PROPS} enabledProviders={["stripe"]} />);
      expect(screen.getByRole("button", { name: /pay.*card/i })).toBeInTheDocument();
    });

    it("shows Vipps pay button when vipps provider is enabled", () => {
      render(<InvoiceView {...DEFAULT_PROPS} enabledProviders={["vipps"]} />);
      expect(screen.getByRole("button", { name: /pay.*vipps/i })).toBeInTheDocument();
    });

    it("shows PayPal pay button when paypal provider is enabled", () => {
      render(<InvoiceView {...DEFAULT_PROPS} enabledProviders={["paypal"]} />);
      expect(screen.getByRole("button", { name: /pay.*paypal/i })).toBeInTheDocument();
    });

    it("shows Full amount and Partial payment toggle buttons", () => {
      render(<InvoiceView {...DEFAULT_PROPS} enabledProviders={["stripe"]} />);
      expect(screen.getByRole("button", { name: /full amount/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /partial payment/i })).toBeInTheDocument();
    });

    it("shows amount input when Partial payment is selected", async () => {
      render(<InvoiceView {...DEFAULT_PROPS} enabledProviders={["stripe"]} />);
      await userEvent.click(screen.getByRole("button", { name: /partial payment/i }));
      expect(screen.getByLabelText(/enter amount/i)).toBeInTheDocument();
    });

    it("hides amount input when Full amount is re-selected", async () => {
      render(<InvoiceView {...DEFAULT_PROPS} enabledProviders={["stripe"]} />);
      await userEvent.click(screen.getByRole("button", { name: /partial payment/i }));
      expect(screen.getByLabelText(/enter amount/i)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /full amount/i }));
      expect(screen.queryByLabelText(/enter amount/i)).not.toBeInTheDocument();
    });

    it("shows validation error when amount is invalid", async () => {
      render(<InvoiceView {...DEFAULT_PROPS} enabledProviders={["stripe"]} />);
      await userEvent.click(screen.getByRole("button", { name: /partial payment/i }));
      const input = screen.getByLabelText(/enter amount/i);
      // Use fireEvent for number inputs to avoid userEvent quirks with controlled inputs
      fireEvent.change(input, { target: { value: "0" } });
      await userEvent.click(screen.getByRole("button", { name: /pay.*card/i }));
      await waitFor(() => {
        expect(screen.getByText(/valid amount/i)).toBeInTheDocument();
      });
    });

    it("calls checkout endpoint when pay button is clicked", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ redirectUrl: "https://stripe.com/pay" }),
      });
      vi.stubGlobal("location", {
        search: "",
        pathname: "/share/invoice/org-1/tok-xyz",
        href: "http://localhost/share/invoice/org-1/tok-xyz",
        assign: vi.fn(),
      });
      render(<InvoiceView {...DEFAULT_PROPS} enabledProviders={["stripe"]} />);
      await userEvent.click(screen.getByRole("button", { name: /pay.*card/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/v1/share/invoice/org-1/tok-xyz/checkout",
          expect.objectContaining({ method: "POST" })
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.provider).toBe("stripe");
        expect(body.amount).toBe(200);
      });
    });

    it("shows payment error when checkout fails", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: "Provider unavailable" }),
      });
      render(<InvoiceView {...DEFAULT_PROPS} enabledProviders={["stripe"]} />);
      await userEvent.click(screen.getByRole("button", { name: /pay.*card/i }));

      await waitFor(() => {
        expect(screen.getByText("Provider unavailable")).toBeInTheDocument();
      });
    });

    it("shows payment success banner after verifying payment from URL params", async () => {
      vi.stubGlobal("location", {
        search: "?session_id=stripe-session-123",
        pathname: "/share/invoice/org-1/tok-xyz",
        href: "http://localhost/share/invoice/org-1/tok-xyz?session_id=stripe-session-123",
      });
      vi.stubGlobal("history", { replaceState: vi.fn() });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ verified: true, amount: 200 }),
      });
      render(<InvoiceView {...DEFAULT_PROPS} enabledProviders={["stripe"]} />);

      await waitFor(() => {
        expect(screen.getByText(/payment received/i)).toBeInTheDocument();
      });
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/share/invoice/org-1/tok-xyz/verify",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"provider":"stripe"'),
        })
      );
    });

    it("verifies Vipps payment from reference URL param", async () => {
      vi.stubGlobal("location", {
        search: "?reference=vipps-ref-456",
        pathname: "/share/invoice/org-1/tok-xyz",
        href: "http://localhost/share/invoice/org-1/tok-xyz?reference=vipps-ref-456",
      });
      vi.stubGlobal("history", { replaceState: vi.fn() });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ verified: true, amount: 200 }),
      });
      render(<InvoiceView {...DEFAULT_PROPS} enabledProviders={["vipps"]} />);

      await waitFor(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.provider).toBe("vipps");
        expect(body.externalId).toBe("vipps-ref-456");
      });
    });

    it("shows PAID IN FULL when balance is zero", () => {
      const props = {
        ...DEFAULT_PROPS,
        record: {
          ...BASE_RECORD,
          payments: [{ amount: 200, date: new Date(), method: "card" }],
        },
      };
      render(<InvoiceView {...props} />);
      expect(screen.getByText("PAID IN FULL")).toBeInTheDocument();
    });
  });

  describe("service images", () => {
    const IMAGE_ATTACHMENT = {
      id: "att-1",
      fileName: "service-photo.jpg",
      fileUrl: "/api/v1/files/tok-xyz/services/service-photo.jpg",
      fileType: "image/jpeg",
      fileSize: 50000,
      category: "services",
      description: "Before photo",
    };

    it("renders image thumbnails when image attachments are present", () => {
      const props = {
        ...DEFAULT_PROPS,
        record: { ...BASE_RECORD, attachments: [IMAGE_ATTACHMENT] },
      };
      render(<InvoiceView {...props} />);
      expect(screen.getByText(/service images/i)).toBeInTheDocument();
      expect(screen.getByAltText("Before photo")).toBeInTheDocument();
    });

    it("opens carousel when image thumbnail is clicked", async () => {
      const props = {
        ...DEFAULT_PROPS,
        record: { ...BASE_RECORD, attachments: [IMAGE_ATTACHMENT] },
      };
      render(<InvoiceView {...props} />);
      const thumbnail = screen.getByAltText("Before photo");
      await userEvent.click(thumbnail.closest("button")!);
      // Carousel is shown (image is in a fullscreen modal)
      expect(screen.getAllByAltText("Before photo").length).toBeGreaterThan(1);
    });

    it("closes carousel when X button is clicked", async () => {
      const props = {
        ...DEFAULT_PROPS,
        record: { ...BASE_RECORD, attachments: [IMAGE_ATTACHMENT] },
      };
      render(<InvoiceView {...props} />);
      await userEvent.click(screen.getByAltText("Before photo").closest("button")!);
      const closeBtn = screen.getByTestId("icon-x").closest("button")!;
      await userEvent.click(closeBtn);
      // After closing, only one image remains (the thumbnail)
      expect(screen.getAllByAltText("Before photo").length).toBe(1);
    });

    it("deduplicates images with the same filename", () => {
      const duplicate = { ...IMAGE_ATTACHMENT, id: "att-2" };
      const props = {
        ...DEFAULT_PROPS,
        record: { ...BASE_RECORD, attachments: [IMAGE_ATTACHMENT, duplicate] },
      };
      render(<InvoiceView {...props} />);
      // Should show "1" in the title, not "2"
      expect(screen.getByText(/service images \(1\)/i)).toBeInTheDocument();
    });
  });

  describe("diagnostic reports", () => {
    it("renders PDF attachment as a downloadable link", () => {
      const pdfAttachment = {
        id: "att-pdf",
        fileName: "diagnostic.pdf",
        fileUrl: "/api/v1/files/tok-xyz/services/diagnostic.pdf",
        fileType: "application/pdf",
        fileSize: 20000,
        category: "services",
        description: null,
      };
      const props = {
        ...DEFAULT_PROPS,
        record: { ...BASE_RECORD, attachments: [pdfAttachment] },
      };
      render(<InvoiceView {...props} />);
      expect(screen.getByText(/diagnostic reports/i)).toBeInTheDocument();
      const link = screen.getByRole("link", { name: /diagnostic.pdf/i });
      expect(link).toHaveAttribute("download", "diagnostic.pdf");
    });
  });

  describe("Download PDF", () => {
    it("fetches the PDF from the correct API URL", async () => {
      const mockBlob = new Blob(["pdf"], { type: "application/pdf" });
      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      render(<InvoiceView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/v1/share/invoice/org-1/tok-xyz/pdf");
      });
    });
  });
});
