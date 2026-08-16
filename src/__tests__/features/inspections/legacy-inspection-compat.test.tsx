/**
 * Upgrade safety for inspections recorded before the overhaul.
 *
 * The fixtures here are deliberately built from the v1.2.38 schema and nothing
 * else: every column that tag's `InspectionItem` and `Inspection` models
 * actually had, and not one field added since. Anything the new code needs
 * beyond that is either absent or null, exactly as it will be on a workshop's
 * database the moment they deploy.
 *
 * The point is to catch the failure mode that a fixture written today cannot:
 * new rendering quietly depending on a column that older rows have no value
 * for. Copying the current fixture and nulling a few fields would drift as the
 * model grows; pinning to the old shape does not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Icon = () => <span data-testid="icon" />;
  return new Proxy(
    { ...actual },
    {
      get: (target, prop: string) =>
        prop === "__esModule" ? true : prop in target ? Icon : undefined,
    }
  );
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.HTMLAttributes<HTMLButtonElement> & { disabled?: boolean; variant?: string }) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/features/inspections/Components/QuoteRequestDialog", () => ({
  QuoteRequestDialog: () => null,
}));

import { InspectionView } from "@/app/(public)/share/inspection/[orgId]/[token]/inspection-view";
import { deriveTestResult, conditionGrade } from "@/features/inspections/Lib/conditions";

/**
 * An item with exactly the v1.2.38 columns: id, name, section, sortOrder,
 * condition, notes, imageUrls. No code, sectionCode, inputType, defaultSeverity,
 * measuredValue, unit, required or photoRequired.
 */
const legacyItem = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "legacy-item",
  name: "Brake Pads",
  section: "Brakes",
  sortOrder: 1,
  condition: "fail",
  notes: "Worn down to 2mm",
  imageUrls: [] as string[],
  ...over,
});

/**
 * An inspection as the backfill leaves it: the old columns, plus the scale
 * snapshot pinned to `basic` because every pre-overhaul template was flipped
 * there by 20260815120000. Every other new column is null.
 */
const LEGACY_INSPECTION = {
  id: "insp-legacy",
  status: "completed",
  mileage: 82000,
  notes: null,
  completedAt: new Date("2025-11-02"),
  createdAt: new Date("2025-11-02"),
  severityScale: "basic",
  country: null,
  vehicle: {
    make: "Ford",
    model: "F-150",
    year: 2021,
    vin: "FORD123",
    licensePlate: "TR-001",
    mileage: 82000,
    customer: { name: "Dave Owner", email: "dave@example.com", phone: "555-3333" },
  },
  template: { name: "Full Inspection", severityScale: "basic", country: null },
  items: [
    legacyItem({ id: "l-pass", name: "Oil Level", section: "Engine", condition: "pass", notes: null }),
    legacyItem(),
    legacyItem({ id: "l-att", name: "Tire Tread", section: "Tires", condition: "attention", notes: null }),
  ],
};

const PROPS = {
  inspection: LEGACY_INSPECTION,
  workshop: { name: "Quality Auto", address: "5 Shop Lane", phone: "555-2222", email: "qa@example.com" },
  logoUrl: "",
  primaryColor: "#d97706",
  showTorqvoiceBranding: false,
  publicToken: "pub-tok-legacy",
  orgId: "org-1",
  hasExistingQuoteRequest: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("open", vi.fn());
});

describe("inspections recorded before the overhaul", () => {
  it("renders a legacy report without throwing", () => {
    render(<InspectionView {...PROPS} />);
    expect(screen.getByText("Quality Auto")).toBeInTheDocument();
    expect(screen.getByText("2021 Ford F-150")).toBeInTheDocument();
  });

  it("keeps the wording the certificate was issued with", () => {
    render(<InspectionView {...PROPS} />);
    // The plain scale the report was created under, not the EU relabelling.
    expect(screen.getAllByText("Attention").length).toBeGreaterThan(0);
    expect(screen.queryByText("Minor defect")).not.toBeInTheDocument();
    expect(screen.queryByText("Major defect")).not.toBeInTheDocument();
  });

  it("still shows the recorded defect and its note", () => {
    render(<InspectionView {...PROPS} />);
    expect(screen.getAllByText("Brake Pads").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Worn down to 2mm").length).toBeGreaterThan(0);
  });

  it("groups by the section string old rows already had", () => {
    render(<InspectionView {...PROPS} />);
    for (const section of ["Engine", "Brakes", "Tires"]) {
      expect(screen.getAllByText(section).length).toBeGreaterThan(0);
    }
  });

  it("falls back to the template when the snapshot predates the backfill", () => {
    // Belt and braces for a row created between deploy and migration.
    const props = {
      ...PROPS,
      inspection: { ...LEGACY_INSPECTION, severityScale: null },
    };
    render(<InspectionView {...props} />);
    expect(screen.getAllByText("Attention").length).toBeGreaterThan(0);
  });

  it("derives a result from the old four-value vocabulary", () => {
    // v1.2.38 could only ever write these four.
    const items = [
      { condition: "pass" as const },
      { condition: "attention" as const },
      { condition: "fail" as const },
      { condition: "not_inspected" as const },
    ];
    const result = deriveTestResult(items, { requireAllInspected: false });
    expect(result).toBeTruthy();
  });

  it("never numbers a grade on a legacy inspection", () => {
    // Numbering is national and opt-in; a pre-overhaul row has no country, so
    // it must not acquire "2 — ..." prefixes it was never issued with.
    for (const condition of ["pass", "attention", "fail", "not_inspected"] as const) {
      expect(conditionGrade(condition, "basic", null)).toBeNull();
    }
  });
});
