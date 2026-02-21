import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/get-auth-context";
import { db } from "@/lib/db";
import { resolveInvoicePrefix } from "@/lib/invoice-utils";
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";
import os from "os";
import JSZip from "jszip";

// Allow up to 5 minutes for large imports
export const maxDuration = 300;

// ── Types for Invoice Ninja export ──────────────────────────────────────────

interface INClient {
  id: number;
  hashed_id: string;
  name: string;
  number: string;
  phone: string | null;
  website: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country_id: string;
  vat_number: string | null;
  private_notes: string | null;
  public_notes: string | null;
  is_deleted: boolean;
}

interface INClientContact {
  id: number;
  client_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  is_primary: number;
}

interface INProduct {
  id: number;
  hashed_id: string;
  product_key: string;
  notes: string | null;
  cost: string;
  price: string;
  quantity: string;
  in_stock_quantity: number;
  product_image: string | null;
  custom_value1: string | null;
  custom_value2: string | null;
  is_deleted: boolean;
}

interface INLineItem {
  _id: string;
  product_key: string;
  quantity: number;
  cost: number;
  notes: string;
  discount: number;
  is_amount_discount: boolean;
  line_total: number;
  tax_amount: number;
  gross_line_total: number;
  type_id: string;
}

interface INInvoice {
  id: number;
  hashed_id: string;
  client_id: string;
  number: string;
  date: string;
  due_date: string | null;
  status_id: number;
  amount: string;
  balance: string;
  paid_to_date: string;
  discount: string;
  is_amount_discount: boolean;
  line_items: INLineItem[];
  public_notes: string | null;
  private_notes: string | null;
  terms: string | null;
  footer: string | null;
  tax_name1: string;
  tax_rate1: number;
  is_deleted: boolean;
  created_at: number;
}

interface INPaymentable {
  paymentable_id: string;
  amount: string;
  paymentable_type: string;
}

interface INPayment {
  id: number;
  hashed_id: string;
  client_id: string;
  number: string;
  date: string;
  amount: string;
  applied: string;
  refunded: string;
  status_id: number;
  type_id: number;
  private_notes: string | null;
  transaction_reference: string | null;
  is_manual: number;
  paymentables: INPaymentable[];
  is_deleted: boolean;
}

interface INDocument {
  id: number;
  url: string;
  name: string;
  type: string;
  size: number;
  documentable_id: string;
  documentable_type: string;
  deleted_at: number | null;
}

interface INBackup {
  clients: INClient[];
  client_contacts: INClientContact[];
  products: INProduct[];
  invoices: INInvoice[];
  payments: INPayment[];
  documents: INDocument[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildAddress(client: INClient): string | null {
  const parts = [
    client.address1,
    client.address2,
    [client.postal_code, client.city].filter(Boolean).join(" "),
    client.state,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function getClientName(
  client: INClient,
  contacts: INClientContact[]
): string {
  if (client.name && client.name.trim()) return client.name.trim();
  const primary = contacts.find(
    (c) => c.client_id === client.hashed_id && c.is_primary === 1
  );
  if (primary) {
    const name = [primary.first_name, primary.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (name) return name;
  }
  return `Client #${client.number || client.id}`;
}

function getPaymentMethod(typeId: number): string {
  const methods: Record<number, string> = {
    1: "bank_transfer",
    2: "cash",
    4: "credit_card",
    5: "debit_card",
    6: "bank_transfer",
    13: "credit_card",
    14: "credit_card",
    15: "other",
    32: "other",
  };
  return methods[typeId] || "other";
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    csv: "text/csv",
    txt: "text/plain",
  };
  return mimeMap[ext || ""] || "application/octet-stream";
}

// ── API Route ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, userId } = ctx;
  let tmpDir: string | null = null;

  try {
    // Read zip from request body
    const arrayBuffer = await request.arrayBuffer();
    const zipBuffer = Buffer.from(arrayBuffer);

    if (zipBuffer.length < 100) {
      return NextResponse.json(
        { error: "Uploaded file is too small to be a valid backup" },
        { status: 400 }
      );
    }

    // Extract zip
    const zip = await JSZip.loadAsync(zipBuffer);

    // Find and parse backup.json
    const backupEntry = zip.file("backup.json");
    if (!backupEntry) {
      return NextResponse.json(
        { error: "No backup.json found in the zip file" },
        { status: 400 }
      );
    }

    const backupJson = await backupEntry.async("string");
    const body = JSON.parse(backupJson) as INBackup;

    if (!body.clients || !Array.isArray(body.clients)) {
      return NextResponse.json(
        { error: "Invalid Invoice Ninja export: missing clients array" },
        { status: 400 }
      );
    }

    // Extract zip to temp dir for document file access
    tmpDir = path.join(os.tmpdir(), `in-import-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });

    for (const [relativePath, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      // Only extract document files, not the full backup
      if (!relativePath.startsWith("documents/")) continue;
      const targetPath = path.join(tmpDir, relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      const content = await entry.async("nodebuffer");
      await writeFile(targetPath, content);
    }

    const clients = body.clients.filter((c) => !c.is_deleted);
    const contacts = body.client_contacts || [];
    const products = (body.products || []).filter((p) => !p.is_deleted);
    const invoices = (body.invoices || []).filter((i) => !i.is_deleted);
    const payments = (body.payments || []).filter((p) => !p.is_deleted);
    const documents = (body.documents || []).filter((d) => !d.deleted_at);

    // Index documents by invoice hashed_id
    const docsByInvoice = new Map<string, INDocument[]>();
    for (const doc of documents) {
      if (doc.documentable_type !== "invoices") continue;
      const existing = docsByInvoice.get(doc.documentable_id) || [];
      existing.push(doc);
      docsByInvoice.set(doc.documentable_id, existing);
    }

    // Get invoice prefix settings
    const prefixSetting = await db.appSetting.findFirst({
      where: { organizationId, key: "workshop.invoicePrefix" },
    });
    const invoicePrefix = resolveInvoicePrefix(
      prefixSetting?.value || "{year}-"
    );

    // Get the current highest invoice number
    const lastRecord = await db.serviceRecord.findFirst({
      where: { vehicle: { organizationId } },
      orderBy: { createdAt: "desc" },
      select: { invoiceNumber: true },
    });
    let nextInvoiceNum = 1001;
    if (lastRecord?.invoiceNumber) {
      const match = lastRecord.invoiceNumber.match(/(\d+)$/);
      if (match) nextInvoiceNum = Number.parseInt(match[1], 10) + 1;
    }

    // Uploads directory for this org
    const uploadsBase = path.join(
      process.cwd(),
      "data",
      "uploads",
      organizationId
    );

    // Maps: IN hashed_id → Torqvoice ID
    const clientIdMap = new Map<string, string>();
    const invoiceIdMap = new Map<string, string>();

    const counts = {
      customers: 0,
      products: 0,
      invoices: 0,
      payments: 0,
      documents: 0,
    };

    await db.$transaction(async (tx) => {
      // ── Create a single placeholder vehicle for all imported invoices ──

      // Invoice Ninja doesn't track vehicles, so all invoices go under
      // one placeholder. Users can reassign them to real vehicles later.
      const placeholderVehicle = await tx.vehicle.create({
        data: {
          make: "Invoice Ninja",
          model: "Import",
          year: new Date().getFullYear(),
          userId,
          organizationId,
        },
      });
      const placeholderVehicleId = placeholderVehicle.id;

      // ── Import customers ────────────────────────────────────────────
      for (const client of clients) {
        const name = getClientName(client, contacts);
        const primaryContact = contacts.find(
          (c) => c.client_id === client.hashed_id && c.is_primary === 1
        );

        const customer = await tx.customer.create({
          data: {
            name,
            email: primaryContact?.email || null,
            phone: client.phone || primaryContact?.phone || null,
            address: buildAddress(client),
            notes: client.private_notes || null,
            userId,
            organizationId,
          },
        });

        clientIdMap.set(client.hashed_id, customer.id);
        counts.customers++;
      }

      // ── Import products → inventory ─────────────────────────────────
      for (const product of products) {
        await tx.inventoryPart.create({
          data: {
            name: product.product_key,
            description: product.notes || null,
            unitCost: parseNum(product.price) || parseNum(product.cost),
            quantity: product.in_stock_quantity || 0,
            partNumber: product.custom_value1 || null,
            supplierUrl: product.custom_value2 || null,
            imageUrl: product.product_image || null,
            userId,
            organizationId,
          },
        });
        counts.products++;
      }

      // ── Import invoices → service records ───────────────────────────
      for (const invoice of invoices) {
        const allItems = invoice.line_items || [];
        const partItems = allItems.filter((li) => li.type_id === "1");
        const laborItems = allItems.filter((li) => li.type_id === "2");

        const amount = parseNum(invoice.amount);
        const discount = parseNum(invoice.discount);

        const itemNames = (invoice.line_items || [])
          .map((li) => li.product_key)
          .filter(Boolean)
          .slice(0, 3);
        const title =
          itemNames.length > 0
            ? itemNames.join(", ")
            : `Invoice #${invoice.number}`;

        const invoiceNumber = `${invoicePrefix}${nextInvoiceNum}`;
        nextInvoiceNum++;

        const partsTotal = partItems.reduce(
          (sum, li) => sum + (li.line_total || 0),
          0
        );
        const laborTotal = laborItems.reduce(
          (sum, li) => sum + (li.line_total || 0),
          0
        );

        const record = await tx.serviceRecord.create({
          data: {
            title,
            description: invoice.private_notes || invoice.public_notes || null,
            invoiceNotes: invoice.terms || null,
            type: "repair",
            status: "completed",
            cost: amount,
            serviceDate: new Date(invoice.date),
            invoiceNumber,
            subtotal: partsTotal + laborTotal,
            discountType:
              discount > 0
                ? invoice.is_amount_discount
                  ? "fixed"
                  : "percentage"
                : null,
            discountValue: discount,
            discountAmount: invoice.is_amount_discount
              ? discount
              : (partsTotal + laborTotal) * (discount / 100),
            taxRate: parseNum(invoice.tax_rate1) || 0,
            taxAmount:
              parseNum(invoice.amount) - (partsTotal + laborTotal) + discount,
            totalAmount: amount,
            vehicleId: placeholderVehicleId,
          },
        });

        invoiceIdMap.set(invoice.hashed_id, record.id);

        // Create part line items
        let partsCreated = 0;
        for (const li of partItems) {
          if (!li.product_key && !li.notes && li.line_total === 0) continue;
          await tx.servicePart.create({
            data: {
              name: li.product_key || li.notes || "Part",
              quantity: li.quantity || 1,
              unitPrice: li.cost || 0,
              total: li.line_total || 0,
              serviceRecordId: record.id,
            },
          });
          partsCreated++;
        }

        // Create labor line items (tasks) — keep even if 0 hours/cost
        let laborCreated = 0;
        for (const li of laborItems) {
          if (!li.product_key && !li.notes && li.line_total === 0) continue;
          await tx.serviceLabor.create({
            data: {
              description: li.notes || li.product_key || "Labor",
              hours: li.quantity || 0,
              rate: li.cost || 0,
              total: li.line_total || 0,
              serviceRecordId: record.id,
            },
          });
          laborCreated++;
        }

        // ── Copy attached documents ─────────────────────────────────
        const invoiceDocs = docsByInvoice.get(invoice.hashed_id) || [];
        for (const doc of invoiceDocs) {
          // Try to read the file from the extracted zip
          const docPath = path.join(tmpDir!, "documents", doc.url);
          let fileData: Buffer;
          try {
            const { readFileSync } = await import("fs");
            fileData = readFileSync(docPath);
          } catch {
            continue; // File not found in zip
          }

          const targetDir = path.join(uploadsBase, "services");
          await mkdir(targetDir, { recursive: true });
          const safeName = doc.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const filename = `in-${invoice.number}-${safeName}`;
          const targetPath = path.join(targetDir, filename);
          await writeFile(targetPath, fileData);

          const fileUrl = `/api/protected/files/${organizationId}/services/${filename}`;
          const isImage = /\.(jpg|jpeg|png|webp)$/i.test(doc.name);

          await tx.serviceAttachment.create({
            data: {
              fileName: doc.name,
              fileUrl,
              fileType: getMimeType(doc.name),
              fileSize: fileData.length,
              category: isImage ? "image" : "diagnostic",
              serviceRecordId: record.id,
            },
          });

          counts.documents++;
        }

        counts.invoices++;
      }

      // ── Import payments ─────────────────────────────────────────────
      for (const payment of payments) {
        if (!payment.paymentables || payment.paymentables.length === 0)
          continue;

        for (const payable of payment.paymentables) {
          if (payable.paymentable_type !== "invoices") continue;

          const serviceRecordId = invoiceIdMap.get(payable.paymentable_id);
          if (!serviceRecordId) continue;

          await tx.payment.create({
            data: {
              amount: parseNum(payable.amount),
              date: new Date(payment.date),
              method: getPaymentMethod(payment.type_id),
              note: payment.private_notes || null,
              externalId: payment.transaction_reference || null,
              serviceRecordId,
            },
          });

          counts.payments++;
        }
      }
    }, { timeout: 120000 });

    return NextResponse.json({
      success: true,
      imported: counts,
    });
  } catch (error) {
    console.error("[import-invoice-ninja] Error:", error);
    const message =
      error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tmpDir) {
      rm(tmpDir, { recursive: true, force: true }).catch(() => { /* ignore cleanup errors */ });
    }
  }
}
