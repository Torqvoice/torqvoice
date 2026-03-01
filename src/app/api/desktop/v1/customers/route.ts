import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withDesktopAuth } from "@/lib/with-desktop-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { createCustomerSchema } from "@/features/customers/Schema/customerSchema";
import { getFeatures, FeatureGatedError } from "@/lib/features";

export async function GET(request: Request) {
  return withDesktopAuth(
    request,
    async ({ organizationId }) => {
      const url = new URL(request.url);
      const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20", 10)));
      const search = url.searchParams.get("search") || "";
      const skip = (page - 1) * pageSize;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { organizationId };

      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { company: { contains: search, mode: "insensitive" } },
        ];
      }

      const [customers, total] = await Promise.all([
        db.customer.findMany({
          where,
          include: {
            _count: { select: { vehicles: true } },
          },
          orderBy: { updatedAt: "desc" },
          skip,
          take: pageSize,
        }),
        db.customer.count({ where }),
      ]);

      return NextResponse.json({
        customers,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.CUSTOMERS },
      ],
    },
  );
}

export async function POST(request: Request) {
  return withDesktopAuth(
    request,
    async ({ userId, organizationId }) => {
      const body = await request.json();
      const data = createCustomerSchema.parse(body);

      const features = await getFeatures(organizationId);
      const count = await db.customer.count({ where: { organizationId } });
      if (count >= features.maxCustomers) {
        throw new FeatureGatedError(
          "maxCustomers",
          "Customer limit reached. Upgrade your plan to add more customers.",
        );
      }

      const customer = await db.customer.create({
        data: {
          ...data,
          email: data.email || null,
          userId,
          organizationId,
        },
      });

      return NextResponse.json({ customer }, { status: 201 });
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.CUSTOMERS },
      ],
    },
  );
}
