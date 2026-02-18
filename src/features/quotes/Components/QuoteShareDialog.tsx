"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import { generateQuotePublicLink, revokeQuotePublicLink } from "@/features/quotes/Actions/quoteShareActions";

interface QuoteShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  organizationId: string;
  initialToken: string | null;
}

export function QuoteShareDialog({
  open,
  onOpenChange,
  quoteId,
  organizationId,
  initialToken,
}: QuoteShareDialogProps) {
  const [publicToken, setPublicToken] = useState<string | null>(initialToken);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicUrl = publicToken && organizationId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/quote/${organizationId}/${publicToken}`
    : null;

  const handleGenerate = async () => {
    setGeneratingLink(true);
    const result = await generateQuotePublicLink(quoteId);
    if (result.success && result.data) setPublicToken(result.data.token);
    setGeneratingLink(false);
  };

  const handleRevoke = async () => {
    await revokeQuotePublicLink(quoteId);
    setPublicToken(null);
  };

  const handleCopy = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Share Quote
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate a public link that allows anyone to view and download this quote without signing in.
          </p>
          {publicUrl ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={publicUrl} readOnly className="text-xs font-mono" />
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleRevoke}
              >
                Revoke Link
              </Button>
            </>
          ) : (
            <Button onClick={handleGenerate} disabled={generatingLink}>
              {generatingLink && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Public Link
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
