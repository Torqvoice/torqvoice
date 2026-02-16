"use client";

import { useSettingsPermission } from "./settings-permission-context";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";

export function ReadOnlyBanner() {
  const { canEdit } = useSettingsPermission();
  if (canEdit) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
      <Lock className="h-4 w-4 text-amber-600 shrink-0" />
      <p className="text-sm text-amber-600">
        You have view-only access to settings. Contact an admin to make changes.
      </p>
    </div>
  );
}

export function SaveButton({ children }: { children: React.ReactNode }) {
  const { canEdit } = useSettingsPermission();
  if (!canEdit) return null;
  return <>{children}</>;
}

export function ReadOnlyWrapper({ children }: { children: React.ReactNode }) {
  const { canEdit } = useSettingsPermission();

  if (canEdit) return <>{children}</>;

  return (
    <div className="pointer-events-none opacity-60 select-none">
      {children}
    </div>
  );
}
