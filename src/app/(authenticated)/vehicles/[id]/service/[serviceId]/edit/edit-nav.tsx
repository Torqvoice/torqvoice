"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface EditNavProps {
  vehicleId: string;
  serviceId: string;
}

export function EditNav({ vehicleId, serviceId }: EditNavProps) {
  const pathname = usePathname();
  const base = `/vehicles/${vehicleId}/service/${serviceId}/edit`;

  const tabs = [
    { label: "Details", href: base },
    { label: "Images", href: `${base}/images` },
    { label: "Video", href: `${base}/video` },
    { label: "Documents", href: `${base}/documents` },
  ];

  return (
    <nav className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-3 py-1.5 text-sm font-medium transition-colors -mb-px border-b-2",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
