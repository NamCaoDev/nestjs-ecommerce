-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED');

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(64) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "locked_until" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_events_status_occurred_at_idx" ON "outbox_events"("status", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_id_idx" ON "outbox_events"("aggregate_id");

