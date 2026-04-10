/**
 * Tests for InvoiceSummary — the live preview pane on the work order edit page.
 *
 * Critical behaviour: this component must use the universal display (net per
 * category, net subtotal, separate tax line, gross total) regardless of
 * whether the record was entered in inclusive or exclusive mode.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

vi.mock("lucide-react", () => ({}));

import { InvoiceSummary } from "@/features/vehicles/Components/service-detail/InvoiceSummary";

const messages = {
  service: {
    invoice: {
      title: "Invoice Summary",
      parts: "Parts",
      labor: "Labor",
      subtotal: "Subtotal",
      subtotalInclTax: "Subtotal (incl. tax)",
      discount: "Discount",
      tax: "Tax ({rate}%)",
      taxIncluded: "Tax (incl., {rate}%)",
      total: "Total",
      paid: "Paid",
      balanceDue: "Balance Due",
      paidBadge: "PAID",
      entityLabel: "Invoice",
      emailSubject: "",
      statusEmailSubject: "",
    },
  },
};

function renderSummary(props: Parameters<typeof InvoiceSummary>[0]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages as any}>
      <InvoiceSummary {...props} />
    </NextIntlClientProvider>,
  );
}

describe("InvoiceSummary — universal display", () => {
  it("shows net values + tax line + gross total for an exclusive record", () => {
    renderSummary({
      hasPartItems: true,
      hasLaborItems: true,
      partsSubtotal: 100,
      laborSubtotal: 200,
      subtotal: 300,
      discountAmount: 0,
      discountType: null,
      discountValue: 0,
      taxRate: 25,
      taxAmount: 75,
      taxInclusive: false,
      displayTotal: 375,
      totalPaid: 0,
      balanceDue: 375,
      hasPayments: false,
      currencyCode: "USD",
    });

    // Net subtotal 300, tax 75, total 375
    expect(screen.getAllByText(/300\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/75\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/375\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Tax (25%)")).toBeInTheDocument();
  });

  it("back-calculates net values for an inclusive record but shows the same gross total", () => {
    renderSummary({
      hasPartItems: true,
      hasLaborItems: true,
      // Stored gross subtotals (the equivalent of the exclusive case scaled by 1.25)
      partsSubtotal: 125,
      laborSubtotal: 250,
      subtotal: 375,
      discountAmount: 0,
      discountType: null,
      discountValue: 0,
      taxRate: 25,
      taxAmount: 75,
      taxInclusive: true,
      displayTotal: 375, // gross customer total
      totalPaid: 0,
      balanceDue: 375,
      hasPayments: false,
      currencyCode: "USD",
    });

    // Should display net parts (100), net labor (200), net subtotal (300),
    // separate tax line (75), gross total (375).
    expect(screen.getAllByText(/100\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/200\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/300\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/75\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/375\.00/).length).toBeGreaterThanOrEqual(1);
    // The tax line label is universal — NOT "Tax (incl., 25%)"
    expect(screen.getByText("Tax (25%)")).toBeInTheDocument();
  });

  it("nets the discount line in inclusive mode", () => {
    renderSummary({
      hasPartItems: true,
      hasLaborItems: false,
      partsSubtotal: 250,
      laborSubtotal: 0,
      subtotal: 250, // gross
      discountAmount: 25, // gross discount
      discountType: "fixed",
      discountValue: 25,
      taxRate: 25,
      taxAmount: 45,
      taxInclusive: true,
      displayTotal: 225, // gross customer total after discount
      totalPaid: 0,
      balanceDue: 225,
      hasPayments: false,
      currencyCode: "USD",
    });

    // Net values: subtotal 200, discount 20, tax 45, total 225
    expect(screen.getAllByText(/200\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/20\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/45\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/225\.00/).length).toBeGreaterThanOrEqual(1);
  });

  it("equivalent invoices show identical visible numbers in both modes", () => {
    // Render exclusive
    const { unmount } = renderSummary({
      hasPartItems: true,
      hasLaborItems: false,
      partsSubtotal: 100,
      laborSubtotal: 0,
      subtotal: 100,
      discountAmount: 0,
      discountType: null,
      discountValue: 0,
      taxRate: 25,
      taxAmount: 25,
      taxInclusive: false,
      displayTotal: 125,
      totalPaid: 0,
      balanceDue: 125,
      hasPayments: false,
      currencyCode: "USD",
    });
    const exclusiveText = screen.getAllByText(/100\.00|25\.00|125\.00/).map(el => el.textContent);
    unmount();

    // Render the equivalent inclusive
    renderSummary({
      hasPartItems: true,
      hasLaborItems: false,
      partsSubtotal: 125,
      laborSubtotal: 0,
      subtotal: 125,
      discountAmount: 0,
      discountType: null,
      discountValue: 0,
      taxRate: 25,
      taxAmount: 25,
      taxInclusive: true,
      displayTotal: 125,
      totalPaid: 0,
      balanceDue: 125,
      hasPayments: false,
      currencyCode: "USD",
    });
    const inclusiveText = screen.getAllByText(/100\.00|25\.00|125\.00/).map(el => el.textContent);

    // Both modes should display the same set of monetary values.
    expect(inclusiveText.sort()).toEqual(exclusiveText.sort());
  });
});
