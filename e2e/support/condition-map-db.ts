import { Client } from 'pg'

/**
 * Database peeks for the condition map's carry forward: what "Confirm all as
 * still there" wrote, read back with the column that links an earlier mark to
 * the one a later visit recorded in its place. Kept apart from `db.ts`, in the
 * same plain-pg style, so the carry specs can grow without touching it.
 */
async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const url = process.env.E2E_DATABASE_URL
  if (!url) throw new Error('E2E_DATABASE_URL is not set. See e2e/README.md.')
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

export interface CarryMarkRow {
  id: string
  serviceRecordId: string | null
  inspectionId: string | null
  inspectionItemId: string | null
  bodyType: string
  view: string
  panel: string
  x: number
  y: number
  kind: string
  severity: string
  note: string | null
  imageUrls: string[]
  resolvedAt: Date | null
  carriedToId: string | null
}

/** Every mark on the vehicle with its carry link, oldest first, resolved ones included. */
export async function marksWithCarry(vehicleId: string): Promise<CarryMarkRow[]> {
  return withDb(async (db) => {
    const result = await db.query<CarryMarkRow>(
      `select id, "serviceRecordId", "inspectionId", "inspectionItemId", "bodyType", view, panel,
              x, y, kind, severity, note, "imageUrls", "resolvedAt", "carriedToId"
         from condition_marks where "vehicleId" = $1 order by "recordedAt", "createdAt"`,
      [vehicleId]
    )
    return result.rows
  })
}

/** Puts photos on a planted mark, as if they had been taken in its editor. */
export async function setMarkPhotos(markId: string, urls: string[]): Promise<void> {
  await withDb((db) =>
    db.query(`update condition_marks set "imageUrls" = $2 where id = $1`, [markId, urls])
  )
}
