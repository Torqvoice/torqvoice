"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { PlanFeatures } from "@/lib/features";
import {
  Banknote,
  Building2,
  Coins,
  CreditCard,
  Database,
  FileText,
  Info,
  Key,
  Layout,
  ListPlus,
  Mail,
  Palette,
  UserCog,
  UsersRound,
  Wrench,
} from "lucide-react";

type SettingsNavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  gate?: keyof PlanFeatures;
  cloudOnly?: boolean;
  selfHostedOnly?: boolean;
};

const settingsNav: SettingsNavItem[] = [
  {
    title: "Company",
    href: "/settings/company",
    icon: Building2,
    description: "Business details & branding",
  },
  {
    title: "Subscription",
    href: "/settings/subscription",
    icon: CreditCard,
    description: "Plan & billing",
    cloudOnly: true,
  },
  {
    title: "Account",
    href: "/settings/account",
    icon: UserCog,
    description: "Name, email & password",
  },
  {
    title: "Team",
    href: "/settings/team",
    icon: UsersRound,
    description: "Members & roles",
  },
  {
    title: "Invoice",
    href: "/settings/invoice",
    icon: FileText,
    description: "Invoice layout & fields",
  },
  {
    title: "Templates",
    href: "/settings/invoice-template",
    icon: Layout,
    description: "Invoice styling & colors",
  },
  {
    title: "Payment",
    href: "/settings/payment",
    icon: Banknote,
    description: "Payment terms & accounts",
    gate: "payments",
  },
  {
    title: "Currency",
    href: "/settings/currency",
    icon: Coins,
    description: "Currency & tax defaults",
  },
  {
    title: "Custom Fields",
    href: "/settings/custom-fields",
    icon: ListPlus,
    description: "Define custom data fields",
    gate: "customFields",
  },
  {
    title: "Email",
    href: "/settings/email",
    icon: Mail,
    description: "Email provider & sending",
    gate: "smtp",
  },
  {
    title: "Workshop",
    href: "/settings/workshop",
    icon: Wrench,
    description: "Technician & labor defaults",
  },
  {
    title: "Appearance",
    href: "/settings/appearance",
    icon: Palette,
    description: "Theme & display",
  },
  {
    title: "Data",
    href: "/settings/data",
    icon: Database,
    description: "Export & import backup",
  },
  {
    title: "License",
    href: "/settings/license",
    icon: Key,
    description: "White-label license",
    selfHostedOnly: true,
  },
  {
    title: "About",
    href: "/settings/about",
    icon: Info,
    description: "Version & info",
  },
];

export function SettingsNav({ features, isCloud }: { features?: PlanFeatures; isCloud?: boolean }) {
  const pathname = usePathname();

  const visibleItems = settingsNav.filter((item) => {
    if (item.gate && features && !features[item.gate]) return false;
    if (item.cloudOnly && !isCloud) return false;
    if (item.selfHostedOnly && isCloud) return false;
    return true;
  });

  return (
    <nav className="flex flex-col gap-1">
      {visibleItems.map((item) => {
        const isActive = pathname === item.href;
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
              <p className={cn("truncate", isActive && "font-medium")}>{item.title}</p>
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
