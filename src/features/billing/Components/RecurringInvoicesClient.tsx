"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFormatDate } from "@/lib/use-format-date";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Pause,
  Play,
  Trash2,
  Zap,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import {
  createRecurringInvoice,
  toggleRecurringInvoice,
  deleteRecurringInvoice,
  processRecurringInvoices,
} from "../Actions/recurringInvoiceActions";
import { toast } from "sonner";

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  customer: { id: string; name: string } | null;
}

interface TemplatePart {
  id: string;
  name: string;
  partNumber: string | null;
  quantity: number;
  unitPrice: number;
}

interface TemplateLabor {
  id: string;
  description: string;
  hours: number;
  rate: number;
}

interface RecurringInvoice {
  id: string;
  title: string;
  description: string | null;
  frequency: string;
  nextRunDate: Date;
  endDate: Date | null;
  isActive: boolean;
  lastRunAt: Date | null;
  runCount: number;
  type: string;
  cost: number;
  taxRate: number;
  invoiceNotes: string | null;
  vehicleId: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    customer: { id: string; name: string } | null;
  };
  templateParts: TemplatePart[];
  templateLabor: TemplateLabor[];
}

interface RecurringInvoicesClientProps {
  invoices: RecurringInvoice[];
  vehicles: Vehicle[];
  currencyCode: string;
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const SERVICE_TYPES = [
  { value: "maintenance", label: "Maintenance" },
  { value: "repair", label: "Repair" },
  { value: "inspection", label: "Inspection" },
  { value: "upgrade", label: "Upgrade" },
];

interface PartRow {
  name: string;
  partNumber: string;
  quantity: number;
  unitPrice: number;
}

interface LaborRow {
  description: string;
  hours: number;
  rate: number;
}

export default function RecurringInvoicesClient({
  invoices,
  vehicles,
  currencyCode,
}: RecurringInvoicesClientProps) {
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "monthly" | "quarterly" | "yearly">("monthly");
  const [nextRunDate, setNextRunDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [serviceType, setServiceType] = useState("maintenance");
  const [cost, setCost] = useState("0");
  const [taxRate, setTaxRate] = useState("0");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [parts, setParts] = useState<PartRow[]>([]);
  const [labor, setLabor] = useState<LaborRow[]>([]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setFrequency("monthly");
    setNextRunDate(new Date().toISOString().split("T")[0]);
    setEndDate("");
    setVehicleId("");
    setServiceType("maintenance");
    setCost("0");
    setTaxRate("0");
    setInvoiceNotes("");
    setParts([]);
    setLabor([]);
  };

  const handleCreate = () => {
    if (!title.trim() || !vehicleId) {
      toast.error("Title and vehicle are required");
      return;
    }

    startTransition(async () => {
      const result = await createRecurringInvoice({
        title: title.trim(),
        description: description.trim() || undefined,
        frequency,
        nextRunDate,
        endDate: endDate || undefined,
        vehicleId,
        type: serviceType,
        cost: parseFloat(cost) || 0,
        taxRate: parseFloat(taxRate) || 0,
        invoiceNotes: invoiceNotes.trim() || undefined,
        templateParts: parts
          .filter((p) => p.name.trim())
          .map((p) => ({
            name: p.name,
            partNumber: p.partNumber || undefined,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
          })),
        templateLabor: labor
          .filter((l) => l.description.trim())
          .map((l) => ({
            description: l.description,
            hours: l.hours,
            rate: l.rate,
          })),
      });

      if (result.success) {
        toast.success("Recurring invoice created");
        setShowCreate(false);
        resetForm();
        router.refresh();
      } else {
        toast.error(result.error || "Failed to create");
      }
    });
  };

  const handleToggle = (id: string) => {
    startTransition(async () => {
      const result = await toggleRecurringInvoice(id);
      if (result.success) {
        toast.success("Status updated");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to update");
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteRecurringInvoice(id);
      if (result.success) {
        toast.success("Recurring invoice deleted");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to delete");
      }
    });
  };

  const handleProcessNow = () => {
    startTransition(async () => {
      const result = await processRecurringInvoices();
      if (result.success && result.data) {
        toast.success(`Processed ${result.data.processed} invoice(s)`);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to process");
      }
    });
  };

  const addPart = () => setParts([...parts, { name: "", partNumber: "", quantity: 1, unitPrice: 0 }]);
  const removePart = (i: number) => setParts(parts.filter((_, idx) => idx !== i));
  const updatePart = (i: number, field: keyof PartRow, value: string | number) => {
    const updated = [...parts];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updated[i] as any)[field] = value;
    setParts(updated);
  };

  const addLabor = () => setLabor([...labor, { description: "", hours: 0, rate: 0 }]);
  const removeLabor = (i: number) => setLabor(labor.filter((_, idx) => idx !== i));
  const updateLabor = (i: number, field: keyof LaborRow, value: string | number) => {
    const updated = [...labor];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updated[i] as any)[field] = value;
    setLabor(updated);
  };

  const fmt = (n: number) => formatCurrency(n, currencyCode);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/billing">
            <Button variant="outline" size="sm">Billing History</Button>
          </Link>
          <Button variant="outline" size="sm" disabled>Recurring</Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleProcessNow}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Zap className="h-4 w-4 mr-1.5" />}
            Process Now
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} disabled={isPending}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Recurring Invoice
          </Button>
        </div>
      </div>

      {/* Table */}
      {invoices.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No recurring invoices yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const partsTotal = inv.templateParts.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
                  const laborTotal = inv.templateLabor.reduce((s, l) => s + l.hours * l.rate, 0);
                  const subtotal = inv.cost + partsTotal + laborTotal;
                  const total = subtotal + subtotal * (inv.taxRate / 100);

                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="text-sm font-medium">{inv.title}</TableCell>
                      <TableCell className="text-sm">
                        {inv.vehicle.year} {inv.vehicle.make} {inv.vehicle.model}
                      </TableCell>
                      <TableCell className="text-sm">{inv.vehicle.customer?.name ?? "-"}</TableCell>
                      <TableCell className="text-sm">{FREQUENCY_LABELS[inv.frequency] ?? inv.frequency}</TableCell>
                      <TableCell className="text-sm">
                        {formatDate(new Date(inv.nextRunDate))}
                      </TableCell>
                      <TableCell className="text-right text-sm">{fmt(total)}</TableCell>
                      <TableCell>
                        <Badge variant={inv.isActive ? "default" : "secondary"}>
                          {inv.isActive ? "Active" : "Paused"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{inv.runCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleToggle(inv.id)}
                            disabled={isPending}
                          >
                            {inv.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDelete(inv.id)}
                            disabled={isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Recurring Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Basic info */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly Oil Change" />
              </div>
              <div className="space-y-1.5">
                <Label>Vehicle *</Label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.year} {v.make} {v.model}
                        {v.customer ? ` (${v.customer.name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>

            {/* Schedule */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Bi-weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <Input type="date" value={nextRunDate} onChange={(e) => setNextRunDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>

            {/* Pricing */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Service Type</Label>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Base Cost</Label>
                <Input type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tax Rate (%)</Label>
                <Input type="number" step="0.01" min="0" max="100" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Invoice Notes</Label>
              <Textarea value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} rows={2} />
            </div>

            {/* Template Parts */}
            <Card className="border shadow-none">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Template Parts</CardTitle>
                  <Button size="sm" variant="outline" onClick={addPart}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Part
                  </Button>
                </div>
              </CardHeader>
              {parts.length > 0 && (
                <CardContent className="px-3 pb-3 space-y-2">
                  {parts.map((p, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-end">
                      <Input placeholder="Part name" value={p.name} onChange={(e) => updatePart(i, "name", e.target.value)} className="text-sm h-8" />
                      <Input placeholder="Part #" value={p.partNumber} onChange={(e) => updatePart(i, "partNumber", e.target.value)} className="text-sm h-8 w-24" />
                      <Input type="number" min="1" value={p.quantity} onChange={(e) => updatePart(i, "quantity", parseInt(e.target.value) || 1)} className="text-sm h-8 w-16" />
                      <Input type="number" step="0.01" min="0" value={p.unitPrice} onChange={(e) => updatePart(i, "unitPrice", parseFloat(e.target.value) || 0)} className="text-sm h-8 w-20" />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removePart(i)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>

            {/* Template Labor */}
            <Card className="border shadow-none">
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Template Labor</CardTitle>
                  <Button size="sm" variant="outline" onClick={addLabor}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Labor
                  </Button>
                </div>
              </CardHeader>
              {labor.length > 0 && (
                <CardContent className="px-3 pb-3 space-y-2">
                  {labor.map((l, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                      <Input placeholder="Description" value={l.description} onChange={(e) => updateLabor(i, "description", e.target.value)} className="text-sm h-8" />
                      <Input type="number" step="0.5" min="0" placeholder="Hours" value={l.hours} onChange={(e) => updateLabor(i, "hours", parseFloat(e.target.value) || 0)} className="text-sm h-8 w-20" />
                      <Input type="number" step="0.01" min="0" placeholder="Rate" value={l.rate} onChange={(e) => updateLabor(i, "rate", parseFloat(e.target.value) || 0)} className="text-sm h-8 w-20" />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeLabor(i)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
