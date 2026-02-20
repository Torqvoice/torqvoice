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
  Gauge,
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
    href: "/settings/templates",
    icon: Layout,
    description: "Invoice, quote & inspection templates",
    gate: "customTemplates",
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
    title: "Maintenance",
    href: "/settings/maintenance",
    icon: Gauge,
    description: "Predicted service intervals",
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
    if (item.cloudOnly && !isCloud) return false;
    if (item.selfHostedOnly && isCloud) return false;
    return true;
  });

  return (
    <nav className="flex flex-col gap-1">
      {visibleItems.map((item) => {
        const isActive = pathname === item.href;
        const isLocked = !!(item.gate && features && !features[item.gate]);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "bg-primary/10 text-primary font-medium"
                : isLocked
                  ? "text-muted-foreground/50 hover:bg-muted/50 hover:text-muted-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className={cn("truncate", isActive && "font-medium")}>{item.title}</p>
                {isLocked && (
                  <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                    PRO
                  </span>
                )}
              </div>
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
