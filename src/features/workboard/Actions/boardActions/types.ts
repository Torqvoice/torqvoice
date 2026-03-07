export type BoardAssignmentWithJob = {
  id: string;
  sortOrder: number;
  notes: string | null;
  technicianId: string;
  serviceRecordId: string | null;
  inspectionId: string | null;
  organizationId: string;
  serviceRecord?: {
    id: string;
    title: string;
    status: string;
    startDateTime: string | null;
    endDateTime: string | null;
    vehicle: {
      id: string;
      make: string;
      model: string;
      year: number;
      licensePlate: string | null;
    };
  } | null;
  inspection?: {
    id: string;
    status: string;
    startDateTime: string | null;
    endDateTime: string | null;
    vehicle: {
      id: string;
      make: string;
      model: string;
      year: number;
      licensePlate: string | null;
    };
    template: { name: string };
  } | null;
};

export type WorkBoardSettings = {
  weekStartDay: number;
  workDayStart: string;
  workDayEnd: string;
};
