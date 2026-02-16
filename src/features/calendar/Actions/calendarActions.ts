"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  type: "service" | "reminder";
  status: string;
  vehicleId: string;
  vehicleLabel: string;
  customerName: string | null;
};

export async function getCalendarEvents(params: {
  start: string;
  end: string;
}) {
  return withAuth(async ({ organizationId }) => {
    const start = new Date(params.start);
    const end = new Date(params.end);
    end.setHours(23, 59, 59, 999);

    const [services, reminders] = await Promise.all([
      db.serviceRecord.findMany({
        where: {
          vehicle: { organizationId },
          serviceDate: { gte: start, lte: end },
        },
        select: {
          id: true,
          title: true,
          serviceDate: true,
          status: true,
          vehicleId: true,
          vehicle: {
            select: {
              make: true,
              model: true,
              year: true,
              customer: { select: { name: true } },
            },
          },
        },
        orderBy: { serviceDate: "asc" },
      }),
      db.reminder.findMany({
        where: {
          vehicle: { organizationId },
          dueDate: { gte: start, lte: end },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          isCompleted: true,
          vehicleId: true,
          vehicle: {
            select: {
              make: true,
              model: true,
              year: true,
              customer: { select: { name: true } },
            },
          },
        },
        orderBy: { dueDate: "asc" },
      }),
    ]);

    const events: CalendarEvent[] = [
      ...services.map((s) => ({
        id: s.id,
        title: s.title,
        date: s.serviceDate.toISOString(),
        type: "service" as const,
        status: s.status,
        vehicleId: s.vehicleId,
        vehicleLabel: `${s.vehicle.year} ${s.vehicle.make} ${s.vehicle.model}`,
        customerName: s.vehicle.customer?.name ?? null,
      })),
      ...reminders
        .filter((r) => r.dueDate !== null)
        .map((r) => ({
          id: r.id,
          title: r.title,
          date: r.dueDate!.toISOString(),
          type: "reminder" as const,
          status: r.isCompleted ? "completed" : new Date(r.dueDate!) < new Date() ? "overdue" : "upcoming",
          vehicleId: r.vehicleId,
          vehicleLabel: `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}`,
          customerName: r.vehicle.customer?.name ?? null,
        })),
    ];

    return events;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }] });
}
