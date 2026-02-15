"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Building2,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

const adminNav = [
  {
    title: "Overview",
    href: "/admin",
    icon: ShieldCheck,
    description: "Platform stats & health",
  },
  {
    title: "Users",
    href: "/admin/users",
    icon: Users,
    description: "Manage all users",
  },
  {
    title: "Organizations",
    href: "/admin/organizations",
    icon: Building2,
    description: "Manage all organizations",
  },

  {
    title: "Settings",
    href: "/admin/settings",
    icon: Settings,
    description: "Platform configuration",
  },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {adminNav.map((item) => {
        const isActive =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className={cn("truncate", isActive && "font-medium")}>
                {item.title}
              </p>
              <p className="hidden truncate text-xs text-muted-foreground lg:block">
                {item.description}
              </p>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
