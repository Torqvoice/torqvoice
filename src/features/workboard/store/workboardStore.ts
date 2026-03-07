import { create } from "zustand";
import type { BoardAssignmentWithJob } from "../Actions/boardActions";

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
  assignments: BoardAssignmentWithJob[];
  unassignedServiceRecords: UnassignedServiceRecord[];
  unassignedInspections: UnassignedInspection[];
  weekStart: string;
  isConnected: boolean;

  setTechnicians: (techs: Technician[]) => void;
  addTechnician: (tech: Technician) => void;
  removeTechnician: (id: string) => void;

  setAssignments: (assignments: BoardAssignmentWithJob[]) => void;
  addAssignment: (assignment: BoardAssignmentWithJob) => void;
  updateAssignment: (assignment: BoardAssignmentWithJob) => void;
  removeAssignment: (id: string) => void;

  setUnassigned: (
    serviceRecords: UnassignedServiceRecord[],
    inspections: UnassignedInspection[],
  ) => void;
  removeFromUnassigned: (jobId: string, type: "serviceRecord" | "inspection") => void;
  addToUnassigned: (job: UnassignedServiceRecord | UnassignedInspection, type: "serviceRecord" | "inspection") => void;

  setWeekStart: (weekStart: string) => void;
  setConnected: (connected: boolean) => void;

  updateServiceTimes: (assignmentId: string, startDateTime: string, endDateTime: string) => void;
  optimisticMove: (assignmentId: string, newTechId: string) => void;
};

export const useWorkBoardStore = create<WorkBoardState>((set) => ({
  technicians: [],
  assignments: [],
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

  setAssignments: (assignments) => set({ assignments }),
  addAssignment: (assignment) =>
    set((s) => ({
      assignments: [...s.assignments.filter((a) => a.id !== assignment.id), assignment],
    })),
  updateAssignment: (assignment) =>
    set((s) => ({
      assignments: s.assignments.map((a) => (a.id === assignment.id ? assignment : a)),
    })),
  removeAssignment: (id) =>
    set((s) => ({ assignments: s.assignments.filter((a) => a.id !== id) })),

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

  updateServiceTimes: (assignmentId, startDateTime, endDateTime) =>
    set((s) => ({
      assignments: s.assignments.map((a) => {
        if (a.id !== assignmentId) return a;
        if (a.serviceRecord) {
          return { ...a, serviceRecord: { ...a.serviceRecord, startDateTime, endDateTime } };
        }
        if (a.inspection) {
          return { ...a, inspection: { ...a.inspection, startDateTime, endDateTime } };
        }
        return a;
      }),
    })),

  setWeekStart: (weekStart) => set({ weekStart }),
  setConnected: (isConnected) => set({ isConnected }),

  optimisticMove: (assignmentId, newTechId) =>
    set((s) => ({
      assignments: s.assignments.map((a) =>
        a.id === assignmentId ? { ...a, technicianId: newTechId } : a,
      ),
    })),
}));
