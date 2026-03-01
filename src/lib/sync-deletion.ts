import { db } from "./db";

export async function recordDeletion(
  entity: string,
  recordId: string | string[],
  organizationId: string
) {
  const ids = Array.isArray(recordId) ? recordId : [recordId];
  if (ids.length === 0) return;

  await db.syncDeletion.createMany({
    data: ids.map((id) => ({
      entity,
      recordId: id,
      organizationId,
    })),
  });
}
