ALTER TABLE service_records ADD COLUMN "technicianId" TEXT;
ALTER TABLE service_records ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inspections ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
-- Migrate existing data from board_assignments
UPDATE service_records sr SET "technicianId" = ba."technicianId", "sortOrder" = ba."sortOrder"
  FROM board_assignments ba WHERE ba."serviceRecordId" = sr.id;
UPDATE inspections i SET "sortOrder" = ba."sortOrder"
  FROM board_assignments ba WHERE ba."inspectionId" = i.id;
DROP TABLE board_assignments;
