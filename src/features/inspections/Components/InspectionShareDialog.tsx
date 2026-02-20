"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, Link2, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import {
  generateInspectionPublicLink,
  revokeInspectionPublicLink,
} from "../Actions/inspectionShareActions";

export function InspectionShareDialog({
  open,
  onOpenChange,
  inspectionId,
  organizationId,
  publicToken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string;
  organizationId: string;
  publicToken: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState(publicToken);

  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/inspection/${organizationId}/${token}`
    : null;

  const handleGenerate = () => {
    startTransition(async () => {
      const result = await generateInspectionPublicLink(inspectionId);
      if (result.success && result.data) {
        setToken(result.data.token);
        toast.success("Share link generated");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to generate link");
      }
    });
  };

  const handleRevoke = () => {
    startTransition(async () => {
      const result = await revokeInspectionPublicLink(inspectionId);
      if (result.success) {
        setToken(null);
        toast.success("Share link revoked");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to revoke link");
      }
    });
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Inspection</DialogTitle>
          <DialogDescription>
            Share a read-only view of this inspection with your customer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {shareUrl ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={shareUrl} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={handleRevoke}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="mr-2 h-4 w-4" />
                )}
                Revoke Link
              </Button>
            </>
          ) : (
            <Button className="w-full" onClick={handleGenerate} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              Generate Share Link
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
