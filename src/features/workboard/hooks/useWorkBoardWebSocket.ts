'use client'

import { useEffect } from 'react'
import { useRealtime, useRealtimeState } from '@/features/realtime/RealtimeProvider'
import { useWorkBoardStore } from '../store/workboardStore'
import type { WorkBoardJob } from '../Actions/boardActions'

export function useWorkBoardWebSocket() {
  const realtime = useRealtime()
  const { status } = useRealtimeState()

  // The board's "live" light says what the link is actually doing, not that
  // this hook has mounted.
  useEffect(() => {
    useWorkBoardStore
      .getState()
      .setConnection(
        status === 'ready' ? 'open' : status === 'connecting' ? 'connecting' : 'closed'
      )
    return () => useWorkBoardStore.getState().setConnection('closed')
  }, [status])

  useEffect(() => {
    if (!realtime) return
    return realtime.onLegacy('workboard', (raw) => {
      const store = useWorkBoardStore.getState()
      // The board's own events, which still travel on the workshop channel
      // (see lib/realtime for the record rooms that will replace them).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = raw as any
      if (!data?.type) return
      switch (data.type) {
        case 'job_assigned':
          store.addJob(data.job as WorkBoardJob)
          // Remove from unassigned lists based on job type and id
          if (data.job.type === 'serviceRecord') {
            store.removeFromUnassigned(data.job.id, 'serviceRecord')
          } else if (data.job.type === 'inspection') {
            store.removeFromUnassigned(data.job.id, 'inspection')
          }
          break

        case 'job_moved':
        case 'job_scheduled':
          store.updateJob(data.job as WorkBoardJob)
          break

        case 'job_unassigned':
          store.removeJob(data.jobId)
          break

        case 'technician_created':
          store.addTechnician(data.technician)
          break

        case 'work_bay_created':
        case 'work_bay_updated':
          store.upsertWorkBay(data.workBay)
          break

        case 'work_bay_removed':
          store.removeWorkBay(data.workBayId as string)
          break

        case 'technician_updated':
        case 'technician_removed':
          // Reload full technician list for updates/removals
          import('../Actions/technicianActions').then(({ getTechnicians }) => {
            getTechnicians().then((res) => {
              if (res.success && res.data) {
                store.setTechnicians(res.data as Parameters<typeof store.setTechnicians>[0])
              }
            })
          })
          break

        case 'service_times_updated': {
          const { serviceRecordId, startDateTime, endDateTime } = data
          const updatedJobs = store.jobs.map((j) =>
            j.type === 'serviceRecord' && j.id === serviceRecordId
              ? { ...j, startDateTime, endDateTime }
              : j
          )
          store.setJobs(updatedJobs)
          break
        }

        case 'inspection_times_updated': {
          const { inspectionId, startDateTime, endDateTime } = data
          const updatedJobs = store.jobs.map((j) =>
            j.type === 'inspection' && j.id === inspectionId
              ? { ...j, startDateTime, endDateTime }
              : j
          )
          store.setJobs(updatedJobs)
          break
        }

        case 'job_status_changed': {
          const { serviceRecordId, inspectionId, status, serviceRecord } = data
          const activeStatuses = ['pending', 'in-progress', 'waiting-parts', 'scheduled']

          // Update the status on matching jobs in-place
          const updated = store.jobs.map((j) => {
            if (serviceRecordId && j.type === 'serviceRecord' && j.id === serviceRecordId) {
              return { ...j, status }
            }
            if (inspectionId && j.type === 'inspection' && j.id === inspectionId) {
              return { ...j, status }
            }
            return j
          })
          store.setJobs(updated)

          // Add/remove from unassigned pool for service records
          if (serviceRecordId && serviceRecord) {
            const isAssigned = store.jobs.some(
              (j) => j.type === 'serviceRecord' && j.id === serviceRecordId
            )
            const isAlreadyUnassigned = store.unassignedServiceRecords.some(
              (sr) => sr.id === serviceRecordId
            )

            if (activeStatuses.includes(status) && !isAssigned && !isAlreadyUnassigned) {
              store.addToUnassigned(serviceRecord, 'serviceRecord')
            } else if (!activeStatuses.includes(status)) {
              store.removeFromUnassigned(serviceRecordId, 'serviceRecord')
            }
          }
          break
        }
      }
    })
  }, [realtime])
}
