import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("lucide-react", () => ({
  AlertTriangle: () => <span data-testid="icon-alert" />,
  Check: () => <span data-testid="icon-check" />,
  CheckCircle2: () => <span data-testid="icon-check-circle" />,
  ChevronLeft: () => <span data-testid="icon-left" />,
  ChevronRight: () => <span data-testid="icon-right" />,
  ClipboardCheck: () => <span data-testid="icon-clipboard" />,
  Download: () => <span data-testid="icon-download" />,
  FileText: () => <span data-testid="icon-file-text" />,
  Loader2: () => <span data-testid="icon-loader" />,
  X: () => <span data-testid="icon-x" />,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: React.HTMLAttributes<HTMLButtonElement> & { disabled?: boolean; variant?: string }) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/features/inspections/Components/QuoteRequestDialog", () => ({
  QuoteRequestDialog: ({ open, onOpenChange, onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void }) =>
    open ? (
      <div data-testid="quote-request-dialog">
        <button onClick={onSuccess} data-testid="dialog-submit">Submit</button>
        <button onClick={() => onOpenChange(false)} data-testid="dialog-close">Close</button>
      </div>
    ) : null,
}));

import { InspectionView } from "@/app/(public)/share/inspection/[orgId]/[token]/inspection-view";
import { toast } from "sonner";

const WORKSHOP = {
  name: "Quality Auto",
  address: "5 Shop Lane",
  phone: "555-2222",
  email: "qa@example.com",
};

const VEHICLE = {
  make: "Ford",
  model: "F-150",
  year: 2021,
  vin: "FORD123",
  licensePlate: "TR-001",
  mileage: 30000,
  customer: { name: "Dave Owner", email: "dave@example.com", phone: "555-3333" },
};

const PASS_ITEM = {
  id: "item-pass",
  name: "Oil Level",
  section: "Engine",
  sortOrder: 1,
  condition: "pass",
  notes: null,
  imageUrls: [],
};

const FAIL_ITEM = {
  id: "item-fail",
  name: "Brake Pads",
  section: "Brakes",
  sortOrder: 2,
  condition: "fail",
  notes: "Worn down to 2mm",
  imageUrls: [],
};

const ATTENTION_ITEM = {
  id: "item-attention",
  name: "Tire Tread",
  section: "Tires",
  sortOrder: 3,
  condition: "attention",
  notes: null,
  imageUrls: [],
};

const BASE_INSPECTION = {
  id: "insp-1",
  status: "completed",
  mileage: 30000,
  notes: null,
  completedAt: new Date("2024-04-01"),
  createdAt: new Date("2024-04-01"),
  vehicle: VEHICLE,
  template: { name: "Full Inspection" },
  items: [PASS_ITEM, FAIL_ITEM, ATTENTION_ITEM],
};

const DEFAULT_PROPS = {
  inspection: BASE_INSPECTION,
  workshop: WORKSHOP,
  logoUrl: "",
  primaryColor: "#d97706",
  showTorqvoiceBranding: false,
  publicToken: "pub-tok-insp",
  orgId: "org-1",
  hasExistingQuoteRequest: false,
};

let mockFetch: ReturnType<typeof vi.fn>;
let mockWindowOpen: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);
  mockWindowOpen = vi.fn();
  vi.stubGlobal("open", mockWindowOpen);
});

describe("InspectionView", () => {
  describe("rendering", () => {
    it("renders the workshop name", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByText("Quality Auto")).toBeInTheDocument();
    });

    it("renders vehicle information", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByText("2021 Ford F-150")).toBeInTheDocument();
      expect(screen.getByText("VIN: FORD123")).toBeInTheDocument();
    });

    it("renders customer information", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByText("Dave Owner")).toBeInTheDocument();
    });

    it("renders Vehicle Inspection heading", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByText("Vehicle Inspection")).toBeInTheDocument();
    });
  });

  describe("summary bar", () => {
    it("shows total inspected item count", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      // The summary renders: <span class="font-semibold text-gray-900">3</span> inspected
      // getByText can't match compound nodes, so check the count span directly.
      const countSpan = document.querySelector("span.font-semibold.text-gray-900");
      expect(countSpan?.textContent).toBe("3");
    });

    it("shows correct pass count", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByText("1 Pass")).toBeInTheDocument();
    });

    it("shows correct fail count", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByText("1 Fail")).toBeInTheDocument();
    });

    it("shows correct attention count", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByText("1 Attention")).toBeInTheDocument();
    });

    it("excludes not_inspected items from the summary", () => {
      const props = {
        ...DEFAULT_PROPS,
        inspection: {
          ...BASE_INSPECTION,
          items: [
            PASS_ITEM,
            { ...FAIL_ITEM, condition: "not_inspected" },
          ],
        },
      };
      render(<InspectionView {...props} />);
      expect(screen.getByText("1 Pass")).toBeInTheDocument();
      expect(screen.getByText("0 Fail")).toBeInTheDocument();
    });
  });

  describe("inspection items", () => {
    it("renders inspection items grouped by section", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByText("Engine")).toBeInTheDocument();
      expect(screen.getByText("Brakes")).toBeInTheDocument();
      expect(screen.getByText("Tires")).toBeInTheDocument();
    });

    it("shows Pass badge on passing item", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByText("Pass")).toBeInTheDocument();
    });

    it("shows Fail badge on failing item", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByText("Fail")).toBeInTheDocument();
    });

    it("shows Attention badge on attention item", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByText("Attention")).toBeInTheDocument();
    });

    it("renders item notes when present", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByText("Worn down to 2mm")).toBeInTheDocument();
    });

    it("does not render not_inspected items", () => {
      const props = {
        ...DEFAULT_PROPS,
        inspection: {
          ...BASE_INSPECTION,
          items: [{ ...PASS_ITEM, condition: "not_inspected", name: "Hidden Item" }],
        },
      };
      render(<InspectionView {...props} />);
      expect(screen.queryByText("Hidden Item")).not.toBeInTheDocument();
    });
  });

  describe("quote request button", () => {
    it("shows Request a Quote button when there are issues", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.getByRole("button", { name: /request a quote/i })).toBeInTheDocument();
    });

    it("does not show Request a Quote button when all items pass", () => {
      const props = {
        ...DEFAULT_PROPS,
        inspection: { ...BASE_INSPECTION, items: [PASS_ITEM] },
      };
      render(<InspectionView {...props} />);
      expect(screen.queryByRole("button", { name: /request a quote/i })).not.toBeInTheDocument();
    });

    it("shows Quote Requested — Cancel button when hasExistingQuoteRequest=true", () => {
      render(<InspectionView {...DEFAULT_PROPS} hasExistingQuoteRequest={true} />);
      expect(screen.getByRole("button", { name: /quote requested/i })).toBeInTheDocument();
      expect(screen.getByText(/cancel/i)).toBeInTheDocument();
    });

    it("does not show Request a Quote when quote is already requested", () => {
      render(<InspectionView {...DEFAULT_PROPS} hasExistingQuoteRequest={true} />);
      expect(screen.queryByRole("button", { name: /^request a quote$/i })).not.toBeInTheDocument();
    });

    it("opens quote request dialog when button is clicked", async () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /request a quote/i }));
      expect(screen.getByTestId("quote-request-dialog")).toBeInTheDocument();
    });

    it("switches to Quote Requested state after dialog submission", async () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /request a quote/i }));
      await userEvent.click(screen.getByTestId("dialog-submit"));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /quote requested/i })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^request a quote$/i })).not.toBeInTheDocument();
      });
    });
  });

  describe("cancel quote request", () => {
    it("calls DELETE /api/public/inspection-quote-request with correct body", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      render(<InspectionView {...DEFAULT_PROPS} hasExistingQuoteRequest={true} />);
      await userEvent.click(screen.getByRole("button", { name: /quote requested/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/public/inspection-quote-request",
          expect.objectContaining({ method: "DELETE" })
        );
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.inspectionId).toBe("insp-1");
        expect(body.publicToken).toBe("pub-tok-insp");
      });
    });

    it("shows Request a Quote button after successful cancellation", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      render(<InspectionView {...DEFAULT_PROPS} hasExistingQuoteRequest={true} />);
      await userEvent.click(screen.getByRole("button", { name: /quote requested/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /request a quote/i })).toBeInTheDocument();
      });
    });

    it("shows toast success after cancellation", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      render(<InspectionView {...DEFAULT_PROPS} hasExistingQuoteRequest={true} />);
      await userEvent.click(screen.getByRole("button", { name: /quote requested/i }));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Quote request cancelled");
      });
    });

    it("shows toast error when cancellation fails", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ success: false, error: "Not found" }),
      });
      render(<InspectionView {...DEFAULT_PROPS} hasExistingQuoteRequest={true} />);
      await userEvent.click(screen.getByRole("button", { name: /quote requested/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Not found");
      });
    });
  });

  describe("Download PDF", () => {
    it("opens the PDF in a new window with the correct URL", async () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));
      expect(mockWindowOpen).toHaveBeenCalledWith(
        "/api/share/inspection/org-1/pub-tok-insp/pdf",
        "_blank"
      );
    });
  });

  describe("quote available banner", () => {
    it("shows the quote available banner when quoteShareUrl is provided", () => {
      render(<InspectionView {...DEFAULT_PROPS} quoteShareUrl="/share/quote/org-1/quote-tok" />);
      expect(screen.getByText(/a quote has been prepared/i)).toBeInTheDocument();
    });

    it("renders View Quote link pointing to the share URL", () => {
      render(<InspectionView {...DEFAULT_PROPS} quoteShareUrl="/share/quote/org-1/quote-tok" />);
      const link = screen.getByRole("link", { name: /view quote/i });
      expect(link).toHaveAttribute("href", "/share/quote/org-1/quote-tok");
    });

    it("does not show quote banner when quoteShareUrl is not provided", () => {
      render(<InspectionView {...DEFAULT_PROPS} />);
      expect(screen.queryByText(/a quote has been prepared/i)).not.toBeInTheDocument();
    });
  });

  describe("image carousel", () => {
    // Use a PASS item (Check icon) to avoid collision with the Fail badge X icon
    const IMG_ITEM = {
      ...PASS_ITEM,
      name: "Oil Level",
      imageUrls: ["/api/files/public/tok/services/photo1.jpg"],
    };

    it("renders inspection image thumbnails", () => {
      const props = {
        ...DEFAULT_PROPS,
        inspection: { ...BASE_INSPECTION, items: [IMG_ITEM] },
      };
      render(<InspectionView {...props} />);
      expect(screen.getByAltText("Oil Level 1")).toBeInTheDocument();
    });

    it("opens carousel when image is clicked", async () => {
      const props = {
        ...DEFAULT_PROPS,
        inspection: { ...BASE_INSPECTION, items: [IMG_ITEM] },
      };
      render(<InspectionView {...props} />);
      const thumbnail = screen.getByAltText("Oil Level 1").closest("button")!;
      await userEvent.click(thumbnail);
      // Carousel modal appears — only one X icon because PASS uses Check icon
      expect(screen.getByTestId("icon-x").closest("button")).toBeInTheDocument();
    });

    it("closes carousel when X button is clicked", async () => {
      const props = {
        ...DEFAULT_PROPS,
        inspection: { ...BASE_INSPECTION, items: [IMG_ITEM] },
      };
      render(<InspectionView {...props} />);
      await userEvent.click(screen.getByAltText("Oil Level 1").closest("button")!);
      await userEvent.click(screen.getByTestId("icon-x").closest("button")!);
      // After close, the carousel X button is gone
      expect(screen.queryByTestId("icon-x")).not.toBeInTheDocument();
    });
  });
});
