import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from 'next-intl/server';

export const revalidate = 60;

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PublicTermsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  const [settings, org] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId: orgId,
        key: {
          in: [
            "payment.termsOfSale",
            "workshop.address",
            "workshop.phone",
            "workshop.email",
            "workshop.logo",
          ],
        },
      },
    }),
    db.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    }),
  ]);

  if (!org) notFound();

  const settingsMap: Record<string, string> = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  const termsContent = settingsMap["payment.termsOfSale"];
  if (!termsContent) notFound();

  const t = await getTranslations('share.terms');

  const workshopName = org.name || "";
  const logoUrl = settingsMap["workshop.logo"] || "";
  const address = settingsMap["workshop.address"] || "";
  const phone = settingsMap["workshop.phone"] || "";
  const email = settingsMap["workshop.email"] || "";

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="rounded-xl border bg-white p-6 shadow-sm sm:p-8">
        {/* Header */}
        <div className="border-b pb-6">
          <div className="flex items-center gap-4">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={workshopName}
                className="max-h-16 max-w-[180px] object-contain object-left"
              />
            )}
            {workshopName && (
              <h1 className="text-xl font-bold text-amber-600 sm:text-2xl">
                {workshopName}
              </h1>
            )}
          </div>
          <h2 className="mt-4 text-lg font-semibold">{t('title')}</h2>
        </div>

        {/* Terms Content */}
        <div className="mt-6">
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {termsContent}
          </p>
        </div>

        {/* Footer */}
        {(address || phone || email) && (
          <div className="mt-8 border-t pt-4">
            <p className="text-xs font-bold uppercase text-gray-400">{t('contact')}</p>
            <div className="mt-1 space-y-0.5 text-sm text-gray-500">
              {address && <p>{address}</p>}
              {phone && <p>{t('tel', { phone })}</p>}
              {email && <p>{email}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
