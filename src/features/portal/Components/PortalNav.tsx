"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
    title: "Dashboard",
    href: "dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Vehicles",
    href: "vehicles",
    icon: Car,
  },
  {
    title: "Invoices",
    href: "invoices",
    icon: FileText,
  },
  {
    title: "Quotes",
    href: "quotes",
    icon: FileQuestion,
  },
  {
    title: "Inspections",
    href: "inspections",
    icon: ClipboardCheck,
  },
  {
    title: "Request Service",
    href: "request-service",
    icon: Wrench,
  },
];

export function PortalNav({ orgId }: { orgId: string }) {
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
            <span className="truncate">{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
