"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createFieldDefinitionSchema, updateFieldDefinitionSchema } from "../Schema/customFieldSchema";
import { revalidatePath } from "next/cache";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { requireFeature } from "@/lib/features";

export async function getFieldDefinitions(entityType?: string) {
  return withAuth(async ({ organizationId }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { organizationId };
    if (entityType) where.entityType = entityType;

    return db.customFieldDefinition.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }] });
}

export async function createFieldDefinition(input: unknown) {
  return withAuth(async ({ userId, organizationId }) => {
    await requireFeature(organizationId, "customFields");

    const data = createFieldDefinitionSchema.parse(input);

    const existing = await db.customFieldDefinition.findFirst({
      where: { organizationId, name: data.name, entityType: data.entityType },
    });
    if (existing) throw new Error("A field with this name already exists for this entity type");

    const field = await db.customFieldDefinition.create({
      data: { ...data, userId, organizationId },
    });

    revalidatePath("/settings/custom-fields");
    return field;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }] });
}

export async function updateFieldDefinition(input: unknown) {
  return withAuth(async ({ organizationId }) => {
    const data = updateFieldDefinitionSchema.parse(input);
    const { id, ...rest } = data;

    const existing = await db.customFieldDefinition.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new Error("Field not found");

    const field = await db.customFieldDefinition.update({
      where: { id },
      data: rest,
    });

    revalidatePath("/settings/custom-fields");
    return field;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }] });
}

export async function deleteFieldDefinition(fieldId: string) {
  return withAuth(async ({ organizationId }) => {
    const field = await db.customFieldDefinition.findFirst({
      where: { id: fieldId, organizationId },
    });
    if (!field) throw new Error("Field not found");

    await db.$transaction([
      db.customFieldValue.deleteMany({ where: { fieldId } }),
      db.customFieldDefinition.delete({ where: { id: fieldId } }),
    ]);

    revalidatePath("/settings/custom-fields");
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }] });
}

export async function getCustomFieldValues(entityId: string, entityType: string) {
  return withAuth(async ({ organizationId }) => {
    const definitions = await db.customFieldDefinition.findMany({
      where: { organizationId, entityType, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    const values = await db.customFieldValue.findMany({
      where: {
        entityId,
        entityType,
        fieldId: { in: definitions.map((d) => d.id) },
      },
    });

    const valuesMap: Record<string, string> = {};
    for (const v of values) {
      valuesMap[v.fieldId] = v.value;
    }

    return definitions.map((def) => ({
      ...def,
      value: valuesMap[def.id] || "",
    }));
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }] });
}

export async function saveCustomFieldValues(
  entityId: string,
  entityType: string,
  values: Record<string, string>
) {
  return withAuth(async ({ organizationId }) => {
    const definitions = await db.customFieldDefinition.findMany({
      where: { organizationId, entityType, isActive: true },
    });

    const validFieldIds = new Set(definitions.map((d) => d.id));

    const ops = Object.entries(values)
      .filter(([fieldId]) => validFieldIds.has(fieldId))
      .map(([fieldId, value]) =>
        db.customFieldValue.upsert({
          where: {
            fieldId_entityId: { fieldId, entityId },
          },
          create: { fieldId, entityId, entityType, value },
          update: { value },
        })
      );

    await db.$transaction(ops);
    return { saved: true };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }] });
}
