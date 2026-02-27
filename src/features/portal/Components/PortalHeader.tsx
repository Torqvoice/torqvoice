"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function PortalHeader({
  orgId,
  orgName,
  orgLogo,
  customerName,
}: {
  orgId: string;
  orgName: string;
  orgLogo?: string | null;
  customerName: string;
}) {
  const t = useTranslations("portal.header");
  const router = useRouter();

  const handleLogout = async () => {
    await fetch(`/api/public/portal/${orgId}/auth/logout`, {
      method: "POST",
    });
    router.push(`/portal/${orgId}/auth/login`);
    router.refresh();
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        {orgLogo ? (
          <img
            src={orgLogo}
            alt={orgName}
            className="h-8 w-8 rounded object-contain"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-sm font-bold text-primary">
            {orgName.charAt(0)}
          </div>
        )}
        <span className="text-sm font-semibold">{orgName}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-muted-foreground sm:block">
          {customerName}
        </span>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          {t("signOut")}
        </Button>
      </div>
    </header>
  );
}
