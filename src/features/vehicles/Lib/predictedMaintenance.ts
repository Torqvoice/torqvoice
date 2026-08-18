/**
 * Pure predicted-maintenance math, shared between the dashboard server
 * actions and the customer-reminder cron so the regression lives in exactly
 * one place.
 */

export type ServiceMileagePoint = {
  serviceDate: Date;
  startDateTime: Date | null;
  mileage: number | null;
};

export type MileagePrediction = {
  predictedMileage: number;
  avgPerDay: number;
  lastServiceDate: Date;
  lastServiceMileage: number;
  dataPoints: number;
  totalDays: number;
};

export type ServiceDueStatus = "overdue" | "approaching";

export type ServiceDueEvaluation = {
  predictedMileage: number;
  lastServiceMileage: number;
  mileageSinceLastService: number;
  status: ServiceDueStatus;
  confidencePercent: number;
};

export const DEFAULT_SERVICE_INTERVAL = 15000;
export const DEFAULT_APPROACHING_THRESHOLD = 1000;

export function calculateConfidencePercent(dataPoints: number, totalDays: number): number {
  const pointScore = Math.min(50, 15 * Math.log2(dataPoints));
  const timeScore = Math.min(30, (totalDays / 365) * 30);
  return Math.min(95, Math.round(15 + pointScore + timeScore));
}

function pointDate(record: ServiceMileagePoint): Date {
  return new Date(record.startDateTime ?? record.serviceDate);
}

/**
 * Linear regression over completed service mileages: average distance per day
 * across the whole history, projected from the latest data point to `now`.
 * Records must be sorted oldest first and carry a mileage. Returns null when
 * there is not enough usable signal (fewer than two points, no elapsed time,
 * or no forward mileage movement).
 */
export function predictMileageFromRecords(
  records: ServiceMileagePoint[],
  now: Date = new Date(),
): MileagePrediction | null {
  const usable = records.filter((r) => r.mileage !== null);
  if (usable.length < 2) return null;

  const earliest = usable[0];
  const latest = usable[usable.length - 1];

  const totalDays =
    (pointDate(latest).getTime() - pointDate(earliest).getTime()) / (1000 * 60 * 60 * 24);
  if (totalDays <= 0) return null;

  const totalMileage = latest.mileage! - earliest.mileage!;
  const avgPerDay = totalMileage / totalDays;
  if (avgPerDay <= 0) return null;

  const daysSinceLatest =
    (now.getTime() - pointDate(latest).getTime()) / (1000 * 60 * 60 * 24);
  const predictedMileage = Math.round(latest.mileage! + daysSinceLatest * avgPerDay);

  return {
    predictedMileage,
    avgPerDay,
    lastServiceDate: pointDate(latest),
    lastServiceMileage: latest.mileage!,
    dataPoints: usable.length,
    totalDays,
  };
}

/**
 * Compares the predicted mileage against the org's service interval. Returns
 * null when the vehicle is neither overdue nor approaching (or when there is
 * no usable prediction).
 */
export function evaluateServiceDue(
  records: ServiceMileagePoint[],
  options: { serviceInterval: number; approachingThreshold: number },
  now: Date = new Date(),
): ServiceDueEvaluation | null {
  const prediction = predictMileageFromRecords(records, now);
  if (!prediction) return null;

  const mileageSinceLastService =
    prediction.predictedMileage - prediction.lastServiceMileage;

  let status: ServiceDueStatus | null = null;
  if (mileageSinceLastService >= options.serviceInterval) {
    status = "overdue";
  } else if (
    mileageSinceLastService >=
    options.serviceInterval - options.approachingThreshold
  ) {
    status = "approaching";
  }
  if (!status) return null;

  return {
    predictedMileage: prediction.predictedMileage,
    lastServiceMileage: prediction.lastServiceMileage,
    mileageSinceLastService,
    status,
    confidencePercent: calculateConfidencePercent(
      prediction.dataPoints,
      prediction.totalDays,
    ),
  };
}
