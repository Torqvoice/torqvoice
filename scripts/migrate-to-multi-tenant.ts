/**
 * One-time migration script: backfill organizationId on all business entities.
 *
 * Run AFTER the first `prisma db push` (with organizationId as optional String?).
 * Run BEFORE the second `prisma db push` (making organizationId required String).
 *
 * Usage:
 *   npx tsx scripts/migrate-to-multi-tenant.ts
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const users = await db.user.findMany({ select: { id: true, name: true } });
  console.log(`Found ${users.length} users to migrate.\n`);

  for (const user of users) {
    // Check if user already has an org membership
    const existing = await db.organizationMember.findFirst({
      where: { userId: user.id },
    });

    let orgId: string;

    if (existing) {
      orgId = existing.organizationId;
      console.log(`User "${user.name}" already has org ${orgId}`);
    } else {
      // Create org and membership
      const org = await db.organization.create({
        data: { name: `${user.name}'s Workshop` },
      });
      await db.organizationMember.create({
        data: { userId: user.id, organizationId: org.id, role: "owner" },
      });
      orgId = org.id;
      console.log(`Created org "${org.name}" (${orgId}) for user "${user.name}"`);
    }

    // Backfill organizationId on all entities owned by this user
    const results = await Promise.all([
      db.vehicle.updateMany({
        where: { userId: user.id, organizationId: null },
        data: { organizationId: orgId },
      }),
      db.customer.updateMany({
        where: { userId: user.id, organizationId: null },
        data: { organizationId: orgId },
      }),
      db.quote.updateMany({
        where: { userId: user.id, organizationId: null },
        data: { organizationId: orgId },
      }),
      db.inventoryPart.updateMany({
        where: { userId: user.id, organizationId: null },
        data: { organizationId: orgId },
      }),
      db.customFieldDefinition.updateMany({
        where: { userId: user.id, organizationId: null },
        data: { organizationId: orgId },
      }),
      db.appSetting.updateMany({
        where: { userId: user.id, organizationId: null },
        data: { organizationId: orgId },
      }),
    ]);

    const labels = ["vehicles", "customers", "quotes", "inventory", "customFields", "settings"];
    const counts = results.map((r, i) => `${labels[i]}: ${r.count}`).join(", ");
    console.log(`  Backfilled: ${counts}\n`);
  }

  console.log("Migration complete!");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
