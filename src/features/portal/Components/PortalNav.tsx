"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Car,
  FileText,
  LayoutDashboard,
  ClipboardCheck,
  FileQuestion,
  Wrench,
} from "lucide-react";

const navItems = [
  {
    key: "dashboard" as const,
    href: "dashboard",
    icon: LayoutDashboard,
  },
  {
    key: "vehicles" as const,
    href: "vehicles",
    icon: Car,
  },
  {
    key: "invoices" as const,
    href: "invoices",
    icon: FileText,
  },
  {
    key: "quotes" as const,
    href: "quotes",
    icon: FileQuestion,
  },
  {
    key: "inspections" as const,
    href: "inspections",
    icon: ClipboardCheck,
  },
  {
    key: "requestService" as const,
    href: "request-service",
    icon: Wrench,
  },
];

export function PortalNav({ orgId }: { orgId: string }) {
  const t = useTranslations("portal.nav");
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const href = `/portal/${orgId}/${item.href}`;
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{t(item.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
