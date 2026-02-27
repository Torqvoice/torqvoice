"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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
  Globe,
  Info,
  Key,
  Layout,
  ListPlus,
  Mail,
  MessageSquare,
  Palette,
  UserCog,
  UsersRound,
  Wrench,
} from "lucide-react";

type SettingsNavItem = {
  key: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  gate?: keyof PlanFeatures;
  cloudOnly?: boolean;
  selfHostedOnly?: boolean;
};

type SettingsCategory = {
  key: string;
  items: SettingsNavItem[];
};

const settingsCategories: SettingsCategory[] = [
  {
    key: "general",
    items: [
      { key: "company", href: "/settings/company", icon: Building2 },
      { key: "subscription", href: "/settings/subscription", icon: CreditCard, cloudOnly: true },
      { key: "account", href: "/settings/account", icon: UserCog },
      { key: "team", href: "/settings/team", icon: UsersRound },
    ],
  },
  {
    key: "billing",
    items: [
      { key: "invoice", href: "/settings/invoice", icon: FileText },
      { key: "templates", href: "/settings/templates", icon: Layout, gate: "customTemplates" },
      { key: "payment", href: "/settings/payment", icon: Banknote, gate: "payments" },
      { key: "currency", href: "/settings/currency", icon: Coins },
      { key: "customFields", href: "/settings/custom-fields", icon: ListPlus, gate: "customFields" },
    ],
  },
  {
    key: "communications",
    items: [
      { key: "email", href: "/settings/email", icon: Mail, gate: "smtp" },
      { key: "sms", href: "/settings/sms", icon: MessageSquare, gate: "sms" },
      { key: "customerPortal", href: "/settings/customer-portal", icon: Globe, gate: "customerPortal" },
    ],
  },
  {
    key: "workshop",
    items: [
      { key: "workshop", href: "/settings/workshop", icon: Wrench },
      { key: "maintenance", href: "/settings/maintenance", icon: Gauge },
    ],
  },
  {
    key: "system",
    items: [
      { key: "appearance", href: "/settings/appearance", icon: Palette },
      { key: "data", href: "/settings/data", icon: Database },
      { key: "license", href: "/settings/license", icon: Key, selfHostedOnly: true },
      { key: "about", href: "/settings/about", icon: Info },
    ],
  },
];

export function SettingsNav({ features, isCloud }: { features?: PlanFeatures; isCloud?: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("settings");

  const filterItem = (item: SettingsNavItem) => {
    if (item.cloudOnly && !isCloud) return false;
    if (item.selfHostedOnly && isCloud) return false;
    return true;
  };

  return (
    <nav className="flex flex-col gap-4">
      {settingsCategories.map((category) => {
        const visibleItems = category.items.filter(filterItem);
        if (visibleItems.length === 0) return null;
        return (
          <div key={category.key}>
            <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              {t(`nav.categories.${category.key}`)}
            </p>
            <div className="flex flex-col gap-0.5">
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
                        <p className={cn("truncate", isActive && "font-medium")}>
                          {t(`nav.items.${item.key}.title`)}
                        </p>
                        {isLocked && (
                          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                            {t("nav.pro")}
                          </span>
                        )}
                      </div>
                      <p className="hidden truncate text-xs text-muted-foreground lg:block">
                        {t(`nav.items.${item.key}.description`)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
