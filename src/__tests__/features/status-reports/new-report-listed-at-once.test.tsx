/**
 * A status report made from a job is in the job's list as soon as it is made.
 *
 * "Create" used to close the dialog and leave "No status reports yet" on the
 * screen until a reload: only "Create and send" read the list again, and only
 * once the send dialog closed. The page reads its reports on the server, so
 * the list asks it to (router.refresh), which here hands back the new list.
 */

import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** What the server would render the list with on the next read. */
let serverReports: unknown[] = []
let rerenderFromServer: (() => void) | null = null
const refresh = vi.fn(() => rerenderFromServer?.())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/hooks/use-native-camera', () => ({ useNativeCamera: () => false }))
vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({ dateFormat: 'yyyy-MM-dd', timeFormat: '24h', timezone: 'UTC' }),
}))
// A recording, without a camera.
vi.mock('@/components/video-recorder-dialog', () => ({
  VideoRecorderDialog: ({ onRecorded }: { onRecorded: (file: File) => void }) => (
    <button
      type="button"
      onClick={() => onRecorded(new File(['x'], 'clip.webm', { type: 'video/webm' }))}
    >
      record a clip
    </button>
  ),
}))
vi.mock('@/features/status-reports/Actions/createStatusReport', () => ({
  createStatusReport: vi.fn(async () => {
    serverReports = [
      {
        id: 'r1',
        title: 'ZZ Brakes look worn',
        message: null,
        status: 'published',
        videoUrl: '/files/clip.webm',
        createdAt: '2026-11-24T10:00:00.000Z',
        expiresAt: null,
        publicToken: 'tok',
        customerFeedback: null,
        feedbackAt: null,
        sentVia: null,
        sentAt: null,
      },
    ]
    return { success: true, data: { id: 'r1' } }
  }),
}))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/features/status-reports/Actions/deleteStatusReport', () => ({
  deleteStatusReport: vi.fn(),
}))
vi.mock('@/features/status-reports/Actions/sendStatusReport', () => ({
  sendStatusReport: vi.fn(),
}))

// The upload is a plain XHR to the files route; answer it at once.
class InstantUpload {
  status = 200
  responseText = JSON.stringify({ url: '/files/clip.webm', fileName: 'clip.webm' })
  upload = { addEventListener: vi.fn() }
  private onLoad: (() => void) | null = null
  addEventListener(event: string, cb: () => void) {
    if (event === 'load') this.onLoad = cb
  }
  open = vi.fn()
  send() {
    setTimeout(() => this.onLoad?.(), 0)
  }
}
vi.stubGlobal('XMLHttpRequest', InstantUpload)

import { StatusReportList } from '@/features/status-reports/Components/StatusReportList'

function JobReports({ customer }: { customer: boolean }) {
  const [reports, setReports] = useState(serverReports)
  rerenderFromServer = () => setReports([...serverReports])
  return (
    <StatusReportList
      serviceRecordId="job-1"
      organizationId="org-1"
      vehicleName="ZZ19 TST"
      customer={
        customer
          ? { id: 'c1', name: 'ZZ Jane Example', email: null, phone: null, telegramChatId: null }
          : null
      }
      smsEnabled={false}
      emailEnabled={false}
      telegramEnabled={false}
      initialReports={reports as never}
    />
  )
}

describe('a new status report on the job', () => {
  for (const customer of [false, true]) {
    it(`is listed as soon as it is created (${customer ? 'with' : 'without'} a customer)`, async () => {
      serverReports = []
      render(<JobReports customer={customer} />)
      expect(screen.getByText('No status reports yet')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'New Status Report' }))
      await userEvent.click(screen.getByRole('button', { name: 'record a clip' }))
      const create = screen.getByRole('button', { name: 'Create' })
      await waitFor(() => expect(create).toBeEnabled())
      await userEvent.click(create)

      await waitFor(() => expect(screen.queryByText('No status reports yet')).toBeNull())
      expect(screen.getAllByText('ZZ Brakes look worn').length).toBeGreaterThan(0)
    })
  }
})
