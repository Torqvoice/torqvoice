/**
 * Tests for copySetFilesToJob — what billing a tire set puts on the job.
 *
 * The rule it exists to enforce: only photos travel. A PDF stored with a set
 * (a storage agreement, an old invoice) is merged page for page into the
 * job's invoice PDF, so copying one silently turns a tire swap invoice into
 * two invoices stapled together — which is exactly the bug that prompted it.
 */

import { describe, it, expect, vi } from 'vitest'
import { copySetFilesToJob, type SetFile } from '@/features/tire-hotel/Lib/copySetFilesToJob'

const photo = (name: string): SetFile => ({
  fileName: name,
  fileUrl: `/api/protected/files/org/tire-hotel/${name}`,
  fileType: 'image/jpeg',
  fileSize: 1024,
  description: 'kerbing on the near side',
})

const pdf = (name: string): SetFile => ({
  fileName: name,
  fileUrl: `/api/protected/files/org/tire-hotel/${name}`,
  fileType: 'application/pdf',
  fileSize: 2048,
  description: null,
})

function makeTx() {
  const createMany = vi.fn().mockResolvedValue({ count: 0 })
  return { tx: { serviceAttachment: { createMany } }, createMany }
}

describe('copying a set’s files onto a job', () => {
  it('copies photos with the tire hotel category, included on the invoice', async () => {
    const { tx, createMany } = makeTx()
    await copySetFilesToJob(tx as never, 'svc-1', [photo('rim-front-left.jpg')])

    expect(createMany).toHaveBeenCalledTimes(1)
    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({
        serviceRecordId: 'svc-1',
        fileName: 'rim-front-left.jpg',
        category: 'tire_hotel',
        includeInInvoice: true,
      }),
    ])
  })

  it('leaves PDFs with the set', async () => {
    const { tx, createMany } = makeTx()
    await copySetFilesToJob(tx as never, 'svc-1', [
      pdf('storage-agreement.pdf'),
      photo('rim-front-left.jpg'),
      pdf('2026-1048.pdf'),
    ])

    const rows = createMany.mock.calls[0][0].data as { fileName: string }[]
    expect(rows.map((r) => r.fileName)).toEqual(['rim-front-left.jpg'])
  })

  it('writes nothing when the set only holds documents', async () => {
    const { tx, createMany } = makeTx()
    await copySetFilesToJob(tx as never, 'svc-1', [pdf('storage-agreement.pdf')])

    expect(createMany).not.toHaveBeenCalled()
  })
})
