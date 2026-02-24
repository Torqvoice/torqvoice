import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_DURATION,
} from "@/lib/customer-session";
import { resolvePortalOrg } from "@/lib/portal-slug";

export default async function PortalVerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { orgId: orgParam } = await params;
  const { token } = await searchParams;

  if (!token) {
    return <VerifyError orgParam={orgParam} message="Missing verification token." />;
  }

  // Resolve slug/id to real org
  const org = await resolvePortalOrg(orgParam);
  if (!org) {
    return <VerifyError orgParam={orgParam} message="Invalid or expired link." />;
  }

  const orgId = org.id;

  // Look up magic link
  const magicLink = await db.customerMagicLink.findUnique({
    where: { token },
  });

  if (!magicLink) {
    return <VerifyError orgParam={orgParam} message="Invalid or expired link." />;
  }

  if (magicLink.organizationId !== orgId) {
    return <VerifyError orgParam={orgParam} message="Invalid or expired link." />;
  }

  if (magicLink.usedAt) {
    return (
      <VerifyError
        orgParam={orgParam}
        message="This link has already been used. Please request a new one."
      />
    );
  }

  if (new Date() > magicLink.expiresAt) {
    return (
      <VerifyError
        orgParam={orgParam}
        message="This link has expired. Please request a new one."
      />
    );
  }

  // Mark magic link as used
  await db.customerMagicLink.update({
    where: { id: magicLink.id },
    data: { usedAt: new Date() },
  });

  // Find customer
  const customer = await db.customer.findFirst({
    where: {
      email: magicLink.email,
      organizationId: orgId,
    },
    select: { id: true },
  });

  if (!customer) {
    return <VerifyError orgParam={orgParam} message="Customer account not found." />;
  }

  // Create session
  const sessionToken = randomBytes(32).toString("hex");
  await db.customerSession.create({
    data: {
      token: sessionToken,
      customerId: customer.id,
      organizationId: orgId,
      expiresAt: new Date(Date.now() + CUSTOMER_SESSION_DURATION),
    },
  });

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/portal",
    maxAge: CUSTOMER_SESSION_DURATION / 1000,
  });

  redirect(`/portal/${orgParam}/dashboard`);
}

function VerifyError({
  orgParam,
  message,
}: {
  orgParam: string;
  message: string;
}) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Verification Failed</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button asChild>
            <Link href={`/portal/${orgParam}/auth/login`}>
              Back to sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
