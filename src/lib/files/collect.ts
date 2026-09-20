import 'server-only'

import { db } from '@/lib/db'

/**
 * Which file URLs a delete takes with it, read before the delete runs.
 *
 * Deleting a row deletes more rows through the database's cascades, and each
 * of those can point at a file. These functions follow the same cascades as
 * the schema (prisma/schema/*.prisma), so a delete can hand every URL it is
 * about to orphan to `releaseFiles` once it has committed. The manager then
 * keeps any that another row still uses (a tire set's photo on a work order,
 * a job photo sent on WhatsApp), so over-collecting here is safe and
 * under-collecting leaves a file behind.
 *
 * What does not cascade is deliberately absent: a vehicle's quotes, tire sets
 * and WhatsApp messages are kept (their vehicle is set to null), and so are
 * their files.
 */

type Urls = (string | null | undefined)[]

/** A work order: its attachments and its status report videos. */
export async function serviceRecordFileUrls(organizationId: string, serviceRecordIds: string[]) {
  if (serviceRecordIds.length === 0) return []
  const [attachments, reports] = await Promise.all([
    db.serviceAttachment.findMany({
      where: { serviceRecordId: { in: serviceRecordIds }, serviceRecord: { organizationId } },
      select: { fileUrl: true },
    }),
    db.statusReport.findMany({
      where: { serviceRecordId: { in: serviceRecordIds }, organizationId },
      select: { videoUrl: true },
    }),
  ])
  return [...attachments.map((a) => a.fileUrl), ...reports.map((r) => r.videoUrl)] as Urls
}

/** An inspection: the photos on its items. */
export async function inspectionFileUrls(organizationId: string, inspectionIds: string[]) {
  if (inspectionIds.length === 0) return []
  const items = await db.inspectionItem.findMany({
    where: { inspectionId: { in: inspectionIds }, inspection: { organizationId } },
    select: { imageUrls: true },
  })
  return items.flatMap((item) => item.imageUrls) as Urls
}

/**
 * A vehicle: its own image, and everything that cascades with it: its work
 * orders (with their attachments and status reports), its inspections and
 * its findings.
 */
export async function vehicleFileUrls(organizationId: string, vehicleIds: string[]) {
  if (vehicleIds.length === 0) return []
  const vehicles = await db.vehicle.findMany({
    where: { id: { in: vehicleIds }, organizationId },
    select: {
      imageUrl: true,
      serviceRecords: { select: { id: true } },
      inspections: { select: { id: true } },
      findings: { select: { imageUrls: true } },
    },
  })
  const serviceRecordIds = vehicles.flatMap((v) => v.serviceRecords.map((s) => s.id))
  const inspectionIds = vehicles.flatMap((v) => v.inspections.map((i) => i.id))
  const [serviceFiles, inspectionFiles] = await Promise.all([
    serviceRecordFileUrls(organizationId, serviceRecordIds),
    inspectionFileUrls(organizationId, inspectionIds),
  ])
  return [
    ...vehicles.map((v) => v.imageUrl),
    ...vehicles.flatMap((v) => v.findings.flatMap((f) => f.imageUrls)),
    ...serviceFiles,
    ...inspectionFiles,
  ] as Urls
}

/** A quote: its attachments. */
export async function quoteFileUrls(organizationId: string, quoteIds: string[]) {
  if (quoteIds.length === 0) return []
  const attachments = await db.quoteAttachment.findMany({
    where: { quoteId: { in: quoteIds }, quote: { organizationId } },
    select: { fileUrl: true },
  })
  return attachments.map((a) => a.fileUrl) as Urls
}

/** A stored tire set: its attachments, and the images on its measurements. */
export async function tireSetFileUrls(organizationId: string, tireSetIds: string[]) {
  if (tireSetIds.length === 0) return []
  const [attachments, images] = await Promise.all([
    db.tireSetAttachment.findMany({
      where: { tireSetId: { in: tireSetIds }, tireSet: { organizationId } },
      select: { fileUrl: true },
    }),
    db.storedImage.findMany({
      where: { tireMeasurement: { tireSetId: { in: tireSetIds }, tireSet: { organizationId } } },
      select: { url: true },
    }),
  ])
  return [...attachments.map((a) => a.fileUrl), ...images.map((i) => i.url)] as Urls
}

/** An inventory part: its main image and its gallery. */
export async function inventoryPartFileUrls(organizationId: string, partIds: string[]) {
  if (partIds.length === 0) return []
  const parts = await db.inventoryPart.findMany({
    where: { id: { in: partIds }, organizationId },
    select: { imageUrl: true, gallery: { select: { url: true } } },
  })
  return parts.flatMap((p) => [p.imageUrl, ...p.gallery.map((i) => i.url)]) as Urls
}
