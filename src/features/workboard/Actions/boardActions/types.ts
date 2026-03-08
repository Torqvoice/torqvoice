export type WorkBoardJob = {
  id: string;
  type: "serviceRecord" | "inspection";
  technicianId: string | null;
  sortOrder: number;
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
  } | null;
  templateName?: string;
};

export type WorkBoardSettings = {
  weekStartDay: number;
  workDayStart: string;
  workDayEnd: string;
};
