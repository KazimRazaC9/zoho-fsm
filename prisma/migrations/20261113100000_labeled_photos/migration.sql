-- Labeled before/after photos (one photo per label) and the temperature-sensor switch on a work order.
ALTER TABLE "Attachment" ADD COLUMN "slot" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "hasTempSensor" BOOLEAN NOT NULL DEFAULT false;
