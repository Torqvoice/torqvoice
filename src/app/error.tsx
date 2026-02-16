"use client";

import { useEffect } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js error boundary convention
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-destructive/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-destructive/5 blur-3xl" />
      </div>

      <div className="glass relative z-10 w-full max-w-md rounded-2xl p-8 text-center shadow-2xl">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <Wrench className="h-10 w-10 text-destructive" strokeWidth={1.5} />
        </div>

        <p className="mb-2 font-mono text-6xl font-bold tracking-tighter text-destructive">500</p>
        <h1 className="text-xl font-semibold tracking-tight">Something Went Wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The engine stalled unexpectedly. Our mechanics have been notified and are working on it.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={reset}>Try Again</Button>
          <Button variant="outline" asChild>
            <a href="/">Back to Dashboard</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
