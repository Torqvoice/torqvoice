import { create } from "zustand";
import type { WorkBoardJob } from "../Actions/boardActions";

type UnassignedServiceRecord = {
  id: string;
  title: string;
  status: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
  };
};

type UnassignedInspection = {
  id: string;
  status: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string | null;
  };
  template: { name: string };
};

export type Technician = {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
  dailyCapacity: number;
  memberId: string | null;
  organizationId: string;
};

type WorkBoardState = {
  technicians: Technician[];
  jobs: WorkBoardJob[];
  unassignedServiceRecords: UnassignedServiceRecord[];
  unassignedInspections: UnassignedInspection[];
  weekStart: string;
  isConnected: boolean;

  setTechnicians: (techs: Technician[]) => void;
  addTechnician: (tech: Technician) => void;
  removeTechnician: (id: string) => void;

  setJobs: (jobs: WorkBoardJob[]) => void;
  addJob: (job: WorkBoardJob) => void;
  updateJob: (job: WorkBoardJob) => void;
  removeJob: (id: string) => void;

  setUnassigned: (
    serviceRecords: UnassignedServiceRecord[],
    inspections: UnassignedInspection[],
  ) => void;
  removeFromUnassigned: (jobId: string, type: "serviceRecord" | "inspection") => void;
  addToUnassigned: (job: UnassignedServiceRecord | UnassignedInspection, type: "serviceRecord" | "inspection") => void;

  setWeekStart: (weekStart: string) => void;
  setConnected: (connected: boolean) => void;

  updateServiceTimes: (jobId: string, startDateTime: string, endDateTime: string) => void;
  optimisticMove: (jobId: string, newTechId: string) => void;
};

export const useWorkBoardStore = create<WorkBoardState>((set) => ({
  technicians: [],
  jobs: [],
  unassignedServiceRecords: [],
  unassignedInspections: [],
  weekStart: "",
  isConnected: false,

  setTechnicians: (technicians) => set({ technicians }),
  addTechnician: (tech) =>
    set((s) => ({
      technicians: [...s.technicians.filter((t) => t.id !== tech.id), tech],
    })),
  removeTechnician: (id) =>
    set((s) => ({ technicians: s.technicians.filter((t) => t.id !== id) })),

  setJobs: (jobs) => set({ jobs }),
  addJob: (job) =>
    set((s) => ({
      jobs: [...s.jobs.filter((j) => j.id !== job.id), job],
    })),
  updateJob: (job) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === job.id ? job : j)),
    })),
  removeJob: (id) =>
    set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),

  setUnassigned: (serviceRecords, inspections) =>
    set({ unassignedServiceRecords: serviceRecords, unassignedInspections: inspections }),
  removeFromUnassigned: (jobId, type) =>
    set((s) =>
      type === "serviceRecord"
        ? { unassignedServiceRecords: s.unassignedServiceRecords.filter((sr) => sr.id !== jobId) }
        : { unassignedInspections: s.unassignedInspections.filter((i) => i.id !== jobId) },
    ),
  addToUnassigned: (job, type) =>
    set((s) =>
      type === "serviceRecord"
        ? { unassignedServiceRecords: [job as UnassignedServiceRecord, ...s.unassignedServiceRecords] }
        : { unassignedInspections: [job as UnassignedInspection, ...s.unassignedInspections] },
    ),

  updateServiceTimes: (jobId, startDateTime, endDateTime) =>
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId ? { ...j, startDateTime, endDateTime } : j,
      ),
    })),

  setWeekStart: (weekStart) => set({ weekStart }),
  setConnected: (isConnected) => set({ isConnected }),

  optimisticMove: (jobId, newTechId) =>
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId ? { ...j, technicianId: newTechId } : j,
      ),
    })),
}));
