import { getEmailSettings } from "@/features/email/Actions/emailSettingsActions";
import { EmailSettingsForm } from "@/features/email/Components/EmailSettingsForm";

export default async function EmailSettingsPage() {
  const result = await getEmailSettings();
  const settings = result.success && result.data ? result.data : {};

  return <EmailSettingsForm initial={settings} />;
}
