-- Photos of the reported problem that were taken before photos were labeled have no label to sit under.
-- They become ordinary "other photos" of the work order, so nothing is lost and nothing is left hidden.
UPDATE "Attachment"
SET "phase" = NULL
WHERE "entityType" = 'WORK_ORDER'
  AND "kind" = 'PHOTO'
  AND "phase" IS NOT NULL
  AND "slot" IS NULL
  AND "issueId" IS NULL;
