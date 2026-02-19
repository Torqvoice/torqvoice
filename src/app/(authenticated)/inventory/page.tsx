import { getInventoryPartsPaginated, getInventoryCategories } from "@/features/inventory/Actions/inventoryActions";
import { getSettings } from "@/features/settings/Actions/settingsActions";
import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { InventoryClient } from "./inventory-client";
import { PageHeader } from "@/components/page-header";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string; category?: string }>;
}) {
  const params = await searchParams;
  const [result, categoriesResult, settingsResult] = await Promise.all([
    getInventoryPartsPaginated({
      page: params.page ? parseInt(params.page) : 1,
      pageSize: params.pageSize ? parseInt(params.pageSize) : 20,
      search: params.search,
      category: params.category,
    }),
    getInventoryCategories(),
    getSettings([SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.INVENTORY_MARKUP_MULTIPLIER]),
  ]);

  if (!result.success || !result.data) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || "Failed to load inventory"}
          </p>
        </div>
      </>
    );
  }

  const categories = categoriesResult.success && categoriesResult.data ? categoriesResult.data : [];
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {};
  const currencyCode = settings[SETTING_KEYS.CURRENCY_CODE] || "USD";
  const markupMultiplier = Number(settings[SETTING_KEYS.INVENTORY_MARKUP_MULTIPLIER]) || 1.0;

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <InventoryClient
          data={result.data}
          search={params.search || ""}
          category={params.category || ""}
          categories={categories}
          currencyCode={currencyCode}
          markupMultiplier={markupMultiplier}
        />
      </div>
    </>
  );
}
