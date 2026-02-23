import { redirect } from "next/navigation";
import { getLayoutData } from "@/lib/get-layout-data";
import { DateSettingsProvider } from "@/components/date-settings-context";
import { ConfirmProvider } from "@/components/confirm-dialog";

export default async function PresenterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getLayoutData();

  if (data.status === "unauthenticated") redirect("/auth/sign-in");
  if (data.status === "no-organization") redirect("/onboarding");

  return (
    <DateSettingsProvider
      dateFormat={data.dateFormat}
      timeFormat={data.timeFormat}
      timezone={data.timezone}
    >
      <ConfirmProvider>{children}</ConfirmProvider>
    </DateSettingsProvider>
  );
}
