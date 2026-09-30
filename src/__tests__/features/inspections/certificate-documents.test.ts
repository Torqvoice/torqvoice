import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('fs/promises', () => {
  const fs = { readFile: vi.fn() }
  return { ...fs, default: fs }
})
vi.mock('@/lib/resolve-upload-path', () => ({ resolveUploadPath: (url: string) => url }))

import { certificateDocuments } from '@/features/inspections/Lib/certificateDocuments'

const file = (over: Partial<Parameters<typeof certificateDocuments>[0][number]>) => ({
  fileName: 'form.pdf',
  fileType: 'application/pdf',
  fileUrl: '/api/protected/files/org/services/form.pdf',
  includeInReport: true,
  ...over,
})

describe('what follows the certificate', () => {
  it('appends only the PDF documents the workshop chose to show', () => {
    const shown = file({})
    const hidden = file({ fileName: 'draft.pdf', includeInReport: false })
    const photo = file({ fileName: 'front.jpg', fileType: 'image/jpeg' })
    const video = file({ fileName: 'walk.mp4', fileType: 'video/mp4' })
    expect(certificateDocuments([hidden, photo, shown, video])).toEqual([shown])
  })
})
