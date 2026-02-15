import { redirect } from "next/navigation";
import { getCachedSession } from "@/lib/cached-session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCachedSession();

  if (!session?.user?.id) redirect("/auth/sign-in");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  });

  if (!user?.isSuperAdmin) redirect("/");

  return (
    <div className="flex h-svh flex-col">
      <PageHeader />
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 pt-0">
        <div className="shrink-0">
          <h1 className="text-3xl font-bold tracking-tight">Admin Panel</h1>
          <p className="mt-1 text-muted-foreground">
            Platform management for super administrators
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-6 md:flex-row">
          <aside className="w-full shrink-0 overflow-y-auto md:w-56 lg:w-64">
            <AdminNav />
          </aside>
          <div className="min-w-0 flex-1 overflow-y-auto pb-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
