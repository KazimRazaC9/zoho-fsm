-- AlterTable
ALTER TABLE "public"."ServiceRequest" ADD COLUMN     "category" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "preferredAt" TIMESTAMPTZ(3);
