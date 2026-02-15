import Link from "next/link";
import { isCloudMode } from "@/lib/features";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

export function UpgradePrompt({
  feature,
  title = "Upgrade Required",
  description,
}: {
  feature: string;
  title?: string;
  description?: string;
}) {
  const cloud = isCloudMode();

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>
            {description ??
              `The ${feature} feature is not available on your current plan.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cloud ? (
            <Button asChild>
              <Link href="/settings/subscription">View Plans</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/settings/license">Manage License</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
