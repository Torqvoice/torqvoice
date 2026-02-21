"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface InspectionItem {
  id: string;
  name: string;
  section: string;
  condition: string;
  notes: string | null;
}

export function QuoteRequestDialog({
  open,
  onOpenChange,
  items,
  inspectionId,
  publicToken,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: InspectionItem[];
  inspectionId: string;
  publicToken: string;
  onSuccess: () => void;
}) {
  const issueItems = items.filter((i) => i.condition === "fail" || i.condition === "attention");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(issueItems.map((i) => i.id)));
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === issueItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(issueItems.map((i) => i.id)));
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one item");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/public/forms/inspection-quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          publicToken,
          selectedItemIds: Array.from(selectedIds),
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Quote request submitted!");
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(data.error || "Failed to submit request");
      }
    } catch {
      toast.error("Failed to submit request");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group by section
  const sections: Record<string, InspectionItem[]> = {};
  for (const item of issueItems) {
    if (!sections[item.section]) sections[item.section] = [];
    sections[item.section].push(item);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a Quote</DialogTitle>
          <DialogDescription>
            Select the items you&apos;d like a repair quote for.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[400px] overflow-y-auto">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-primary hover:underline"
            >
              {selectedIds.size === issueItems.length ? "Deselect all" : "Select all"}
            </button>
            <span className="text-xs text-muted-foreground">
              {selectedIds.size} of {issueItems.length} selected
            </span>
          </div>

          {Object.entries(sections).map(([sectionName, sectionItems]) => (
            <div key={sectionName}>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                {sectionName}
              </p>
              <div className="space-y-2">
                {sectionItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleItem(item.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.name}</span>
                        {item.condition === "fail" ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600 bg-red-100 rounded-full px-1.5 py-0.5">
                            <X className="h-2.5 w-2.5" /> Fail
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-100 rounded-full px-1.5 py-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" /> Attention
                          </span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Message <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Any additional details or questions..."
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || selectedIds.size === 0}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
