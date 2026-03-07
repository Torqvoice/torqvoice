import { describe, it, expect } from "vitest";
import {
  getTimeOfDay,
  timeToMinutes,
  minutesToTime,
  isSameDay,
  dateOverlaps,
  clampToDay,
  getAssignmentDateRange,
  getDurationMinutes,
  assignmentOverlapsDate,
} from "@/features/workboard/utils/datetime";
import type { BoardAssignmentWithJob } from "@/features/workboard/Actions/boardActions";

function makeAssignment(
  startDateTime: string | null,
  endDateTime: string | null,
): BoardAssignmentWithJob {
  return {
    id: "a1",
    technicianId: "t1",
    serviceRecordId: "sr1",
    inspectionId: null,
    sortOrder: 0,
    notes: null,
    technician: { id: "t1", name: "Tech", color: "#000" },
    serviceRecord: {
      id: "sr1",
      title: "Test",
      status: "pending",
      type: "maintenance",
      startDateTime,
      endDateTime,
      vehicle: null,
    },
    inspection: null,
  } as unknown as BoardAssignmentWithJob;
}

describe("getTimeOfDay", () => {
  it("formats midnight as 00:00", () => {
    expect(getTimeOfDay(new Date(2026, 2, 17, 0, 0))).toBe("00:00");
  });

  it("formats morning time with zero-padding", () => {
    expect(getTimeOfDay(new Date(2026, 2, 17, 7, 5))).toBe("07:05");
  });

  it("formats afternoon time", () => {
    expect(getTimeOfDay(new Date(2026, 2, 17, 14, 30))).toBe("14:30");
  });

  it("ignores seconds", () => {
    expect(getTimeOfDay(new Date(2026, 2, 17, 12, 0, 45))).toBe("12:00");
  });
});

describe("timeToMinutes", () => {
  it("converts 00:00 to 0", () => {
    expect(timeToMinutes("00:00")).toBe(0);
  });

  it("converts 07:00 to 420", () => {
    expect(timeToMinutes("07:00")).toBe(420);
  });

  it("converts 15:00 to 900", () => {
    expect(timeToMinutes("15:00")).toBe(900);
  });

  it("converts 23:59 to 1439", () => {
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  it("converts 12:30 to 750", () => {
    expect(timeToMinutes("12:30")).toBe(750);
  });
});

describe("minutesToTime", () => {
  it("converts 0 to 00:00", () => {
    expect(minutesToTime(0)).toBe("00:00");
  });

  it("converts 420 to 07:00", () => {
    expect(minutesToTime(420)).toBe("07:00");
  });

  it("converts 900 to 15:00", () => {
    expect(minutesToTime(900)).toBe("15:00");
  });

  it("converts 1439 to 23:59", () => {
    expect(minutesToTime(1439)).toBe("23:59");
  });

  it("clamps negative values to 00:00", () => {
    expect(minutesToTime(-10)).toBe("00:00");
  });

  it("clamps values above 1439 to 23:59", () => {
    expect(minutesToTime(2000)).toBe("23:59");
  });
});

describe("isSameDay", () => {
  it("returns true for same day different times", () => {
    expect(isSameDay(new Date(2026, 2, 17, 8, 0), new Date(2026, 2, 17, 15, 30))).toBe(true);
  });

  it("returns false for adjacent days", () => {
    expect(isSameDay(new Date(2026, 2, 17, 23, 59), new Date(2026, 2, 18, 0, 0))).toBe(false);
  });

  it("returns false for different months", () => {
    expect(isSameDay(new Date(2026, 2, 17), new Date(2026, 3, 17))).toBe(false);
  });
});

describe("dateOverlaps", () => {
  it("returns true when ranges overlap", () => {
    const start = new Date(2026, 2, 17, 8, 0);
    const end = new Date(2026, 2, 17, 16, 0);
    const dayStart = new Date(2026, 2, 17, 0, 0);
    const dayEnd = new Date(2026, 2, 17, 23, 59);
    expect(dateOverlaps(start, end, dayStart, dayEnd)).toBe(true);
  });

  it("returns false when ranges do not overlap", () => {
    const start = new Date(2026, 2, 18, 8, 0);
    const end = new Date(2026, 2, 18, 16, 0);
    const dayStart = new Date(2026, 2, 17, 0, 0);
    const dayEnd = new Date(2026, 2, 17, 23, 59);
    expect(dateOverlaps(start, end, dayStart, dayEnd)).toBe(false);
  });

  it("returns true for multi-day range overlapping a day", () => {
    const start = new Date(2026, 2, 16, 14, 0);
    const end = new Date(2026, 2, 18, 10, 0);
    const dayStart = new Date(2026, 2, 17, 0, 0);
    const dayEnd = new Date(2026, 2, 17, 23, 59);
    expect(dateOverlaps(start, end, dayStart, dayEnd)).toBe(true);
  });
});

describe("clampToDay", () => {
  it("clamps a range that extends beyond day boundaries", () => {
    const dayStart = new Date(2026, 2, 17, 7, 0);
    const dayEnd = new Date(2026, 2, 17, 15, 0);
    const result = clampToDay(
      new Date(2026, 2, 16, 14, 0),
      new Date(2026, 2, 18, 10, 0),
      dayStart,
      dayEnd,
    );
    expect(result.start.getTime()).toBe(dayStart.getTime());
    expect(result.end.getTime()).toBe(dayEnd.getTime());
  });

  it("preserves range within day boundaries", () => {
    const start = new Date(2026, 2, 17, 9, 0);
    const end = new Date(2026, 2, 17, 12, 0);
    const result = clampToDay(start, end, new Date(2026, 2, 17, 7, 0), new Date(2026, 2, 17, 15, 0));
    expect(result.start.getTime()).toBe(start.getTime());
    expect(result.end.getTime()).toBe(end.getTime());
  });
});

describe("getAssignmentDateRange", () => {
  it("extracts dates from service record", () => {
    const a = makeAssignment("2026-03-17T08:00:00.000Z", "2026-03-17T16:00:00.000Z");
    const { start, end } = getAssignmentDateRange(a);
    expect(start).toBeInstanceOf(Date);
    expect(end).toBeInstanceOf(Date);
  });

  it("returns null when no dates", () => {
    const a = makeAssignment(null, null);
    const { start, end } = getAssignmentDateRange(a);
    expect(start).toBeNull();
    expect(end).toBeNull();
  });
});

describe("getDurationMinutes", () => {
  it("computes 60 minutes for 1 hour", () => {
    const start = new Date(2026, 2, 17, 8, 0);
    const end = new Date(2026, 2, 17, 9, 0);
    expect(getDurationMinutes(start, end)).toBe(60);
  });

  it("computes multi-day duration", () => {
    const start = new Date(2026, 2, 17, 14, 0);
    const end = new Date(2026, 2, 18, 10, 0);
    expect(getDurationMinutes(start, end)).toBe(20 * 60); // 20 hours
  });
});

describe("assignmentOverlapsDate", () => {
  it("returns true when assignment spans the date", () => {
    const a = makeAssignment("2026-03-17T08:00:00.000Z", "2026-03-17T16:00:00.000Z");
    expect(assignmentOverlapsDate(a, "2026-03-17")).toBe(true);
  });

  it("returns false when assignment is on different date", () => {
    const a = makeAssignment("2026-03-18T08:00:00.000Z", "2026-03-18T16:00:00.000Z");
    expect(assignmentOverlapsDate(a, "2026-03-17")).toBe(false);
  });

  it("returns true for multi-day assignment overlapping the date", () => {
    const a = makeAssignment("2026-03-16T14:00:00.000Z", "2026-03-18T10:00:00.000Z");
    expect(assignmentOverlapsDate(a, "2026-03-17")).toBe(true);
  });

  it("returns false when no dates on assignment", () => {
    const a = makeAssignment(null, null);
    expect(assignmentOverlapsDate(a, "2026-03-17")).toBe(false);
  });
});

describe("roundtrip: timeToMinutes <-> minutesToTime", () => {
  it("preserves value through roundtrip", () => {
    for (const mins of [0, 60, 420, 750, 900, 1439]) {
      expect(timeToMinutes(minutesToTime(mins))).toBe(mins);
    }
  });

  it("preserves time string through roundtrip", () => {
    for (const time of ["00:00", "07:00", "12:30", "15:00", "23:59"]) {
      expect(minutesToTime(timeToMinutes(time))).toBe(time);
    }
  });
});
