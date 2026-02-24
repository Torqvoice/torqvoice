import { redirect } from "next/navigation";

export default async function PortalPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/portal/${orgId}/dashboard`);
}
