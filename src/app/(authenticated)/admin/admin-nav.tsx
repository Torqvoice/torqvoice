"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  Building2,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

const adminNav = [
  {
    titleKey: "nav.overview.title",
    descriptionKey: "nav.overview.description",
    href: "/admin",
    icon: ShieldCheck,
  },
  {
    titleKey: "nav.users.title",
    descriptionKey: "nav.users.description",
    href: "/admin/users",
    icon: Users,
  },
  {
    titleKey: "nav.organizations.title",
    descriptionKey: "nav.organizations.description",
    href: "/admin/organizations",
    icon: Building2,
  },
  {
    titleKey: "nav.settings.title",
    descriptionKey: "nav.settings.description",
    href: "/admin/settings",
    icon: Settings,
  },
];

export function AdminNav() {
  const pathname = usePathname();
  const t = useTranslations("admin");

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
                {t(item.titleKey)}
              </p>
              <p className="hidden truncate text-xs text-muted-foreground lg:block">
                {t(item.descriptionKey)}
              </p>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
