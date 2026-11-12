-- Work orders completed before QA existed were already final: treat them as closed.
UPDATE "WorkOrder" SET "status" = 'CLOSED' WHERE "status" = 'COMPLETED';
