import { create } from 'zustand'
import type { WorkBay, WorkBoardJob } from '../Actions/boardActions'

type UnassignedServiceRecord = {
  id: string
  title: string
  status: string
  // null for parts-only counter sales
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
}

type UnassignedInspection = {
  id: string
  status: string
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  }
  template: { name: string }
}

export type Technician = {
  id: string
  name: string
  color: string
  isActive: boolean
  sortOrder: number
  dailyCapacity: number
  userId: string | null
  organizationId: string
}

type WorkBoardState = {
  technicians: Technician[]
  workBays: WorkBay[]
  jobs: WorkBoardJob[]
  unassignedServiceRecords: UnassignedServiceRecord[]
  unassignedInspections: UnassignedInspection[]
  weekStart: string
  isConnected: boolean

  setTechnicians: (techs: Technician[]) => void
  addTechnician: (tech: Technician) => void
  removeTechnician: (id: string) => void

  setWorkBays: (bays: WorkBay[]) => void
  upsertWorkBay: (bay: WorkBay) => void
  removeWorkBay: (id: string) => void

  setJobs: (jobs: WorkBoardJob[]) => void
  addJob: (job: WorkBoardJob) => void
  updateJob: (job: WorkBoardJob) => void
  removeJob: (id: string) => void

  setUnassigned: (
    serviceRecords: UnassignedServiceRecord[],
    inspections: UnassignedInspection[]
  ) => void
  removeFromUnassigned: (jobId: string, type: 'serviceRecord' | 'inspection') => void
  addToUnassigned: (
    job: UnassignedServiceRecord | UnassignedInspection,
    type: 'serviceRecord' | 'inspection'
  ) => void

  setWeekStart: (weekStart: string) => void
  setConnected: (connected: boolean) => void

  updateServiceTimes: (jobId: string, startDateTime: string, endDateTime: string) => void
  optimisticMove: (jobId: string, newTechId: string) => void
  /** Apply a lane and/or time change to one job without waiting for the server. */
  optimisticSchedule: (
    jobId: string,
    patch: Partial<
      Pick<WorkBoardJob, 'technicianId' | 'workBayId' | 'startDateTime' | 'endDateTime'>
    >
  ) => void
}

export const useWorkBoardStore = create<WorkBoardState>((set) => ({
  technicians: [],
  workBays: [],
  jobs: [],
  unassignedServiceRecords: [],
  unassignedInspections: [],
  weekStart: '',
  isConnected: false,

  setTechnicians: (technicians) => set({ technicians }),
  addTechnician: (tech) =>
    set((s) => ({
      technicians: [...s.technicians.filter((t) => t.id !== tech.id), tech],
    })),
  removeTechnician: (id) => set((s) => ({ technicians: s.technicians.filter((t) => t.id !== id) })),

  setWorkBays: (workBays) => set({ workBays }),
  upsertWorkBay: (bay) =>
    set((s) => ({
      workBays: s.workBays.some((b) => b.id === bay.id)
        ? s.workBays.map((b) => (b.id === bay.id ? bay : b))
        : [...s.workBays, bay].sort((a, b) => a.sortOrder - b.sortOrder),
    })),
  removeWorkBay: (id) =>
    set((s) => ({
      workBays: s.workBays.filter((b) => b.id !== id),
      // The bay is gone; its jobs stay scheduled and fall into the "no bay"
      // lane, mirroring the SetNull the database just performed.
      jobs: s.jobs.map((j) => (j.workBayId === id ? { ...j, workBayId: null } : j)),
    })),

  setJobs: (jobs) => set({ jobs }),
  addJob: (job) =>
    set((s) => ({
      jobs: [...s.jobs.filter((j) => j.id !== job.id), job],
    })),
  updateJob: (job) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === job.id ? job : j)),
    })),
  removeJob: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),

  setUnassigned: (serviceRecords, inspections) =>
    set({ unassignedServiceRecords: serviceRecords, unassignedInspections: inspections }),
  removeFromUnassigned: (jobId, type) =>
    set((s) =>
      type === 'serviceRecord'
        ? { unassignedServiceRecords: s.unassignedServiceRecords.filter((sr) => sr.id !== jobId) }
        : { unassignedInspections: s.unassignedInspections.filter((i) => i.id !== jobId) }
    ),
  addToUnassigned: (job, type) =>
    set((s) =>
      type === 'serviceRecord'
        ? {
            unassignedServiceRecords: [
              job as UnassignedServiceRecord,
              ...s.unassignedServiceRecords,
            ],
          }
        : { unassignedInspections: [job as UnassignedInspection, ...s.unassignedInspections] }
    ),

  updateServiceTimes: (jobId, startDateTime, endDateTime) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, startDateTime, endDateTime } : j)),
    })),

  setWeekStart: (weekStart) => set({ weekStart }),
  setConnected: (isConnected) => set({ isConnected }),

  optimisticMove: (jobId, newTechId) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, technicianId: newTechId } : j)),
    })),

  optimisticSchedule: (jobId, patch) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j)),
    })),
}))
