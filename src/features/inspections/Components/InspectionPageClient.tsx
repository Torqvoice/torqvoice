"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFormatDate } from "@/lib/use-format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Camera, Check, CheckCircle2, ClipboardCheck, Download, FileText, Loader2,
  MessageSquareText, MoreVertical, Share2, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { updateInspectionItem, completeInspection, deleteInspection } from "../Actions/inspectionActions";
import { InspectionShareDialog } from "./InspectionShareDialog";

type Condition = "pass" | "fail" | "attention" | "not_inspected";

interface InspectionItem {
  id: string;
  name: string;
  section: string;
  sortOrder: number;
  condition: string;
  notes: string | null;
  imageUrls: string[];
}

interface InspectionData {
  id: string;
  status: string;
  mileage: number | null;
  notes: string | null;
  publicToken: string | null;
  completedAt: Date | null;
  createdAt: Date;
  organizationId: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    vin: string | null;
    licensePlate: string | null;
    mileage: number;
    customer: { id: string; name: string; email: string | null; phone: string | null } | null;
  };
  template: { id: string; name: string };
  items: InspectionItem[];
  quotes: { id: string; quoteNumber: string | null; status: string }[];
  quoteRequests: { id: string; message: string | null; selectedItemIds: string[]; createdAt: Date }[];
}

const conditionConfig: Record<Condition, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  pass: {
    label: "Pass",
    color: "text-emerald-600",
    bgColor: "bg-emerald-500 hover:bg-emerald-600",
    icon: <Check className="h-3.5 w-3.5" />,
  },
  fail: {
    label: "Fail",
    color: "text-red-600",
    bgColor: "bg-red-500 hover:bg-red-600",
    icon: <X className="h-3.5 w-3.5" />,
  },
  attention: {
    label: "Attention",
    color: "text-amber-600",
    bgColor: "bg-amber-500 hover:bg-amber-600",
    icon: <span className="text-xs font-bold">!</span>,
  },
  not_inspected: {
    label: "N/A",
    color: "text-gray-400",
    bgColor: "bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500",
    icon: null,
  },
};

function ConditionButton({
  condition,
  active,
  onClick,
  disabled,
}: {
  condition: Condition;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const config = conditionConfig[condition];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-full text-white transition-all ${
        active
          ? `${config.bgColor} ring-2 ring-offset-2 ring-offset-background`
          : "bg-gray-200 dark:bg-gray-700 text-gray-500 hover:opacity-80"
      } ${active ? `ring-${condition === "pass" ? "emerald" : condition === "fail" ? "red" : condition === "attention" ? "amber" : "gray"}-500/50` : ""} disabled:opacity-50`}
      title={config.label}
    >
      {config.icon}
    </button>
  );
}

function InspectionItemRow({
  item,
  isCompleted,
}: {
  item: InspectionItem;
  isCompleted: boolean;
}) {
  const [condition, setCondition] = useState(item.condition as Condition);
  const [notes, setNotes] = useState(item.notes || "");
  const [imageUrls, setImageUrls] = useState<string[]>(item.imageUrls || []);
  const [showNotes, setShowNotes] = useState(!!item.notes);
  const [notesRequired, setNotesRequired] = useState(false);
  const [showClearNotesDialog, setShowClearNotesDialog] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const saveItem = (cond: Condition, n: string) => {
    startSaving(async () => {
      const result = await updateInspectionItem(item.id, {
        condition: cond,
        notes: n || undefined,
        imageUrls,
      });
      if (!result.success) {
        toast.error("Failed to update item");
      } else {
        toast.success("Saved");
      }
    });
  };

  const handleConditionChange = (newCondition: Condition) => {
    if (isCompleted) return;

    // Toggle off: clicking the same condition resets to not_inspected
    if (condition === newCondition) {
      if ((newCondition === "attention" || newCondition === "fail") && notes.trim()) {
        setShowClearNotesDialog(true);
        return;
      }
      setCondition("not_inspected");
      setNotesRequired(false);
      setShowNotes(false);
      setNotes("");
      saveItem("not_inspected", "");
      return;
    }

    setCondition(newCondition);

    // Attention/fail require notes — show notes field and wait for input
    if (newCondition === "attention" || newCondition === "fail") {
      setShowNotes(true);
      setNotesRequired(true);
      if (notes.trim()) {
        // Notes already exist, save immediately
        setNotesRequired(false);
        saveItem(newCondition, notes);
      } else {
        // Focus the notes field so the tech can type right away
        setTimeout(() => notesRef.current?.focus(), 50);
      }
      return;
    }

    // Pass: save immediately, no notes required
    setNotesRequired(false);
    saveItem(newCondition, notes);
  };

  const handleNotesBlur = () => {
    if (isCompleted) return;

    // If notes were required (attention/fail selected without notes)
    if (notesRequired) {
      if (notes.trim()) {
        setNotesRequired(false);
        saveItem(condition, notes);
      } else {
        toast.error("Notes are required for this status");
      }
      return;
    }

    // Normal notes update
    if (notes === (item.notes || "")) return;
    startSaving(async () => {
      const result = await updateInspectionItem(item.id, {
        condition,
        notes: notes || undefined,
        imageUrls,
      });
      if (result.success) {
        toast.success("Notes saved");
      } else {
        toast.error("Failed to save notes");
      }
    });
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || isCompleted) return;

    setIsUploading(true);
    const newUrls: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload/service-files", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.url) {
          newUrls.push(data.url);
        } else {
          toast.error(data.error || `Upload failed for ${file.name}`);
        }
      }

      if (newUrls.length > 0) {
        const updated = [...imageUrls, ...newUrls];
        setImageUrls(updated);
        await updateInspectionItem(item.id, {
          condition,
          notes: notes || undefined,
          imageUrls: updated,
        });
        toast.success(`${newUrls.length} file${newUrls.length > 1 ? "s" : ""} uploaded`);
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (index: number) => {
    if (isCompleted) return;
    const updated = imageUrls.filter((_, i) => i !== index);
    setImageUrls(updated);
    startSaving(async () => {
      const result = await updateInspectionItem(item.id, {
        condition,
        notes: notes || undefined,
        imageUrls: updated,
      });
      if (result.success) {
        toast.success("File removed");
      } else {
        toast.error("Failed to remove file");
      }
    });
  };

  const isVideo = (url: string) => /\.(mp4|webm|mov)$/i.test(url);

  const conditionBadgeColor = conditionConfig[condition]?.color || "text-gray-400";

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-sm font-medium ${conditionBadgeColor}`}>
            {item.name}
          </span>
          {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(["pass", "attention", "fail"] as Condition[]).map((c) => (
            <ConditionButton
              key={c}
              condition={c}
              active={condition === c}
              onClick={() => handleConditionChange(c)}
              disabled={isCompleted}
            />
          ))}
          <button
            type="button"
            onClick={() => setShowNotes(!showNotes)}
            className="ml-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showNotes ? "Hide" : "Notes"}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isCompleted || isUploading}
            className="ml-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            multiple
            className="hidden"
            onChange={handleMediaUpload}
          />
        </div>
      </div>

      {showNotes && (
        <div className="space-y-1">
          <Textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder={notesRequired ? "Notes required for this status..." : "Add notes..."}
            className={`text-sm min-h-[60px] ${notesRequired ? "border-red-400 focus-visible:ring-red-400" : ""}`}
            disabled={isCompleted}
          />
          {notesRequired && (
            <p className="text-xs text-red-500">Notes are required for attention/fail items</p>
          )}
        </div>
      )}

      {imageUrls.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {imageUrls.map((url, idx) => (
            <div key={idx} className="relative group">
              {isVideo(url) ? (
                <video
                  src={url}
                  controls
                  className="h-32 max-w-xs rounded-lg border"
                />
              ) : (
                <img
                  src={url}
                  alt={`${item.name} ${idx + 1}`}
                  className="h-20 w-20 rounded-lg object-cover border"
                />
              )}
              {!isCompleted && (
                <button
                  type="button"
                  onClick={() => handleRemoveFile(idx)}
                  className="absolute -right-1.5 -top-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={showClearNotesDialog} onOpenChange={setShowClearNotesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove status?</AlertDialogTitle>
            <AlertDialogDescription>
              The notes for this item will be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setCondition("not_inspected");
                setNotesRequired(false);
                setShowNotes(false);
                setNotes("");
                setShowClearNotesDialog(false);
                saveItem("not_inspected", "");
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function InspectionPageClient({
  inspection,
}: {
  inspection: InspectionData;
}) {
  const router = useRouter();
  const { formatDate } = useFormatDate();
  const [isPending, startTransition] = useTransition();
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const isCompleted = inspection.status === "completed";

  // Sort items by sortOrder first, then group by section preserving order
  const sortedItems = [...inspection.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const sectionOrder: string[] = [];
  const sections: Record<string, InspectionItem[]> = {};
  for (const item of sortedItems) {
    if (!sections[item.section]) {
      sections[item.section] = [];
      sectionOrder.push(item.section);
    }
    sections[item.section].push(item);
  }

  const totalItems = inspection.items.length;
  const inspectedItems = inspection.items.filter((i) => i.condition !== "not_inspected").length;
  const passCount = inspection.items.filter((i) => i.condition === "pass").length;
  const failCount = inspection.items.filter((i) => i.condition === "fail").length;
  const attentionCount = inspection.items.filter((i) => i.condition === "attention").length;
  const hasIssueItems = failCount > 0 || attentionCount > 0;
  const pendingQuoteRequest = inspection.quoteRequests?.[0] ?? null;

  const handleComplete = () => {
    startTransition(async () => {
      const result = await completeInspection(inspection.id);
      if (result.success) {
        toast.success("Inspection completed");
        setShowCompleteDialog(false);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to complete inspection");
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteInspection(inspection.id);
      if (result.success) {
        toast.success("Inspection deleted");
        router.push("/inspections");
      } else {
        toast.error(result.error || "Failed to delete inspection");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Link
            href="/inspections"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to inspections
          </Link>
          <div className="flex items-center gap-2">
            {!isCompleted && (
              <Button size="sm" onClick={() => setShowCompleteDialog(true)}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Complete Inspection
              </Button>
            )}
            {inspection.quotes.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/quotes/${inspection.quotes[0].id}`)}
              >
                <FileText className="mr-1 h-3.5 w-3.5" />
                View Quote
              </Button>
            ) : hasIssueItems ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/quotes/new?fromInspection=${inspection.id}`)}
              >
                <FileText className="mr-1 h-3.5 w-3.5" />
                Create Quote
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setShowShareDialog(true)}>
              <Share2 className="mr-1 h-3.5 w-3.5" />
              Share
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => window.open(`/api/inspections/${inspection.id}/pdf`, "_blank")}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <ClipboardCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-bold leading-tight">
                {inspection.vehicle.year} {inspection.vehicle.make} {inspection.vehicle.model}
              </h1>
              <Badge
                variant="outline"
                className={`text-xs ${isCompleted ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-blue-500/10 text-blue-500 border-blue-500/20"}`}
              >
                {isCompleted ? "Completed" : "In Progress"}
              </Badge>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{inspection.template.name}</span>
              <span>&middot;</span>
              <span>{formatDate(new Date(inspection.createdAt))}</span>
              {inspection.mileage && (
                <>
                  <span>&middot;</span>
                  <span>{inspection.mileage.toLocaleString()} mi</span>
                </>
              )}
              {inspection.vehicle.licensePlate && (
                <>
                  <span>&middot;</span>
                  <span className="font-mono">{inspection.vehicle.licensePlate}</span>
                </>
              )}
              {inspection.vehicle.customer && (
                <>
                  <span>&middot;</span>
                  <Link href={`/customers/${inspection.vehicle.customer.id}`} className="hover:underline">
                    {inspection.vehicle.customer.name}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="font-semibold text-foreground">{inspectedItems}/{totalItems}</span>
            <span className="text-xs">inspected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium">{passCount} pass</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-xs font-medium">{failCount} fail</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-full bg-amber-500" />
            <span className="text-xs font-medium">{attentionCount} attention</span>
          </div>
        </div>
      </div>

      {/* Pending quote request banner */}
      {pendingQuoteRequest && (
        <Card className="border-amber-500/30 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
              <MessageSquareText className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Customer requested a quote for {pendingQuoteRequest.selectedItemIds.length} item(s)
              </p>
              {pendingQuoteRequest.message && (
                <p className="mt-0.5 text-sm text-amber-800/80 dark:text-amber-300/70">
                  &ldquo;{pendingQuoteRequest.message}&rdquo;
                </p>
              )}
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/30 text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/30"
                  onClick={() => router.push(`/quotes/new?fromInspection=${inspection.id}`)}
                >
                  <FileText className="mr-1 h-3.5 w-3.5" />
                  Create Quote
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inspection sections */}
      <div className="space-y-4">
        {sectionOrder.map((sectionName) => {
          const items = sections[sectionName];
          const sectionPass = items.filter((i) => i.condition === "pass").length;
          const sectionTotal = items.length;
          return (
            <Card key={sectionName}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{sectionName}</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {sectionPass}/{sectionTotal} pass
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((item) => (
                  <InspectionItemRow
                    key={item.id}
                    item={item}
                    isCompleted={isCompleted}
                  />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Complete confirmation dialog */}
      <AlertDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the inspection as completed. You won&apos;t be able to modify
              items after completing.
              {totalItems - inspectedItems > 0 && (
                <span className="block mt-2 font-medium text-amber-600">
                  {totalItems - inspectedItems} item(s) have not been inspected yet.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this inspection and all its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Share dialog */}
      <InspectionShareDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        inspectionId={inspection.id}
        organizationId={inspection.organizationId}
        publicToken={inspection.publicToken}
      />
    </div>
  );
}
