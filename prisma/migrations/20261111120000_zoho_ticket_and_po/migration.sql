-- Optional text references: Zoho ticket on a request and its work order, customer PO on a work order.
ALTER TABLE "ServiceRequest" ADD COLUMN "zohoTicket" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "zohoTicket" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "purchaseOrder" TEXT;
