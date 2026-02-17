import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FeatureLockedMessageProps {
  feature: string;
  description: string;
  isCloud: boolean;
}

export function FeatureLockedMessage({ feature, description, isCloud }: FeatureLockedMessageProps) {
  const upgradeHref = isCloud ? "/settings/subscription" : "/settings/license";
  const upgradeLabel = isCloud ? "Upgrade Plan" : "Activate License";

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
        <Lock className="h-6 w-6 text-amber-600" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">{feature}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2">
        <p className="text-sm font-medium text-amber-600">Requires a Pro license</p>
      </div>
      <Button asChild className="mt-4" size="sm">
        <Link href={upgradeHref}>{upgradeLabel}</Link>
      </Button>
    </div>
  );
}
