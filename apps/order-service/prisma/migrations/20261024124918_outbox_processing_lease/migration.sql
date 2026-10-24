-- AlterEnum
ALTER TYPE "outbox_status" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "locked_until" TIMESTAMPTZ(3);

