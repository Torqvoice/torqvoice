import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { AccountSettings } from "./account-settings";
import { getContentCounts } from "@/features/settings/Actions/deleteContent";

export default async function AccountSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const [user, countsResult] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true },
    }),
    getContentCounts(),
  ]);

  const contentCounts = countsResult.success && countsResult.data
    ? countsResult.data
    : { vehicles: 0, customers: 0, quotes: 0, inventory: 0 };

  return (
    <AccountSettings
      twoFactorEnabled={user?.twoFactorEnabled ?? false}
      contentCounts={contentCounts}
    />
  );
}
