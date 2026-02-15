"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGlassModal } from "@/components/glass-modal";
import { Gauge, Loader2 } from "lucide-react";
import { createOnboardingOrg } from "../Actions/createOnboardingOrg";

export function OnboardingForm() {
  const [workshopName, setWorkshopName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const modal = useGlassModal();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await createOnboardingOrg({ workshopName });
      if (!result.success) {
        modal.open("error", "Setup Failed", result.error || "Could not create workshop");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      modal.open("error", "Setup Failed", "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2">
          <Gauge className="h-5 w-5 text-primary" />
          <span className="gradient-text text-sm font-bold tracking-wider uppercase">
            Torqvoice
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Set up your workshop</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your workshop name to get started
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="workshopName">Workshop Name</Label>
          <Input
            id="workshopName"
            type="text"
            placeholder="My Auto Workshop"
            value={workshopName}
            onChange={(e) => setWorkshopName(e.target.value)}
            required
            minLength={2}
            maxLength={100}
            className="h-11 bg-background/50"
          />
        </div>

        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Get Started
        </Button>
      </form>
    </div>
  );
}
