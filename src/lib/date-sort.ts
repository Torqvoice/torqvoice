import { Prisma } from "@/generated/prisma/client";

/**
 * SQL ORDER BY expression for the date a work order/invoice is presented
 * with: the explicitly set invoice date, else the scheduled start, else the
 * service date. Matches what the invoice PDF and list views display.
 * `alias` must be a code-supplied table alias, never user input.
 */
export function effectiveDateSql(alias: string): Prisma.Sql {
  const a = Prisma.raw(`"${alias}"`);
  return Prisma.sql`COALESCE(${a}."invoiceDate", ${a}."startDateTime", ${a}."serviceDate")`;
}

/**
 * Prisma orderBy approximating COALESCE(startDateTime, serviceDate) for
 * lists that display the scheduled start when present. Records without a
 * scheduled start (imported/legacy data) sort by serviceDate and group at
 * the old end: nulls first ascending, nulls last descending.
 */
export function serviceDateOrderBy(dir: "asc" | "desc") {
  return [
    {
      startDateTime: {
        sort: dir,
        nulls: dir === "asc" ? ("first" as const) : ("last" as const),
      },
    },
    { serviceDate: dir },
  ];
}
