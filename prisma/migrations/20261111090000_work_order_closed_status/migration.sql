-- A completed work order now waits for QA; QA moves it to CLOSED.
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
