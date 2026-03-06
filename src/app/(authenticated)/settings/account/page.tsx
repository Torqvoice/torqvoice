import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { AccountSettings } from "./account-settings";

export default async function AccountSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const [user, verificationSetting] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true, emailVerified: true },
    }),
    db.systemSetting.findUnique({
      where: { key: "email.verificationRequired" },
      select: { value: true },
    }),
  ]);

  return (
    <AccountSettings
      twoFactorEnabled={user?.twoFactorEnabled ?? false}
      emailVerified={user?.emailVerified ?? false}
      emailVerificationRequired={verificationSetting?.value === "true"}
    />
  );
}
