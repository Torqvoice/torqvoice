import { getTranslations } from "next-intl/server";
import { getCustomersPaginated } from "@/features/customers/Actions/customerActions";
import { CustomersClient } from "./customers-client";
import { PageHeader } from "@/components/page-header";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string }>;
}) {
  const params = await searchParams;
  const result = await getCustomersPaginated({
    page: params.page ? parseInt(params.page) : 1,
    pageSize: params.pageSize ? parseInt(params.pageSize) : 20,
    search: params.search,
  });

  if (!result.success || !result.data) {
    const t = await getTranslations("customers.list");
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {result.error || t("error")}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <CustomersClient
          data={result.data}
          search={params.search || ""}
        />
      </div>
    </>
  );
}
