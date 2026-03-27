import { db } from "@/lib/db";
import { AuthLogoProvider } from "@/components/auth-logo-provider";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const logoSetting = await db.appSetting.findFirst({
    where: { key: "workshop.logo" },
    select: { id: true },
  });

  return (
    <AuthLogoProvider hasCustomLogo={!!logoSetting}>
      {children}
    </AuthLogoProvider>
  );
}
